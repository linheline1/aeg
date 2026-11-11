import Icon from './Icon';
import { useTranslation } from 'react-i18next';

export function Loading({ label }: { label?: string }) {
  const { t } = useTranslation();
  return <div className="state-card" role="status"><span className="spinner" aria-hidden="true" /><p>{label || t('feedback.loading')}</p></div>;
}

export function Empty({ title, description }: { title: string; description: string }) {
  return <div className="state-card empty-state"><Icon name="file" size={30} /><h3>{title}</h3><p>{description}</p></div>;
}

export function ErrorMessage({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { t } = useTranslation();
  return <div className="alert alert-error" role="alert"><Icon name="alert" /><div><strong>{t('feedback.errorTitle')}</strong><p>{message}</p>{onRetry && <button className="btn btn-ghost btn-sm" onClick={onRetry}>{t('feedback.retry')}</button>}</div></div>;
}

export function SuccessMessage({ children }: { children: React.ReactNode }) {
  return <div className="alert alert-success" role="status"><Icon name="check" /><div>{children}</div></div>;
}
