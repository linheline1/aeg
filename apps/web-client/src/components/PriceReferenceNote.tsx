interface PriceReferenceNoteProps {
  /** 紧凑样式：用于表格上方、卡片内的单行提示 */
  compact?: boolean;
  /** 是否附葡语同级说明，默认展示 */
  showPt?: boolean;
  className?: string;
}

const ZH_FULL =
  '参考预估：基于当前税费预估、费率及汇率计算，不构成最终报价。税费、汇率及附加费用可能调整，最终价格以我司书面确认及正式账单为准。';
const ZH_COMPACT =
  '参考预估：基于当前税费预估、费率及汇率计算，不构成最终报价。';

const PT_FULL =
  'Estimativa de referência: calculada com base em tributos estimados, tarifas e câmbio atuais; não constitui proposta final. Tributos, câmbio e despesas adicionais podem ser ajustados. O valor válido é o confirmado por escrito pela nossa empresa e na fatura oficial.';
const PT_COMPACT =
  'Estimativa de referência — não constitui proposta final.';

export default function PriceReferenceNote({
  compact = false,
  showPt = true,
  className = ''
}: PriceReferenceNoteProps) {
  return (
    <div
      className={`price-ref-note${compact ? ' price-ref-note-compact' : ''}${className ? ` ${className}` : ''}`}
      role="note"
      aria-label="参考预估说明"
    >
      <span className="price-ref-note-badge">参考预估</span>
      <div className="price-ref-note-body">
        <p className="price-ref-note-zh">{compact ? ZH_COMPACT : ZH_FULL}</p>
        {showPt && <p className="price-ref-note-pt" lang="pt-BR">{compact ? PT_COMPACT : PT_FULL}</p>}
      </div>
    </div>
  );
}
