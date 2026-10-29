import type { LandingContent } from '../content';
import Reveal from '../Reveal';
import SectionHead from './SectionHead';
import { CalculatorIcon, BoxesIcon, DownloadIcon, UploadIcon } from '../icons';

const STEP_ICONS = [DownloadIcon, BoxesIcon, UploadIcon, CalculatorIcon];

export default function Process({ t }: { t: LandingContent }) {
  return (
    <section className="lp-section" id="como-funciona" aria-labelledby="lp-steps-title">
      <div className="lp-container">
        <SectionHead index="01" kicker={t.steps.kicker} title={t.steps.title} titleId="lp-steps-title" />
        <Reveal className="lp-steps" delay={120}>
          {t.steps.items.map((step, i) => {
            const Icon = STEP_ICONS[i];
            return (
              <article className="lp-step" key={step.title}>
                <div className="lp-step-top">
                  <span className="lp-step-icon"><Icon /></span>
                  <span className="lp-step-num" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
                </div>
                <h3>{step.title}</h3>
                <p>{step.description}</p>
              </article>
            );
          })}
        </Reveal>
      </div>
    </section>
  );
}
