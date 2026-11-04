import { ORDER_STATUS, REVIEW_STATUS, STAGE } from '../utils/format';

export default function StatusBadge({ value, kind = 'order' }: { value?: string | null; kind?: 'order' | 'review' | 'stage' }) {
  if (!value) return <span className="badge badge-neutral">Não iniciado</span>;
  const labels = kind === 'review' ? REVIEW_STATUS : kind === 'stage' ? STAGE : ORDER_STATUS;
  const tone = value === 'approved' || value === 'cleared' || value === 'done' ? 'success'
    : value === 'changes_requested' || value === 'failed' ? 'danger'
      : value === 'customs_in_progress' || value === 'customs_br' || value === 'duty_paid' || value === 'computing' ? 'info'
        : value === 'pending' || value === 'pending_fee' || value === 'uploaded' ? 'warning' : 'neutral';
  return <span className={`badge badge-${tone}`}>{labels[value] || 'Status não informado'}</span>;
}
