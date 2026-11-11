import { useTranslation } from 'react-i18next';

interface PriceReferenceNoteProps {
  /** 紧凑样式：用于表格上方、卡片内的单行提示 */
  compact?: boolean;
  /** 是否附葡语同级说明，默认展示 */
  showPt?: boolean;
  className?: string;
}

export default function PriceReferenceNote({
  compact = false,
  showPt = true,
  className = ''
}: PriceReferenceNoteProps) {
  const { t, i18n } = useTranslation();
  const isPt = i18n.language.startsWith('pt');
  return (
    <div
      className={`price-ref-note${compact ? ' price-ref-note-compact' : ''}${className ? ` ${className}` : ''}`}
      role="note"
      aria-label={t('priceNote.aria')}
    >
      <span className="price-ref-note-badge">{t('priceNote.badge')}</span>
      <div className="price-ref-note-body">
        <p className="price-ref-note-zh">{t(compact ? 'priceNote.compact' : 'priceNote.full')}</p>
        {showPt && !isPt && <p className="price-ref-note-pt" lang="pt-BR">{compact ? 'Estimativa de referência — não constitui proposta final.' : 'Estimativa de referência: calculada com base em tributos estimados, tarifas e câmbio atuais; não constitui proposta final. Tributos, câmbio e despesas adicionais podem ser ajustados. O valor válido é o confirmado por escrito pela nossa empresa e na fatura oficial.'}</p>}
      </div>
    </div>
  );
}
