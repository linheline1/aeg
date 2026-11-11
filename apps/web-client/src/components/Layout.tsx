import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../store/auth';
import logo from '../assets/logo.png';

export default function Layout() {
  const { t, i18n } = useTranslation();
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const langRef = useRef<HTMLDivElement>(null);

  // 语言下拉：点击外部 / Esc 关闭
  useEffect(() => {
    if (!langOpen) return;
    const onClick = (e: MouseEvent) => {
      if (langRef.current && !langRef.current.contains(e.target as Node)) {
        setLangOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLangOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [langOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  const currentLang = i18n.language?.startsWith('pt') ? 'pt' : 'zh';

  return (
    <div>
      <header className="app-header">
        <div className="brand">
          <img className="logo-dot" src={logo} alt="AEG" />
        </div>
        <nav>
          <NavLink to="/home">{t('nav.home')}</NavLink>
          <NavLink to="/workbench">{t('nav.upload')}</NavLink>
          <NavLink to="/orders">{t('nav.myQuotes')}</NavLink>
        </nav>
        <div className="user-area" ref={menuRef}>
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
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(o => !o)}
          >
            {user?.username}
            <span className={`user-caret${menuOpen ? ' open' : ''}`}>▾</span>
          </button>
          {menuOpen && (
            <div className="user-dropdown" role="menu">
              <button
                type="button"
                className="user-dropdown-item"
                role="menuitem"
                onClick={() => { setMenuOpen(false); nav('/profile'); }}
              >
                👤 {t('user.center')}
              </button>
              <button
                type="button"
                className="user-dropdown-item"
                role="menuitem"
                onClick={() => { setMenuOpen(false); nav('/help'); }}
              >
                ❓ {t('user.help')}
              </button>
              <div className="user-dropdown-divider" />
              <button
                type="button"
                className="user-dropdown-item danger"
                role="menuitem"
                onClick={() => { setMenuOpen(false); logout(); nav('/login'); }}
              >
                ⏻ {t('user.logout')}
              </button>
            </div>
          )}
        </div>
      </header>
      <div className="app-main">
        <Outlet />
      </div>
    </div>
  );
}
