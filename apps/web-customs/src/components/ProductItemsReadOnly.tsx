import { useTranslation } from 'react-i18next';
import type { OrderDetailData } from '../types';
import { numeric, text } from '../utils/data';
import { number, rmb } from '../utils/format';
import { Empty } from './Feedback';
import OrderImages from './OrderImages';

export default function ProductItemsReadOnly({ order }: { order: OrderDetailData }) {
  const { t } = useTranslation();
  if (!order.line_items.length) return <Empty title={t('products.emptyTitle')} description={t('products.emptyDescription')} />;
  return <div className="table-wrap product-table-wrap"><table className="table product-table product-table-readonly">
    <colgroup>{[68, 280, 96, 120, 100, 120, 120, 115, 115].map((width, index) => <col key={index} style={{ width }} />)}</colgroup>
    <thead><tr>{[t('products.row'), t('products.description'), t('products.image'), 'NCM', t('products.quantity'), t('products.unitPrice'), t('products.total'), t('products.volume'), t('products.weight')].map((label, index) => <th scope="col" key={index} className={index >= 4 ? 'amount' : undefined}>{label}</th>)}</tr></thead>
    <tbody>{order.line_items.map((item, index) => {
      const rowNo = Number(item.row_no);
      const images = order.images.filter(image => Number(image.row_no) === rowNo);
      return <tr key={String(item.id ?? item.row_no ?? index)} style={{ ['--product-row-height' as string]: '56px' }}>
        <td>{text(item, ['row_no'])}</td><td className="product-name">{text(item, ['product_en', 'product_cn'])}</td>
        <td className="product-image-cell">{images.length ? <OrderImages images={images} compact /> : '—'}</td>
        <td>{text(item, ['hs_code'])}</td><td className="amount">{number(numeric(item, ['total_pcs']))}</td>
        <td className="amount">{rmb(numeric(item, ['unit_price']))}</td><td className="amount">{rmb(numeric(item, ['total_price']))}</td>
        <td className="amount">{number(numeric(item, ['total_cbm']))}</td><td className="amount">{number(numeric(item, ['total_gw']))}</td>
      </tr>;
    })}</tbody>
  </table></div>;
}
