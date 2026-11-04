import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../store/auth';
import { roleLabel } from '../lib/roles';
import logo from '../assets/logo.png';

export default function Layout() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);
  // M4：业务员与报价员职责分离 —— 业务员只见「报价跟进 + 成交统计」
  const isSales = user?.role === 'sales';

  useEffect(() => setMenuOpen(false), [location.pathname]);
  useEffect(() => setUserMenuOpen(false), [location.pathname, location.hash]);

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

  return (
    <div className="layout">
      {menuOpen && (
        <button
          className="nav-scrim"
          type="button"
          tabIndex={-1}
          aria-label="关闭导航菜单"
          onClick={closeMenu}
        />
      )}
      <aside
        id="ops-navigation"
        ref={sidebarRef}
        className={`sidebar${menuOpen ? ' sidebar-open' : ''}`}
        aria-label="主导航"
      >
        <div className="brand">
          <img className="logo-dot" src={logo} alt="AEG" />
          <span>AEG · 运营端</span>
        </div>
        <nav className="nav" aria-label="运营功能">
          <NavLink to="/orders">{isSales ? '📞 报价跟进' : '📦 报价订单'}</NavLink>
          <NavLink to="/deals">📊 成交统计</NavLink>
          {!isSales && <NavLink to="/images">🖼 客户图片</NavLink>}
          {!isSales && <NavLink to="/products">🗂 产品档案</NavLink>}
          {!isSales && <NavLink to="/rates">💰 费率表</NavLink>}
          <NavLink to="/finance">💵 财务应收</NavLink>
          {!isSales && <NavLink to="/template">📄 模板预览</NavLink>}
          <NavLink to="/help">❓ 帮助中心</NavLink>
        </nav>
      </aside>
      <div className="main">
        <header className="topbar">
          <div className="topbar-leading">
            <button
              ref={menuButtonRef}
              className="menu-btn"
              type="button"
              aria-label={menuOpen ? '关闭导航菜单' : '打开导航菜单'}
              aria-controls="ops-navigation"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen(open => !open)}
            >
              <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <span className="mobile-brand">AEG · 运营端</span>
          </div>
          <div className="user-info" ref={userMenuRef}>
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
                  👤 用户中心
                </button>
                <div className="user-dropdown-divider" />
                <button
                  type="button"
                  className="user-dropdown-item danger"
                  role="menuitem"
                  onClick={() => { setUserMenuOpen(false); logout(); nav('/login'); }}
                >
                  ⏻ 退出登录
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
