import { Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Layout from './components/Layout';
import RequireAuth from './components/RequireAuth';
import { useAuth } from './store/auth';
import Dashboard from './pages/Dashboard';
import TemplateList from './pages/TemplateList';
import ClientList from './pages/ClientList';
import ClientDetail from './pages/ClientDetail';
import StaffList from './pages/StaffList';
import CustomsCnpjs from './pages/CustomsCnpjs';
import AuditLog from './pages/AuditLog';
import HelpArticles from './pages/HelpArticles';
import AiConfig from './pages/AiConfig';
import Profile from './pages/Profile';

/** 无权访问提示页（顶层路由，避免守卫重定向死循环） */
function Forbidden() {
  return (
    <div className="login-page">
      <div className="login-card" style={{ textAlign: 'center' }}>
        <h2 style={{ marginTop: 0 }}>403 · 无权访问</h2>
        <p className="muted">当前账号角色无权访问该页面（管理员功能）</p>
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
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" /> : <Login />} />
      <Route path="/403" element={<Forbidden />} />
      <Route
        path="/*"
        element={
          <RequireAuth allowedRoles={['admin', 'operator']}>
            <Layout>
              <Routes>
                <Route index element={user?.role === 'operator' ? <Navigate to="clients" replace /> : <Dashboard />} />
                <Route path="templates" element={<RequireAuth allowedRoles={['admin']}><TemplateList /></RequireAuth>} />
                <Route path="clients" element={<ClientList />} />
                <Route path="clients/:id" element={<ClientDetail />} />
                <Route path="staff" element={<RequireAuth allowedRoles={['admin']}><StaffList /></RequireAuth>} />
                <Route path="customs-cnpjs" element={<RequireAuth allowedRoles={['admin']}><CustomsCnpjs /></RequireAuth>} />
                <Route path="help" element={<RequireAuth allowedRoles={['admin']}><HelpArticles /></RequireAuth>} />
                <Route path="audit" element={<RequireAuth allowedRoles={['admin']}><AuditLog /></RequireAuth>} />
                <Route path="ai-config" element={<RequireAuth allowedRoles={['admin']}><AiConfig /></RequireAuth>} />
                <Route path="profile" element={<Profile />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Layout>
          </RequireAuth>
        }
      />
    </Routes>
  );
}
