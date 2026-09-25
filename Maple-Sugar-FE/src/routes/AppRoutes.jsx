import { lazy, Suspense } from 'react';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import { Navigate, Route, Routes } from 'react-router-dom';
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
const PlacementPage = lazy(() =>
  import('../pages/PlacementPage').then((module) => ({ default: module.PlacementPage })),
);
const AlertsPage = lazy(() =>
  import('../pages/AlertsPage').then((module) => ({ default: module.AlertsPage })),
);
const SchedulePage = lazy(() =>
  import('../pages/SchedulePage').then((module) => ({ default: module.SchedulePage })),
);
const ScheduleAdminPage = lazy(() =>
  import('../pages/ScheduleAdminPage').then((module) => ({ default: module.ScheduleAdminPage })),
);
const AdminPage = lazy(() =>
  import('../pages/AdminPage').then((module) => ({ default: module.AdminPage })),
);
const CollectionPage = lazy(() =>
  import('../pages/CollectionPage').then((module) => ({ default: module.CollectionPage })),
);

const PROTECTED = [
  { path: '/dashboard', element: <DashboardPage />, capability: Capability.VIEW_DASHBOARD },
  { path: '/table', element: <SapDataPage />, capability: Capability.VIEW_DATA_TABLE },
  { path: '/collection', element: <CollectionPage />, capability: Capability.RECORD_DATA },
  { path: '/nodes/:nodeId', element: <NodePage />, capability: Capability.VIEW_DASHBOARD },
  { path: '/placement', element: <PlacementPage />, capability: Capability.VIEW_DASHBOARD },
  { path: '/notifications', element: <AlertsPage />, capability: Capability.VIEW_ALERTS },
  { path: '/schedule', element: <SchedulePage />, capability: Capability.VIEW_SCHEDULE },
  {
    path: '/schedule-admin',
    element: <ScheduleAdminPage />,
    capability: Capability.MANAGE_SCHEDULE,
  },
  { path: '/admin', element: <AdminPage />, capability: Capability.MANAGE_USERS },
];

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
      <Route path="/schedule/manage" element={<Navigate to="/schedule-admin" replace />} />
      <Route path="/guides" element={<Navigate to="/dashboard" replace />} />
      <Route path="/nodes" element={<Navigate to="/dashboard" replace />} />

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
