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
  const { token, user } = useAuth();
  const loc = useLocation();

  if (!token || !user) return <Navigate to="/login" state={{ from: loc }} replace />;
  if (!allowedRoles.includes(user.role)) return <Navigate to="/403" replace />;
  return <>{children}</>;
}
