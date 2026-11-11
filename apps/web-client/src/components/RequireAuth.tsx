import { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../store/auth';
import type { Role } from '@aeg/shared-types';

export default function RequireAuth({ children, allowedRole }: { children: React.ReactNode; allowedRole: Role }) {
  const { token, user, logout } = useAuth();
  const loc = useLocation();
  const roleMismatch = Boolean(token && user && user.role !== allowedRole);

  // 角色不符（如员工账号打开客户端）：退出本端会话并回登录页
  useEffect(() => {
    if (roleMismatch) logout();
  }, [roleMismatch, logout]);

  if (!token || !user || roleMismatch) return <Navigate to="/login" state={{ from: loc }} replace />;
  return <>{children}</>;
}
