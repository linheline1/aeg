import { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../store/auth';

export default function RequireAuth({ children }: { children: React.ReactNode }) {
  const { token, user, logout } = useAuth();
  const location = useLocation();
  const roleMismatch = Boolean(token && user && user.role !== 'customs');

  useEffect(() => {
    if (roleMismatch) logout();
  }, [roleMismatch, logout]);

  if (!token || !user || roleMismatch) return <Navigate to="/login" state={{ from: location }} replace />;
  return <>{children}</>;
}
