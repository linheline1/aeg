import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getApiErrorMessage } from '@aeg/web-shared/errors';
import { api, useAuth } from '../store/auth';
import PriceReferenceNote from '../components/PriceReferenceNote';

const STATUS: Record<string, string> = {
  uploaded: '已上传', validating: '校验中', pending_fee: '待核算', computing: '计算中', done: '参考价已生成', failed: '失败'
};
const SHIPMENT: Record<string, string> = {
  booked: '已订舱', loaded: '已装柜', customs_cn: '中国报关', departed: '已开船', on_water: '海运途中',
  arrived: '已到港', customs_br: '巴西清关中', duty_paid: '关税已缴', cleared: '清关放行', delivered: '已签收'
};
const money = (value?: number | null) => value == null ? '—' : `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const time = (value?: string) => value ? value.slice(0, 16).replace('T', ' ') : '—';

export default function Home() {
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
    }).catch(e => setErr(getApiErrorMessage(e, '首页数据加载失败'))).finally(() => setLoading(false));
  }, []);

  const sorted = useMemo(() => [...orders].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))), [orders]);
  const published = orders.filter(order => order.status === 'done');
  const computing = orders.filter(order => ['uploaded', 'validating', 'pending_fee', 'computing'].includes(order.status));
  const shipments = orders.filter(order => order.shipment_stage).sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
  const inTransit = shipments.filter(order => order.shipment_stage !== 'delivered');
  const defaultCnpj = cnpjs.find(item => item.is_default) || cnpjs[0];
  const needsInvoice = published.filter(order => !order.invoice_cnpj);
  const verification = profile?.client?.verification_status || 'pending';

  if (loading) return <div className="card"><p className="muted">首页数据加载中…</p></div>;

  return (
    <>
      <div className="page-head home-head">
        <div>
          <h1>您好，{user?.username}</h1>
          <p className="sub">管理报价、订单物流和巴西开票资料</p>
        </div>
        <div className="home-head-actions">
          <Link className="btn btn-lg" to="/workbench">上传 Excel 获取报价</Link>
        </div>
      </div>
      {err && <div className="alert alert-err">{err}</div>}

      <div className="home-stats">
        {[
          ['全部报价', orders.length, '累计报价单'],
          ['核算中', computing.length, '等待运营核算'],
          ['参考价已生成', published.length, '参考价可用'],
          ['运输中订单', inTransit.length, '物流进行中']
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
          <div className="card-title"><h3>快捷报价</h3><span className="muted text-sm">不同格式 Excel 均可识别</span></div>
          <p className="home-action-copy">上传后先核对总件数、产品金额、整单货值和 CBM，再自动完成税费与参考 DDP 预估。</p>
          <div className="home-tags">
            <span className="home-tag">AI 格式识别</span>
            <span className="home-tag">税费预估</span>
            <span className="home-tag">参考 DDP</span>
          </div>
          <Link className="btn" to="/workbench">开始上传 →</Link>
        </div>
        <div className="card">
          <div className="card-title"><h3>待办事项</h3></div>
          <div className="home-todo">
            {verification !== 'approved' && <Link to="/profile"><span>企业认证{verification === 'rejected' ? '被驳回，请重新提交' : '待审核'}</span><span>→</span></Link>}
            {!defaultCnpj && <Link to="/cnpjs"><span>添加巴西公司 CNPJ 和 IE</span><span>→</span></Link>}
            {defaultCnpj && !defaultCnpj.ie && <Link to="/cnpjs"><span>补充默认巴西公司的 IE</span><span>→</span></Link>}
            {needsInvoice.length > 0 && <Link to="/orders"><span>{needsInvoice.length} 个已生成参考价的订单待选择开票公司</span><span>→</span></Link>}
            {verification === 'approved' && defaultCnpj?.ie && needsInvoice.length === 0 && <span className="muted">暂无待办事项</span>}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-title"><h3>最近报价</h3><Link to="/orders">查看全部 →</Link></div>
        {sorted.length === 0 ? <p className="muted">还没有报价，上传第一份装箱清单开始。</p> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>报价号</th><th>上传时间</th><th>总件数</th><th>CBM</th><th>申报货值</th><th>参考DDP</th><th>状态</th></tr></thead>
              <tbody>{sorted.slice(0, 5).map(order => (
                <tr key={order.id}>
                  <td><Link to={`/orders/${order.id}`}>{order.quote_no}</Link>{order.converted_by_ai && <span className="muted text-sm"> · AI</span>}</td>
                  <td>{time(order.created_at)}</td>
                  <td>{order.total_pcs == null ? '—' : Number(order.total_pcs).toLocaleString()}</td>
                  <td>{order.total_cbm == null ? '—' : Number(order.total_cbm).toFixed(4)}</td>
                  <td>{order.total_amount_rmb == null ? '—' : `${Number(order.total_amount_rmb).toLocaleString(undefined, { maximumFractionDigits: 2 })} RMB`}</td>
                  <td>
                    {order.status === 'done'
                      ? <>{money(order.total_amount_brl)}<span className="ref-tag">参考</span></>
                      : '—'}
                  </td>
                  <td><span className={`status-tag status-${order.status}`}>{STATUS[order.status] || order.status}</span></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
        <PriceReferenceNote compact className="mt-12" />
      </div>

      <div className="home-bottom-grid">
        <div className="card">
          <div className="card-title"><h3>物流跟踪</h3><Link to="/orders">我的订单 →</Link></div>
          {shipments.length === 0 ? <p className="muted">安排运输后，物流节点会显示在这里。</p> : shipments.slice(0, 4).map(order => (
            <div className="home-ship" key={order.id}>
              <div className="row" style={{ justifyContent: 'space-between', gap: 12 }}>
                <Link to={`/orders/${order.id}`}><strong>{order.quote_no}</strong></Link>
                <span className="ship-stage-chip">{SHIPMENT[order.shipment_stage] || order.shipment_stage}</span>
              </div>
              <div className="muted text-sm" style={{ marginTop: 6 }}>预计到港：{order.shipment_eta ? order.shipment_eta.slice(0, 10) : '待确认'}</div>
            </div>
          ))}
        </div>
        <div className="card">
          <div className="card-title"><h3>默认开票公司</h3><Link to="/cnpjs">管理资料 →</Link></div>
          {defaultCnpj ? (
            <>
              <p style={{ marginTop: 0 }}><strong>{defaultCnpj.company_name}</strong></p>
              <div className="home-info-row"><span className="muted">CNPJ</span><span>{defaultCnpj.cnpj}</span></div>
              <div className="home-info-row"><span className="muted">IE</span><span>{defaultCnpj.ie || '未填写'}</span></div>
              {defaultCnpj.situacao_cadastral && <div className="home-info-row"><span className="muted">登记状态</span><span>{defaultCnpj.situacao_cadastral}</span></div>}
            </>
          ) : <p className="muted">尚未添加巴西公司开票信息。</p>}
        </div>
      </div>
    </>
  );
}
