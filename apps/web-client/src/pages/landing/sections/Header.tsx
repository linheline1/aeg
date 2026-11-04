import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import logo from '../../../assets/logo-mark.png';
import type { Lang, LandingContent } from '../content';
import { CloseIcon, MenuIcon } from '../icons';

interface HeaderProps {
  t: LandingContent;
  lang: Lang;
  loggedIn: boolean;
  activeId: string | null;
  onLangChange: (lang: Lang) => void;
}

function LangSelect({ t, lang, onLangChange, className = '' }: HeaderProps & { className?: string }) {
  return (
    <select
      className={`lp-lang-select ${className}`.trim()}
      value={lang}
      onChange={(e) => onLangChange(e.target.value as Lang)}
      aria-label={t.languageLabel}
    >
      <option value="pt">Português</option>
      <option value="zh">中文</option>
    </select>
  );
}

export default function Header({ t, lang, loggedIn, activeId, onLangChange }: HeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setMenuOpen(false);
      menuButtonRef.current?.focus();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [menuOpen]);

  const closeMenu = () => setMenuOpen(false);

  return (
    <header className="lp-header" data-menu-open={menuOpen || undefined} data-scrolled={scrolled || undefined}>
      <div className="lp-container lp-header-inner">
        <a className="lp-brand" href="#top" aria-label="AEG">
          <img className="lp-brand-mark" src={logo} alt="AEG" width={207} height={96} />
          <span className="lp-brand-tag">{t.brand}</span>
        </a>

        <nav className="lp-nav" aria-label={t.navLabel}>
          {t.nav.map((item) => (
            <a key={item.id} href={item.href} aria-current={activeId === item.id ? 'true' : undefined}>
              {item.label}
            </a>
          ))}
        </nav>

        <div className="lp-header-cta">
          <LangSelect t={t} lang={lang} loggedIn={loggedIn} activeId={activeId} onLangChange={onLangChange} className="lp-lang-desktop" />
          {loggedIn ? (
            <Link className="lp-btn lp-btn-primary lp-panel-link" to="/home">{t.goPanel}</Link>
          ) : (
            <>
              <Link className="lp-btn lp-btn-ghost lp-login-link" to="/login">{t.login}</Link>
              <Link className="lp-btn lp-btn-accent lp-request-link" to="/register">{t.requestAccess}</Link>
            </>
          )}
          <button
            ref={menuButtonRef}
            type="button"
            className="lp-menu-btn"
            aria-expanded={menuOpen}
            aria-controls="lp-mobile-menu"
            aria-label={menuOpen ? t.closeMenu : t.menu}
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? <CloseIcon width={22} height={22} /> : <MenuIcon width={22} height={22} />}
          </button>
        </div>
      </div>

      {menuOpen && (
        <div className="lp-mobile-menu" id="lp-mobile-menu">
          <nav className="lp-mobile-nav" aria-label={t.navLabel}>
            {t.nav.map((item) => (
              <a key={item.id} href={item.href} onClick={closeMenu}>{item.label}</a>
            ))}
          </nav>
          <div className="lp-mobile-actions">
            <LangSelect t={t} lang={lang} loggedIn={loggedIn} activeId={activeId} onLangChange={onLangChange} className="lp-lang-mobile" />
            {loggedIn ? (
              <Link className="lp-btn lp-btn-primary" to="/home" onClick={closeMenu}>{t.goPanel}</Link>
            ) : (
              <>
                <Link className="lp-btn lp-btn-ghost" to="/login" onClick={closeMenu}>{t.login}</Link>
                <Link className="lp-btn lp-btn-accent" to="/register" onClick={closeMenu}>{t.requestAccess}</Link>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
