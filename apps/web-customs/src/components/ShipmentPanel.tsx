import { useState } from 'react';
import { api, errorMessage } from '../store/auth';
import type { OrderDetailData, ProgressStage } from '../types';
import { dateTime, STAGE } from '../utils/format';
import { ErrorMessage, SuccessMessage } from './Feedback';
import Icon from './Icon';
import StatusBadge from './StatusBadge';

export default function ShipmentPanel({ order, onUpdated }: { order: OrderDetailData; onUpdated: () => Promise<void> }) {
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
      setNote(''); setHappenedAt(''); setSuccess('Etapa de desembaraço registrada com sucesso.'); await onUpdated();
    } catch (reason) { setError(errorMessage(reason, 'Não foi possível registrar a etapa.')); }
    finally { setBusy(false); }
  };
  const events = order.shipment?.events || [];
  return <div className="shipment-layout"><div><div className="current-stage"><span>Etapa atual</span><StatusBadge value={order.shipment_stage} kind="stage" /></div><form onSubmit={submit} className="progress-form"><div className="field"><label htmlFor="progress-stage">Nova etapa</label><select id="progress-stage" className="form-input" value={stage} onChange={(event) => setStage(event.target.value as ProgressStage)} disabled={busy}>{Object.entries(STAGE).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div><div className="field"><label htmlFor="progress-date">Data e hora do evento <span className="optional">(opcional)</span></label><input id="progress-date" className="form-input" type="datetime-local" value={happenedAt} onChange={(event) => setHappenedAt(event.target.value)} disabled={busy} /></div><div className="field"><label htmlFor="progress-note">Observação <span className="optional">(opcional)</span></label><textarea id="progress-note" className="form-input" rows={3} value={note} onChange={(event) => setNote(event.target.value)} disabled={busy} placeholder="Inclua informações relevantes sobre esta etapa" /></div>{error && <ErrorMessage message={error} />}{success && <SuccessMessage>{success}</SuccessMessage>}<button className="btn" disabled={busy}>{busy ? 'Registrando…' : <><Icon name="ship" size={18} />Registrar etapa</>}</button></form></div><div className="timeline-wrap"><h3>Histórico do desembaraço</h3>{events.length === 0 ? <p className="muted">Nenhuma etapa registrada até o momento.</p> : <ol className="timeline">{events.map((event) => <li key={event.id}><span className="timeline-dot" /><div><strong>{STAGE[event.stage] || 'Etapa aduaneira'}</strong><time>{dateTime(event.happened_at)}</time>{event.note && <p>{event.note}</p>}<small>{event.created_by || 'Responsável não informado'}</small></div></li>)}</ol>}</div></div>;
}
