import { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../store/auth';
import type { Role } from '@aeg/shared-types';

export default function RequireAuth({
  children,
  allowedRoles
}: {
  children: React.ReactNode;
  allowedRoles: Role[];
}) {
  const { token, user, logout } = useAuth();
  const loc = useLocation();
  const roleMismatch = Boolean(token && user && !allowedRoles.includes(user.role));

  // 角色不符（如客户账号打开管理端）：清掉本端会话并回登录页，
  // 否则 /login 会因「已登录」再次跳回首页，形成 403 死循环
  useEffect(() => {
    if (roleMismatch) logout();
  }, [roleMismatch, logout]);

  if (!token || !user || roleMismatch) return <Navigate to="/login" state={{ from: loc }} replace />;
  return <>{children}</>;
}
