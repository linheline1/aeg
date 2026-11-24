import { useEffect, useState } from 'react';

export type ShipmentException = {
  status: 'open' | 'resolved';
  message: string;
  owner?: string;
  updated_at: string;
};

type ShipmentTimes = {
  etd?: string | null;
  eta?: string | null;
  updated_at?: string;
  events?: { stage: string; happened_at: string }[];
};

export function shipmentDateTime(value: string | undefined, language: string) {
  if (!value || !Number.isFinite(Date.parse(value))) return '—';
  return new Date(value).toLocaleString(language.startsWith('pt') ? 'pt-BR' : 'zh-CN', { timeZoneName: 'short' });
}

export function aisIsRecent(value: string | undefined, now = Date.now()) {
  const age = now - Date.parse(value ?? '');
  return age >= 0 && age <= 30 * 60_000;
}

export function useAisFreshness(value?: string) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!value) return;
    setNow(Date.now());
    const time = Date.parse(value);
    if (!Number.isFinite(time)) return;
    const remaining = time + 30 * 60_000 + 1 - Date.now();
    if (remaining <= 0 || remaining > 31 * 60_000) return;
    const timer = setTimeout(() => setNow(Date.now()), remaining);
    return () => clearTimeout(timer);
  }, [value]);
  return aisIsRecent(value, now);
}

export function ShipmentSchedule({ shipment, language }: { shipment: ShipmentTimes; language: string }) {
  const pt = language.startsWith('pt');
  const actual = (stage: string) => shipment.events?.reduce<string | undefined>((latest, event) =>
    event.stage === stage && Number.isFinite(Date.parse(event.happened_at))
      && (!latest || Date.parse(event.happened_at) > Date.parse(latest)) ? event.happened_at : latest, undefined);
  const fields = [
    [pt ? 'Embarque previsto' : '预计开船', shipment.etd?.slice(0, 10) || '—'],
    [pt ? 'Embarque efetivo' : '实际开船', shipmentDateTime(actual('departed'), language)],
    [pt ? 'Chegada prevista' : '预计到港', shipment.eta?.slice(0, 10) || '—'],
    [pt ? 'Chegada efetiva' : '实际到港', shipmentDateTime(actual('arrived'), language)]
  ];
  return <section aria-label={pt ? 'Datas do transporte' : '船期与实际进度'} style={{ marginBlock: 14 }}>
    <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 155px), 1fr))', gap: 8 }}>
      {fields.map(([label, value]) => <div key={label}>
        <dt className="muted text-sm">{label}</dt>
        <dd style={{ margin: 0 }}>{value}</dd>
      </div>)}
    </dl>
    {shipment.updated_at && <p className="muted text-sm" style={{ marginBottom: 0 }}>
      {pt ? 'Dados logísticos atualizados em' : '物流资料更新时间'} · {shipmentDateTime(shipment.updated_at, language)}
    </p>}
  </section>;
}

export function ShipmentExceptionNotice({ exception, language }: { exception: ShipmentException; language: string }) {
  const pt = language.startsWith('pt');
  const open = exception.status === 'open';
  return <div className={open ? 'alert alert-warn' : 'alert'} style={{ marginBlock: 12, overflowWrap: 'anywhere' }}>
    <strong>{open ? (pt ? 'Ocorrência em acompanhamento' : '物流异常处理中') : (pt ? 'Ocorrência resolvida' : '物流异常已解决')}</strong>
    <div>{exception.message}</div>
    <small>{shipmentDateTime(exception.updated_at, language)}{exception.owner && ` · ${pt ? 'Responsável' : '负责人'} ${exception.owner}`}</small>
  </div>;
}
