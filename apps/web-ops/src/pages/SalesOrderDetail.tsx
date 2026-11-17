import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../store/auth';
import { getApiErrorMessage } from '@aeg/web-shared/errors';

type Quote = {
  quote_no: string; client_name: string; status: string; created_at: string;
  total_amount_rmb?: number | null; total_amount_brl?: number | null;
  total_cbm?: number | null; total_gw_kg?: number | null;
  deal_status?: string | null; deal_note?: string | null;
  pricing_breakdown?: { items?: { name: string; amount: number }[]; total?: number } | null;
  shipment?: { vessel_name?: string; voyage_no?: string; events?: { stage: string; happened_at: string }[] } | null;
  line_items?: Record<string, unknown>[];
};

export default function SalesOrderDetail() {
  const { id } = useParams();
  const { t } = useTranslation();
  const [quote, setQuote] = useState<Quote | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    api.get<Quote>(`/api/ops/orders/${id}`)
      .then(({ data }) => { if (active) setQuote(data); })
      .catch(reason => { if (active) setError(getApiErrorMessage(reason)); });
    return () => { active = false; };
  }, [id]);

  if (error) return <div className="card"><p className="err-msg">{error}</p><Link to="/orders">{t('common.back')}</Link></div>;
  if (!quote) return <div className="card">{t('common.loading')}</div>;
  const amount = (value?: number | null) => value == null ? '—' : Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 });
  return <>
    <div className="page-title"><h1><Link to="/orders" className="btn-link">← {t('common.back')}</Link> &nbsp; {quote.quote_no}</h1></div>
    <div className="card">
      <div className="card-title"><h3>{t('orderDetail.summary.title')}</h3></div>
      <div className="grid-3">
        <p><span className="muted">{t('orderDetail.summary.client')}</span><br /><strong>{quote.client_name}</strong></p>
        <p><span className="muted">{t('orders.status')}</span><br />{quote.status}</p>
        <p><span className="muted">{t('orders.dealStatus')}</span><br />{quote.deal_status || '—'}</p>
        <p><span className="muted">{t('orderDetail.summary.declaredAmount')}</span><br />¥ {amount(quote.total_amount_rmb)}</p>
        <p><span className="muted">{t('orderDetail.summary.totalBrl')}</span><br />R$ {amount(quote.total_amount_brl)}</p>
        <p><span className="muted">{t('orderDetail.summary.totalCbm')}</span><br />{amount(quote.total_cbm)}</p>
        <p><span className="muted">{t('orderDetail.summary.totalGw')}</span><br />{amount(quote.total_gw_kg)}</p>
        <p><span className="muted">{t('orders.createdAt')}</span><br />{quote.created_at?.slice(0, 16).replace('T', ' ')}</p>
      </div>
      {quote.deal_note && <p>{quote.deal_note}</p>}
    </div>
    {quote.pricing_breakdown && <div className="card">
      <div className="card-title"><h3>{t('orders.amountBrl')}</h3></div>
      {quote.pricing_breakdown.items?.map((item, index) => <p key={index}>{item.name}: R$ {amount(item.amount)}</p>)}
      <strong>R$ {amount(quote.pricing_breakdown.total ?? quote.total_amount_brl)}</strong>
    </div>}
    {quote.shipment && <div className="card">
      <div className="card-title"><h3>{t('orderDetail.ship.title')}</h3></div>
      <p>{[quote.shipment.vessel_name, quote.shipment.voyage_no].filter(Boolean).join(' · ')}</p>
      {quote.shipment.events?.map((event, index) => <p key={index}>{event.stage} · {event.happened_at?.slice(0, 16).replace('T', ' ')}</p>)}
    </div>}
    <div className="card">
      <div className="card-title"><h3>{t('orderDetail.lines.title')}</h3></div>
      {quote.line_items?.length ? <div className="table-wrap"><table className="table"><thead><tr>
        {['rowNo', 'productCn', 'productEn', 'hsCode', 'totalPcs', 'unitPrice', 'totalPrice'].map(key => <th key={key}>{t(`orderDetail.field.${key}`)}</th>)}
      </tr></thead><tbody>{quote.line_items.map((item, index) => <tr key={String(item.row_no ?? index)}>
        {['row_no', 'product_cn', 'product_en', 'hs_code', 'total_pcs', 'unit_price', 'total_price'].map(key => <td key={key}>{String(item[key] ?? '—')}</td>)}
      </tr>)}</tbody></table></div> : <p className="muted">{t('orderDetail.lines.noRows')}</p>}
    </div>
  </>;
}
