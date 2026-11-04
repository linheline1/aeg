import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Empty, ErrorMessage, Loading } from '../components/Feedback';
import Icon from '../components/Icon';
import StatusBadge from '../components/StatusBadge';
import { api, errorMessage } from '../store/auth';
import type { OrderRow } from '../types';
import { brl, dateTime } from '../utils/format';

interface OrderList { items: OrderRow[]; total: number; page: number; pageSize: number }
const PAGE_SIZE = 15;

export default function Orders() {
  const [data, setData] = useState<OrderList | null>(null);
  const [status, setStatus] = useState('');
  const [keyword, setKeyword] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (status) params.set('status', status);
    if (query) params.set('q', query);
    try { setData((await api.get<OrderList>(`/api/customs/orders?${params}`)).data); }
    catch (reason) { setError(errorMessage(reason, 'Não foi possível carregar os pedidos.')); }
    finally { setLoading(false); }
  }, [page, query, status]);
  useEffect(() => { void load(); }, [load]);

  const totalPages = Math.max(1, Math.ceil((data?.total || 0) / PAGE_SIZE));
  return (
    <>
      <div className="page-heading"><div><span className="eyebrow">Gestão de processos</span><h1>Pedidos e declarações</h1><p>Consulte os valores da DI, revise tributos e acompanhe o desembaraço.</p></div></div>
      <section className="card filter-card" aria-label="Filtros de pedidos">
        <form className="filters" onSubmit={(event) => { event.preventDefault(); setPage(1); setQuery(keyword.trim()); }}>
          <div className="field search-field"><label htmlFor="order-search">Buscar pedido</label><div className="input-with-icon"><Icon name="search" size={18} /><input id="order-search" className="form-input" value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="Número do pedido" /></div></div>
          <div className="field"><label htmlFor="order-status">Situação</label><select id="order-status" className="form-input" value={status} onChange={(event) => { setPage(1); setStatus(event.target.value); }}><option value="">Todas as situações</option><option value="pending">Aguardando análise</option><option value="approved">DI aprovada</option><option value="changes_requested">Alterações solicitadas</option></select></div>
          <div className="filter-actions"><button className="btn" type="submit" disabled={loading}><Icon name="search" size={17} />Filtrar</button>{(query || status) && <button className="btn btn-ghost" type="button" onClick={() => { setKeyword(''); setQuery(''); setStatus(''); setPage(1); }}>Limpar filtros</button>}</div>
        </form>
      </section>
      {error && <ErrorMessage message={error} onRetry={load} />}
      <section className="card list-card" aria-labelledby="orders-list-title">
        <div className="card-title"><div><h2 id="orders-list-title">Lista de pedidos</h2><p>{data ? `${data.total} ${data.total === 1 ? 'pedido encontrado' : 'pedidos encontrados'}` : 'Consultando pedidos'}</p></div><button className="icon-button" type="button" onClick={load} disabled={loading} aria-label="Atualizar lista"><Icon name="refresh" /></button></div>
        {loading && !data ? <Loading label="Carregando pedidos…" /> : data?.items.length === 0 ? <Empty title="Nenhum pedido encontrado" description="Ajuste os filtros ou tente uma nova busca." /> : data && <>
          <div className={`table-wrap${loading ? ' table-loading' : ''}`} aria-busy={loading}><table className="table orders-table"><thead><tr><th>Pedido</th><th>Revisão da DI</th><th>Versão</th><th className="amount">Total da DI</th><th>Desembaraço</th><th>Atualizado em</th><th><span className="sr-only">Ação</span></th></tr></thead><tbody>{data.items.map((order) => <tr key={order.id}><td><Link className="order-link" to={`/orders/${order.id}`}>{order.quote_no}</Link><small className="cell-note">Criado em {dateTime(order.created_at)}</small></td><td><StatusBadge value={order.customs_review?.status || 'pending'} kind="review" /></td><td>{order.customs_review?.di_review_version ? `Versão ${order.customs_review.di_review_version}` : 'Sem revisão'}</td><td className="amount">{brl(order.di_total_brl ?? order.customs_review?.total_di_brl)}</td><td><StatusBadge value={order.shipment_stage} kind="stage" /></td><td>{dateTime(order.updated_at)}</td><td><Link className="table-action" to={`/orders/${order.id}`} aria-label={`Abrir pedido ${order.quote_no}`}>Abrir<Icon name="arrow" size={16} /></Link></td></tr>)}</tbody></table></div>
          <nav className="pagination" aria-label="Paginação dos pedidos"><span>Página {data.page} de {totalPages}</span><div><button className="btn btn-ghost btn-sm" disabled={page <= 1 || loading} onClick={() => setPage((value) => value - 1)}>Anterior</button><button className="btn btn-ghost btn-sm" disabled={page >= totalPages || loading} onClick={() => setPage((value) => value + 1)}>Próxima</button></div></nav>
        </>}
      </section>
    </>
  );
}
