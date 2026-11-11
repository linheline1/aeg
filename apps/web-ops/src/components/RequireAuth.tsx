import { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../store/auth';
import type { Role } from '@aeg/shared-types';

/** 路由守卫：未登录回登录页；角色不符则退出本端会话后回登录页（避免 403 死循环） */
export default function RequireAuth({
  children,
  allowedRole
}: {
  children: React.ReactNode;
  allowedRole: Role | Role[];
}) {
  const { token, user, logout } = useAuth();
  const loc = useLocation();
  const roles: Role[] = Array.isArray(allowedRole) ? allowedRole : [allowedRole];
  const roleMismatch = Boolean(token && user && !roles.includes(user.role));

  useEffect(() => {
    if (roleMismatch) logout();
  }, [roleMismatch, logout]);

  if (!token || !user || roleMismatch) {
    return <Navigate to="/login" state={{ from: loc }} replace />;
  }
  return <>{children}</>;
}
