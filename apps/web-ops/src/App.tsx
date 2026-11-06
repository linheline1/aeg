import { Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Layout from './components/Layout';
import RequireAuth from './components/RequireAuth';
import Orders from './pages/Orders';
import OrderDetail from './pages/OrderDetail';
import Rates from './pages/Rates';
import Deals from './pages/Deals';
import Template from './pages/Template';
import Finance from './pages/Finance';
import Help from './pages/Help';
import Products from './pages/Products';
import Profile from './pages/Profile';
import { useAuth } from './store/auth';

/** 无权访问提示页（顶层路由，避免守卫重定向死循环） */
function Forbidden() {
  return (
    <div className="login-page">
      <div className="login-card" style={{ textAlign: 'center' }}>
        <h2 style={{ marginTop: 0 }}>403 · 无权访问</h2>
        <p className="sub">当前账号角色无权进入运营端（报价员 operator / 业务员 sales）</p>
        <a
          className="btn btn-lg"
          href="#back"
          onClick={e => { e.preventDefault(); window.location.href = '/login'; }}
        >
          返回登录
        </a>
      </div>
    </div>
  );
}

export default function App() {
  const { user } = useAuth();
  // M4：业务员登录运营端后落在「成交统计」，报价员落在「报价订单」
  const home = user?.role === 'sales' ? '/deals' : '/orders';

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to={home} /> : <Login />} />
      <Route path="/403" element={<Forbidden />} />
      <Route
        path="/"
        element={
          <RequireAuth allowedRole={['operator', 'sales']}>
            <Layout />
          </RequireAuth>
        }
      >
        <Route index element={<Navigate to={home} replace />} />
        <Route path="orders" element={<Orders />} />
        <Route
          path="orders/:id"
          element={
            <RequireAuth allowedRole={['operator', 'admin']}>
              <OrderDetail />
            </RequireAuth>
          }
        />
        <Route path="deals" element={<Deals />} />
        <Route
          path="rates"
          element={
            <RequireAuth allowedRole={['operator', 'admin']}>
              <Rates />
            </RequireAuth>
          }
        />
        <Route
          path="products"
          element={
            <RequireAuth allowedRole={['operator', 'admin']}>
              <Products />
            </RequireAuth>
          }
        />
        <Route
          path="template"
          element={
            <RequireAuth allowedRole={['operator', 'admin']}>
              <Template />
            </RequireAuth>
          }
        />
        <Route
          path="finance"
          element={
            <RequireAuth allowedRole={['operator', 'admin', 'sales']}>
              <Finance />
            </RequireAuth>
          }
        />
        <Route path="help" element={<Help />} />
        <Route path="help/:slug" element={<Help />} />
        <Route path="profile" element={<Profile />} />
        <Route path="*" element={<Navigate to={home} replace />} />
      </Route>
    </Routes>
  );
}
