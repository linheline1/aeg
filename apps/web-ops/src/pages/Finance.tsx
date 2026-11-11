import { Fragment, useEffect, useState } from 'react';
import { getApiErrorMessage } from '@aeg/web-shared/errors';
import { api } from '../store/auth';
import { useTranslation } from 'react-i18next';

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

const brl = (n: number) =>
  'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** M10 财务：应收台账 + 回款登记 + 汇总对账（operator/admin；sales 只读归属单） */
export default function Finance() {
  const { t } = useTranslation();
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
      setErr(getApiErrorMessage(e, t('finance.loadError')));
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
      setRowErr(getApiErrorMessage(e, t('finance.paymentError')));
    } finally {
      setBusy(false);
    }
  };

  const removePayment = async (pid: string) => {
    if (!window.confirm(t('finance.deleteConfirm'))) return;
    try {
      await api.delete(`/api/ops/finance/payments/${pid}`);
      await load();
    } catch (e: any) {
      alert(getApiErrorMessage(e, t('finance.deleteError')));
    }
  };

  if (err) return <div className="card"><p style={{ color: 'var(--err)' }}>{t('finance.loadError')}：{err}</p></div>;
  if (!rows) return <div className="card"><p className="muted">{t('common.loading')}</p></div>;

  return (
    <>
      <div className="page-title">
        <h1>{t('finance.title')}</h1>
        <span className="muted text-sm">{t('finance.subtitle')}</span>
      </div>
      <p className="muted text-sm" style={{ margin: '0 0 12px' }}>
        {t('finance.note')}
      </p>

      {summary && (
        <div className="stat-grid">
          <div className="stat-card">
            <span className="label">{t('finance.receivable')}</span>
            <span className="value">{brl(summary.totals.receivable_brl)}</span>
            <span className="delta">{t('finance.orderCount', { count: summary.totals.order_count })}</span>
          </div>
          <div className="stat-card">
            <span className="label">{t('finance.received')}</span>
            <span className="value" style={{ color: 'var(--ok)' }}>{brl(summary.totals.received_brl)}</span>
            <span className="delta">{t('finance.paidCount', { count: summary.totals.paid_off_count })}</span>
          </div>
          <div className="stat-card">
            <span className="label">{t('finance.outstanding')}</span>
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
              <th>{t('finance.quote')}</th><th>{t('finance.client')}</th><th className="amt">{t('finance.receivable')}</th><th className="amt">{t('finance.received')}</th>
              <th className="amt">{t('finance.outstanding')}</th><th>{t('finance.payStatus')}</th><th>{t('finance.deal')}</th><th>{t('finance.salesperson')}</th><th></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={9} className="muted" style={{ textAlign: 'center' }}>{t('finance.empty')}</td></tr>
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
                  <td><span className={`pay-${q.pay_status}`}>{t(`finance.pay.${q.pay_status}`)}</span></td>
                  <td>{q.deal_status ? t(`finance.dealStatus.${q.deal_status}`, { defaultValue: q.deal_status }) : '—'}</td>
                  <td>{q.salesperson_name || '—'}</td>
                  <td>
                    <button
                      className="btn btn-sm btn-ghost"
                      onClick={() => { setOpenId(openId === q.id ? null : q.id); setRowErr(null); }}
                    >
                      {openId === q.id ? t('finance.collapse') : t('finance.payments', { count: q.payments.length })}
                    </button>
                  </td>
                </tr>
                {openId === q.id && (
                  <tr>
                    <td colSpan={9} style={{ background: '#fafbfc' }}>
                      {q.payments.length > 0 && (
                        <table className="table" style={{ marginBottom: 10 }}>
                          <thead>
                            <tr><th>{t('finance.paidAt')}</th><th className="amt">{t('finance.amount')}</th><th>{t('finance.paymentNote')}</th><th>{t('finance.createdBy')}</th>{canEdit && <th></th>}</tr>
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
                                    <button className="btn btn-sm btn-danger" onClick={() => removePayment(p.id)}>{t('common.delete')}</button>
                                  </td>
                                )}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                      {canEdit && q.outstanding_brl > 0 && (
                        <div className="payment-form" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                          <input
                            className="form-input" style={{ width: 140 }} type="number" min="0" step="0.01"
                            placeholder={t('finance.amountPlaceholder', { amount: q.outstanding_brl.toFixed(2) })}
                            value={amount} onChange={e => setAmount(e.target.value)}
                          />
                          <input
                            className="form-input" style={{ width: 150 }} type="date"
                            value={paidAt} onChange={e => setPaidAt(e.target.value)}
                          />
                          <input
                            className="form-input" style={{ flex: 1, minWidth: 180 }} placeholder={t('finance.notePlaceholder')}
                            value={note} onChange={e => setNote(e.target.value)} maxLength={500}
                          />
                          <button className="btn btn-sm" disabled={busy || !amount} onClick={() => submitPayment(q)}>
                            {busy ? t('finance.submitting') : t('finance.registerPayment')}
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
        <div className="finance-reconciliation" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div className="card">
            <div className="card-title"><h3>{t('finance.byMonth')}</h3></div>
            <div className="finance-reconciliation-table">
              <table className="table">
                <thead><tr><th>{t('finance.month')}</th><th className="amt">{t('finance.receivable')}</th><th className="amt">{t('finance.received')}</th><th className="amt">{t('finance.outstanding')}</th></tr></thead>
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
          </div>
          <div className="card">
            <div className="card-title"><h3>{t('finance.byClient')}</h3></div>
            <div className="finance-reconciliation-table">
              <table className="table">
                <thead><tr><th>{t('finance.client')}</th><th className="amt">{t('finance.receivable')}</th><th className="amt">{t('finance.received')}</th><th className="amt">{t('finance.outstanding')}</th></tr></thead>
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
        </div>
      )}
    </>
  );
}
