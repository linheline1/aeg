import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../store/auth';

export default function RequireAuth({ children }: { children: React.ReactNode }) {
  const { token, user, logout } = useAuth();
  const location = useLocation();
  if (!token || !user) return <Navigate to="/login" state={{ from: location }} replace />;
  if (user.role !== 'customs') {
    logout();
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}
