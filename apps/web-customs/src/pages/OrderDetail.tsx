import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import DiHistory from '../components/DiHistory';
import DiPanel from '../components/DiPanel';
import { ErrorMessage, Loading, SuccessMessage } from '../components/Feedback';
import Icon from '../components/Icon';
import Modal from '../components/Modal';
import OrderImages from '../components/OrderImages';
import ProductItems from '../components/ProductItems';
import ShipmentPanel from '../components/ShipmentPanel';
import StatusBadge from '../components/StatusBadge';
import { api, errorMessage } from '../store/auth';
import type { OrderDetailData, Review } from '../types';
import { brl, dateTime, number, rmb } from '../utils/format';

export default function OrderDetail() {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const [order, setOrder] = useState<OrderDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [changesOpen, setChangesOpen] = useState(false);
  const [changeNote, setChangeNote] = useState('');
  const [changeError, setChangeError] = useState('');
  const [changeBusy, setChangeBusy] = useState(false);
  const [success, setSuccess] = useState('');
  const [translating, setTranslating] = useState(false);
  const [translationError, setTranslationError] = useState('');
  const [translationAttempted, setTranslationAttempted] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try { setOrder((await api.get<OrderDetailData>(`/api/customs/orders/${id}`)).data); }
    catch (reason) { setError(errorMessage(reason, t('detail.loadError'))); }
    finally { setLoading(false); }
  }, [id]);
  useEffect(() => { setLoading(true); void load(); }, [load]);

  const translateProducts = useCallback(async () => {
    setTranslating(true); setTranslationError('');
    try { setOrder((await api.post<OrderDetailData>(`/api/customs/orders/${id}/translate-products`)).data); }
    catch (reason) { setTranslationError(errorMessage(reason, t('detail.translationError'))); }
    finally { setTranslating(false); }
  }, [id]);
  useEffect(() => { setTranslationAttempted(false); setTranslationError(''); }, [id]);
  useEffect(() => {
    if (!order || translationAttempted) return;
    setTranslationAttempted(true);
    const needsTranslation = order.line_items.some((item) => {
      const english = String(item.product_en || '').trim();
      return !english || /[\u3400-\u9fff]/i.test(english);
    });
    if (needsTranslation) void translateProducts();
  }, [order, translationAttempted, translateProducts]);

  const requestChanges = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!changeNote.trim()) { setChangeError(t('detail.changeRequired')); return; }
    setChangeBusy(true); setChangeError('');
    try {
      await api.patch<Review>(`/api/customs/orders/${id}/review-status`, { status: 'changes_requested', note: changeNote.trim() });
      setChangesOpen(false); setChangeNote(''); setSuccess(t('detail.changeSuccess')); await load();
    } catch (reason) { setChangeError(errorMessage(reason, t('detail.changeError'))); }
    finally { setChangeBusy(false); }
  };

  if (loading && !order) return <Loading label={t('detail.loading')} />;
  if (!order) return <><Link className="back-link" to="/orders"><Icon name="back" size={18} />{t('detail.back')}</Link><ErrorMessage message={error || t('detail.notFound')} onRetry={load} /></>;
  const review = order.customs_review;
  return (
    <>
      <Link className="back-link" to="/orders"><Icon name="back" size={18} />{t('detail.back')}</Link>
      <div className="page-heading detail-heading"><div><span className="eyebrow">{t('detail.eyebrow')}</span><div className="title-with-badge"><h1>{order.quote_no}</h1><StatusBadge value={review?.status || 'pending'} kind="review" /></div><p>{t('detail.updatedAt', { date: dateTime(order.updated_at) })}{review?.reviewed_by ? ` · ${t('detail.reviewedBy', { name: review.reviewed_by })}` : ''}</p></div><div className="heading-actions"><button className="btn btn-ghost" onClick={() => setHistoryOpen(true)}><Icon name="history" size={18} />{t('detail.versionHistory')}</button><button className="btn btn-danger-ghost" onClick={() => { setChangesOpen(true); setChangeError(''); setSuccess(''); }}><Icon name="alert" size={18} />{t('detail.requestChanges')}</button></div></div>
      {error && <ErrorMessage message={error} onRetry={load} />}{success && <SuccessMessage>{success}</SuccessMessage>}
      <section className="order-overview" aria-label={t('detail.summaryLabel')}><div><span>{t('detail.invoiceValue')}</span><strong>{rmb(order.total_amount_rmb)}</strong></div><div><span>{t('detail.ddpValue')}</span><strong>{brl(order.total_amount_brl)}</strong></div><div><span>{t('table.diTotal')}</span><strong>{brl(order.di_total_brl ?? review?.total_di_brl)}</strong></div><div><span>{t('detail.totalVolume')}</span><strong>{number(order.total_cbm)} m³</strong></div><div><span>{t('detail.grossWeight')}</span><strong>{number(order.total_gw_kg)} kg</strong></div></section>
      <section className="card invoice-card"><div className="card-title"><div><h2>{t('detail.invoiceData')}</h2><p>{t('detail.invoiceDescription')}</p></div><StatusBadge value={order.shipment_stage} kind="stage" /></div>{order.invoice_cnpj ? <div className="invoice-data"><div><span>{t('detail.companyName')}</span><strong>{order.invoice_cnpj.company_name}</strong></div><div><span>CNPJ</span><strong>{order.invoice_cnpj.cnpj}</strong></div><div><span>{t('detail.stateRegistration')}</span><strong>{order.invoice_cnpj.ie || t('detail.notProvided')}</strong></div></div> : <p className="muted">{t('detail.noInvoiceCnpj')}</p>}</section>
      <section className="card" aria-labelledby="products-title"><div className="card-title"><div><h2 id="products-title">{t('detail.productsTitle')}</h2><p>{t('detail.productsDescription')}</p></div></div>{translating && <p className="section-note" role="status">{t('detail.translating')}</p>}{translationError && <ErrorMessage message={translationError} onRetry={translateProducts} />}<ProductItems order={order} /></section>
      {order.images.some((image) => image.row_no == null) && <section className="card" aria-labelledby="images-title"><div className="card-title"><div><h2 id="images-title">{t('detail.imagesTitle')}</h2><p>{t('detail.imagesDescription')}</p></div><span className="badge badge-neutral">{t('detail.files', { count: order.images.filter((image) => image.row_no == null).length })}</span></div><OrderImages images={order.images.filter((image) => image.row_no == null)} /></section>}
      <section className="card" aria-labelledby="di-title"><div className="card-title"><div><h2 id="di-title">{t('detail.diTitle')}</h2><p>{t('detail.diDescription')}</p></div>{review?.di_review_version && <span className="badge badge-info">{t('orders.versionValue', { version: review.di_review_version })}</span>}</div>{review?.note && <div className="review-note"><strong>{t('detail.lastReviewNote')}</strong><p>{review.note}</p></div>}<DiPanel orderId={order.id} initialAnalysis={order.di_analysis} onUpdated={load} /></section>
      <section className="card" aria-labelledby="shipment-title"><div className="card-title"><div><h2 id="shipment-title">{t('detail.shipmentTitle')}</h2><p>{t('detail.shipmentDescription')}</p></div></div><ShipmentPanel order={order} onUpdated={load} /></section>
      {historyOpen && <DiHistory orderId={order.id} onClose={() => setHistoryOpen(false)} />}
      {changesOpen && <Modal title={t('detail.requestChanges')} onClose={() => { if (!changeBusy) setChangesOpen(false); }}><form onSubmit={requestChanges}><p className="modal-description">{t('detail.changeDescription', { quote: order.quote_no })}</p><div className="field"><label htmlFor="change-note">{t('detail.changeLabel')} <span className="required">{t('detail.required')}</span></label><textarea id="change-note" className="form-input" rows={5} maxLength={500} value={changeNote} onChange={(event) => setChangeNote(event.target.value)} required disabled={changeBusy} placeholder={t('detail.changePlaceholder')} /></div>{changeError && <div className="form-error" role="alert"><Icon name="alert" size={18} />{changeError}</div>}<div className="modal-actions"><button className="btn btn-ghost" type="button" onClick={() => setChangesOpen(false)} disabled={changeBusy}>{t('common.cancel')}</button><button className="btn btn-danger" type="submit" disabled={changeBusy || !changeNote.trim()}>{changeBusy ? t('detail.sending') : t('detail.sendRequest')}</button></div></form></Modal>}
    </>
  );
}
