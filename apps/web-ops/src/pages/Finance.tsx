import { Fragment, useEffect, useState } from 'react';
import { api } from '../store/auth';

interface Payment {
  id: string; amount_brl: number; paid_at: string;
  note: string | null; created_by: string; created_at: string;
}
interface Receivable {
  id: string; quote_no: string; client_id: string; client_name: string;
  total_brl: number; received_brl: number; outstanding_brl: number;
  pay_status: 'unpaid' | 'partial' | 'paid_off';
  deal_status: string | null; salesperson_name: string | null;
  done_at: string; payments: Payment[];
}
interface Summary {
  totals: { order_count: number; paid_off_count: number; receivable_brl: number; received_brl: number; outstanding_brl: number };
  by_month: { month: string; receivable_brl: number; received_brl: number; outstanding_brl: number }[];
  by_client: { client_id: string; client_name: string; receivable_brl: number; received_brl: number; outstanding_brl: number }[];
}

const PAY_CN: Record<string, string> = { unpaid: '未收款', partial: '部分回款', paid_off: '已结清' };
const DEAL_CN: Record<string, string> = { open: '跟进中', won: '已成交', lost: '未成交' };

const brl = (n: number) =>
  'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** M10 财务：应收台账 + 回款登记 + 汇总对账（operator/admin；sales 只读归属单） */
export default function Finance() {
  const [rows, setRows] = useState<Receivable[] | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [paidAt, setPaidAt] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [rowErr, setRowErr] = useState<string | null>(null);

  const role = JSON.parse(localStorage.getItem('aeg_ops_user') || '{}')?.role;
  const canEdit = role === 'operator' || role === 'admin';

  const load = async () => {
    try {
      const [r1, r2] = await Promise.all([
        api.get('/api/ops/finance/receivables'),
        canEdit ? api.get('/api/ops/finance/summary') : Promise.resolve({ data: null })
      ]);
      setRows(r1.data);
      setSummary(r2.data);
    } catch (e: any) {
      setErr(e?.response?.data?.message || e?.message || '加载失败');
    }
  };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const submitPayment = async (q: Receivable) => {
    setBusy(true);
    setRowErr(null);
    try {
      await api.post(`/api/ops/finance/quotes/${q.id}/payments`, {
        amount_brl: Number(amount),
        paid_at: paidAt || undefined,
        note: note || undefined
      });
      setAmount(''); setPaidAt(''); setNote('');
      await load();
    } catch (e: any) {
      setRowErr(e?.response?.data?.message || e?.message || '登记失败');
    } finally {
      setBusy(false);
    }
  };

  const removePayment = async (pid: string) => {
    if (!window.confirm('确认删除该回款记录？')) return;
    try {
      await api.delete(`/api/ops/finance/payments/${pid}`);
      await load();
    } catch (e: any) {
      alert(e?.response?.data?.message || e?.message || '删除失败');
    }
  };

  if (err) return <div className="card"><p style={{ color: 'var(--err)' }}>加载失败:{err}</p></div>;
  if (!rows) return <div className="card"><p className="muted">加载中…</p></div>;

  return (
    <>
      <div className="page-title">
        <h1>财务 · 应收</h1>
        <span className="muted text-sm">已生成参考价的内部应收台账与回款登记</span>
      </div>
      <p className="muted text-sm" style={{ margin: '0 0 12px' }}>
        内部应收基于当前参考 DDP 快照；客户侧金额为参考预估，最终以书面确认和正式账单为准。
      </p>

      {summary && (
        <div className="stat-grid">
          <div className="stat-card">
            <span className="label">应收总额</span>
            <span className="value">{brl(summary.totals.receivable_brl)}</span>
            <span className="delta">{summary.totals.order_count} 单</span>
          </div>
          <div className="stat-card">
            <span className="label">已收</span>
            <span className="value" style={{ color: 'var(--ok)' }}>{brl(summary.totals.received_brl)}</span>
            <span className="delta">已结清 {summary.totals.paid_off_count} 单</span>
          </div>
          <div className="stat-card">
            <span className="label">未收</span>
            <span className="value" style={{ color: summary.totals.outstanding_brl > 0 ? 'var(--err)' : undefined }}>
              {brl(summary.totals.outstanding_brl)}
            </span>
          </div>
        </div>
      )}

      <div className="table-wrap" style={{ marginBottom: 16 }}>
        <table className="table">
          <thead>
            <tr>
              <th>报价号</th><th>客户</th><th className="amt">应收</th><th className="amt">已收</th>
              <th className="amt">未收</th><th>收款状态</th><th>成交</th><th>业务员</th><th></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={9} className="muted" style={{ textAlign: 'center' }}>暂无已发布的报价单</td></tr>
            )}
            {rows.map(q => (
              <Fragment key={q.id}>
                <tr>
                  <td>{q.quote_no}</td>
                  <td>{q.client_name}</td>
                  <td className="amt">{brl(q.total_brl)}</td>
                  <td className="amt">{brl(q.received_brl)}</td>
                  <td className="amt" style={{ color: q.outstanding_brl > 0 ? 'var(--err)' : undefined }}>
                    {brl(q.outstanding_brl)}
                  </td>
                  <td><span className={`pay-${q.pay_status}`}>{PAY_CN[q.pay_status]}</span></td>
                  <td>{q.deal_status ? DEAL_CN[q.deal_status] || q.deal_status : '—'}</td>
                  <td>{q.salesperson_name || '—'}</td>
                  <td>
                    <button
                      className="btn btn-sm btn-ghost"
                      onClick={() => { setOpenId(openId === q.id ? null : q.id); setRowErr(null); }}
                    >
                      {openId === q.id ? '收起' : `回款 (${q.payments.length})`}
                    </button>
                  </td>
                </tr>
                {openId === q.id && (
                  <tr>
                    <td colSpan={9} style={{ background: '#fafbfc' }}>
                      {q.payments.length > 0 && (
                        <table className="table" style={{ marginBottom: 10 }}>
                          <thead>
                            <tr><th>回款日期</th><th className="amt">金额</th><th>备注</th><th>登记人</th>{canEdit && <th></th>}</tr>
                          </thead>
                          <tbody>
                            {q.payments.map(p => (
                              <tr key={p.id}>
                                <td>{p.paid_at}</td>
                                <td className="amt">{brl(p.amount_brl)}</td>
                                <td>{p.note || '—'}</td>
                                <td>{p.created_by}</td>
                                {canEdit && (
                                  <td>
                                    <button className="btn btn-sm btn-danger" onClick={() => removePayment(p.id)}>删除</button>
                                  </td>
                                )}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                      {canEdit && q.outstanding_brl > 0 && (
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                          <input
                            className="form-input" style={{ width: 140 }} type="number" min="0" step="0.01"
                            placeholder={`金额（≤ ${q.outstanding_brl.toFixed(2)}）`}
                            value={amount} onChange={e => setAmount(e.target.value)}
                          />
                          <input
                            className="form-input" style={{ width: 150 }} type="date"
                            value={paidAt} onChange={e => setPaidAt(e.target.value)}
                          />
                          <input
                            className="form-input" style={{ flex: 1, minWidth: 180 }} placeholder="备注（可选）"
                            value={note} onChange={e => setNote(e.target.value)} maxLength={500}
                          />
                          <button className="btn btn-sm" disabled={busy || !amount} onClick={() => submitPayment(q)}>
                            {busy ? '提交中…' : '登记回款'}
                          </button>
                        </div>
                      )}
                      {rowErr && <p style={{ color: 'var(--err)', marginTop: 8 }}>{rowErr}</p>}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {summary && summary.by_month.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div className="card">
            <div className="card-title"><h3>按月对账</h3></div>
            <table className="table">
              <thead><tr><th>月份</th><th className="amt">应收</th><th className="amt">已收</th><th className="amt">未收</th></tr></thead>
              <tbody>
                {summary.by_month.map(m => (
                  <tr key={m.month}>
                    <td>{m.month}</td>
                    <td className="amt">{brl(m.receivable_brl)}</td>
                    <td className="amt">{brl(m.received_brl)}</td>
                    <td className="amt">{brl(m.outstanding_brl)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="card">
            <div className="card-title"><h3>按客户对账</h3></div>
            <table className="table">
              <thead><tr><th>客户</th><th className="amt">应收</th><th className="amt">已收</th><th className="amt">未收</th></tr></thead>
              <tbody>
                {summary.by_client.map(c => (
                  <tr key={c.client_id}>
                    <td>{c.client_name}</td>
                    <td className="amt">{brl(c.receivable_brl)}</td>
                    <td className="amt">{brl(c.received_brl)}</td>
                    <td className="amt">{brl(c.outstanding_brl)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
