import { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../store/auth';
import logo from '../assets/logo.png';

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const isAdmin = user?.role === 'admin';

  useEffect(() => setMenuOpen(false), [location.pathname]);
  useEffect(() => setUserMenuOpen(false), [location.pathname]);

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
    { to: '/', label: '工作台', icon: '🏠' },
    { to: '/templates', label: '模板管理', icon: '📄' },
    { to: '/clients', label: '客户管理', icon: '👥' },
    { to: '/customs-cnpjs', label: '进口抬头', icon: '🏢' },
    { to: '/staff', label: '员工管理', icon: '🧑‍💼' },
    { to: '/help', label: '帮助文档', icon: '❓' },
    { to: '/audit', label: '审计日志', icon: '🔍' },
    { to: '/ai-config', label: '模型 API', icon: '🤖' }
  ] : [
    { to: '/clients', label: '企业认证审核', icon: '✅' }
  ];

  return (
    <div className="layout">
      {menuOpen && <button type="button" className="nav-scrim" aria-label="关闭导航菜单" onClick={() => setMenuOpen(false)} />}
      <aside id="admin-sidebar" className={`sidebar${menuOpen ? ' sidebar-open' : ''}`} aria-label="主导航">
        <div className="brand">
          <img className="logo-dot" src={logo} alt="AEG" />
          DDP · 管理端
        </div>
        <nav>
          {navItems.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === '/'} onClick={() => setMenuOpen(false)}>
              <span aria-hidden="true">{n.icon}</span>{n.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="main">
        <header className="topbar">
          <button
            type="button"
            className="menu-button"
            aria-label="打开导航菜单"
            aria-controls="admin-sidebar"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(true)}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <div className="user-info" ref={userMenuRef}>
            <button
              type="button"
              className="user-menu-trigger"
              aria-haspopup="menu"
              aria-expanded={userMenuOpen}
              onClick={() => setUserMenuOpen(open => !open)}
            >
              <span aria-hidden="true">👤</span>
              <strong className="user-menu-name">{user?.username}</strong>
              <span className="muted text-sm user-menu-role">· {isAdmin ? '管理员' : '运营人员'}</span>
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
                  👤 用户中心
                </button>
                <div className="user-dropdown-divider" />
                <button
                  type="button"
                  className="user-dropdown-item danger"
                  role="menuitem"
                  onClick={() => { setUserMenuOpen(false); logout(); nav('/login'); }}
                >
                  ⏻ 登出
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
