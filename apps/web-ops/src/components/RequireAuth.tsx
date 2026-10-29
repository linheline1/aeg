import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../store/auth';
import type { Role } from '@aeg/shared-types';

/** 路由守卫：未登录去登录页；已登录但角色不符去 /403（避免重定向死循环） */
export default function RequireAuth({
  children,
  allowedRole
}: {
  children: React.ReactNode;
  allowedRole: Role | Role[];
}) {
  const { token, user } = useAuth();
  const loc = useLocation();

  if (!token || !user) {
    return <Navigate to="/login" state={{ from: loc }} replace />;
  }
  const roles: Role[] = Array.isArray(allowedRole) ? allowedRole : [allowedRole];
  if (!roles.includes(user.role)) {
    return <Navigate to="/403" replace />;
  }
  return <>{children}</>;
}
