import { Link } from 'react-router-dom';
import type { LandingContent } from '../content';
import { ArrowRightIcon, BoltIcon } from '../icons';

interface HeroProps {
  t: LandingContent;
  loggedIn: boolean;
}

export default function Hero({ t, loggedIn }: HeroProps) {
  return (
    <section className="lp-hero" id="top" aria-labelledby="lp-hero-title">
      <div className="lp-container lp-hero-grid">
        <div className="lp-hero-copy">
          <p className="lp-eyebrow">{t.hero.eyebrow}</p>
          <h1 id="lp-hero-title">
            {t.hero.title.before}<em>{t.hero.title.accent}</em>{t.hero.title.after}
          </h1>
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
          <div className="lp-hero-stats">
            {t.hero.stats.map((stat) => (
              <div key={stat.label}>
                <strong>{stat.value}</strong>
                <span>{stat.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="lp-hero-visual">
          <picture>
            <source srcSet="/hero-ship.webp" type="image/webp" />
            <img src="/hero-ship.jpg" alt={t.hero.imgAlt} width={1368} height={768} decoding="async" />
          </picture>
          <p className="lp-hero-badge">
            <BoltIcon width={16} height={16} />
            <span>{t.hero.badge}</span>
          </p>
          <div className="lp-route-card">
            <div className="lp-route-row">
              <span className="lp-route-dot lp-route-dot-a" aria-hidden="true" />
              <span>{t.hero.routes.from}</span>
            </div>
            <span className="lp-route-line" aria-hidden="true" />
            <div className="lp-route-row">
              <span className="lp-route-dot lp-route-dot-b" aria-hidden="true" />
              <span>{t.hero.routes.to}</span>
            </div>
          </div>
        </div>
      </div>
      <svg className="lp-wave" viewBox="0 0 1440 90" preserveAspectRatio="none" aria-hidden="true">
        <path d="M0,52 C240,84 480,20 720,38 C960,56 1200,80 1440,44 L1440,90 L0,90 Z" fill="rgba(11,34,51,.05)" />
        <path d="M0,58 C240,90 480,26 720,44 C960,62 1200,86 1440,50" fill="none" stroke="#c8963e" strokeWidth="1.6" opacity=".5" />
      </svg>
    </section>
  );
}
