import { Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import RequireAuth from './components/RequireAuth';
import Cnpjs from './pages/Cnpjs';
import Home from './pages/Home';
import Login from './pages/Login';
import OrderDetail from './pages/OrderDetail';
import Orders from './pages/Orders';
import Profile from './pages/Profile';
import { useAuth } from './store/auth';

export default function App() {
  const { token, user } = useAuth();
  const authenticated = Boolean(token && user?.role === 'customs');
  return (
    <Routes>
      <Route path="/login" element={authenticated ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/" element={<RequireAuth><Layout /></RequireAuth>}>
        <Route index element={<Home />} />
        <Route path="orders" element={<Orders />} />
        <Route path="orders/:id" element={<OrderDetail />} />
        <Route path="cnpjs" element={<Cnpjs />} />
        <Route path="profile" element={<Profile />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
