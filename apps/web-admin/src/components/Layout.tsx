import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../store/auth';
import logo from '../assets/logo.png';

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const isAdmin = user?.role === 'admin';

  const navItems = isAdmin ? [
    { to: '/', label: '工作台', icon: '🏠' },
    { to: '/templates', label: '模板管理', icon: '📄' },
    { to: '/clients', label: '客户管理', icon: '👥' },
    { to: '/staff', label: '员工管理', icon: '🧑‍💼' },
    { to: '/help', label: '帮助文档', icon: '❓' },
    { to: '/audit', label: '审计日志', icon: '🔍' },
    { to: '/ai-config', label: '模型 API', icon: '🤖' }
  ] : [
    { to: '/clients', label: '企业认证审核', icon: '✅' }
  ];

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">
          <img className="logo-dot" src={logo} alt="AEG" />
          DDP · 管理端
        </div>
        <nav>
          {navItems.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === '/'}>
              <span>{n.icon}</span>{n.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="main">
        <header className="topbar">
          <div className="user-info">
            👤 <strong>{user?.username}</strong>
            <span className="muted text-sm">· {isAdmin ? '管理员' : '运营人员'}</span>
          </div>
          <button className="logout-btn" onClick={() => { logout(); nav('/login'); }}>登出</button>
        </header>
        <div className="content">{children}</div>
      </main>
    </div>
  );
}
