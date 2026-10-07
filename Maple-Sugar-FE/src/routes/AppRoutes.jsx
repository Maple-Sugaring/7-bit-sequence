import { lazy, Suspense } from 'react';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Capability } from '../business/permissions';
import { AppShell } from '../components/layout/AppShell';
import { AuthCallbackPage } from '../pages/AuthCallbackPage';
import { LoginPage } from '../pages/LoginPage';
import { NotFoundPage } from '../pages/NotFoundPage';
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

const PROTECTED = [
  { path: '/dashboard', element: <DashboardPage />, capability: Capability.VIEW_DASHBOARD },
  { path: '/map', element: <FleetMapPage />, capability: [Capability.VIEW_DASHBOARD, Capability.VIEW_NODES] },
  { path: '/deploy', element: <DeployPage />, capability: Capability.DEPLOY_NODES },
  { path: '/table', element: <SapDataPage />, capability: Capability.VIEW_DATA_TABLE },
  { path: '/collection', element: <CollectionPage />, capability: Capability.RECORD_DATA },
  { path: '/nodes/:nodeId', element: <NodePage />, capability: Capability.VIEW_DASHBOARD },
  { path: '/notifications', element: <AlertsPage />, capability: Capability.VIEW_ALERTS },
  { path: '/schedule', element: <SchedulePage />, capability: Capability.VIEW_SCHEDULE },
  { path: '/admin', element: <AdminPage />, capability: Capability.MANAGE_USERS },
  // Every signed-in role has a profile, so there is no capability gate.
  { path: '/profile', element: <ProfilePage /> },
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
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<LoginPage />} />
      <Route path="/auth/callback" element={<AuthCallbackPage />} />

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
        {PROTECTED.map(({ path, element, capability }) => (
          <Route
            key={path}
            path={path}
            element={
              <ProtectedRoute capability={capability}>
                <Suspense fallback={<PageFallback />}>{element}</Suspense>
              </ProtectedRoute>
            }
          />
        ))}
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
