import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import logo from '../assets/logo.png';
import { useAuth } from '../store/auth';
import Icon from './Icon';

export default function Layout() {
  const { t, i18n } = useTranslation();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const langRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMenuOpen(false), [location.pathname]);
  useEffect(() => setUserMenuOpen(false), [location.pathname]);
  useEffect(() => setLangOpen(false), [location.pathname]);
  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [menuOpen]);

  // 语言下拉：点击外部 / Esc 关闭
  useEffect(() => {
    if (!langOpen) return;
    const onClick = (event: MouseEvent) => {
      if (langRef.current && !langRef.current.contains(event.target as Node)) {
        setLangOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setLangOpen(false); };
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
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setUserMenuOpen(false); };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [userMenuOpen]);

  const currentLang = i18n.language?.startsWith('pt') ? 'pt' : 'zh';

  return (
    <div className="layout">
      <a className="skip-link" href="#conteudo">{t('skip.toContent')}</a>
      {menuOpen && <button className="nav-scrim" aria-label={t('topbar.closeMenu')} onClick={() => setMenuOpen(false)} />}
      <aside className={`sidebar${menuOpen ? ' sidebar-open' : ''}`} aria-label={t('sidebar.label')}>
        <div className="brand">
          <img src={logo} alt="AEG" />
          <div><strong>AEG DDP</strong><span>{t('sidebar.brandSuffix')}</span></div>
        </div>
        <nav className="nav">
          <NavLink to="/" end><Icon name="home" />{t('nav.home')}</NavLink>
          <NavLink to="/orders"><Icon name="orders" />{t('nav.orders')}</NavLink>
          <NavLink to="/cnpjs"><Icon name="building" />{t('nav.cnpjs')}</NavLink>
        </nav>
        <div className="sidebar-foot"><Icon name="ship" /><span>{t('sidebar.operation')}</span></div>
      </aside>
      <div className="main">
        <header className="topbar">
          <button className="icon-button menu-button" onClick={() => setMenuOpen(true)} aria-label={t('topbar.openMenu')} aria-expanded={menuOpen}><Icon name="menu" /></button>
          <div className="topbar-context"><span className="eyebrow">{t('topbar.portalLabel')}</span><span>{t('topbar.envLabel')}</span></div>
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
              aria-label={t('topbar.accountMenu')}
              onClick={() => setUserMenuOpen(open => !open)}
            >
              <span className="user-avatar" aria-hidden="true">{user?.username.slice(0, 1).toUpperCase()}</span>
              <span className="user-name"><strong>{user?.username}</strong><small>{t('user.role.despachante')}</small></span>
              <span className={`user-caret${userMenuOpen ? ' open' : ''}`} aria-hidden="true">▾</span>
            </button>
            {userMenuOpen && (
              <div className="user-dropdown" role="menu">
                <button
                  type="button"
                  className="user-dropdown-item"
                  role="menuitem"
                  onClick={() => { setUserMenuOpen(false); navigate('/profile'); }}
                >
                  <Icon name="user" size={17} /><span>{t('user.center')}</span>
                </button>
                <div className="user-dropdown-divider" />
                <button
                  type="button"
                  className="user-dropdown-item danger"
                  role="menuitem"
                  onClick={() => { setUserMenuOpen(false); logout(); navigate('/login'); }}
                >
                  <Icon name="logout" size={17} /><span>{t('user.logout')}</span>
                </button>
              </div>
            )}
          </div>
        </header>
        <main id="conteudo" className="content" tabIndex={-1}><Outlet /></main>
      </div>
    </div>
  );
}
