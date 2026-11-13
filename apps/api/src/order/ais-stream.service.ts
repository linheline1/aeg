import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import WebSocket from 'ws';
import fs from 'fs';
import path from 'path';
import { repoRoot } from '../common/mock-db';

export interface AisPosition {
  mmsi: string;
  latitude: number;
  longitude: number;
  observed_at: string;
  ship_name: string | null;
  speed_knots: number | null;
  course_degrees: number | null;
}

/** 轨迹点：单船按时间累积的船位，用于在地图上画出真实走过的路 */
export interface AisTrackPoint {
  latitude: number;
  longitude: number;
  observed_at: string;
  speed_knots: number | null;
  course_degrees: number | null;
}

/** 同一条船最多保留的轨迹点数（约几个月的近岸航迹） */
const MAX_TRACK_POINTS = 1000;
/** 同一位置 5 分钟内重复推送不重复记点（多接收站会给重复报文） */
const TRACK_SAMPLE_MIN_MS = 5 * 60 * 1000;
const TRACK_SAMPLE_MIN_DEG = 0.002;
/** 轨迹保留天数 */
const TRACK_KEEP_DAYS = 60;

@Injectable()
export class AisStreamService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AisStreamService.name);
  private readonly key = process.env.AISSTREAM_API_KEY?.trim() || '';
  private readonly watched = new Map<string, number>();
  private readonly positions = new Map<string, AisPosition>();
  /** mmsi → 时间正序的轨迹点，落盘在 apps/api/data/ais-tracks.json */
  private readonly tracks = new Map<string, AisTrackPoint[]>();
  private socket: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private subscriptionTimer: ReturnType<typeof setTimeout> | null = null;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private autoWatchTimer: ReturnType<typeof setInterval> | null = null;
  private trackDirty = false;
  private lastSubscriptionAt = 0;
  private retryMs = 1000;
  private stopped = false;

  constructor(@Inject('QuotesRepo') private readonly quotesRepo: any) {}

  /** 是否配置了 AISStream API key（未配置时前端不再轮询船位） */
  get enabled(): boolean {
    return !!this.key;
  }

  onModuleInit() {
    this.loadTracks();
    this.startAutoWatch();
  }

  /**
   * 自动跟踪在途订单：不依赖是否有人打开详情页。
   * 每 10 分钟扫一遍已成交且未签收的订单，把 MMSI 加入订阅，
   * 这样航迹能持续累积（打开页面时已有历史点，而不是从零开始）。
   */
  private startAutoWatch() {
    if (!this.key || this.autoWatchTimer) return;
    const run = () => { this.autoWatch().catch(e => this.logger.warn(`AIS 自动跟踪失败：${e?.message || e}`)); };
    run();
    this.autoWatchTimer = setInterval(run, 10 * 60 * 1000);
    this.autoWatchTimer.unref?.();
  }

  private async autoWatch() {
    const rows: any[] = await this.quotesRepo.find();
    const now = Date.now();
    let n = 0;
    for (const q of rows || []) {
      const mmsi = q?.shipment?.mmsi;
      if (!mmsi) continue;
      if (q.status !== 'done' || q.deal_status !== 'won') continue;
      const events: any[] = q.shipment.events || [];
      // 已签收的订单不用再追
      if (events.some(e => e?.stage === 'delivered')) continue;
      // 90 天没更新的视为已结束，避免无限期订阅
      const at = Date.parse(q.updated_at || q.created_at || '');
      if (Number.isFinite(at) && now - at > 90 * 86400000) continue;
      this.watch(mmsi);
      n++;
    }
    if (n) this.logger.log(`AIS 自动跟踪 ${n} 票在途订单`);
  }

  watch(mmsi: string | null | undefined): AisPosition | null {
    if (!this.key || !mmsi || !/^\d{9}$/.test(mmsi)) return null;
    const wasWatching = this.watched.has(mmsi);
    this.watched.set(mmsi, Date.now());
    if (!wasWatching) {
      if (!this.socket) this.connect();
      else this.scheduleSubscription();
    }
    return this.positions.get(mmsi) || null;
  }

  /** 单船的 AIS 轨迹（时间正序，最多 limit 点），供地图画"自动航迹" */
  track(mmsi: string | null | undefined, limit = 300): AisTrackPoint[] {
    if (!mmsi) return [];
    const list = this.tracks.get(mmsi);
    return list?.length ? list.slice(-limit) : [];
  }

  private activeMmsis(): string[] {
    const cutoff = Date.now() - 2 * 60 * 60 * 1000;
    for (const [mmsi, lastViewed] of this.watched) {
      if (lastViewed < cutoff) this.watched.delete(mmsi);
    }
    return [...this.watched.keys()].slice(0, 200);
  }

  private trackFile(): string {
    return path.join(repoRoot(), 'apps/api/data/ais-tracks.json');
  }

  private loadTracks() {
    try {
      const file = this.trackFile();
      if (!fs.existsSync(file)) return;
      const raw = JSON.parse(fs.readFileSync(file, 'utf-8'));
      let n = 0;
      for (const mmsi of Object.keys(raw || {})) {
        if (Array.isArray(raw[mmsi]) && raw[mmsi].length) {
          this.tracks.set(mmsi, raw[mmsi]);
          n++;
        }
      }
      if (n) this.logger.log(`AIS 轨迹已加载：${n} 条船`);
    } catch (e: any) {
      this.logger.warn(`AIS 轨迹读取失败：${e?.message || e}`);
    }
  }

  private scheduleFlush() {
    this.trackDirty = true;
    if (this.flushTimer) return;
    // 节流写盘：报文密集时不会每来一条就写文件
    this.flushTimer = setTimeout(() => { this.flushTimer = null; this.flushTracks(); }, 5000);
  }

  private flushTracks() {
    if (!this.trackDirty) return;
    try {
      const file = this.trackFile();
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const out: Record<string, AisTrackPoint[]> = {};
      for (const [mmsi, pts] of this.tracks) if (pts.length) out[mmsi] = pts;
      fs.writeFileSync(file, JSON.stringify(out));
      this.trackDirty = false;
    } catch (e: any) {
      this.logger.warn(`AIS 轨迹写入失败：${e?.message || e}`);
    }
  }

  private recordPoint(mmsi: string, p: AisTrackPoint) {
    const list = this.tracks.get(mmsi) || [];
    const last = list[list.length - 1];
    if (last) {
      const dt = Date.parse(p.observed_at) - Date.parse(last.observed_at);
      const moved = Math.abs(last.latitude - p.latitude) + Math.abs(last.longitude - p.longitude);
      if (dt < TRACK_SAMPLE_MIN_MS && moved < TRACK_SAMPLE_MIN_DEG) return;
    }
    list.push(p);
    const cutoff = Date.now() - TRACK_KEEP_DAYS * 86400000;
    const kept = list.filter(x => {
      const t = Date.parse(x.observed_at);
      return Number.isFinite(t) ? t >= cutoff : false;
    }).slice(-MAX_TRACK_POINTS);
    this.tracks.set(mmsi, kept);
    this.scheduleFlush();
  }

  private connect() {
    if (this.stopped || this.socket || !this.activeMmsis().length) return;
    const socket = new WebSocket('wss://stream.aisstream.io/v0/stream', { perMessageDeflate: true });
    this.socket = socket;
    socket.on('open', () => {
      this.retryMs = 1000;
      this.sendSubscription(); // 首次订阅须在连接后 3 秒内发送。
    });
    socket.on('message', data => this.consume(data.toString()));
    socket.on('error', error => this.logger.warn(`AIS stream connection error: ${error.message}`));
    socket.on('close', () => {
      if (this.socket === socket) this.socket = null;
      if (this.stopped || !this.activeMmsis().length) return;
      const delay = this.retryMs + Math.floor(Math.random() * 500);
      this.retryMs = Math.min(this.retryMs * 2, 60000);
      this.reconnectTimer = setTimeout(() => { this.reconnectTimer = null; this.connect(); }, delay);
    });
  }

  private scheduleSubscription() {
    if (this.subscriptionTimer || this.socket?.readyState !== WebSocket.OPEN) return;
    const delay = Math.max(0, 1100 - (Date.now() - this.lastSubscriptionAt));
    this.subscriptionTimer = setTimeout(() => {
      this.subscriptionTimer = null;
      this.sendSubscription();
    }, delay);
  }

  private sendSubscription() {
    if (this.socket?.readyState !== WebSocket.OPEN) return;
    const mmsis = this.activeMmsis();
    if (!mmsis.length) { this.socket.close(); return; }
    // MMSI 过滤是必要的：不加过滤时全球订阅会让服务端每秒推送数十条无关船位，
    // 既浪费带宽也更容易触发服务端限流丢包。实测该字段对目标船有效。
    this.socket.send(JSON.stringify({
      APIKey: this.key,
      BoundingBoxes: [[[-85, -180], [85, 180]]],
      FiltersShipMMSI: mmsis,
      FilterMessageTypes: ['PositionReport', 'StandardClassBPositionReport', 'ExtendedClassBPositionReport']
    }));
    this.lastSubscriptionAt = Date.now();
  }

  private consume(raw: string) {
    let event: any;
    try { event = JSON.parse(raw); } catch { return; }
    const type = event?.MessageType;
    if (!['PositionReport', 'StandardClassBPositionReport', 'ExtendedClassBPositionReport'].includes(type)) return;
    const meta = event.MetaData;
    const report = event.Message?.[type];
    const mmsi = String(meta?.MMSI ?? report?.UserID ?? '');
    if (!this.watched.has(mmsi) || report?.Valid === false) return;
    // 实测 MetaData 的经纬度字段是小写 latitude/longitude（官方文档写作大写），两种都兼容，
    // 再退回 PositionReport 的 Latitude/Longitude。
    const latitude = Number(meta?.Latitude ?? meta?.latitude ?? report?.Latitude);
    const longitude = Number(meta?.Longitude ?? meta?.longitude ?? report?.Longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return;
    const speed = Number(report?.Sog);
    const course = Number(report?.Cog);
    // 优先用报文自带的 UTC 时间，比"收到时刻"更接近真实观测时间
    const at = typeof meta?.time_utc === 'string' && Number.isFinite(Date.parse(meta.time_utc))
      ? new Date(Date.parse(meta.time_utc)).toISOString()
      : new Date().toISOString();
    const pos: AisPosition = {
      mmsi, latitude, longitude, observed_at: at,
      ship_name: typeof meta?.ShipName === 'string' ? meta.ShipName.trim() : null,
      speed_knots: Number.isFinite(speed) ? speed : null,
      course_degrees: Number.isFinite(course) ? course : null
    };
    this.positions.set(mmsi, pos);
    this.recordPoint(mmsi, {
      latitude, longitude, observed_at: at,
      speed_knots: pos.speed_knots, course_degrees: pos.course_degrees
    });
  }

  onModuleDestroy() {
    this.stopped = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.subscriptionTimer) clearTimeout(this.subscriptionTimer);
    if (this.flushTimer) clearTimeout(this.flushTimer);
    if (this.autoWatchTimer) clearInterval(this.autoWatchTimer);
    this.flushTracks();
    this.socket?.close();
  }
}
