import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../store/auth';
import { roleLabel } from '../lib/roles';
import logo from '../assets/logo.png';

export default function Layout() {
  const { t, i18n } = useTranslation();
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const langRef = useRef<HTMLDivElement>(null);
  // M4：业务员与报价员职责分离 —— 业务员只见「报价跟进 + 成交统计」
  const isSales = user?.role === 'sales';

  useEffect(() => setMenuOpen(false), [location.pathname]);
  useEffect(() => setUserMenuOpen(false), [location.pathname, location.hash]);
  useEffect(() => setLangOpen(false), [location.pathname, location.hash]);

  // 语言下拉：点击外部 / Esc 关闭
  useEffect(() => {
    if (!langOpen) return;
    const onClick = (event: MouseEvent) => {
      if (langRef.current && !langRef.current.contains(event.target as Node)) {
        setLangOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setLangOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [langOpen]);

  useEffect(() => {
    if (!userMenuOpen) return;
    const onClick = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setUserMenuOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [userMenuOpen]);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 960px)');
    const closeOnDesktop = (event: MediaQueryListEvent) => {
      if (!event.matches) setMenuOpen(false);
    };
    media.addEventListener('change', closeOnDesktop);
    return () => media.removeEventListener('change', closeOnDesktop);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    sidebarRef.current?.querySelector<HTMLAnchorElement>('nav a')?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setMenuOpen(false);
      window.requestAnimationFrame(() => menuButtonRef.current?.focus());
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [menuOpen]);

  const closeMenu = () => {
    setMenuOpen(false);
    window.requestAnimationFrame(() => menuButtonRef.current?.focus());
  };

  const currentLang = i18n.language?.startsWith('pt') ? 'pt' : 'zh';

  return (
    <div className="layout">
      {menuOpen && (
        <button
          className="nav-scrim"
          type="button"
          tabIndex={-1}
          aria-label={t('topbar.closeNav')}
          onClick={closeMenu}
        />
      )}
      <aside
        id="ops-navigation"
        ref={sidebarRef}
        className={`sidebar${menuOpen ? ' sidebar-open' : ''}`}
        aria-label={t('sidebar.label')}
      >
        <div className="brand">
          <img className="logo-dot" src={logo} alt="AEG" />
          <span>AEG · {t('brand.subtitle')}</span>
        </div>
        <nav className="nav" aria-label={t('sidebar.opsNav')}>
          <NavLink to="/orders">{isSales ? t('nav.ordersSales') : t('nav.orders')}</NavLink>
          <NavLink to="/deals">{t('nav.deals')}</NavLink>
          {isSales && <NavLink to="/clients">{t('nav.myClients')}</NavLink>}
          {!isSales && <NavLink to="/products">{t('nav.products')}</NavLink>}
          {!isSales && <NavLink to="/rates">{t('nav.rates')}</NavLink>}
          <NavLink to="/finance">{t('nav.finance')}</NavLink>
          {!isSales && <NavLink to="/template">{t('nav.template')}</NavLink>}
          <NavLink to="/help">{t('nav.help')}</NavLink>
        </nav>
      </aside>
      <div className="main">
        <header className="topbar">
          <div className="topbar-leading">
            <button
              ref={menuButtonRef}
              className="menu-btn"
              type="button"
              aria-label={menuOpen ? t('topbar.closeNav') : t('topbar.openNav')}
              aria-controls="ops-navigation"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen(open => !open)}
            >
              <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <span className="mobile-brand">AEG · {t('brand.subtitle')}</span>
          </div>
          <div className="user-info" ref={userMenuRef}>
            {/* 语言切换 — 下拉 */}
            <div className="lang-switcher" ref={langRef} style={{ position: 'relative', marginRight: 12 }}>
              <button
                type="button"
                className="lang-trigger"
                aria-haspopup="menu"
                aria-expanded={langOpen}
                aria-label={t('lang.switch')}
                onClick={() => setLangOpen(open => !open)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '6px 10px', borderRadius: 6,
                  border: '1px solid rgba(255,255,255,0.15)',
                  background: 'transparent', color: 'inherit', cursor: 'pointer', fontSize: 13,
                }}
              >
                {currentLang === 'zh' ? '🇨🇳 中文' : '🇧🇷 PT'}
                <span style={{ opacity: 0.6, fontSize: 10 }}>▾</span>
              </button>
              {langOpen && (
                <div className="lang-dropdown" role="menu" style={{
                  position: 'absolute', top: 'calc(100% + 6px)', right: 0, minWidth: 140,
                  background: '#ffffff',
                  border: '1px solid rgba(0,0,0,0.12)', borderRadius: 8, padding: 4,
                  boxShadow: '0 8px 24px rgba(0,0,0,0.35)', zIndex: 1000,
                }}>
                  <button type="button" role="menuitem"
                    onClick={() => { i18n.changeLanguage('zh'); setLangOpen(false); }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                      padding: '8px 12px', border: 'none', color: '#1f2937',
                      background: currentLang === 'zh' ? 'rgba(0,0,0,0.06)' : 'transparent', borderRadius: 6, cursor: 'pointer', fontSize: 13, textAlign: 'left',
                    }}>🇨🇳 中文</button>
                  <button type="button" role="menuitem"
                    onClick={() => { i18n.changeLanguage('pt'); setLangOpen(false); }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                      padding: '8px 12px', border: 'none', color: '#1f2937',
                      background: currentLang === 'pt' ? 'rgba(0,0,0,0.06)' : 'transparent', borderRadius: 6, cursor: 'pointer', fontSize: 13, textAlign: 'left',
                    }}>🇧🇷 Português</button>
                </div>
              )}
            </div>
            <button
              type="button"
              className="user-menu-trigger"
              aria-haspopup="menu"
              aria-expanded={userMenuOpen}
              onClick={() => setUserMenuOpen(open => !open)}
            >
              👤 <span className="user-menu-name">{user?.username}</span>
              <span className="user-menu-role">· {roleLabel(user?.role)}</span>
              <span className={`user-caret${userMenuOpen ? ' open' : ''}`}>▾</span>
            </button>
            {userMenuOpen && (
              <div className="user-dropdown" role="menu">
                <button
                  type="button"
                  className="user-dropdown-item"
                  role="menuitem"
                  onClick={() => { setUserMenuOpen(false); nav('/profile'); }}
                >
                  👤 {t('user.center')}
                </button>
                <div className="user-dropdown-divider" />
                <button
                  type="button"
                  className="user-dropdown-item danger"
                  role="menuitem"
                  onClick={() => { setUserMenuOpen(false); logout(); nav('/login'); }}
                >
                  ⏻ {t('user.logout')}
                </button>
              </div>
            )}
          </div>
        </header>
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
