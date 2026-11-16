import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import ProductItems from '../components/ProductItems';
import { ErrorMessage, Loading } from '../components/Feedback';
import { api, errorMessage } from '../store/auth';
import type { OrderDetailData } from '../types';

export default function ProductSheet() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [order, setOrder] = useState<OrderDetailData | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    api.get<OrderDetailData>(`/api/customs/orders/${id}`)
      .then(result => { if (active) setOrder(result.data); })
      .catch(reason => { if (active) setError(errorMessage(reason, t('detail.loadError'))); });
    return () => { active = false; };
  }, [id, t]);
  if (!order && !error) return <Loading label={t('detail.loading')} />;
  if (!order) return <ErrorMessage message={error} />;
  return <>
    <Link className="back-link" to={`/orders/${id}`}>{t('detail.back')}</Link>
    <div className="page-heading"><div><span className="eyebrow">{order.quote_no}</span><h1>{t('products.editPageTitle')}</h1></div></div>
    <section className="card product-sheet-page"><ProductItems order={order} onUpdated={async () => { navigate(`/orders/${id}`); }} /></section>
  </>;
}
