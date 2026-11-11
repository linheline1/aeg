import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
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
import MyClients from './pages/MyClients';
import { useAuth } from './store/auth';
export default function App() {
  const { user } = useAuth();
  // M4：业务员登录运营端后落在「成交统计」，报价员落在「报价订单」
  const home = user?.role === 'sales' ? '/deals' : '/orders';

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to={home} /> : <Login />} />
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
        <Route path="clients" element={<RequireAuth allowedRole={['sales']}><MyClients /></RequireAuth>} />
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
