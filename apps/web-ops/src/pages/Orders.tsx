import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getApiErrorMessage } from '@aeg/web-shared/errors';
import { downloadOrShareFile } from '@aeg/web-shared/file-actions';
import { api, useAuth } from '../store/auth';
import { invalidateListCache, readListCache, writeListCache } from '../lib/list-cache';

interface CustomsReview {
  status: 'pending' | 'approved' | 'changes_requested';
  di_review_version: number | null;
  total_di_brl: number | null;
  note: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
}

interface OrderRow {
  id: string;
  quote_no: string;
  client_id: string;
  client_name: string;
  template_version: string;
  status: string;
  input_file_name: string | null;
  total_cbm?: number | null;
  total_gw_kg?: number | null;
  total_amount_brl?: number | null;
  total_amount_usd?: number | null;
  salesperson_id: string | null;
  salesperson_name: string | null;
  deal_status: 'open' | 'won' | 'lost' | null;
  deal_note: string | null;
  created_at: string;
  has_file: boolean;
  customs_review: CustomsReview | null;
}

interface Salesperson {
  id: string;
  username: string;
  status: string;
}

interface ClientOption { id: string; name: string; china_company_name: string | null; }
interface UploadResult {
  ok: boolean;
  quote_id?: string;
  quote_no?: string;
  status?: string;
  message?: string;
  total_amount_brl?: number;
  total_amount_usd?: number;
  total_amount_rmb?: number;
  pricing_breakdown?: { items: { code: string; name: string; amount: number }[]; total: number };
  error_summary?: string;
  errors?: { row: number; col_letter: string; reason: string }[];
}

const STATUS_KEYS: Record<string, string> = {
  uploaded: 'orders.status.uploaded',
  pending_fee: 'orders.status.pendingFee',
  computing: 'orders.status.computing',
  done: 'orders.status.done',
  failed: 'orders.status.failed'
};

/** M4 成交状态：null=未标记 open=跟进中 won=已成交 lost=未成交 */
const DEAL_KEYS: Record<string, string> = {
  open: 'orders.deal.open',
  won: 'orders.deal.won',
  lost: 'orders.deal.lost'
};

const COMPUTABLE = new Set(['uploaded', 'pending_fee', 'failed', 'computing']);
const brl = (n?: number | null) => (n == null ? '—' : n.toLocaleString('pt-BR', { minimumFractionDigits: 2 }));

export default function Orders() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const clientFilter = searchParams.get('client_id') || '';
  const { user } = useAuth();
  const isSales = user?.role === 'sales';

  const [list, setList] = useState<OrderRow[] | null>(null);
  const [salespeople, setSalespeople] = useState<Salesperson[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [keyword, setKeyword] = useState('');
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [clientId, setClientId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [fileKey, setFileKey] = useState(0);
  const [templateUrl, setTemplateUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const listRequest = useRef(0);
  const pageSize = 20;

  const reload = (force = false) => {
    const request = ++listRequest.current;
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (status) params.set('status', status);
    if (q) params.set('q', q);
    if (clientFilter) params.set('client_id', clientFilter);
    const cacheKey = `orders:${user?.id || ''}:${params}`;
    const cached = readListCache<{ items: OrderRow[]; total: number }>(cacheKey);
    if (cached) { setList(cached.items); setTotal(cached.total); }
    else setList(null);
    if (cached && !force) return;
    api.get(`/api/ops/orders?${params}`)
      .then(r => {
        if (request !== listRequest.current) return;
        const value = { items: r.data.items as OrderRow[], total: r.data.total as number };
        writeListCache(cacheKey, value);
        setList(value.items); setTotal(value.total); setErr(null);
      })
      .catch(e => { if (request === listRequest.current) setErr(getApiErrorMessage(e, t('orders.loadError'))); });
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSales, page, status, q, clientFilter]);

  useEffect(() => {
    // 业务员分配下拉（operator/admin）
    if (!isSales) {
      const cached = readListCache<Salesperson[]>('orders:options:salespeople');
      if (cached) { setSalespeople(cached); return; }
      api.get('/api/ops/salespeople')
        .then(r => { setSalespeople(r.data); writeListCache('orders:options:salespeople', r.data); })
        .catch(() => {});
    }
  }, [isSales]);

  // 客户下拉：运营/管理员用于转客户，业务员用于上传报价
  useEffect(() => {
    const cached = readListCache<ClientOption[]>('orders:options:clients');
    if (cached) { setClients(cached); return; }
    api.get('/api/ops/orders/clients/options')
      .then(r => { const value = r.data || []; setClients(value); writeListCache('orders:options:clients', value); })
      .catch(e => setErr(getApiErrorMessage(e, t('orders.clientsLoadError'))));
  }, []);

  useEffect(() => {
    if (!isSales) return;
    const cached = readListCache<string>('orders:options:template');
    if (cached) { setTemplateUrl(cached); return; }
    api.get('/api/client/template/current')
      .then(r => { const value = r.data.download_url || ''; setTemplateUrl(value); if (value) writeListCache('orders:options:template', value); })
      .catch(() => setTemplateUrl(''));
  }, [isSales]);

  const downloadTemplate = async () => {
    if (!templateUrl) return;
    try {
      const r = await api.get(templateUrl, { responseType: 'blob' });
      await downloadOrShareFile(r.data, `${t('template.fileName')}.xlsx`);
    } catch { setErr(t('orders.templateDownloadFailed')); }
  };

  const uploadQuote = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setUploadResult(null);
    if (!clientId) { setErr(t('rates.selectClientError')); return; }
    if (!file) { setErr(t('orders.fileRequired')); return; }
    setUploading(true);
    try {
      const data = new FormData();
      data.append('client_id', clientId);
      data.append('file', file);
      const r = await api.post('/api/ops/orders/upload', data);
      setUploadResult(r.data);
      if (r.data.ok) {
        setFile(null);
        setFileKey(k => k + 1);
        invalidateListCache('orders:'); reload(true);
      }
    } catch (e: any) {
      setErr(getApiErrorMessage(e, t('orders.uploadFailed')));
    } finally { setUploading(false); }
  };

  /** M4 成交标记：won/lost/open（未成交可选填原因） */
  const markDeal = async (o: OrderRow, next: 'won' | 'lost' | 'open') => {
    if (next === 'won' && o.customs_review?.status !== 'approved') {
      alert(t('orders.customsApprovalRequired'));
      return;
    }
    let note: string | undefined;
    if (next === 'lost') {
      note = window.prompt(t('orders.lostReasonPrompt')) ?? undefined;
    }
    setBusyId(o.id);
    try {
      await api.patch(`/api/ops/orders/${o.id}/deal`, {
        deal_status: next,
        ...(note !== undefined ? { note } : {})
      });
      invalidateListCache('orders:'); reload(true);
    } catch (e: any) {
      alert(getApiErrorMessage(e, t('orders.actionFailed')));
    } finally {
      setBusyId(null);
    }
  };

  /** M4 改派业务员（客户归属兜底 + 订单级改派，传空=清除改派回到客户归属） */
  const assign = async (o: OrderRow, salespersonId: string) => {
    setBusyId(o.id);
    try {
      await api.patch(`/api/ops/orders/${o.id}/assign`, {
        salesperson_id: salespersonId === 'inherit' ? null : salespersonId
      });
      invalidateListCache('orders:'); reload(true);
    } catch (e: any) {
      alert(getApiErrorMessage(e, t('orders.assignFailed')));
      reload(true);
    } finally {
      setBusyId(null);
    }
  };

  /** 转客户：把该报价号转给另一个客户（归属业务员回到新客户默认业务员） */
  const changeClient = async (o: OrderRow, nextClientId: string) => {
    if (!nextClientId || nextClientId === o.client_id) return;
    const target = clients.find(c => c.id === nextClientId);
    if (!window.confirm(t('orders.clientChangeConfirm', {
      quote: o.quote_no,
      client: target?.name || nextClientId
    }))) return;
    setBusyId(o.id);
    try {
      await api.patch(`/api/ops/orders/${o.id}/client`, { client_id: nextClientId });
      invalidateListCache('orders:'); reload(true);
    } catch (e: any) {
      alert(getApiErrorMessage(e, t('orders.clientChangeFailed')));
      reload(true);
    } finally {
      setBusyId(null);
    }
  };

  const compute = async (o: OrderRow) => {
    setBusyId(o.id);
    try {
      await api.post(`/api/ops/orders/${o.id}/compute`);
      invalidateListCache('orders:'); reload(true);
    } catch (e: any) {
      alert(getApiErrorMessage(e, t('orders.computeFailed')));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <div className="page-title">
        <h1>{isSales ? t('orders.titleSales') : t('orders.title')}</h1>
        <p className="sub">
          {isSales
            ? t('orders.subtitleSales')
            : t('orders.subtitleAll')}
        </p>
      </div>

      {clientFilter && <div className="card" style={{ marginBottom: 12 }}>
        <span>{clients.find(client => client.id === clientFilter)?.name || '—'}</span>{' · '}
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => { setSearchParams({}); setPage(1); }}>{t('myClients.clearFilter')}</button>
      </div>}

      {err && <p className="err">❌ {err}</p>}

      {isSales && (
        <div className="card">
          <div className="card-title">
            <h3>📤 {t('orders.uploadTitle')}</h3>
            <button className="btn btn-ghost btn-sm" type="button" disabled={!templateUrl} onClick={downloadTemplate}>{t('orders.downloadTemplate')}</button>
          </div>
          {clients.length === 0 ? (
            <p className="muted">{t('orders.noClients')}</p>
          ) : (
            <form onSubmit={uploadQuote}>
              <div className="row gap-md order-upload-controls" style={{ flexWrap: 'wrap' }}>
                <select className="form-input" style={{ width: 260 }} value={clientId} disabled={uploading}
                  onChange={e => setClientId(e.target.value)}>
                  <option value="">{t('rates.selectClient')}</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.china_company_name || c.name}</option>)}
                </select>
                <input key={fileKey} type="file" accept=".xlsx" disabled={uploading}
                  onChange={e => setFile(e.target.files?.[0] || null)} />
                <button className="btn" disabled={uploading || !clientId || !file}>
                  {uploading ? t('orders.uploading') : t('orders.uploadSubmit')}
                </button>
              </div>
              <p className="muted text-sm">{t('orders.uploadHint')}</p>
            </form>
          )}
          {uploadResult?.error_summary && <div className="alert alert-err">❌ {uploadResult.error_summary}</div>}
          {uploadResult?.errors && uploadResult.errors.length > 0 && (
            <ul className="muted text-sm">
              {uploadResult.errors.slice(0, 10).map((error, i) => <li key={i}>{t('orders.rowError', { row: error.row, col: error.col_letter, reason: error.reason })}</li>)}
            </ul>
          )}
          {uploadResult?.ok && (
            <div className="alert alert-ok">
              <strong>{t('orders.uploadSuccess', { quote: uploadResult.quote_no })}</strong>
              {uploadResult.total_amount_rmb != null && <div style={{ marginTop: 6 }}>{t('orders.declaredAmount', { amount: brl(uploadResult.total_amount_rmb) })}</div>}
              <div style={{ marginTop: 8, fontSize: 18 }}>{t('orders.ddpTotal', { amount: brl(uploadResult.total_amount_brl) })}</div>
              <div>{t('orders.oceanFreight', { amount: brl(uploadResult.total_amount_usd) })}</div>
              {uploadResult.pricing_breakdown && <div className="text-sm" style={{ marginTop: 6 }}>
                {uploadResult.pricing_breakdown.items.map(item => <div key={item.code}>{item.name}: R$ {brl(item.amount)}</div>)}
              </div>}
              {uploadResult.message && <div style={{ marginTop: 6 }}>{uploadResult.message}</div>}
              <div className="text-sm" style={{ marginTop: 6 }}>{t('orders.referenceNote')}</div>
            </div>
          )}
        </div>
      )}

      <div className="card" style={{ marginBottom: 12, padding: 12 }}>
        <form
          className="row gap-md order-filters"
          onSubmit={e => { e.preventDefault(); setPage(1); setQ(keyword.trim()); }}
        >
          <select
            className="form-input form-input-sm" style={{ width: 140 }}
            value={status}
            onChange={e => { setPage(1); setStatus(e.target.value); }}
          >
            <option value="">{t('orders.allStatuses')}</option>
            {Object.keys(STATUS_KEYS).map(k => <option key={k} value={k}>{t(STATUS_KEYS[k])}</option>)}
          </select>
          <input
            className="form-input form-input-sm" style={{ flex: 1, maxWidth: 320 }}
            placeholder={t('orders.searchPlaceholder')}
            value={keyword}
            onChange={e => setKeyword(e.target.value)}
          />
          <button className="btn btn-sm" type="submit">{t('common.search')}</button>
          {q && (
            <button
              className="btn btn-sm btn-ghost" type="button"
              onClick={() => { setKeyword(''); setPage(1); setQ(''); }}
            >
              {t('products.clear')}
            </button>
          )}
          <span className="muted text-sm">{t('orders.totalCount', { count: total })}</span>
        </form>
      </div>

      {list && (
        <div className="card table-wrap orders-table-wrap">
          <table className="table orders-table">
            <thead>
              <tr>
                <th>{t('orders.quoteNo')}</th>
                <th className="text-nowrap">{t('orders.client')}</th>
                <th className="text-nowrap">{t('orders.status')}</th>
                <th>{t('orders.customsReview')}</th>
                <th>{t('orders.amountBrl')}</th>
                <th>{t('orders.dealStatus')}</th>
                {!isSales && <th>{t('orders.salesperson')}</th>}
                {!isSales && <th className="actions-col">{t('orders.actions')}</th>}
              </tr>
            </thead>
            <tbody>
              {list.map(o => {
                const dealLabel = o.deal_status
                  ? (DEAL_KEYS[o.deal_status] ? t(DEAL_KEYS[o.deal_status]) : o.deal_status)
                  : t('orders.deal.none');
                const dealCls = o.deal_status === 'won' ? 'deal-won'
                  : o.deal_status === 'lost' ? 'deal-lost'
                  : o.deal_status === 'open' ? 'deal-open' : 'deal-none';
                const customsApproved = o.customs_review?.status === 'approved';
                return (
                  <tr key={o.id} className={busyId === o.id ? 'row-editing' : ''}>
                    <td data-label={t('orders.quoteNo')}>
                      <div className="text-nowrap">
                        {isSales ? (
                          <strong>{o.quote_no}</strong>
                        ) : (
                          <Link to={`/orders/${o.id}`}><strong>{o.quote_no}</strong></Link>
                        )}
                      </div>
                      {o.has_file && (
                        <a
                          className="muted"
                          style={{ fontSize: 12 }}
                          href={`#dl-${o.id}`}
                          onClick={async e => {
                            e.preventDefault();
                            try {
                              const r = await api.get(`/api/ops/orders/${o.id}/file`, { responseType: 'blob' });
                              await downloadOrShareFile(r.data, o.input_file_name || `${o.quote_no}.xlsx`);
                            } catch {
                              alert(t('orders.originalDownloadFailed'));
                            }
                          }}
                        >
                          📎 {o.input_file_name || t('orders.originalFile')}
                        </a>
                      )}
                      <div className="muted text-nowrap" style={{ fontSize: 11 }}>{o.created_at.slice(0, 16).replace('T', ' ')}</div>
                    </td>
                    <td data-label={t('orders.client')} className="text-nowrap">
                      {isSales ? o.client_name : (
                        <select
                          className="form-input form-input-sm"
                          style={{ width: 150 }}
                          value={o.client_id}
                          disabled={busyId === o.id}
                          onChange={e => changeClient(o, e.target.value)}
                          title={t('orders.clientChangeHint')}
                        >
                          {!clients.some(c => c.id === o.client_id) && (
                            <option value={o.client_id}>{o.client_name}</option>
                          )}
                          {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      )}
                    </td>
                    <td data-label={t('orders.status')} className="text-nowrap"><span className={`status-${o.status}`}>{STATUS_KEYS[o.status] ? t(STATUS_KEYS[o.status]) : o.status}</span></td>
                    <td data-label={t('orders.customsReview')}>
                      {o.customs_review ? (
                        <div>
                          <span className={`deal-tag ${o.customs_review.status === 'approved' ? 'deal-won' : o.customs_review.status === 'changes_requested' ? 'deal-lost' : 'deal-open'}`}>
                            {o.customs_review.status === 'pending'
                              ? t('orders.customs.pending')
                              : o.customs_review.status === 'approved'
                                ? t('orders.customs.approvedVersion', { version: o.customs_review.di_review_version != null ? ` v${o.customs_review.di_review_version}` : '' })
                                : t('orders.customs.changesRequested')}
                          </span>
                          {o.customs_review.status === 'changes_requested' && o.customs_review.note && (
                            <div className="muted" style={{ fontSize: 11, maxWidth: 160, marginTop: 4 }} title={o.customs_review.note}>
                              {o.customs_review.note}
                            </div>
                          )}
                        </div>
                      ) : <span className="muted" style={{ fontSize: 12 }}>{t('orders.customs.notSubmitted')}</span>}
                    </td>
                    <td data-label={t('orders.amountBrl')} className="amt">R$ {brl(o.total_amount_brl)}</td>
                    <td data-label={t('orders.dealStatus')}>
                      {o.status === 'done' ? (
                        <div>
                          <span className={`deal-tag ${dealCls}`}>{dealLabel}</span>
                          <select
                            className="form-input form-input-sm"
                            style={{ marginTop: 4, width: 104 }}
                            value={o.deal_status || ''}
                            disabled={busyId === o.id}
                            onChange={e => {
                              const v = e.target.value as '' | 'won' | 'lost' | 'open';
                              if (v === '') return; // 「未标记」仅展示，不重复提交
                              markDeal(o, v);
                            }}
                          >
                            <option value="">{t('orders.deal.none')}</option>
                            <option value="open">{t('orders.deal.open')}</option>
                            <option
                              value="won"
                              disabled={!customsApproved}
                              title={customsApproved ? t('orders.deal.markApprovedHint') : t('orders.customsApprovalRequired')}
                            >{t('orders.deal.won')}</option>
                            <option value="lost">{t('orders.deal.lost')}</option>
                          </select>
                          {o.deal_note && (
                            <div className="muted" style={{ fontSize: 11, maxWidth: 130, marginTop: 2 }} title={o.deal_note}>
                              {o.deal_note}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="muted" style={{ fontSize: 12 }}>{t('orders.deal.afterCompute')}</span>
                      )}
                    </td>
                    {!isSales && (
                      <td data-label={t('orders.salesperson')}>
                        <select
                          className="form-input form-input-sm"
                          style={{ width: 110 }}
                          value={o.salesperson_id || ''}
                          disabled={busyId === o.id}
                          onChange={e => assign(o, e.target.value)}
                          title={o.salesperson_id ? t('orders.assignReassignHint') : t('orders.assignHint')}
                        >
                          <option value="">{t('orderDetail.summary.unassigned')}</option>
                          {salespeople.map(s => (
                            <option key={s.id} value={s.id}>{s.username}</option>
                          ))}
                        </select>
                      </td>
                    )}
                    {!isSales && (
                      <td data-label={t('orders.actions')} className="actions-col">
                        <div className="row-actions">
                          <Link to={`/orders/${o.id}`}>{t('orders.view')}</Link>
                          {COMPUTABLE.has(o.status) && (
                            <a href="#compute" onClick={e => { e.preventDefault(); compute(o); }}>{t('orders.compute')}</a>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {list && list.length === 0 && <div className="card"><p className="muted">{t('orders.empty')}</p></div>}

      {total > 0 && (
        <div className="row gap-md pagination" style={{ justifyContent: 'flex-end', alignItems: 'center', marginTop: 12 }}>
          <span className="muted text-sm">{t('products.page', { page, pageCount: Math.max(1, Math.ceil(total / pageSize)) })}</span>
          <button className="btn btn-sm btn-ghost" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>{t('products.previous')}</button>
          <button
            className="btn btn-sm btn-ghost"
            disabled={page >= Math.ceil(total / pageSize)}
            onClick={() => setPage(p => p + 1)}
          >
            {t('products.next')}
          </button>
        </div>
      )}
    </>
  );
}
