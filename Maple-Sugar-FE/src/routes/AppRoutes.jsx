import { lazy, Suspense } from 'react';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell';
import { apiMode } from '../data/apiClient';
import { AuthCallbackPage } from '../pages/AuthCallbackPage';
import { LandingPage } from '../pages/LandingPage';
import { LoginPage } from '../pages/LoginPage';
import { NotFoundPage } from '../pages/NotFoundPage';
import { PrivacyPage } from '../pages/PrivacyPage';
import { ROUTE_CAPABILITIES } from './navigation';
import { ProtectedRoute } from './ProtectedRoute';

const DashboardPage = lazy(() =>
  import('../pages/DashboardPage').then((module) => ({ default: module.DashboardPage })),
);
const SapDataPage = lazy(() =>
  import('../pages/SapDataPage').then((module) => ({ default: module.SapDataPage })),
);
const NodePage = lazy(() =>
  import('../pages/NodePage').then((module) => ({ default: module.NodePage })),
);
const AlertsPage = lazy(() =>
  import('../pages/AlertsPage').then((module) => ({ default: module.AlertsPage })),
);
const SchedulePage = lazy(() =>
  import('../pages/SchedulePage').then((module) => ({ default: module.SchedulePage })),
);
const AdminPage = lazy(() =>
  import('../pages/AdminPage').then((module) => ({ default: module.AdminPage })),
);
const CollectionPage = lazy(() =>
  import('../pages/CollectionPage').then((module) => ({ default: module.CollectionPage })),
);
const ProfilePage = lazy(() =>
  import('../pages/ProfilePage').then((module) => ({ default: module.ProfilePage })),
);
const FleetMapPage = lazy(() =>
  import('../pages/FleetMapPage').then((module) => ({ default: module.FleetMapPage })),
);
const DeployPage = lazy(() =>
  import('../pages/DeployPage').then((module) => ({ default: module.DeployPage })),
);
const FeedbackPage = lazy(() =>
  import('../pages/FeedbackPage').then((module) => ({ default: module.FeedbackPage })),
);
//WCAG 2.2 SC 2.4.2: Each page must have a unique title
const SITE_NAME = 'Maple Sugaring';

function PageTitle({title, children}){
  useLayoutEffect(()=>{
    document.title = title ? `${title} - ${SITE_NAME}` : SITE_NAME;
  },[title]);
  return children;
}

const PROTECTED = [
  { path: '/dashboard', title: 'The Bush', element: <DashboardPage /> },
  { path: '/map', title: 'Fleet map', element: <FleetMapPage /> },
  { path: '/deploy', title: 'Deploy', element: <DeployPage /> },
  { path: '/table', title: 'Sugar Woods', element: <SapDataPage /> },
  { path: '/collection', title: 'Collection', element: <CollectionPage /> },
  { path: '/nodes/:nodeId', title: 'Sensor Node', element: <NodePage /> },
  { path: '/notifications', title: 'Notifications', element: <AlertsPage /> },
  { path: '/schedule', title: 'Schedule', element: <SchedulePage /> },
  { path: '/admin', title: 'Admin', element: <AdminPage /> },
  { path: '/profile', title: 'Your profile', element: <ProfilePage /> },
  ...(apiMode === 'mock' ? [{ path: '/feedback', element: <FeedbackPage /> }] : []),
];

// Old schedule-admin links (e.g. from alerts) carry a tree and task in the query.
function RedirectKeepingSearch({ to }) {
  const { search } = useLocation();
  const params = new URLSearchParams(search);
  if (params.has('task') && !params.has('shiftTask')) {
    params.set('shiftTask', params.get('task'));
    params.delete('task');
  }
  const query = params.toString();
  return <Navigate to={`${to}${query ? `?${query}` : ''}`} replace />;
}

function PageFallback() {
  return (
    <Box role="status" aria-live="polite" sx={{ display: 'grid', placeItems: 'center', minHeight: 320 }}>
      <CircularProgress />
    </Box>
  );
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<PageTitle title="Sign in"><LoginPage /></PageTitle>} />
      <Route path="/" element={<PageTitle><LandingPage /></PageTitle>} />
      <Route path="/auth/callback" element={<PageTitle title="Signing in"><AuthCallbackPage /></PageTitle>} />
      <Route path="/privacy" element={<PageTitle title="Privacy"><PrivacyPage /></PageTitle>} />
 
      <Route path="/data" element={<Navigate to="/table" replace />} />
      <Route path="/input" element={<Navigate to="/collection" replace />} />
      <Route path="/record" element={<Navigate to="/collection" replace />} />
      <Route path="/alerts" element={<Navigate to="/notifications" replace />} />
      <Route path="/schedule/manage" element={<RedirectKeepingSearch to="/schedule" />} />
      <Route path="/schedule-admin" element={<RedirectKeepingSearch to="/schedule" />} />
      <Route path="/guides" element={<Navigate to="/dashboard" replace />} />
      <Route path="/nodes" element={<Navigate to="/deploy" replace />} />
      <Route path="/deployed" element={<Navigate to="/deploy" replace />} />
 
      <Route
        element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }
      >
        {PROTECTED.map(({ path, title, element }) => (
          <Route
            key={path}
            path={path}
            element={
              <ProtectedRoute capability={ROUTE_CAPABILITIES[path] ?? undefined}>
                {/* Outside Suspense so the title changes immediately, even while the page chunk loads. */}
                <PageTitle title={title}>
                  <Suspense fallback={<PageFallback />}>{element}</Suspense>
                </PageTitle>
              </ProtectedRoute>
            }
          />
        ))}
      </Route>
 
      <Route path="*" element={<PageTitle title="Page not found"><NotFoundPage /></PageTitle>} />
    </Routes>
  );
}
