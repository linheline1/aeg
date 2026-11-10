import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getApiErrorMessage } from '@aeg/web-shared/errors';
import { api, useAuth } from '../store/auth';
import PriceReferenceNote from '../components/PriceReferenceNote';
import { useTranslation } from 'react-i18next';
const money = (value?: number | null) => value == null ? '—' : `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const time = (value?: string) => value ? value.slice(0, 16).replace('T', ' ') : '—';

export default function Home() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [orders, setOrders] = useState<any[]>([]);
  const [profile, setProfile] = useState<any>(null);
  const [cnpjs, setCnpjs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  useEffect(() => {
    Promise.all([
      api.get('/api/client/orders'),
      api.get('/api/client/profile'),
      api.get('/api/client/cnpjs')
    ]).then(([orderRes, profileRes, cnpjRes]) => {
      setOrders(orderRes.data || []);
      setProfile(profileRes.data);
      setCnpjs(cnpjRes.data || []);
    }).catch(e => setErr(getApiErrorMessage(e, t('home.loadError')))).finally(() => setLoading(false));
  }, [t]);

  const sorted = useMemo(() => [...orders].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))), [orders]);
  const published = orders.filter(order => order.status === 'done');
  const computing = orders.filter(order => ['uploaded', 'validating', 'pending_fee', 'computing'].includes(order.status));
  const shipments = orders.filter(order => order.shipment_stage).sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
  const inTransit = shipments.filter(order => order.shipment_stage !== 'delivered');
  const defaultCnpj = cnpjs.find(item => item.is_default) || cnpjs[0];
  const needsInvoice = published.filter(order => !order.invoice_cnpj);
  const verification = profile?.client?.verification_status || 'pending';

  if (loading) return <div className="card"><p className="muted">{t('home.loading')}</p></div>;

  return (
    <>
      <div className="page-head home-head">
        <div>
          <h1>{t('home.greeting', { name: user?.username })}</h1>
          <p className="sub">{t('home.subtitle')}</p>
        </div>
        <div className="home-head-actions">
          <Link className="btn btn-lg" to="/workbench">{t('home.uploadCta')}</Link>
        </div>
      </div>
      {err && <div className="alert alert-err">{err}</div>}

      <div className="home-stats">
        {[
          [t('home.stats.all'), orders.length, t('home.stats.allNote')],
          [t('home.stats.computing'), computing.length, t('home.stats.computingNote')],
          [t('home.stats.done'), published.length, t('home.stats.doneNote')],
          [t('home.stats.shipping'), inTransit.length, t('home.stats.shippingNote')]
        ].map(([label, value, note]) => (
          <Link className="card home-stat" to="/orders" key={String(label)}>
            <div className="home-stat-label">{label}</div>
            <div className="home-stat-value">{value}</div>
            <div className="home-stat-foot"><span>{note}</span><span>→</span></div>
          </Link>
        ))}
      </div>

      <div className="home-grid">
        <div className="card">
          <div className="card-title"><h3>{t('home.quickQuote')}</h3><span className="muted text-sm">{t('home.quickQuoteHint')}</span></div>
          <p className="home-action-copy">{t('home.quickQuoteDescription')}</p>
          <div className="home-tags">
            <span className="home-tag">{t('home.tags.ai')}</span>
            <span className="home-tag">{t('home.tags.tax')}</span>
            <span className="home-tag">{t('home.tags.ddp')}</span>
          </div>
          <Link className="btn" to="/workbench">{t('home.startUpload')} →</Link>
        </div>
        <div className="card">
          <div className="card-title"><h3>{t('home.todo')}</h3></div>
          <div className="home-todo">
            {verification !== 'approved' && <Link to="/profile"><span>{t(verification === 'rejected' ? 'home.todoRejected' : 'home.todoPending')}</span><span>→</span></Link>}
            {!defaultCnpj && <Link to="/cnpjs"><span>{t('home.todoAddCnpj')}</span><span>→</span></Link>}
            {defaultCnpj && !defaultCnpj.ie && <Link to="/cnpjs"><span>{t('home.todoAddIe')}</span><span>→</span></Link>}
            {needsInvoice.length > 0 && <Link to="/orders"><span>{t('home.todoInvoice', { count: needsInvoice.length })}</span><span>→</span></Link>}
            {verification === 'approved' && defaultCnpj?.ie && needsInvoice.length === 0 && <span className="muted">{t('home.todoEmpty')}</span>}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-title"><h3>{t('home.recentQuotes')}</h3><Link to="/orders">{t('home.viewAll')} →</Link></div>
        {sorted.length === 0 ? <p className="muted">{t('home.noQuotes')}</p> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>{t('home.table.quote')}</th><th>{t('home.table.uploadedAt')}</th><th>{t('home.table.pieces')}</th><th>CBM</th><th>{t('home.table.value')}</th><th>{t('home.table.ddp')}</th><th>{t('home.table.status')}</th></tr></thead>
              <tbody>{sorted.slice(0, 5).map(order => (
                <tr key={order.id}>
                  <td><Link to={`/orders/${order.id}`}>{order.quote_no}</Link>{order.converted_by_ai && <span className="muted text-sm"> · AI</span>}</td>
                  <td>{time(order.created_at)}</td>
                  <td>{order.total_pcs == null ? '—' : Number(order.total_pcs).toLocaleString()}</td>
                  <td>{order.total_cbm == null ? '—' : Number(order.total_cbm).toFixed(4)}</td>
                  <td>{order.total_amount_rmb == null ? '—' : `${Number(order.total_amount_rmb).toLocaleString(undefined, { maximumFractionDigits: 2 })} RMB`}</td>
                  <td>
                    {order.status === 'done'
                      ? <>{money(order.total_amount_brl)}<span className="ref-tag">{t('common.reference')}</span></>
                      : '—'}
                  </td>
                  <td><span className={`status-tag status-${order.status}`}>{t(`status.${order.status}`, { defaultValue: order.status })}</span></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
        <PriceReferenceNote compact className="mt-12" />
      </div>

      <div className="home-bottom-grid">
        <div className="card">
          <div className="card-title"><h3>{t('home.shipping')}</h3><Link to="/orders">{t('home.myOrders')} →</Link></div>
          {shipments.length === 0 ? <p className="muted">{t('home.noShipping')}</p> : shipments.slice(0, 4).map(order => (
            <div className="home-ship" key={order.id}>
              <div className="row" style={{ justifyContent: 'space-between', gap: 12 }}>
                <Link to={`/orders/${order.id}`}><strong>{order.quote_no}</strong></Link>
                <span className="ship-stage-chip">{t(`shipment.${order.shipment_stage}`, { defaultValue: order.shipment_stage })}</span>
              </div>
              <div className="muted text-sm" style={{ marginTop: 6 }}>{t('home.eta')}：{order.shipment_eta ? order.shipment_eta.slice(0, 10) : t('home.toConfirm')}</div>
            </div>
          ))}
        </div>
        <div className="card">
          <div className="card-title"><h3>{t('home.defaultInvoice')}</h3><Link to="/cnpjs">{t('home.manageData')} →</Link></div>
          {defaultCnpj ? (
            <>
              <p style={{ marginTop: 0 }}><strong>{defaultCnpj.company_name}</strong></p>
              <div className="home-info-row"><span className="muted">CNPJ</span><span>{defaultCnpj.cnpj}</span></div>
              <div className="home-info-row"><span className="muted">IE</span><span>{defaultCnpj.ie || t('home.notFilled')}</span></div>
              {defaultCnpj.situacao_cadastral && <div className="home-info-row"><span className="muted">{t('home.registrationStatus')}</span><span>{defaultCnpj.situacao_cadastral}</span></div>}
            </>
          ) : <p className="muted">{t('home.noInvoiceData')}</p>}
        </div>
      </div>
    </>
  );
}
