import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getApiErrorMessage } from '@aeg/web-shared/errors';
import { api } from '../store/auth';

interface ClientRow {
  id: string;
  name: string;
  china_company_name: string | null;
  status: string;
  verification_status: string;
  username: string | null;
  user_status: string | null;
  quote_count: number;
  open_count: number;
  last_quote_at: string | null;
  created_at: string;
}

export default function MyClients() {
  const { t, i18n } = useTranslation();
  const [rows, setRows] = useState<ClientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const locale = i18n.language.startsWith('pt') ? 'pt-BR' : 'zh-CN';

  const load = () => {
    setLoading(true);
    setError('');
    api.get<ClientRow[]>('/api/ops/orders/clients/mine')
      .then(response => setRows(response.data))
      .catch(err => setError(getApiErrorMessage(err, t('myClients.loadError'))))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const visible = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    return term ? rows.filter(row => [row.name, row.china_company_name, row.username].some(value => value?.toLocaleLowerCase().includes(term))) : rows;
  }, [rows, query]);

  return <>
    <div className="page-title"><div><h1>{t('myClients.title')}</h1><p className="sub">{t('myClients.subtitle')}</p></div></div>
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="row gap-md" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
        <input className="form-input" style={{ flex: '1 1 240px', maxWidth: 420 }} value={query} onChange={event => setQuery(event.target.value)} placeholder={t('myClients.search')} aria-label={t('myClients.search')} />
        <span className="muted text-sm">{t('myClients.count', { count: visible.length })}</span>
      </div>
    </div>
    {loading && <div className="card" role="status">{t('myClients.loading')}</div>}
    {!loading && error && <div className="card" role="alert"><p>{error}</p><button type="button" className="btn btn-sm" onClick={load}>{t('myClients.retry')}</button></div>}
    {!loading && !error && visible.length === 0 && <div className="card"><p className="muted">{query ? t('myClients.noResults') : t('myClients.empty')}</p></div>}
    {!loading && !error && visible.length > 0 && <div className="card table-wrap"><table className="table">
      <thead><tr><th>{t('myClients.client')}</th><th>{t('myClients.account')}</th><th>{t('myClients.status')}</th><th>{t('myClients.verification')}</th><th>{t('myClients.quotes')}</th><th>{t('myClients.followUp')}</th><th>{t('myClients.latest')}</th><th>{t('myClients.action')}</th></tr></thead>
      <tbody>{visible.map(row => <tr key={row.id}>
        <td data-label={t('myClients.client')}><strong>{row.name}</strong>{row.china_company_name && <div className="muted text-sm">{row.china_company_name}</div>}</td>
        <td data-label={t('myClients.account')}>{row.username || '—'}</td>
        <td data-label={t('myClients.status')}>{t(`myClients.status.${row.status}`, { defaultValue: row.status })}{row.user_status === 'disabled' && <span className="muted text-sm"> · {t('myClients.accountDisabled')}</span>}</td>
        <td data-label={t('myClients.verification')}>{t(`myClients.verification.${row.verification_status}`, { defaultValue: row.verification_status })}</td>
        <td data-label={t('myClients.quotes')}>{row.quote_count}</td>
        <td data-label={t('myClients.followUp')}>{row.open_count}</td>
        <td data-label={t('myClients.latest')}>{row.last_quote_at ? new Date(row.last_quote_at).toLocaleString(locale) : '—'}</td>
        <td data-label={t('myClients.action')}><Link className="btn btn-sm btn-ghost" to={`/orders?client_id=${encodeURIComponent(row.id)}`}>{t('myClients.viewQuotes')}</Link></td>
      </tr>)}</tbody>
    </table></div>}
  </>;
}
