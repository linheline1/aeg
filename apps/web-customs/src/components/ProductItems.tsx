import type { OrderDetailData } from '../types';
import { number, rmb } from '../utils/format';
import { numeric, text } from '../utils/data';
import { Empty } from './Feedback';
import OrderImages from './OrderImages';

export default function ProductItems({ order }: { order: OrderDetailData }) {
  if (!order.line_items.length) return <Empty title="Nenhum item disponível" description="Os itens da invoice não foram informados." />;
  return (
    <>
      <p className="section-note">{order.valid_rows} de {order.total_rows} linhas válidas na invoice. As imagens são vinculadas à sua respectiva linha.</p>
      <div className="table-wrap"><table className="table product-table"><thead><tr><th>Linha</th><th>Produto / descrição</th><th>Imagem</th><th>NCM</th><th className="amount">Quantidade</th><th className="amount">Preço unitário</th><th className="amount">Total</th><th className="amount">Volume (m³)</th><th className="amount">Peso (kg)</th></tr></thead><tbody>{order.line_items.map((item, index) => {
        const rowNo = Number(text(item, ['row_no', 'line_no', 'row']));
        const rowImages = order.images.filter((image) => Number(image.row_no) === rowNo);
        return <tr key={String(item.id ?? item.row_no ?? index)}><td>{text(item, ['row_no', 'line_no', 'row'])}</td><td className="product-name">{text(item, ['product_name', 'product_en', 'product_cn', 'description', 'product_description', 'name', 'goods_description'])}</td><td className="product-image-cell">{rowImages.length > 0 ? <OrderImages images={rowImages} /> : <span className="muted">—</span>}</td><td>{text(item, ['ncm', 'ncm_code', 'hs_code'])}</td><td className="amount">{number(numeric(item, ['quantity', 'total_pcs', 'qty', 'qtd']))}</td><td className="amount">{rmb(numeric(item, ['unit_price_rmb', 'unit_price', 'price_rmb', 'unit_value_rmb']))}</td><td className="amount">{rmb(numeric(item, ['total_amount_rmb', 'total_price', 'total_rmb', 'amount_rmb', 'total_price_rmb', 'total_value_rmb']))}</td><td className="amount">{number(numeric(item, ['cbm', 'total_cbm', 'volume_cbm']))}</td><td className="amount">{number(numeric(item, ['gw_kg', 'total_gw', 'total_gw_kg', 'gross_weight_kg', 'weight_kg']))}</td></tr>;
      })}</tbody></table></div>
    </>
  );
}
