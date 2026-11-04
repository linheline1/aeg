import { Link } from 'react-router-dom';
import type { LandingContent } from '../content';
import { ArrowRightIcon, BanknoteIcon, BoltIcon, FileCheckIcon, HistoryIcon } from '../icons';

interface HeroProps {
  t: LandingContent;
  loggedIn: boolean;
}

/** stats 图标按序对应 content.ts 中的 stats 数组 */
const STAT_ICONS = [FileCheckIcon, BanknoteIcon, HistoryIcon];

export default function Hero({ t, loggedIn }: HeroProps) {
  return (
    <section className="lp-hero" id="top" aria-labelledby="lp-hero-title">
      <div className="lp-hero-rail" aria-hidden="true">
        <span className="lp-hero-rail-line" />
        <span className="lp-hero-rail-text">{t.hero.scrollHint}</span>
      </div>

      <div className="lp-container lp-hero-stage">
        <p className="lp-eyebrow">{t.hero.eyebrow}</p>
        <p className="lp-hero-badge">
          <BoltIcon width={16} height={16} />
          <span>{t.hero.badge}</span>
        </p>

        <h1 className="lp-hero-title" id="lp-hero-title">
          <span className="lp-hero-title-intro">{t.hero.title.before}</span>
          <span className="lp-hero-title-detail">
            <em>{t.hero.title.accent}</em>
            {t.hero.title.after}
          </span>
        </h1>

        <div className="lp-hero-lower">
          <div className="lp-hero-copy">
            <p className="lp-lead">{t.hero.lead}</p>
            <div className="lp-hero-actions">
              <Link className="lp-btn lp-btn-primary lp-btn-lg" to={loggedIn ? '/home' : '/register'}>
                {loggedIn ? t.hero.ctaPanel : t.hero.ctaStart}
                <ArrowRightIcon className="lp-btn-arrow" width={18} height={18} />
              </Link>
              <a className="lp-btn lp-btn-outline lp-btn-lg" href="#como-funciona">
                {t.hero.ctaHow}
              </a>
            </div>
            <a className="lp-consult-link" href={`mailto:${t.footer.contact.email}`}>
              {t.consultation.button} <ArrowRightIcon width={16} height={16} />
            </a>
            <div className="lp-hero-stats">
              {t.hero.stats.map((stat, index) => {
                const StatIcon = STAT_ICONS[index] ?? FileCheckIcon;
                return (
                  <div key={stat.label}>
                    <strong><StatIcon width={19} height={19} />{stat.value}</strong>
                    <span>{stat.label}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="lp-hero-visual">
            <picture>
              <source srcSet="/hero-ship.webp" type="image/webp" />
              <img src="/hero-ship.jpg" alt={t.hero.imgAlt} width={1368} height={768} decoding="async" />
            </picture>
            <div className="lp-route-card">
              <div className="lp-route-row">
                <span className="lp-route-dot lp-route-dot-a" aria-hidden="true" />
                <span>{t.hero.routes.from}</span>
              </div>
              <div className="lp-route-mid">
                <span className="lp-route-line" aria-hidden="true" />
                <span className="lp-route-label">{t.hero.routes.label}</span>
              </div>
              <div className="lp-route-row">
                <span className="lp-route-dot lp-route-dot-b" aria-hidden="true" />
                <span>{t.hero.routes.to}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
