import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import logo from '../../../assets/logo-mark.png';
import type { Lang, LandingContent } from '../content';
import { CloseIcon, MenuIcon } from '../icons';

interface HeaderProps {
  t: LandingContent;
  lang: Lang;
  loggedIn: boolean;
  onLangChange: (lang: Lang) => void;
}

interface LangSelectProps {
  t: LandingContent;
  lang: Lang;
  onLangChange: (lang: Lang) => void;
  className?: string;
}

function LangSelect({ t, lang, onLangChange, className = '' }: LangSelectProps) {
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

function NavItems({ t, onNavigate }: { t: LandingContent; onNavigate?: () => void }) {
  const { pathname } = useLocation();
  /** 当前展开的下拉菜单 id；点击子项后立即关闭，避免跳转后菜单卡在页面上 */
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

  const closeDropdown = () => setOpenDropdown(null);

  // 菜单展开期间：鼠标进入页面上任何非下拉区域即关闭。
  // 不依赖容器 onMouseLeave —— 菜单为绝对定位，可能遮挡相邻导航项导致 leave 不触发。
  useEffect(() => {
    if (!openDropdown) return;
    const onOver = (e: MouseEvent) => {
      if (!(e.target as HTMLElement | null)?.closest?.('.lp-nav-dropdown')) {
        setOpenDropdown(null);
      }
    };
    document.addEventListener('mouseover', onOver);
    return () => document.removeEventListener('mouseover', onOver);
  }, [openDropdown]);

  return (
    <>
      {t.nav.map((item) => {
        if (item.children) {
          const active = item.children.some((c) => c.href === pathname);
          const open = openDropdown === item.id;
          return (
            <div
              key={item.id}
              className="lp-nav-dropdown"
              data-active={active || undefined}
              data-open={open || undefined}
              onMouseEnter={() => setOpenDropdown(item.id)}
              onMouseLeave={closeDropdown}
            >
              <Link
                to={item.href}
                className="lp-nav-dropdown-trigger"
                aria-current={active ? 'true' : undefined}
                aria-expanded={open}
                onClick={() => {
                  closeDropdown();
                  window.scrollTo(0, 0);
                  onNavigate?.();
                }}
              >
                {item.label}
                <svg className="lp-nav-caret" width="10" height="6" viewBox="0 0 10 6" fill="none" aria-hidden="true">
                  <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </Link>
              <div className="lp-nav-dropdown-menu">
                {item.children.map((child) => (
                  <Link
                    key={child.id}
                    to={child.href}
                    aria-current={pathname === child.href ? 'true' : undefined}
                    onClick={() => {
                      closeDropdown();
                      window.scrollTo(0, 0);
                      onNavigate?.();
                    }}
                  >
                    {child.label}
                  </Link>
                ))}
              </div>
            </div>
          );
        }
        if (item.href.startsWith('#')) {
          return (
            <a key={item.id} href={item.href} onClick={onNavigate}>{item.label}</a>
          );
        }
        return (
          <Link
            key={item.id}
            to={item.href}
            aria-current={pathname === item.href ? 'true' : undefined}
            onClick={() => {
              window.scrollTo(0, 0);
              onNavigate?.();
            }}
          >
            {item.label}
          </Link>
        );
      })}
    </>
  );
}

export default function Header({ t, lang, loggedIn, onLangChange }: HeaderProps) {
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
        <Link className="lp-brand" to="/" aria-label="AEG" onClick={() => window.scrollTo(0, 0)}>
          <img className="lp-brand-mark" src={logo} alt="AEG" width={207} height={96} />
          <span className="lp-brand-tag">{t.brand}</span>
        </Link>

        <nav className="lp-nav" aria-label={t.navLabel}>
          <NavItems t={t} />
        </nav>

        <div className="lp-header-cta">
          <LangSelect t={t} lang={lang} onLangChange={onLangChange} className="lp-lang-desktop" />
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
            <NavItems t={t} onNavigate={closeMenu} />
          </nav>
          <div className="lp-mobile-actions">
            <LangSelect t={t} lang={lang} onLangChange={onLangChange} className="lp-lang-mobile" />
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
