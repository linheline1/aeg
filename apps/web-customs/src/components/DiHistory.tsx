import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, errorMessage } from '../store/auth';
import type { DiVersion } from '../types';
import { brl, dateTime, percent } from '../utils/format';
import { additionalFeesTotal, analysisValue, importTaxesValue, text } from '../utils/data';
import { ErrorMessage, Loading } from './Feedback';
import Modal from './Modal';

export default function DiHistory({ orderId, onClose }: { orderId: string; onClose: () => void }) {
  const { t } = useTranslation();
  const [versions, setVersions] = useState<DiVersion[] | null>(null);
  const [selected, setSelected] = useState<DiVersion | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api.get<DiVersion[]>(`/api/customs/orders/${orderId}/di/versions`).then((response) => {
      setVersions(response.data); setSelected(response.data[0] || null);
    }).catch((reason) => setError(errorMessage(reason, t('history.loadError'))));
  }, [orderId]);
  const analysis = selected?.analysis || null;
  const items = analysis?.items || [];
  const additionalFees = analysis?.additional_fees || [];
  const importTaxes = importTaxesValue(analysis, items);
  const additionalTotal = additionalFeesTotal(additionalFees);
  const summary: Array<[string, number | null]> = [
    ['CIF', analysisValue(analysis, ['total_cif_brl', 'cif_brl'], items, ['cif_brl'])],
    ['II', analysisValue(analysis, ['total_ii_brl', 'ii_brl'], items, ['ii_brl'])],
    ['IPI', analysisValue(analysis, ['total_ipi_brl', 'ipi_brl'], items, ['ipi_brl'])],
    ['PIS', analysisValue(analysis, ['total_pis_brl', 'pis_brl'], items, ['pis_brl'])],
    ['COFINS', analysisValue(analysis, ['total_cofins_brl', 'cofins_brl'], items, ['cofins_brl'])],
    [t('di.summary.importTaxes'), importTaxes],
    [t('di.summary.additionalFees'), additionalTotal],
    [t('table.diTotal'), importTaxes == null ? null : importTaxes + additionalTotal]
  ];
  return <Modal title={t('history.title')} onClose={onClose} wide>
    {error ? <ErrorMessage message={error} /> : !versions ? <Loading label={t('history.loading')} /> : versions.length === 0 ? <p className="muted">{t('history.empty')}</p> : <div className="history-layout"><aside className="version-list" aria-label={t('history.available')}>{versions.map((version) => <button key={version.version} className={selected?.version === version.version ? 'active' : ''} onClick={() => setSelected(version)}><strong>{t('orders.versionValue', { version: version.version })}</strong><span>{dateTime(version.reviewed_at)}</span><small>{version.reviewed_by || t('shipment.unknownOwner')}</small></button>)}</aside><div className="version-content">{selected && <>
      <div className="readonly-note">{t('history.readonly', { version: selected.version })}</div>
      <div className="di-summary compact">{summary.map(([label, value]) => <div key={label}><span>{label}</span><strong>{brl(value)}</strong></div>)}</div>
      <div className="table-wrap"><table className="table di-table"><thead><tr><th>Linha</th><th>NCM</th><th className="amount">II</th><th className="amount">IPI</th><th className="amount">PIS</th><th className="amount">COFINS</th><th className="amount">CIF</th><th className="amount">Total</th></tr></thead><tbody>{items.map((item, index) => <tr key={index}><td>{text(item, ['row_no', 'line_no'])}</td><td>{text(item, ['ncm', 'ncm_code'])}</td><td className="amount">{percent(Number(item.ii_rate || 0) * 100)}</td><td className="amount">{percent(Number(item.ipi_rate || 0) * 100)}</td><td className="amount">{percent(Number(item.pis_rate || 0) * 100)}</td><td className="amount">{percent(Number(item.cofins_rate || 0) * 100)}</td><td className="amount">{brl(Number(item.cif_brl || 0))}</td><td className="amount">{brl(Number(item.di_brl ?? item.total_brl ?? 0))}</td></tr>)}</tbody></table></div>
      <section className="di-fee-history" aria-labelledby={`fee-history-title-${selected.version}`}>
        <div className="subsection-heading"><div><h3 id={`fee-history-title-${selected.version}`}>{t('di.feesTitle')}</h3><p>{t('history.feesDescription')}</p></div><span className="badge badge-neutral">{t('history.fees', { count: additionalFees.length })}</span></div>
        {additionalFees.length === 0 ? <p className="muted di-fee-empty">{t('history.noFees')}</p> : <>
          <div className="table-wrap"><table className="table di-fees-table"><caption className="sr-only">{t('history.feesCaption', { version: selected.version })}</caption><thead><tr><th>{t('di.name')}</th><th className="amount">{t('di.feeValue')}</th><th>{t('shipment.note')}</th></tr></thead><tbody>{additionalFees.map((fee) => <tr key={fee.id}><td data-label={t('di.name')} className="di-fee-name-text">{fee.name}</td><td data-label={t('di.feeValue')} className="amount strong">{brl(fee.amount_brl)}</td><td data-label={t('shipment.note')} className="di-fee-note-text">{fee.note || '—'}</td></tr>)}</tbody></table></div>
          <div className="di-fee-subtotal"><span>{t('history.feesSubtotal')}</span><strong>{brl(additionalTotal)}</strong></div>
        </>}
      </section>
    </>}</div></div>}
  </Modal>;
}
