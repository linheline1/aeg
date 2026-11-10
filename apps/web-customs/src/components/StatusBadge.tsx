import { useTranslation } from 'react-i18next';

export default function StatusBadge({ value, kind = 'order' }: { value?: string | null; kind?: 'order' | 'review' | 'stage' }) {
  const { t } = useTranslation();
  if (!value) return <span className="badge badge-neutral">{t('status.notStarted')}</span>;
  const tone = value === 'approved' || value === 'cleared' || value === 'done' ? 'success'
    : value === 'changes_requested' || value === 'failed' ? 'danger'
      : value === 'customs_in_progress' || value === 'customs_br' || value === 'duty_paid' || value === 'computing' ? 'info'
        : value === 'pending' || value === 'pending_fee' || value === 'uploaded' ? 'warning' : 'neutral';
  const key = `status.${kind}.${value}`;
  return <span className={`badge badge-${tone}`}>{t(key, { defaultValue: t('status.unknown') })}</span>;
}
