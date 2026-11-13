/**
 * 港口坐标解析（与前端 ShipmentRouteMap 的 PORTS 表保持一致，中英文别名）。
 * 只用于“按节点推导位置”：节点本身没有坐标时，按节点阶段落到 POL/POD 港口点。
 */
import { corridorBetween, estimateSeaPosition } from './sea-route';

const PORTS: Record<string, [number, number]> = {
  shanghai: [31.23, 121.49], 上海: [31.23, 121.49],
  ningbo: [29.87, 121.55], 宁波: [29.87, 121.55],
  shenzhen: [22.54, 114.06], 深圳: [22.54, 114.06],
  yantian: [22.56, 114.27], 盐田: [22.56, 114.27],
  santos: [-23.95, -46.33], 桑托斯: [-23.95, -46.33],
  paranagua: [-25.52, -48.51], 巴拉那瓜: [-25.52, -48.51]
};

export function locatePort(name?: string | null): [number, number] | null {
  const key = (name || '').toLowerCase().trim();
  if (!key) return null;
  const match = Object.keys(PORTS).find(port => key.includes(port));
  return match ? PORTS[match] : null;
}

/** 起运港侧节点：货物在 POL 或其腹地 */
const POL_STAGES = new Set(['booked', 'loaded', 'customs_cn', 'departed']);
/** 目的港侧节点：货物已到 POD 及之后环节 */
const POD_STAGES = new Set(['arrived', 'customs_br', 'duty_paid', 'cleared', 'delivered']);

export interface NodePosition {
  latitude: number;
  longitude: number;
  /** manual = 节点上手动填的坐标；port = 按节点阶段落到 POL/POD */
  source: 'manual' | 'port';
}

/**
 * 单个物流节点的位置：优先用节点上手动录入的坐标，其次按阶段落到 POL/POD 港口点。
 * on_water 无默认位置（海上段只能靠 AIS），返回 null。
 */
export function eventNodePosition(ev: { stage?: string; lat?: number | null; lng?: number | null }, shipment: any): NodePosition | null {
  // 注意 Number(null) === 0，必须先判空，否则没手动坐标的节点会被误判成 (0,0)
  const hasManual = ev.lat != null && ev.lng != null
    && String(ev.lat).trim() !== '' && String(ev.lng).trim() !== '';
  if (hasManual) {
    const lat = Number(ev.lat);
    const lng = Number(ev.lng);
    if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
      return { latitude: lat, longitude: lng, source: 'manual' };
    }
  }
  if (ev.stage && POL_STAGES.has(ev.stage)) {
    const p = locatePort(shipment?.pol);
    return p ? { latitude: p[0], longitude: p[1], source: 'port' } : null;
  }
  if (ev.stage && POD_STAGES.has(ev.stage)) {
    const p = locatePort(shipment?.pod);
    return p ? { latitude: p[0], longitude: p[1], source: 'port' } : null;
  }
  return null;
}

/**
 * 当前节点位置：所有能定位的节点中，按 happened_at 取最新的一个。
 * 这就是“按节点更新位置”的核心——运营每补一个节点，位置就跟着跳。
 */
export function latestNodePosition(shipment: any): (NodePosition & { stage: string; happened_at: string }) | null {
  const events = [...(shipment?.events || [])].sort((a: any, b: any) => String(a.happened_at).localeCompare(String(b.happened_at)));
  for (let i = events.length - 1; i >= 0; i--) {
    const pos = eventNodePosition(events[i], shipment);
    if (pos) return { ...pos, stage: events[i].stage, happened_at: events[i].happened_at };
  }
  return null;
}

export interface ResolvedShipment {
  events: any[];
  node_position: (NodePosition & { source: 'manual' | 'port' | 'estimated'; stage: string; happened_at: string }) | null;
}

/**
 * 解析一票订单的全部节点位置，供详情接口下发：
 * 1) 手动坐标优先，其次按节点阶段落到 POL/POD 港口；
 * 2) 仍缺位置的（典型是 on_water 海上段），沿参考海路按时间比例估算一个点，
 *    标 position_source='estimated'，前端画成空心点，避免被当成真实船位。
 */
export function resolveShipment(shipment: any): ResolvedShipment {
  const raw: any[] = shipment?.events || [];
  const events: any[] = raw.map((ev: any) => {
    const pos = eventNodePosition(ev, shipment);
    return pos
      ? { ...ev, lat: pos.latitude, lng: pos.longitude, position_source: pos.source }
      : { ...ev, position_source: null };
  });

  const path = corridorBetween(locatePort(shipment?.pol), locatePort(shipment?.pod));
  const ts = (e: any) => Date.parse(e.happened_at);
  // 只有手动/落港的节点能当锚点，估算点不参与再插值，避免误差层层放大
  const anchors = events
    .filter(e => e.position_source === 'manual' || e.position_source === 'port')
    .sort((a, b) => ts(a) - ts(b));

  if (path && anchors.length > 1) {
    for (const ev of events) {
      if (ev.position_source) continue;
      const t = ts(ev);
      if (!Number.isFinite(t)) continue;
      let prev: any = null;
      let next: any = null;
      for (const a of anchors) {
        const at = ts(a);
        if (!Number.isFinite(at)) continue;
        if (at <= t) prev = a;
        else { next = a; break; }
      }
      if (!prev || !next) continue;
      const est = estimateSeaPosition(path, t,
        { at: ts(prev), lat: prev.lat, lng: prev.lng },
        { at: ts(next), lat: next.lat, lng: next.lng });
      if (est) {
        ev.lat = Number(est[0].toFixed(4));
        ev.lng = Number(est[1].toFixed(4));
        ev.position_source = 'estimated';
      }
    }
  }

  const byTime = [...events].sort((a, b) => String(a.happened_at).localeCompare(String(b.happened_at)));
  let node_position: ResolvedShipment['node_position'] = null;
  for (let i = byTime.length - 1; i >= 0; i--) {
    const e = byTime[i];
    if (e.lat != null && e.lng != null && e.position_source) {
      node_position = { latitude: e.lat, longitude: e.lng, source: e.position_source, stage: e.stage, happened_at: e.happened_at };
      break;
    }
  }
  return { events, node_position };
}
