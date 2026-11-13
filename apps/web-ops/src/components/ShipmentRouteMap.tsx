import { useEffect, useRef } from 'react';
import L, { type LatLngExpression } from 'leaflet';
import 'leaflet/dist/leaflet.css';

const PORTS: Record<string, [number, number]> = {
  shanghai: [31.23, 121.49], 上海: [31.23, 121.49], ningbo: [29.87, 121.55], 宁波: [29.87, 121.55],
  shenzhen: [22.54, 114.06], 深圳: [22.54, 114.06], yantian: [22.56, 114.27], 盐田: [22.56, 114.27],
  santos: [-23.95, -46.33], 桑托斯: [-23.95, -46.33], paranagua: [-25.52, -48.51], 巴拉那瓜: [-25.52, -48.51],
};

// 东亚至巴西东南部的参考海路，不能代替承运人公布的实际航线。
const SEA_CORRIDOR: LatLngExpression[] = [
  [18, 113], [11, 110], [5, 105], [1.2, 103.5], [4, 99], [5, 94], [1, 83], [-7, 72],
  [-17, 62], [-28, 55], [-35, 43], [-38, 29], [-36, 19], [-34, 5], [-30, -12], [-26, -29], [-24, -40],
];

function locate(name?: string | null): [number, number] | null {
  const key = (name || '').toLowerCase().trim();
  const match = Object.keys(PORTS).find(port => key.includes(port));
  return match ? PORTS[match] : null;
}

function referenceRoute(origin: [number, number] | null, destination: [number, number] | null): LatLngExpression[] | null {
  if (!origin || !destination) return null;
  const eastAsia = origin[1] >= 100 && origin[1] <= 135 && origin[0] >= 15 && origin[0] <= 40;
  const southeastBrazil = destination[1] >= -55 && destination[1] <= -40 && destination[0] >= -32 && destination[0] <= -18;
  return eastAsia && southeastBrazil ? [origin, ...SEA_CORRIDOR, destination] : null;
}

/** 把节点吸附到参考海路上，返回最近顶点下标（无参考航线时返回 -1） */
function nearestRouteIndex(lat: number, lng: number, route: LatLngExpression[] | null): number {
  if (!route || !route.length) return -1;
  let best = -1;
  let bestD = Infinity;
  route.forEach((p, i) => {
    const [la, ln] = p as [number, number];
    const d = (la - lat) ** 2 + (ln - lng) ** 2;
    if (d < bestD) { bestD = d; best = i; }
  });
  return best;
}

type Position = { latitude: number; longitude: number; observed_at: string; speed_knots?: number | null } | null;
type TrackPoint = { latitude: number; longitude: number; observed_at: string };

/** 已定位的物流节点（服务端解析好坐标后下发），用于画节点轨迹 */
export type RouteNode = {
  id: string; label?: string; happened_at?: string; latitude: number; longitude: number;
  /** true = 海上段无真实坐标，按参考海路估算的点（画成空心，避免误认为真实船位） */
  estimated?: boolean;
};

export function ShipmentRouteMap({ pol, pod, language = 'zh', position, nodes, track }: {
  pol?: string | null; pod?: string | null; language?: string; position?: Position; nodes?: RouteNode[]; track?: TrackPoint[];
}) {
  const nodeRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const boundsRef = useRef<L.LatLngBounds | null>(null);
  const fittedRouteRef = useRef('');
  const pt = language.startsWith('pt');
  const origin = locate(pol);
  const destination = locate(pod);
  const route = referenceRoute(origin, destination);
  const validPosition = position && Number.isFinite(position.latitude) && Number.isFinite(position.longitude)
    && Math.abs(position.latitude) <= 90 && Math.abs(position.longitude) <= 180;
  // 已定位节点按时间正序，末位就是当前位置（“按节点更新位置”的依据）
  const validNodes = (nodes || [])
    .filter(n => Number.isFinite(n.latitude) && Number.isFinite(n.longitude)
      && Math.abs(n.latitude) <= 90 && Math.abs(n.longitude) <= 180);
  const currentNode = validNodes.length ? validNodes[validNodes.length - 1] : null;
  const nodesKey = validNodes.map(n => `${n.id}:${n.latitude.toFixed(4)},${n.longitude.toFixed(4)}`).join('|');
  // AIS 自动航迹（服务端累积后下发），按时间正序
  const validTrack = (track || [])
    .filter(p => Number.isFinite(p.latitude) && Number.isFinite(p.longitude)
      && Math.abs(p.latitude) <= 90 && Math.abs(p.longitude) <= 180);
  const trackKey = validTrack.length
    ? `${validTrack.length}:${validTrack[0].observed_at}:${validTrack[validTrack.length - 1].latitude.toFixed(3)},${validTrack[validTrack.length - 1].longitude.toFixed(3)}`
    : '';

  useEffect(() => {
    if (!nodeRef.current) return;
    const map = L.map(nodeRef.current, { zoomControl: true, scrollWheelZoom: false, worldCopyJump: true, minZoom: 2, maxZoom: 10 })
      .setView([-8, 22], 2);
    // Esri World Street Map: 免费、无需 API key、CDN 稳定，海运场景海陆对比清晰。
    // tileSize 512 + zoomOffset -1 实现 retina 高清显示，避免高分屏模糊。
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
      tileSize: 512,
      zoomOffset: -1,
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.esri.com">Esri</a>',
    }).addTo(map);
    mapRef.current = map;
    layerRef.current = L.layerGroup().addTo(map);
    const resize = new ResizeObserver(() => map.invalidateSize({ animate: false }));
    resize.observe(nodeRef.current);
    const frame = requestAnimationFrame(() => map.invalidateSize({ animate: false }));
    return () => { cancelAnimationFrame(frame); resize.disconnect(); map.remove(); mapRef.current = null; layerRef.current = null; };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    const points: LatLngExpression[] = [];
    if (route) {
      L.polyline(route, { color: '#2563eb', weight: 3, opacity: .85, dashArray: '7 7' }).addTo(layer);
      points.push(...route);
    }
    if (origin) {
      L.circleMarker(origin, { radius: 7, color: '#fff', weight: 2, fillColor: '#0f766e', fillOpacity: 1 })
        .bindTooltip(pol || '', { direction: 'top' }).addTo(layer);
      points.push(origin);
    }
    if (destination) {
      L.circleMarker(destination, { radius: 7, color: '#fff', weight: 2, fillColor: '#2563eb', fillOpacity: 1 })
        .bindTooltip(pod || '', { direction: 'top' }).addTo(layer);
      points.push(destination);
    }
    // 节点轨迹：沿参考海路取子路径，避免两点直连时横穿大陆；无参考航线才用直线
    if (validNodes.length) {
      const nodePts: LatLngExpression[] = validNodes.map(n => [n.latitude, n.longitude]);
      const idxs = validNodes.map(n => nearestRouteIndex(n.latitude, n.longitude, route));
      if (nodePts.length > 1) {
        if (route && idxs.every(i => i >= 0)) {
          const lo = Math.min(...idxs);
          const hi = Math.max(...idxs);
          if (hi > lo) L.polyline(route.slice(lo, hi + 1), { color: '#0d9488', weight: 3, opacity: .9 }).addTo(layer);
        } else {
          L.polyline(nodePts, { color: '#0d9488', weight: 2.5, opacity: .9 }).addTo(layer);
        }
      }
      validNodes.forEach((n, i) => {
        const cur = i === validNodes.length - 1;
        const estTag = n.estimated ? (pt ? ' (estimado)' : '（估算）') : '';
        const tip = `${n.label || ''}${estTag}${n.happened_at ? ' · ' + n.happened_at.slice(0, 16).replace('T', ' ') : ''}`;
        L.circleMarker([n.latitude, n.longitude], {
          radius: cur ? 9 : 6, color: '#0d9488', weight: 2,
          // 估算点用空心：一眼能和真实节点/港口区分开
          fillColor: n.estimated ? '#ffffff' : (cur ? '#dc2626' : '#0d9488'),
          fillOpacity: n.estimated ? .85 : 1
        }).bindTooltip(tip, { direction: 'top' }).addTo(layer);
      });
      points.push(...nodePts);
    }
    if (validPosition && position) {
      const ship: LatLngExpression = [position.latitude, position.longitude];
      const ageMinutes = (Date.now() - Date.parse(position.observed_at)) / 60000;
      const recent = ageMinutes >= 0 && ageMinutes <= 30;
      L.circleMarker(ship, { radius: 7, color: '#fff', weight: 2, fillColor: recent ? '#d97706' : '#64748b', fillOpacity: 1 })
        .bindTooltip(pt ? 'Última posição AIS' : '最近 AIS 船位', { direction: 'top' }).addTo(layer);
      points.push(ship);
    }
    // AIS 自动航迹：船实际上报过的点连成的线（橙色实线），与人工节点轨迹区分
    if (validTrack.length > 1) {
      const pts: LatLngExpression[] = validTrack.map(p => [p.latitude, p.longitude]);
      L.polyline(pts, { color: '#d97706', weight: 3, opacity: .85 }).addTo(layer);
      validTrack.forEach((p, i) => {
        const head = i === validTrack.length - 1;
        if (!head && i % 5 !== 0) return; // 中间点抽稀，避免密集点盖住地图
        L.circleMarker([p.latitude, p.longitude], {
          radius: head ? 5 : 3, color: '#d97706', weight: 1,
          fillColor: '#fff', fillOpacity: 1
        }).bindTooltip(`${pt ? 'AIS' : 'AIS 航迹'} · ${new Date(p.observed_at).toLocaleString(pt ? 'pt-BR' : 'zh-CN')}`, { direction: 'top' }).addTo(layer);
      });
      points.push(...pts);
    }
    boundsRef.current = points.length ? L.latLngBounds(points) : null;
    const routeKey = `${pol || ''}|${pod || ''}`;
    if (boundsRef.current && (routeKey !== fittedRouteRef.current || !fittedRouteRef.current)) {
      map.invalidateSize({ animate: false });
      map.fitBounds(boundsRef.current, { padding: [24, 24], maxZoom: 5, animate: false });
      fittedRouteRef.current = routeKey || 'position';
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pol, pod, position?.latitude, position?.longitude, position?.observed_at, nodesKey, trackKey, language]);

  return <div className="shipment-route-map">
    <div className="shipment-route-map-head">
      <strong>{pt ? 'Mapa da rota marítima' : '海运航线地图'}</strong>
      <span>{pt ? 'Verde: trajeto por nós logísticos; vermelho: nó atual; círculo vazado: posição estimada (trecho oceânico); linha laranja: rastro AIS automático. Ponto laranja: AIS dos últimos 30 min; cinza: mais antigo. Tracejado: rota de referência.' : '绿线是节点轨迹，红点是当前节点；空心圈是海上段估算位置（非真实船位）；橙线是 AIS 自动累积的真实航迹（近岸有效，大洋无信号）。橙点为 30 分钟内船位，灰点为更早的。虚线是参考海路。'}</span>
    </div>
    <div className="shipment-route-map-wrap">
      <div ref={nodeRef} className="shipment-route-map-canvas" role="region" aria-label={pt ? 'Mapa interativo da rota marítima' : '可缩放的海运地图'} />
      <button type="button" className="shipment-route-map-reset" onClick={() => {
        if (mapRef.current && boundsRef.current) mapRef.current.fitBounds(boundsRef.current, { padding: [24, 24], maxZoom: 5 });
      }}>{pt ? 'Ver rota completa' : '查看全程'}</button>
    </div>
    <div className="shipment-route-map-ports"><span>{pol || '—'}</span><span>→</span><span>{pod || '—'}</span></div>
    {currentNode && <div className="shipment-route-map-ais">📍 {pt ? 'Nó atual' : '当前节点位置'} · {currentNode.label || ''}{currentNode.estimated ? (pt ? ' (estimado)' : '（估算）') : ''}{currentNode.happened_at ? ` · ${new Date(currentNode.happened_at).toLocaleString(pt ? 'pt-BR' : 'zh-CN')}` : ''} · {currentNode.latitude.toFixed(4)}, {currentNode.longitude.toFixed(4)}</div>}
    {validNodes.length > 0 && (
      <div className="shipment-route-map-nodes">
        {validNodes.map((n, i) => (
          <span key={n.id} className={[i === validNodes.length - 1 ? 'cur' : '', n.estimated ? 'est' : ''].filter(Boolean).join(' ')}>
            <i aria-hidden="true" />
            {n.label || '—'}
            {n.estimated ? (pt ? ' ≈' : ' 估算') : ''}
            {n.happened_at ? ` · ${new Date(n.happened_at).toLocaleDateString(pt ? 'pt-BR' : 'zh-CN')}` : ''}
          </span>
        ))}
      </div>
    )}
    {validPosition && position && <div className="shipment-route-map-ais">{pt ? 'Última posição AIS' : '最近 AIS 船位'} · {new Date(position.observed_at).toLocaleString(pt ? 'pt-BR' : 'zh-CN')} · {position.latitude.toFixed(4)}, {position.longitude.toFixed(4)}{position.speed_knots != null ? ` · ${position.speed_knots.toFixed(1)} kn` : ''}</div>}
    {validTrack.length > 1 && (
      <div className="shipment-route-map-ais">
        📡 {pt ? `Rastro AIS automático: ${validTrack.length} pontos` : `AIS 自动航迹：${validTrack.length} 个点`}
        {' · '}{new Date(validTrack[0].observed_at).toLocaleString(pt ? 'pt-BR' : 'zh-CN')}
        {' → '}{new Date(validTrack[validTrack.length - 1].observed_at).toLocaleString(pt ? 'pt-BR' : 'zh-CN')}
      </div>
    )}
    {!route && <div className="shipment-route-map-ais">{pt ? 'Rota de referência indisponível para estes portos.' : '该港口组合暂无参考海路。'}</div>}
  </div>;
}
