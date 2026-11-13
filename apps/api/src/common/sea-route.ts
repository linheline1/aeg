/**
 * 参考海路（东亚 → 巴西东南部）。与前端 ShipmentRouteMap 的 SEA_CORRIDOR 保持一致。
 * 用途：给「海上段节点」估算位置——海运段的中间节点没有港口可落，只能按时间比例
 * 沿这条参考航线插值，得到一个"大概在哪个洋区"的坐标。仅供参考，非承运人实际航线。
 */
const SEA_CORRIDOR: [number, number][] = [
  [18, 113], [11, 110], [5, 105], [1.2, 103.5], [4, 99], [5, 94], [1, 83], [-7, 72],
  [-17, 62], [-28, 55], [-35, 43], [-38, 29], [-36, 19], [-34, 5], [-30, -12], [-26, -29], [-24, -40]
];

/**
 * 只有「东亚起运 + 巴西东南部目的」这一组港口才有参考海路；
 * 其他组合不猜，返回 null（避免画出一条误导性的线）。
 */
export function corridorBetween(origin: [number, number] | null, destination: [number, number] | null): [number, number][] | null {
  const o = origin;
  const d = destination;
  if (!o || !d) return null;
  const eastAsia = o[1] >= 100 && o[1] <= 135 && o[0] >= 15 && o[0] <= 40;
  const southeastBrazil = d[1] >= -55 && d[1] <= -40 && d[0] >= -32 && d[0] <= -18;
  return eastAsia && southeastBrazil ? [o, ...SEA_CORRIDOR, d] : null;
}

function nearestIndex(path: [number, number][], lat: number, lng: number): number {
  let best = 0;
  let bestD = Infinity;
  path.forEach((p, i) => {
    const d = (p[0] - lat) ** 2 + (p[1] - lng) ** 2;
    if (d < bestD) { bestD = d; best = i; }
  });
  return best;
}

function distance(a: [number, number], b: [number, number]): number {
  // 等距近似即可，只用于按比例取点
  const k = Math.cos(((a[0] + b[0]) / 2) * Math.PI / 180);
  const dy = b[0] - a[0];
  const dx = (b[1] - a[1]) * k;
  return Math.sqrt(dx * dx + dy * dy);
}

/** 沿 path 第 from→to 段走 fraction(0~1) 的累计距离，返回插值点 */
function pointAlong(path: [number, number][], from: number, to: number, fraction: number): [number, number] {
  const lo = Math.min(from, to);
  const hi = Math.max(from, to);
  const segs: { a: [number, number]; b: [number, number]; len: number }[] = [];
  let total = 0;
  for (let i = lo; i < hi; i++) {
    const len = distance(path[i], path[i + 1]);
    segs.push({ a: path[i], b: path[i + 1], len });
    total += len;
  }
  if (!segs.length) return path[lo];
  const want = Math.min(Math.max(fraction, 0), 1) * total;
  let acc = 0;
  for (const s of segs) {
    if (acc + s.len >= want) {
      const r = s.len ? (want - acc) / s.len : 0;
      return [s.a[0] + (s.b[0] - s.a[0]) * r, s.a[1] + (s.b[1] - s.a[1]) * r];
    }
    acc += s.len;
  }
  return path[hi];
}

type Anchor = { at: number; lat?: number | null; lng?: number | null };

/**
 * 海上段节点估算位置：前后各取最近一个「已知位置」的节点，按时间比例在海路上插值。
 * 时间比例 ≠ 实际航速（船可能等泊、绕航），所以只作参考，前端标注为"估算"。
 */
export function estimateSeaPosition(path: [number, number][], at: number, from: Anchor, to: Anchor): [number, number] | null {
  if (from.lat == null || from.lng == null || to.lat == null || to.lng == null) return null;
  const span = to.at - from.at;
  if (!(span > 0)) return null;
  const t = (at - from.at) / span;
  if (!Number.isFinite(t) || t < 0 || t > 1) return null;
  const iFrom = nearestIndex(path, from.lat, from.lng);
  const iTo = nearestIndex(path, to.lat, to.lng);
  if (iFrom === iTo) {
    // 两端落在同一个海路顶点：退化为两点权重插值
    return [from.lat + (to.lat - from.lat) * t, from.lng + (to.lng - from.lng) * t];
  }
  return pointAlong(path, iFrom, iTo, t);
}
