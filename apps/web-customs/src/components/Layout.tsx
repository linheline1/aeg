import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import logo from '../assets/logo.png';
import { useAuth } from '../store/auth';
import Icon from './Icon';

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMenuOpen(false), [location.pathname]);
  useEffect(() => setUserMenuOpen(false), [location.pathname]);
  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [menuOpen]);

  // Menu da conta: fecha ao clicar fora ou pressionar Esc
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

  return (
    <div className="layout">
      <a className="skip-link" href="#conteudo">Ir para o conteúdo</a>
      {menuOpen && <button className="nav-scrim" aria-label="Fechar menu" onClick={() => setMenuOpen(false)} />}
      <aside className={`sidebar${menuOpen ? ' sidebar-open' : ''}`} aria-label="Navegação principal">
        <div className="brand">
          <img src={logo} alt="AEG" />
          <div><strong>AEG DDP</strong><span>Despacho aduaneiro</span></div>
        </div>
        <nav className="nav">
          <NavLink to="/" end><Icon name="home" />Início</NavLink>
          <NavLink to="/orders"><Icon name="orders" />Pedidos e DI</NavLink>
          <NavLink to="/cnpjs"><Icon name="building" />CNPJs e cotas</NavLink>
        </nav>
        <div className="sidebar-foot"><Icon name="ship" /><span>Operação logística<br />Brasil · China</span></div>
      </aside>
      <div className="main">
        <header className="topbar">
          <button className="icon-button menu-button" onClick={() => setMenuOpen(true)} aria-label="Abrir menu" aria-expanded={menuOpen}><Icon name="menu" /></button>
          <div className="topbar-context"><span className="eyebrow">Portal do despachante</span><span>Ambiente de análise aduaneira</span></div>
          <div className="user-info" ref={userMenuRef}>
            <button
              type="button"
              className="user-menu-trigger"
              aria-haspopup="menu"
              aria-expanded={userMenuOpen}
              aria-label="Menu da conta"
              onClick={() => setUserMenuOpen(open => !open)}
            >
              <span className="user-avatar" aria-hidden="true">{user?.username.slice(0, 1).toUpperCase()}</span>
              <span className="user-name"><strong>{user?.username}</strong><small>Despachante aduaneiro</small></span>
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
                  <Icon name="user" size={17} /><span>Centro da conta</span>
                </button>
                <div className="user-dropdown-divider" />
                <button
                  type="button"
                  className="user-dropdown-item danger"
                  role="menuitem"
                  onClick={() => { setUserMenuOpen(false); logout(); navigate('/login'); }}
                >
                  <Icon name="logout" size={17} /><span>Sair</span>
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
