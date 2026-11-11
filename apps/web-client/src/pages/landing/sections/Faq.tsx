import type { LandingContent } from '../content';
import SectionHead from './SectionHead';
import { ArrowRightIcon } from '../icons';

export default function Faq({ t }: { t: LandingContent }) {
  return (
    <section className="lp-section lp-faq" id="faq" aria-labelledby="lp-faq-title">
      <div className="lp-container lp-faq-grid">
        <SectionHead index="04" kicker={t.faq.kicker} title={t.faq.title} titleId="lp-faq-title" />
        <div className="lp-faq-list">
          {t.faq.items.map((item, index) => (
            <details key={item.question}>
              <summary>
                <span className="lp-faq-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
                <span>{item.question}</span>
                <ArrowRightIcon className="lp-faq-arrow" width={18} height={18} aria-hidden="true" />
              </summary>
              <p>{item.answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
