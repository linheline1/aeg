import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../store/auth';
import PriceReferenceNote from '../components/PriceReferenceNote';

interface QuoteOrder {
  id: string;
  quote_no: string;
  template_version: string;
  status: string;
  total_amount_brl?: number | null;
  total_amount_usd?: number | null;
  total_amount_rmb?: number | null;
  declared_currency?: 'RMB' | 'USD';
  total_pcs?: number | null;
  total_cbm?: number | null;
  input_file_name?: string | null;
  converted_by_ai?: boolean;
  ai_notes?: string | null;
  /** 金额是否为参考预估（接口未返回时按参考处理） */
  price_is_reference?: boolean;
  /** M7：物流摘要 */
  shipment_stage?: string | null;
  shipment_eta?: string | null;
  created_at: string;
  updated_at?: string;
}

/** M7 物流节点阶段（清关环节细化为三节点） */
const SHIP_STAGE_CN: Record<string, string> = {
  booked: '已订舱', loaded: '已装柜', customs_cn: '中国报关', departed: '已开船',
  on_water: '海运途中', arrived: '已到港', customs_br: '巴西清关中',
  duty_paid: '关税已缴', cleared: '清关放行', delivered: '已签收'
};

const STATUS_CN: Record<string, string> = {
  done: '参考价已生成',
  computing: '计算中',
  pending_fee: '待核算',
  validating: '校验中',
  uploaded: '已上传',
  failed: '失败'
};

const fmtBRL = (n: number) =>
  'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtUSD = (n: number) =>
  'US$ ' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtTime = (s?: string | null) => (s ? s.slice(0, 16).replace('T', ' ') : '—');

export default function Orders() {
  const [list, setList] = useState<QuoteOrder[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api.get('/api/client/orders')
      .then(r => setList([...(r.data as QuoteOrder[])].sort((a, b) => b.created_at.localeCompare(a.created_at))))
      .catch(e => setErr(e?.response?.data?.message || '加载失败'));
  }, []);

  const latest = list && list.length > 0
    ? list.reduce((a, b) =>
        (a.updated_at || a.created_at) > (b.updated_at || b.created_at) ? a : b
      )
    : null;

  return (
    <>
      <div className="page-head">
        <h1>我的报价</h1>
        <p className="sub">运营核算完成后生成的 DDP 参考预估在此处查看，金额不构成最终报价</p>
      </div>

      {err && <div className="alert alert-err">加载失败：{err}</div>}

      {list === null && !err && (
        <div className="quote-grid">
          {[0, 1, 2].map(i => <div className="quote-card sk" key={i} />)}
        </div>
      )}

      {list && list.length > 0 && (
        <>
          <div className="orders-stats">
            <span className="stat-chip">共 {list.length} 份报价</span>
            {latest && (
              <span className="stat-chip">最近更新 {fmtTime(latest.updated_at || latest.created_at)}</span>
            )}
          </div>

          <div className="quote-note">
            <b>费用说明：</b>
            <span>
              US$ 为<b>参考海运费</b>（中国起运港 + 海运段，美元计价）；
              R$ 为 <b>参考DDP 巴西全程总价</b>，包含海运费、港杂费、进口税费、销售税务及综合运营费用；
              内部运营成本不向客户拆分展示，所有金额均为参考预估。
            </span>
          </div>

          <PriceReferenceNote className="price-ref-note-mb" />

          <div className="card" style={{ padding: 0 }}>
            <div className="table-wrap">
              <table className="table" style={{ minWidth: 1180, margin: 0 }}>
                <thead>
                  <tr>
                    <th>报价号 / 清单</th><th>上传时间</th><th>总件数</th><th>CBM</th><th>申报货值</th>
                    <th>参考海运费</th><th>参考DDP 巴西全程总价</th><th>状态</th><th>物流节点</th><th className="actions-col">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map(o => (
                    <tr key={o.id}>
                      <td>
                        <Link to={`/orders/${o.id}`}><strong>{o.quote_no}</strong></Link>
                        <div className="muted text-sm" title={o.input_file_name || ''}>{o.input_file_name || '装箱清单'}</div>
                        {o.converted_by_ai && (
                          <span className="quote-ai-tag" title={o.ai_notes || '该清单由 AI 自动识别并转换格式'}>AI 已识别转换</span>
                        )}
                      </td>
                      <td>{fmtTime(o.created_at)}</td>
                      <td>{o.total_pcs == null ? '—' : o.total_pcs.toLocaleString()}</td>
                      <td>{o.total_cbm == null ? '—' : o.total_cbm.toFixed(4)}</td>
                      <td>
                        {o.total_amount_rmb == null ? '—' : `${o.total_amount_rmb.toLocaleString('zh-CN', { maximumFractionDigits: 2 })} RMB`}
                        {o.declared_currency === 'USD' && <div className="muted text-sm">USD 已折算</div>}
                      </td>
                      <td>{o.status === 'done' && o.total_amount_usd != null ? fmtUSD(o.total_amount_usd) : '—'}</td>
                      <td>
                        {o.status === 'done' && o.total_amount_brl != null
                          ? <><strong>{fmtBRL(o.total_amount_brl)}</strong><span className="ref-tag">参考</span></>
                          : '—'}
                      </td>
                      <td><span className={`status-tag status-${o.status}`}>{STATUS_CN[o.status] || o.status}</span></td>
                      <td>
                        {o.shipment_stage ? (
                          <>
                            <span className="ship-stage-chip">{SHIP_STAGE_CN[o.shipment_stage] || o.shipment_stage}</span>
                            {o.shipment_eta && <div className="muted text-sm">ETA {o.shipment_eta.slice(0, 10)}</div>}
                          </>
                        ) : '—'}
                      </td>
                      <td className="actions-col"><Link className="btn btn-sm btn-ghost" to={`/orders/${o.id}`}>查看详情</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {list && list.length === 0 && !err && (
        <div className="card empty-state">
          <p className="empty-title">暂无报价单</p>
          <p className="muted">上传装箱清单并通过运营核算后，参考价会自动生成到这里</p>
          <Link className="btn" to="/workbench">去工作台上传清单</Link>
        </div>
      )}
    </>
  );
}
