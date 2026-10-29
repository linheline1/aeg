import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../store/auth';
import logo from '../assets/logo.png';

const ROLE_CN: Record<string, string> = {
  operator: '报价员',
  sales: '业务员',
  admin: '管理员'
};

export default function Layout() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  // M4：业务员与报价员职责分离 —— 业务员只见「报价跟进 + 成交统计」
  const isSales = user?.role === 'sales';

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">
          <img className="logo-dot" src={logo} alt="AEG" />
          <span>AEG · 运营端</span>
        </div>
        <nav className="nav">
          <NavLink to="/orders">{isSales ? '📞 报价跟进' : '📦 报价订单'}</NavLink>
          <NavLink to="/deals">📊 成交统计</NavLink>
          {!isSales && <NavLink to="/images">🖼 客户图片</NavLink>}
          {!isSales && <NavLink to="/rates">💰 费率表</NavLink>}
          <NavLink to="/finance">💵 财务应收</NavLink>
          {!isSales && <NavLink to="/template">📄 模板预览</NavLink>}
          <NavLink to="/help">❓ 帮助中心</NavLink>
        </nav>
      </aside>
      <div className="main">
        <div className="topbar">
          <div />
          <div className="user-info">
            <span>
              {user?.username} · {ROLE_CN[user?.role || ''] || user?.role}
            </span>
            <button
              className="logout-btn"
              onClick={() => {
                logout();
                nav('/login');
              }}
            >
              退出登录
            </button>
          </div>
        </div>
        <div className="content">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
