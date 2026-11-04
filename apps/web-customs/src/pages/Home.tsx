import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Empty, ErrorMessage, Loading } from '../components/Feedback';
import Icon, { type IconName } from '../components/Icon';
import StatusBadge from '../components/StatusBadge';
import { api, errorMessage } from '../store/auth';
import type { OrderRow } from '../types';
import { brl, dateTime } from '../utils/format';

interface HomeData {
  counts: { pending: number; approved: number; changes_requested: number; customs_in_progress: number; cleared: number };
  recent: OrderRow[];
}

const cards: Array<{ key: keyof HomeData['counts']; label: string; detail: string; icon: IconName; tone: string }> = [
  { key: 'pending', label: 'Aguardando análise', detail: 'DIs para revisar', icon: 'clock', tone: 'amber' },
  { key: 'approved', label: 'DIs aprovadas', detail: 'Revisões concluídas', icon: 'check', tone: 'green' },
  { key: 'changes_requested', label: 'Alterações solicitadas', detail: 'Aguardando ajustes', icon: 'alert', tone: 'red' },
  { key: 'customs_in_progress', label: 'Em desembaraço', detail: 'Processos em andamento', icon: 'ship', tone: 'blue' },
  { key: 'cleared', label: 'Desembaraçados', detail: 'Processos finalizados', icon: 'orders', tone: 'slate' }
];

export default function Home() {
  const [data, setData] = useState<HomeData | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setData((await api.get<HomeData>('/api/customs/home')).data); }
    catch (reason) { setError(errorMessage(reason, 'Não foi possível carregar o resumo.')); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  return (
    <>
      <div className="page-heading"><div><span className="eyebrow">Visão geral</span><h1>Painel aduaneiro</h1><p>Acompanhe as análises e os processos que precisam da sua atenção.</p></div><Link className="btn" to="/orders">Ver todos os pedidos<Icon name="arrow" size={18} /></Link></div>
      {error && <ErrorMessage message={error} onRetry={load} />}
      {loading && !data ? <Loading label="Carregando painel…" /> : data && <>
        <section className="stats-grid" aria-label="Resumo dos processos">
          {cards.map((card) => <article className="stat-card" key={card.key}><div className={`stat-icon stat-${card.tone}`}><Icon name={card.icon} /></div><div className="stat-copy"><span>{card.label}</span><strong>{data.counts[card.key]}</strong><small>{card.detail}</small></div></article>)}
        </section>
        <section className="card" aria-labelledby="recent-title">
          <div className="card-title"><div><h2 id="recent-title">Pendências recentes</h2><p>Pedidos atualizados que aguardam uma ação.</p></div><Link to="/orders">Abrir lista<Icon name="chevron" size={16} /></Link></div>
          {data.recent.length === 0 ? <Empty title="Tudo em dia" description="Não há pendências recentes no momento." /> : <div className="table-wrap"><table className="table"><thead><tr><th>Pedido</th><th>Revisão da DI</th><th>Etapa de desembaraço</th><th className="amount">Total da DI</th><th>Atualizado em</th><th><span className="sr-only">Ação</span></th></tr></thead><tbody>{data.recent.map((order) => <tr key={order.id}><td><Link className="order-link" to={`/orders/${order.id}`}>{order.quote_no}</Link></td><td><StatusBadge value={order.customs_review?.status || 'pending'} kind="review" /></td><td><StatusBadge value={order.shipment_stage} kind="stage" /></td><td className="amount">{brl(order.di_total_brl ?? order.customs_review?.total_di_brl)}</td><td>{dateTime(order.updated_at)}</td><td><Link className="table-action" to={`/orders/${order.id}`} aria-label={`Analisar pedido ${order.quote_no}`}>Analisar<Icon name="arrow" size={16} /></Link></td></tr>)}</tbody></table></div>}
        </section>
      </>}
    </>
  );
}
