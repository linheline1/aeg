import { Link } from 'react-router-dom';
import type { LandingContent } from '../content';
import Reveal from '../Reveal';
import { ArrowRightIcon } from '../icons';

export default function CtaBand({ t, loggedIn }: { t: LandingContent; loggedIn: boolean }) {
  return (
    <section className="lp-cta-band" aria-labelledby="lp-cta-title">
      <div className="lp-container lp-cta-inner">
        <Reveal>
          <h2 id="lp-cta-title">{t.cta.title}</h2>
          <p>{t.cta.description}</p>
        </Reveal>
        <Reveal delay={120} className="lp-cta-actions">
          <Link className="lp-btn lp-btn-gold lp-btn-lg" to={loggedIn ? '/home' : '/login'}>
            {t.cta.button}
            <ArrowRightIcon className="lp-btn-arrow" width={18} height={18} />
          </Link>
          <a className="lp-consult-link" href={`mailto:${t.footer.contact.email}`}>{t.consultation.button}</a>
          <p className="lp-contact-note">{t.consultation.note}</p>
        </Reveal>
      </div>
    </section>
  );
}
