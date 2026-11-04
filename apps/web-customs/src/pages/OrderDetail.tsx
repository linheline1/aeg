import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
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
    catch (reason) { setError(errorMessage(reason, 'Não foi possível carregar o pedido.')); }
    finally { setLoading(false); }
  }, [id]);
  useEffect(() => { setLoading(true); void load(); }, [load]);

  const translateProducts = useCallback(async () => {
    setTranslating(true); setTranslationError('');
    try { setOrder((await api.post<OrderDetailData>(`/api/customs/orders/${id}/translate-products`)).data); }
    catch (reason) { setTranslationError(errorMessage(reason, 'Não foi possível traduzir as descrições. Tente novamente.')); }
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
    if (!changeNote.trim()) { setChangeError('Descreva as alterações necessárias antes de enviar.'); return; }
    setChangeBusy(true); setChangeError('');
    try {
      await api.patch<Review>(`/api/customs/orders/${id}/review-status`, { status: 'changes_requested', note: changeNote.trim() });
      setChangesOpen(false); setChangeNote(''); setSuccess('Solicitação de alterações enviada com sucesso.'); await load();
    } catch (reason) { setChangeError(errorMessage(reason, 'Não foi possível solicitar as alterações.')); }
    finally { setChangeBusy(false); }
  };

  if (loading && !order) return <Loading label="Carregando detalhes do pedido…" />;
  if (!order) return <><Link className="back-link" to="/orders"><Icon name="back" size={18} />Voltar aos pedidos</Link><ErrorMessage message={error || 'Pedido não encontrado.'} onRetry={load} /></>;
  const review = order.customs_review;
  return (
    <>
      <Link className="back-link" to="/orders"><Icon name="back" size={18} />Voltar aos pedidos</Link>
      <div className="page-heading detail-heading"><div><span className="eyebrow">Processo aduaneiro</span><div className="title-with-badge"><h1>{order.quote_no}</h1><StatusBadge value={review?.status || 'pending'} kind="review" /></div><p>Atualizado em {dateTime(order.updated_at)}{review?.reviewed_by ? ` · Revisado por ${review.reviewed_by}` : ''}</p></div><div className="heading-actions"><button className="btn btn-ghost" onClick={() => setHistoryOpen(true)}><Icon name="history" size={18} />Histórico de versões</button><button className="btn btn-danger-ghost" onClick={() => { setChangesOpen(true); setChangeError(''); setSuccess(''); }}><Icon name="alert" size={18} />Solicitar alterações</button></div></div>
      {error && <ErrorMessage message={error} onRetry={load} />}{success && <SuccessMessage>{success}</SuccessMessage>}
      <section className="order-overview" aria-label="Resumo do pedido"><div><span>Valor da invoice</span><strong>{rmb(order.total_amount_rmb)}</strong></div><div><span>Valor DDP</span><strong>{brl(order.total_amount_brl)}</strong></div><div><span>Total da DI</span><strong>{brl(order.di_total_brl ?? review?.total_di_brl)}</strong></div><div><span>Volume total</span><strong>{number(order.total_cbm)} m³</strong></div><div><span>Peso bruto</span><strong>{number(order.total_gw_kg)} kg</strong></div></section>
      <section className="card invoice-card"><div className="card-title"><div><h2>Dados da invoice</h2><p>Informações fiscais vinculadas à declaração.</p></div><StatusBadge value={order.shipment_stage} kind="stage" /></div>{order.invoice_cnpj ? <div className="invoice-data"><div><span>Razão social</span><strong>{order.invoice_cnpj.company_name}</strong></div><div><span>CNPJ</span><strong>{order.invoice_cnpj.cnpj}</strong></div><div><span>Inscrição estadual</span><strong>{order.invoice_cnpj.ie || 'Não informada'}</strong></div></div> : <p className="muted">Nenhum CNPJ de invoice vinculado a este pedido.</p>}</section>
      <section className="card" aria-labelledby="products-title"><div className="card-title"><div><h2 id="products-title">Produtos e valores</h2><p>Quantidades, preços e medidas declarados na invoice.</p></div></div>{translating && <p className="section-note" role="status">Traduzindo descrições para inglês…</p>}{translationError && <ErrorMessage message={translationError} onRetry={translateProducts} />}<ProductItems order={order} /></section>
      {order.images.some((image) => image.row_no == null) && <section className="card" aria-labelledby="images-title"><div className="card-title"><div><h2 id="images-title">Imagens gerais do pedido</h2><p>Imagens que não estão vinculadas a uma linha específica.</p></div><span className="badge badge-neutral">{order.images.filter((image) => image.row_no == null).length} {order.images.filter((image) => image.row_no == null).length === 1 ? 'arquivo' : 'arquivos'}</span></div><OrderImages images={order.images.filter((image) => image.row_no == null)} /></section>}
      <section className="card" aria-labelledby="di-title"><div className="card-title"><div><h2 id="di-title">Análise da Declaração de Importação</h2><p>Revise parâmetros, classificação fiscal, tributos e valores da DI.</p></div>{review?.di_review_version && <span className="badge badge-info">Versão {review.di_review_version}</span>}</div>{review?.note && <div className="review-note"><strong>Última nota de revisão</strong><p>{review.note}</p></div>}<DiPanel orderId={order.id} initialAnalysis={order.di_analysis} onUpdated={load} /></section>
      <section className="card" aria-labelledby="shipment-title"><div className="card-title"><div><h2 id="shipment-title">Progresso do desembaraço</h2><p>Registre as etapas e mantenha o histórico do processo atualizado.</p></div></div><ShipmentPanel order={order} onUpdated={load} /></section>
      {historyOpen && <DiHistory orderId={order.id} onClose={() => setHistoryOpen(false)} />}
      {changesOpen && <Modal title="Solicitar alterações" onClose={() => { if (!changeBusy) setChangesOpen(false); }}><form onSubmit={requestChanges}><p className="modal-description">Descreva com clareza o que precisa ser corrigido no pedido <strong>{order.quote_no}</strong>. Esta observação ficará registrada na revisão.</p><div className="field"><label htmlFor="change-note">Alterações necessárias <span className="required">(obrigatório)</span></label><textarea id="change-note" className="form-input" rows={5} maxLength={500} value={changeNote} onChange={(event) => setChangeNote(event.target.value)} required disabled={changeBusy} placeholder="Ex.: revisar a descrição e o NCM dos itens indicados" /></div>{changeError && <div className="form-error" role="alert"><Icon name="alert" size={18} />{changeError}</div>}<div className="modal-actions"><button className="btn btn-ghost" type="button" onClick={() => setChangesOpen(false)} disabled={changeBusy}>Cancelar</button><button className="btn btn-danger" type="submit" disabled={changeBusy || !changeNote.trim()}>{changeBusy ? 'Enviando…' : 'Enviar solicitação'}</button></div></form></Modal>}
    </>
  );
}
