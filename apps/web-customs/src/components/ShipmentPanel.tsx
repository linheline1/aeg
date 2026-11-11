import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, errorMessage } from '../store/auth';
import type { OrderDetailData, ProgressStage } from '../types';
import { dateTime } from '../utils/format';
import { ErrorMessage, SuccessMessage } from './Feedback';
import Icon from './Icon';
import StatusBadge from './StatusBadge';

export default function ShipmentPanel({ order, onUpdated }: { order: OrderDetailData; onUpdated: () => Promise<void> }) {
  const { t } = useTranslation();
  const [stage, setStage] = useState<ProgressStage>('customs_br');
  const [note, setNote] = useState('');
  const [happenedAt, setHappenedAt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError(''); setSuccess('');
    try {
      await api.post(`/api/customs/orders/${order.id}/progress`, { stage, ...(note.trim() ? { note: note.trim() } : {}), ...(happenedAt ? { happened_at: new Date(happenedAt).toISOString() } : {}) });
      setNote(''); setHappenedAt(''); setSuccess(t('shipment.success')); await onUpdated();
    } catch (reason) { setError(errorMessage(reason, t('shipment.error'))); }
    finally { setBusy(false); }
  };
  const events = order.shipment?.events || [];
  const stages: ProgressStage[] = ['customs_br', 'duty_paid', 'cleared'];
  return <div className="shipment-layout"><div><div className="current-stage"><span>{t('shipment.currentStage')}</span><StatusBadge value={order.shipment_stage} kind="stage" /></div><form onSubmit={submit} className="progress-form"><div className="field"><label htmlFor="progress-stage">{t('shipment.newStage')}</label><select id="progress-stage" className="form-input" value={stage} onChange={(event) => setStage(event.target.value as ProgressStage)} disabled={busy}>{stages.map((value) => <option key={value} value={value}>{t(`status.stage.${value}`)}</option>)}</select></div><div className="field"><label htmlFor="progress-date">{t('shipment.eventDate')} <span className="optional">{t('shipment.optional')}</span></label><input id="progress-date" className="form-input" type="datetime-local" value={happenedAt} onChange={(event) => setHappenedAt(event.target.value)} disabled={busy} /></div><div className="field"><label htmlFor="progress-note">{t('shipment.note')} <span className="optional">{t('shipment.optional')}</span></label><textarea id="progress-note" className="form-input" rows={3} value={note} onChange={(event) => setNote(event.target.value)} disabled={busy} placeholder={t('shipment.notePlaceholder')} /></div>{error && <ErrorMessage message={error} />}{success && <SuccessMessage>{success}</SuccessMessage>}<button className="btn" disabled={busy}>{busy ? t('shipment.registering') : <><Icon name="ship" size={18} />{t('shipment.register')}</>}</button></form></div><div className="timeline-wrap"><h3>{t('shipment.history')}</h3>{events.length === 0 ? <p className="muted">{t('shipment.empty')}</p> : <ol className="timeline">{events.map((event) => <li key={event.id}><span className="timeline-dot" /><div><strong>{t(`status.stage.${event.stage}`, { defaultValue: t('shipment.customsStage') })}</strong><time>{dateTime(event.happened_at)}</time>{event.note && <p>{event.note}</p>}<small>{event.created_by || t('shipment.unknownOwner')}</small></div></li>)}</ol>}</div></div>;
}
