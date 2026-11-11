import { Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Register from './pages/Register';
import Landing from './pages/Landing';
import Company from './pages/Company';
import Partners from './pages/Partners';
import LinePage from './pages/LinePage';
import Layout from './components/Layout';
import Workbench from './pages/Workbench';
import Home from './pages/Home';
import CnpjPage from './pages/CnpjPage';
import Profile from './pages/Profile';
import Help from './pages/Help';
import Orders from './pages/Orders';
import OrderDetail from './pages/OrderDetail';
import RequireAuth from './components/RequireAuth';
import { useAuth } from './store/auth';

export default function App() {
  const { user } = useAuth();
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/company" element={<Company />} />
      <Route path="/partners" element={<Partners />} />
      <Route path="/lines/brazil" element={<LinePage lineKey="lineBrazil" />} />
      <Route path="/lines/argentina" element={<LinePage lineKey="lineArgentina" />} />
      <Route path="/lines/south-america" element={<LinePage lineKey="lineSouthAmerica" />} />
      <Route path="/login" element={user ? <Navigate to="/home" /> : <Login />} />
      <Route path="/register" element={user ? <Navigate to="/home" /> : <Register />} />
      <Route element={<RequireAuth allowedRole="client"><Layout /></RequireAuth>}>
        <Route path="/home" element={<Home />} />
        <Route path="/workbench" element={<Workbench />} />
        <Route path="/cnpjs" element={<CnpjPage />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/help" element={<Help />} />
        <Route path="/help/:slug" element={<Help />} />
        <Route path="/orders" element={<Orders />} />
        <Route path="/orders/:id" element={<OrderDetail />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
