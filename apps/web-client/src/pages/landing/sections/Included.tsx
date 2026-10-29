import type { LandingContent } from '../content';
import Reveal from '../Reveal';
import SectionHead from './SectionHead';
import { AnchorIcon, FileCheckIcon, ShipIcon, ShieldCheckIcon } from '../icons';

const INCLUDED_ICONS = [ShipIcon, AnchorIcon, FileCheckIcon];

export default function Included({ t }: { t: LandingContent }) {
  return (
    <section className="lp-section lp-section-dark" id="incluso" aria-labelledby="lp-included-title">
      <div className="lp-container">
        <SectionHead
          index="02"
          kicker={t.included.kicker}
          title={t.included.title}
          subtitle={t.included.subtitle}
          titleId="lp-included-title"
          dark
        />
        <Reveal className="lp-included" delay={120}>
          {t.included.items.map((item, i) => {
            const Icon = INCLUDED_ICONS[i];
            return (
              <article className="lp-included-card" key={item.code}>
                <span className="lp-included-icon"><Icon /></span>
                <span className="lp-included-code">{item.code}</span>
                <h3>{item.title}</h3>
                <p>{item.description}</p>
                <span className="lp-included-note">{item.note}</span>
              </article>
            );
          })}
        </Reveal>
        <Reveal className="lp-included-total" delay={200}>
          <ShieldCheckIcon width={20} height={20} />
          <span>{t.included.total}</span>
        </Reveal>
        <Reveal className="lp-disclaimer" delay={260}>
          <span className="lp-disclaimer-badge" aria-hidden="true">!</span>
          <p>{t.estimateNotice}</p>
        </Reveal>
      </div>
    </section>
  );
}
