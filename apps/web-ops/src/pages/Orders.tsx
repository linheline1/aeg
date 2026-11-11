import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getApiErrorMessage } from '@aeg/web-shared/errors';
import { downloadOrShareFile } from '@aeg/web-shared/file-actions';
import { api, useAuth } from '../store/auth';

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

const STATUS_CN: Record<string, string> = {
  uploaded: '已上传',
  pending_fee: '待核算',
  computing: '计算中',
  done: '已发布',
  failed: '失败'
};

/** M4 成交状态：null=未标记 open=跟进中 won=已成交 lost=未成交 */
const DEAL_CN: Record<string, string> = {
  open: '跟进中',
  won: '已成交',
  lost: '未成交'
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
  const pageSize = 20;

  const reload = () => {
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (status) params.set('status', status);
    if (q) params.set('q', q);
    if (clientFilter) params.set('client_id', clientFilter);
    api.get(`/api/ops/orders?${params}`)
      .then(r => { setList(r.data.items); setTotal(r.data.total); })
      .catch(e => setErr(getApiErrorMessage(e, '加载失败')));
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSales, page, status, q, clientFilter]);

  useEffect(() => {
    // 业务员分配下拉（operator/admin）
    if (!isSales) {
      api.get('/api/ops/salespeople')
        .then(r => setSalespeople(r.data))
        .catch(() => {});
    }
  }, [isSales]);

  useEffect(() => {
    if (!isSales) return;
    api.get('/api/ops/orders/clients/options')
      .then(r => setClients(r.data || []))
      .catch(e => setErr(getApiErrorMessage(e, '客户列表加载失败')));
    api.get('/api/client/template/current')
      .then(r => setTemplateUrl(r.data.download_url || ''))
      .catch(() => setTemplateUrl(''));
  }, [isSales]);

  const downloadTemplate = async () => {
    if (!templateUrl) return;
    try {
      const r = await api.get(templateUrl, { responseType: 'blob' });
      await downloadOrShareFile(r.data, '巴西整柜装箱清单_模板.xlsx');
    } catch { setErr('模板下载失败'); }
  };

  const uploadQuote = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setUploadResult(null);
    if (!clientId) { setErr('请选择客户'); return; }
    if (!file) { setErr('请选择要上传的 Excel 清单'); return; }
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
        reload();
      }
    } catch (e: any) {
      setErr(getApiErrorMessage(e, '上传报价失败'));
    } finally { setUploading(false); }
  };

  /** M4 成交标记：won/lost/open（未成交可选填原因） */
  const markDeal = async (o: OrderRow, next: 'won' | 'lost' | 'open') => {
    if (next === 'won' && o.customs_review?.status !== 'approved') {
      alert('需由报关行批准当前 DI 版本后才能标记成交');
      return;
    }
    let note: string | undefined;
    if (next === 'lost') {
      note = window.prompt('未成交原因（可选，将记入审计日志）：') ?? undefined;
    }
    setBusyId(o.id);
    try {
      await api.patch(`/api/ops/orders/${o.id}/deal`, {
        deal_status: next,
        ...(note !== undefined ? { note } : {})
      });
      reload();
    } catch (e: any) {
      alert(getApiErrorMessage(e, '操作失败'));
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
      reload();
    } catch (e: any) {
      alert(getApiErrorMessage(e, '分配失败'));
      reload();
    } finally {
      setBusyId(null);
    }
  };

  const compute = async (o: OrderRow) => {
    setBusyId(o.id);
    try {
      await api.post(`/api/ops/orders/${o.id}/compute`);
      reload();
    } catch (e: any) {
      alert(getApiErrorMessage(e, '核算失败'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <div className="page-title">
        <h1>{isSales ? '报价跟进' : '报价订单'}</h1>
        <p className="sub">
          {isSales
            ? '归属您的客户报价单：上传 Excel 生成参考 DDP 预估，核算发布后请及时跟进并标记成交状态（客户侧展示为参考预估，非最终价）'
            : '客户上传的报价订单：核算、改派业务员、跟进成交状态'}
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
            <h3>📤 上传 Excel 获取参考 DDP 预估</h3>
            <button className="btn btn-ghost btn-sm" type="button" disabled={!templateUrl} onClick={downloadTemplate}>下载清单模板</button>
          </div>
          {clients.length === 0 ? (
            <p className="muted">暂无可上传的客户，请联系管理员先分配客户归属。</p>
          ) : (
            <form onSubmit={uploadQuote}>
              <div className="row gap-md order-upload-controls" style={{ flexWrap: 'wrap' }}>
                <select className="form-input" style={{ width: 260 }} value={clientId} disabled={uploading}
                  onChange={e => setClientId(e.target.value)}>
                  <option value="">请选择客户</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.china_company_name || c.name}</option>)}
                </select>
                <input key={fileKey} type="file" accept=".xlsx" disabled={uploading}
                  onChange={e => setFile(e.target.files?.[0] || null)} />
                <button className="btn" disabled={uploading || !clientId || !file}>
                  {uploading ? '上传并计算中…' : '上传并获取参考 DDP 预估'}
                </button>
              </div>
              <p className="muted text-sm">仅支持 .xlsx。按客户费率与 DI 计算海运、港杂费、巴西进口税费及利润，生成参考 DDP 预估；客户侧展示为参考价，不构成最终报价。</p>
            </form>
          )}
          {uploadResult?.error_summary && <div className="alert alert-err">❌ {uploadResult.error_summary}</div>}
          {uploadResult?.errors && uploadResult.errors.length > 0 && (
            <ul className="muted text-sm">
              {uploadResult.errors.slice(0, 10).map((error, i) => <li key={i}>第 {error.row} 行 / {error.col_letter} 列：{error.reason}</li>)}
            </ul>
          )}
          {uploadResult?.ok && (
            <div className="alert alert-ok">
              <strong>上传成功：{uploadResult.quote_no}（参考 DDP 预估）</strong>
              {uploadResult.total_amount_rmb != null && <div style={{ marginTop: 6 }}>整柜申报金额：¥ {brl(uploadResult.total_amount_rmb)}</div>}
              <div style={{ marginTop: 8, fontSize: 18 }}>参考 DDP 预估总价：R$ {brl(uploadResult.total_amount_brl)}</div>
              <div>国际海运费（USD，按系统费率）：US$ {brl(uploadResult.total_amount_usd)}</div>
              {uploadResult.pricing_breakdown && <div className="text-sm" style={{ marginTop: 6 }}>
                {uploadResult.pricing_breakdown.items.map(item => <div key={item.code}>{item.name}：R$ {brl(item.amount)}</div>)}
              </div>}
              {uploadResult.message && <div style={{ marginTop: 6 }}>{uploadResult.message}</div>}
              <div className="text-sm" style={{ marginTop: 6 }}>客户侧展示为参考预估，最终价格以运营确认后为准。</div>
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
            <option value="">全部状态</option>
            {Object.entries(STATUS_CN).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <input
            className="form-input form-input-sm" style={{ flex: 1, maxWidth: 320 }}
            placeholder="搜索报价号 / 文件名，回车搜索"
            value={keyword}
            onChange={e => setKeyword(e.target.value)}
          />
          <button className="btn btn-sm" type="submit">搜索</button>
          {q && (
            <button
              className="btn btn-sm btn-ghost" type="button"
              onClick={() => { setKeyword(''); setPage(1); setQ(''); }}
            >
              清除
            </button>
          )}
          <span className="muted text-sm">共 {total} 单</span>
        </form>
      </div>

      {list && (
        <div className="card table-wrap orders-table-wrap">
          <table className="table orders-table">
            <thead>
              <tr>
                <th>报价号</th>
                <th className="text-nowrap">客户</th>
                <th className="text-nowrap">状态</th>
                <th>报关审核</th>
                <th>BRL 合计</th>
                <th>成交状态</th>
                {!isSales && <th>业务员</th>}
                <th>创建时间</th>
                {!isSales && <th className="actions-col">操作</th>}
              </tr>
            </thead>
            <tbody>
              {list.map(o => {
                const dealCn = o.deal_status ? DEAL_CN[o.deal_status] : '未标记';
                const dealCls = o.deal_status === 'won' ? 'deal-won'
                  : o.deal_status === 'lost' ? 'deal-lost'
                  : o.deal_status === 'open' ? 'deal-open' : 'deal-none';
                const customsApproved = o.customs_review?.status === 'approved';
                return (
                  <tr key={o.id} className={busyId === o.id ? 'row-editing' : ''}>
                    <td data-label="报价号">
                      <div>
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
                              alert('原文件下载失败');
                            }
                          }}
                        >
                          📎 {o.input_file_name || '原文件'}
                        </a>
                      )}
                    </td>
                    <td data-label="客户" className="text-nowrap">{o.client_name}</td>
                    <td data-label="状态" className="text-nowrap"><span className={`status-${o.status}`}>{STATUS_CN[o.status] || o.status}</span></td>
                    <td data-label="报关审核">
                      {o.customs_review ? (
                        <div>
                          <span className={`deal-tag ${o.customs_review.status === 'approved' ? 'deal-won' : o.customs_review.status === 'changes_requested' ? 'deal-lost' : 'deal-open'}`}>
                            {o.customs_review.status === 'pending'
                              ? '等待报关行'
                              : o.customs_review.status === 'approved'
                                ? `已批准${o.customs_review.di_review_version != null ? ` v${o.customs_review.di_review_version}` : ''}`
                                : '需修改'}
                          </span>
                          {o.customs_review.status === 'changes_requested' && o.customs_review.note && (
                            <div className="muted" style={{ fontSize: 11, maxWidth: 160, marginTop: 4 }} title={o.customs_review.note}>
                              {o.customs_review.note}
                            </div>
                          )}
                        </div>
                      ) : <span className="muted" style={{ fontSize: 12 }}>未提交</span>}
                    </td>
                    <td data-label="BRL 合计" className="amt">R$ {brl(o.total_amount_brl)}</td>
                    <td data-label="成交状态">
                      {o.status === 'done' ? (
                        <div>
                          <span className={`deal-tag ${dealCls}`}>{dealCn}</span>
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
                            <option value="">未标记</option>
                            <option value="open">跟进中</option>
                            <option
                              value="won"
                              disabled={!customsApproved}
                              title={customsApproved ? '标记已成交' : '需由报关行批准当前 DI 版本后才能标记成交'}
                            >已成交</option>
                            <option value="lost">未成交</option>
                          </select>
                          {o.deal_note && (
                            <div className="muted" style={{ fontSize: 11, maxWidth: 130, marginTop: 2 }} title={o.deal_note}>
                              {o.deal_note}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="muted" style={{ fontSize: 12 }}>核算后可标记</span>
                      )}
                    </td>
                    {!isSales && (
                      <td data-label="业务员">
                        <select
                          className="form-input form-input-sm"
                          style={{ width: 110 }}
                          value={o.salesperson_id || ''}
                          disabled={busyId === o.id}
                          onChange={e => assign(o, e.target.value)}
                          title={o.salesperson_id ? '改派业务员（清空=回到客户默认归属）' : '指定业务员'}
                        >
                          <option value="">未分配</option>
                          {salespeople.map(s => (
                            <option key={s.id} value={s.id}>{s.username}</option>
                          ))}
                        </select>
                      </td>
                    )}
                    <td data-label="创建时间" className="muted" style={{ fontSize: 12 }}>{o.created_at.slice(0, 16).replace('T', ' ')}</td>
                    {!isSales && (
                      <td data-label="操作" className="actions-col">
                        <div className="row-actions">
                          <Link to={`/orders/${o.id}`}>查看</Link>
                          {COMPUTABLE.has(o.status) && (
                            <a href="#compute" onClick={e => { e.preventDefault(); compute(o); }}>核算</a>
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

      {list && list.length === 0 && <div className="card"><p className="muted">没有符合条件的订单</p></div>}

      {total > 0 && (
        <div className="row gap-md pagination" style={{ justifyContent: 'flex-end', alignItems: 'center', marginTop: 12 }}>
          <span className="muted text-sm">第 {page} / {Math.max(1, Math.ceil(total / pageSize))} 页</span>
          <button className="btn btn-sm btn-ghost" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>上一页</button>
          <button
            className="btn btn-sm btn-ghost"
            disabled={page >= Math.ceil(total / pageSize)}
            onClick={() => setPage(p => p + 1)}
          >
            下一页
          </button>
        </div>
      )}
    </>
  );
}
