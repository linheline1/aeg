import type { OrderDetailData } from '../types';
import { number, rmb } from '../utils/format';
import { numeric, text } from '../utils/data';
import { Empty } from './Feedback';
import OrderImages from './OrderImages';
import { useTranslation } from 'react-i18next';

export default function ProductItems({ order }: { order: OrderDetailData }) {
  const { t } = useTranslation();
  if (!order.line_items.length) return <Empty title={t('products.emptyTitle')} description={t('products.emptyDescription')} />;
  return (
    <>
      <p className="section-note">{t('products.validRows', { valid: order.valid_rows, total: order.total_rows })}</p>
      <div className="table-wrap"><table className="table product-table"><thead><tr><th>{t('products.row')}</th><th>{t('products.description')}</th><th>{t('products.image')}</th><th>NCM</th><th className="amount">{t('products.quantity')}</th><th className="amount">{t('products.unitPrice')}</th><th className="amount">{t('products.total')}</th><th className="amount">{t('products.volume')}</th><th className="amount">{t('products.weight')}</th></tr></thead><tbody>{order.line_items.map((item, index) => {
        const rowNo = Number(text(item, ['row_no', 'line_no', 'row']));
        const rowImages = order.images.filter((image) => Number(image.row_no) === rowNo);
        return <tr key={String(item.id ?? item.row_no ?? index)}><td>{text(item, ['row_no', 'line_no', 'row'])}</td><td className="product-name">{text(item, ['product_name', 'product_en', 'product_cn', 'description', 'product_description', 'name', 'goods_description'])}</td><td className="product-image-cell">{rowImages.length > 0 ? <OrderImages images={rowImages} /> : <span className="muted">—</span>}</td><td>{text(item, ['ncm', 'ncm_code', 'hs_code'])}</td><td className="amount">{number(numeric(item, ['quantity', 'total_pcs', 'qty', 'qtd']))}</td><td className="amount">{rmb(numeric(item, ['unit_price_rmb', 'unit_price', 'price_rmb', 'unit_value_rmb']))}</td><td className="amount">{rmb(numeric(item, ['total_amount_rmb', 'total_price', 'total_rmb', 'amount_rmb', 'total_price_rmb', 'total_value_rmb']))}</td><td className="amount">{number(numeric(item, ['cbm', 'total_cbm', 'volume_cbm']))}</td><td className="amount">{number(numeric(item, ['gw_kg', 'total_gw', 'total_gw_kg', 'gross_weight_kg', 'weight_kg']))}</td></tr>;
      })}</tbody></table></div>
    </>
  );
}
