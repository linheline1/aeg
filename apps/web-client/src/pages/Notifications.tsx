import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getApiErrorMessage } from '@aeg/web-shared/errors';
import { documentTypeLabel } from '@aeg/web-shared/order-documents';
import { api } from '../store/auth';

export const notificationReadEvent = 'aeg:notification-read';

type Notice = {
  id: string;
  type: 'published' | 'accepted' | 'rejected' | 'shipment' | 'exception_open' | 'exception_resolved' | 'document_requested' | 'document_rejected';
  quoteId: string;
  quoteNo: string;
  at: string;
  version?: number;
  stage?: string;
  message?: string;
  read: boolean;
};
type Inbox = { items: Notice[]; total: number; unread: number };

export default function Notifications() {
  const { t, i18n } = useTranslation();
  const [page, setPage] = useState(1);
  const [inbox, setInbox] = useState<Inbox | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [marking, setMarking] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setInbox(null);
    setError('');
    api.get<Inbox>('/api/client/notifications', { params: { page }, signal: controller.signal })
      .then(({ data }) => { if (!controller.signal.aborted) setInbox(data); })
      .catch(reason => { if (!controller.signal.aborted) setError(getApiErrorMessage(reason, t('notifications.error'))); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [page, t]);

  async function mark(ids: string[]) {
    if (!ids.length || marking) return;
    setMarking(true);
    setError('');
    try {
      await api.post('/api/client/notifications/read', { ids });
      const selected = new Set(ids);
      setInbox(current => current && ({
        ...current,
        unread: Math.max(0, current.unread - current.items.filter(item => !item.read && selected.has(item.id)).length),
        items: current.items.map(item => selected.has(item.id) ? { ...item, read: true } : item)
      }));
      window.dispatchEvent(new Event(notificationReadEvent));
    } catch (reason) {
      setError(getApiErrorMessage(reason, t('notifications.error')));
    } finally { setMarking(false); }
  }

  const unreadHere = inbox?.items.filter(item => !item.read).map(item => item.id) ?? [];
  return <div className="card">
    <div className="card-title">
      <h2>{t('notifications.title')}</h2>
      <button type="button" className="btn btn-ghost" disabled={marking || !unreadHere.length} onClick={() => void mark(unreadHere)}>
        {t('notifications.markPage')}
      </button>
    </div>
    {error && <p className="alert alert-err" role="alert">{error}</p>}
    {loading && <p role="status">{t('notifications.loading')}</p>}
    {inbox && <>
      <p className="muted">{t('notifications.unread', { count: inbox.unread })}</p>
      {!inbox.items.length && <p>{t('notifications.empty')}</p>}
      <ul className="notification-list">
        {inbox.items.map(item => {
          const document = item.type === 'document_requested' || item.type === 'document_rejected';
          const stage = !item.stage ? '' : document ? documentTypeLabel(item.stage, i18n.resolvedLanguage) :
            t('orderDetail.shipStage.' + item.stage, { defaultValue: item.stage });
          return <li key={item.id} className={item.read ? '' : 'notification-unread'}>
            <div>
              <Link to={'/orders/' + item.quoteId + (document ? '#order-documents' : '')} onClick={() => { if (!item.read) void mark([item.id]); }}>
                {item.quoteNo} · {t('notifications.' + item.type, { version: item.version, stage })}
              </Link>
              {item.message && <div className="text-sm" style={{ overflowWrap: 'anywhere' }}>{item.message}</div>}
              <div className="muted text-sm">{new Date(item.at).toLocaleString(i18n.resolvedLanguage)}</div>
            </div>
            {!item.read && <button type="button" className="btn btn-sm btn-ghost" disabled={marking} onClick={() => void mark([item.id])}>{t('notifications.markRead')}</button>}
          </li>;
        })}
      </ul>
      {inbox.total > 20 && <div className="row gap-md mt-12">
        <button type="button" className="btn btn-ghost" disabled={page <= 1 || marking} onClick={() => setPage(page - 1)}>{t('notifications.previous')}</button>
        <span>{page} / {Math.ceil(inbox.total / 20)}</span>
        <button type="button" className="btn btn-ghost" disabled={page * 20 >= inbox.total || marking} onClick={() => setPage(page + 1)}>{t('notifications.next')}</button>
      </div>}
    </>}
  </div>;
}
