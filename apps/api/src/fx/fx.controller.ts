import { Controller, Get, Query, ServiceUnavailableException, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../common/guards/auth.guard';

/** Frankfurter（ECB 参考汇率）公共接口 */
const SOURCE = 'https://api.frankfurter.dev/v1/latest';
/** 内存缓存时长：6 小时（ECB 每个工作日更新一次） */
const CACHE_MS = 6 * 60 * 60 * 1000;
const CODE = /^[A-Z]{3}$/;

interface FxSnapshot {
  base: string;
  date: string;
  rates: Record<string, number>;
  fetched_at: string;
  /** true = 上游不可用，返回的是过期缓存 */
  stale: boolean;
  source: string;
}

/**
 * 实时汇率（Frankfurter / 欧洲央行参考汇率）
 *   GET /api/fx/rates?base=USD&symbols=BRL,CNY
 * 结果缓存 6 小时；上游失败时返回上次缓存并标记 stale。
 */
@Controller('fx')
@UseGuards(AuthGuard)
export class FxController {
  private readonly cache = new Map<string, { data: FxSnapshot; expires: number }>();

  @Get('rates')
  async latest(
    @Query('base') base = 'USD',
    @Query('symbols') symbols = 'BRL'
  ): Promise<FxSnapshot> {
    const code = String(base || 'USD').toUpperCase();
    const wanted = String(symbols || 'BRL')
      .split(',')
      .map(value => value.trim().toUpperCase())
      .filter(value => CODE.test(value));
    if (!CODE.test(code) || wanted.length === 0) {
      throw new ServiceUnavailableException('汇率参数非法：币种需为 3 位字母代码');
    }

    const key = `${code}:${wanted.join(',')}`;
    const hit = this.cache.get(key);
    if (hit && hit.expires > Date.now()) return hit.data;

    try {
      const url = `${SOURCE}?base=${code}&symbols=${wanted.join(',')}`;
      const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body: any = await response.json();
      const data: FxSnapshot = {
        base: body.base || code,
        date: body.date || '',
        rates: body.rates || {},
        fetched_at: new Date().toISOString(),
        stale: false,
        source: 'frankfurter.dev'
      };
      this.cache.set(key, { data, expires: Date.now() + CACHE_MS });
      return data;
    } catch {
      if (hit) return { ...hit.data, stale: true };
      throw new ServiceUnavailableException('实时汇率暂不可用，请稍后重试或手动填写');
    }
  }
}
