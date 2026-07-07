import { Navigate, Outlet } from 'react-router-dom';
import { roleHome, useAuth } from '../context/AuthContext';
import { UserRole } from '../types';
import LoadingSpinner from './LoadingSpinner';

interface RoleRouteProps {
  allowed: UserRole[];
}

/**
 * RBAC on the client: only users whose role is in `allowed` may enter.
 * Anyone else is silently redirected to their own dashboard.
 */
const RoleRoute = ({ allowed }: RoleRouteProps) => {
  const { user, loading } = useAuth();

  if (loading) {
    return <LoadingSpinner fullScreen />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!allowed.includes(user.role)) {
    return <Navigate to={roleHome(user.role)} replace />;
  }

  return <Outlet />;
};

export default RoleRoute;
