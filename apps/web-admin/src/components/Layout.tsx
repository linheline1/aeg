import { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../store/auth';
import logo from '../assets/logo.png';

export default function Layout({ children }: { children: React.ReactNode }) {
  const { t, i18n } = useTranslation();
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const langRef = useRef<HTMLDivElement>(null);
  const isAdmin = user?.role === 'admin';

  useEffect(() => setMenuOpen(false), [location.pathname]);
  useEffect(() => setUserMenuOpen(false), [location.pathname]);
  useEffect(() => setLangOpen(false), [location.pathname]);

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

  // 用户下拉：点击外部 / Esc 关闭
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
    if (!menuOpen) return;
    const previousOverflow = document.body.style.overflow;
    const desktopMedia = window.matchMedia('(min-width: 961px)');
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    const closeOnDesktop = (event: MediaQueryListEvent) => {
      if (event.matches) setMenuOpen(false);
    };
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', closeOnEscape);
    desktopMedia.addEventListener('change', closeOnDesktop);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', closeOnEscape);
      desktopMedia.removeEventListener('change', closeOnDesktop);
    };
  }, [menuOpen]);

  const navItems = isAdmin ? [
    { to: '/', label: t('nav.dashboard') },
    { to: '/templates', label: t('nav.templates') },
    { to: '/clients', label: t('nav.clients') },
    { to: '/customs-cnpjs', label: t('nav.customsCnpjs') },
    { to: '/staff', label: t('nav.staff') },
    { to: '/partners', label: t('nav.partners') },
    { to: '/help', label: t('nav.help') },
    { to: '/audit', label: t('nav.audit') },
    { to: '/ai-config', label: t('nav.aiConfig') }
  ] : [
    { to: '/clients', label: t('nav.clientReview') }
  ];

  const currentLang = i18n.language?.startsWith('pt') ? 'pt' : 'zh';

  return (
    <div className="layout">
      {menuOpen && <button type="button" className="nav-scrim" aria-label={t('topbar.openNav')} onClick={() => setMenuOpen(false)} />}
      <aside id="admin-sidebar" className={`sidebar${menuOpen ? ' sidebar-open' : ''}`} aria-label={t('sidebar.label')}>
        <div className="brand">
          <img className="logo-dot" src={logo} alt="AEG" />
          DDP · {t('sidebar.brandSuffix')}
        </div>
        <nav>
          {navItems.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === '/'} onClick={() => setMenuOpen(false)}>
              {n.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="main">
        <header className="topbar">
          <button
            type="button"
            className="menu-button"
            aria-label={t('topbar.openNav')}
            aria-controls="admin-sidebar"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(true)}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <div className="user-info" ref={userMenuRef}>
            {/* 语言切换 — 下拉 */}
            <div className="lang-switcher" ref={langRef} style={{ position: 'relative' }}>
              <button
                type="button"
                className="lang-trigger"
                aria-haspopup="menu"
                aria-expanded={langOpen}
                aria-label={t('lang.switch')}
                onClick={() => setLangOpen(open => !open)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '6px 10px',
                  borderRadius: 6,
                  border: '1px solid rgba(255,255,255,0.15)',
                  background: 'transparent',
                  color: 'inherit',
                  cursor: 'pointer',
                  fontSize: 13,
                }}
              >
                {currentLang === 'zh' ? '🇨🇳 中文' : '🇧🇷 PT'}
                <span style={{ opacity: 0.6, fontSize: 10 }}>▾</span>
              </button>
              {langOpen && (
                <div
                  className="lang-dropdown"
                  role="menu"
                  style={{
                    position: 'absolute',
                    top: 'calc(100% + 6px)',
                    right: 0,
                    minWidth: 140,
                    background: '#ffffff',
                    border: '1px solid rgba(0,0,0,0.12)',
                    borderRadius: 8,
                    padding: '4px',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
                    zIndex: 1000,
                  }}
                >
                  <button
                    type="button"
                    className={`lang-option${currentLang === 'zh' ? ' is-active' : ''}`}
                    role="menuitem"
                    onClick={() => { i18n.changeLanguage('zh'); setLangOpen(false); }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      width: '100%',
                      padding: '8px 12px',
                      border: 'none',
                      color: '#1f2937',
                      background: currentLang === 'zh' ? 'rgba(0,0,0,0.06)' : 'transparent',
                      borderRadius: 6,
                      cursor: 'pointer',
                      fontSize: 13,
                      textAlign: 'left',
                    }}
                  >
                    🇨🇳 中文
                  </button>
                  <button
                    type="button"
                    className={`lang-option${currentLang === 'pt' ? ' is-active' : ''}`}
                    role="menuitem"
                    onClick={() => { i18n.changeLanguage('pt'); setLangOpen(false); }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      width: '100%',
                      padding: '8px 12px',
                      border: 'none',
                      color: '#1f2937',
                      background: currentLang === 'pt' ? 'rgba(0,0,0,0.06)' : 'transparent',
                      borderRadius: 6,
                      cursor: 'pointer',
                      fontSize: 13,
                      textAlign: 'left',
                    }}
                  >
                    🇧🇷 Português
                  </button>
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
              <span aria-hidden="true">👤</span>
              <strong className="user-menu-name">{user?.username}</strong>
              <span className="muted text-sm user-menu-role">· {isAdmin ? t('user.role.admin') : t('user.role.operator')}</span>
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
        <div className="content">{children}</div>
      </main>
    </div>
  );
}
