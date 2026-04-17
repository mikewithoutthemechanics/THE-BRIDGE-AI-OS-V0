import { useEffect, useState, type ComponentType } from 'react';
import { useApp, useAuth } from './AppContext';

// Route configuration
export interface RouteConfig {
  path: string;
  component: ComponentType;
  requiresAuth?: boolean;
  requiresAdmin?: boolean;
  title?: string;
}

// Route guard logic
export function useRouteGuard() {
  const { user, token, isAuthenticated, isAdmin } = useAuth();

  const checkAccess = (route: RouteConfig): { allowed: boolean; redirectTo?: string } => {
    // Public routes
    if (!route.requiresAuth && !route.requiresAdmin) {
      return { allowed: true };
    }

    // Auth required but not authenticated
    if (route.requiresAuth && !isAuthenticated) {
      return { allowed: false, redirectTo: '/join' };
    }

    // Admin required but not admin
    if (route.requiresAdmin && !isAdmin) {
      return { allowed: false, redirectTo: '/app' };
    }

    // Authenticated user trying to access join/auth pages
    if (isAuthenticated && (route.path === '/join' || route.path.startsWith('/auth'))) {
      return { allowed: false, redirectTo: '/app' };
    }

    return { allowed: true };
  };

  return { checkAccess };
}

// Router provider hook
export function useRouter(routes: RouteConfig[]) {
  const [currentPath, setCurrentPath] = useState(() => {
    return window.location.pathname || '/';
  });

  const { checkAccess } = useRouteGuard();

  // Find current route
  const currentRoute = routes.find(route => {
    if (route.path === '/') {
      return currentPath === '/' || currentPath === '/landing';
    }
    return currentPath.startsWith(route.path);
  }) || routes.find(route => route.path === '/'); // Fallback to home

  // Check access for current route
  const accessCheck = currentRoute ? checkAccess(currentRoute) : { allowed: false, redirectTo: '/' };

  // Navigate function
  const navigate = (to: string) => {
    // Update URL without page reload
    window.history.pushState({}, '', to);
    setCurrentPath(to);

    // Scroll to top
    window.scrollTo(0, 0);
  };

  // Handle browser back/forward
  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(window.location.pathname);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Handle initial route guard
  useEffect(() => {
    if (!accessCheck.allowed && accessCheck.redirectTo) {
      navigate(accessCheck.redirectTo);
    }
  }, [accessCheck.allowed, accessCheck.redirectTo]);

  return {
    currentPath,
    currentRoute: accessCheck.allowed ? currentRoute : null,
    navigate,
    isAllowed: accessCheck.allowed,
    redirectTo: accessCheck.redirectTo,
  };
}