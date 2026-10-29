import type { LandingContent } from '../content';
import Reveal from '../Reveal';
import SectionHead from './SectionHead';
import { BanknoteIcon, ShieldCheckIcon, BoltIcon, HistoryIcon } from '../icons';

const ADVANTAGE_ICONS = [BanknoteIcon, ShieldCheckIcon, BoltIcon, HistoryIcon];

export default function Advantages({ t }: { t: LandingContent }) {
  return (
    <section className="lp-section" id="vantagens" aria-labelledby="lp-advantages-title">
      <div className="lp-container">
        <SectionHead index="03" kicker={t.advantages.kicker} title={t.advantages.title} titleId="lp-advantages-title" />
        <div className="lp-adv-grid">
          {t.advantages.items.map((item, i) => {
            const Icon = ADVANTAGE_ICONS[i];
            return (
              <Reveal key={item.title} delay={i * 80}>
                <article className="lp-adv">
                  <span className="lp-adv-icon"><Icon /></span>
                  <div>
                    <h3>{item.title}</h3>
                    <p>{item.description}</p>
                  </div>
                </article>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
