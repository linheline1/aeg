import Icon from './Icon';

export function Loading({ label = 'Carregando informações…' }: { label?: string }) {
  return <div className="state-card" role="status"><span className="spinner" aria-hidden="true" /><p>{label}</p></div>;
}

export function Empty({ title, description }: { title: string; description: string }) {
  return <div className="state-card empty-state"><Icon name="file" size={30} /><h3>{title}</h3><p>{description}</p></div>;
}

export function ErrorMessage({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return <div className="alert alert-error" role="alert"><Icon name="alert" /><div><strong>Não foi possível continuar</strong><p>{message}</p>{onRetry && <button className="btn btn-ghost btn-sm" onClick={onRetry}>Tentar novamente</button>}</div></div>;
}

export function SuccessMessage({ children }: { children: React.ReactNode }) {
  return <div className="alert alert-success" role="status"><Icon name="check" /><div>{children}</div></div>;
}
