import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../store/auth';
import logo from '../assets/logo.png';

export default function Layout() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // 点击菜单外部 / 按 Esc 关闭下拉
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

  return (
    <div>
      <header className="app-header">
        <div className="brand">
          <img className="logo-dot" src={logo} alt="AEG" />
        </div>
        <nav>
          <NavLink to="/home">🏠 Home</NavLink>
          <NavLink to="/workbench">📤 上传报价</NavLink>
          <NavLink to="/orders">📋 我的报价</NavLink>
        </nav>
        <div className="user-area" ref={menuRef}>
          <button
            type="button"
            className="user-menu-trigger"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(o => !o)}
          >
            👤 {user?.username}
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
                👤 用户中心
              </button>
              <button
                type="button"
                className="user-dropdown-item"
                role="menuitem"
                onClick={() => { setMenuOpen(false); nav('/help'); }}
              >
                ❓ 帮助中心
              </button>
              <div className="user-dropdown-divider" />
              <button
                type="button"
                className="user-dropdown-item danger"
                role="menuitem"
                onClick={() => { setMenuOpen(false); logout(); nav('/login'); }}
              >
                ⏻ 登出
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
