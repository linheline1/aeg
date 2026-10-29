import { Link } from 'react-router-dom';
import logo from '../../../assets/logo-mark.png';
import type { LandingContent } from '../content';

export default function Footer({ t }: { t: LandingContent }) {
  const { contact } = t.footer;

  return (
    <footer className="lp-footer">
      <div className="lp-container">
        <div className="lp-footer-grid">
          <div className="lp-footer-brand">
            <a className="lp-brand" href="#top" aria-label="AEG">
              <img className="lp-brand-mark" src={logo} alt="AEG" width={207} height={96} />
            </a>
            <p>{t.footer.brandDescription}</p>
          </div>

          {t.footer.columns.map((column) => (
            <div className="lp-footer-col" key={column.title}>
              <h4>{column.title}</h4>
              {column.links.map((link) =>
                link.href.startsWith('/')
                  ? <Link key={link.label} to={link.href}>{link.label}</Link>
                  : <a key={link.label} href={link.href}>{link.label}</a>
              )}
            </div>
          ))}

          <div className="lp-footer-col">
            <h4>{t.footer.contactTitle}</h4>
            <a href={`mailto:${contact.email}`}>{contact.email}</a>
            <a href={`tel:${contact.phone.replace(/[^+\d]/g, '')}`}>{contact.phone}</a>
            <span>{contact.location}</span>
          </div>
        </div>

        <div className="lp-footer-bottom">
          <span>{t.footer.copyright}</span>
          <span>{t.footer.tagline}</span>
        </div>
        <p className="lp-footer-disclaimer">{t.estimateNotice}</p>
      </div>
    </footer>
  );
}
