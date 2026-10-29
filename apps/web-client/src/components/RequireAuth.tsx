import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../store/auth';
import type { Role } from '@aeg/shared-types';

export default function RequireAuth({ children, allowedRole }: { children: React.ReactNode; allowedRole: Role }) {
  const { token, user } = useAuth();
  const loc = useLocation();
  if (!token || !user) return <Navigate to="/login" state={{ from: loc }} replace />;
  if (user.role !== allowedRole) return <Navigate to="/403" replace />;
  return <>{children}</>;
}
