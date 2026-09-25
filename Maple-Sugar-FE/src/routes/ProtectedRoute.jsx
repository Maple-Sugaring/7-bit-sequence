import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/auth';
import { landingRouteFor } from './navigation';

function FullPageSpinner() {
  return (
    <Box
      role="status"
      aria-live="polite"
      sx={{ minHeight: '100dvh', display: 'grid', placeItems: 'center' }}
    >
      <CircularProgress />
    </Box>
  );
}

function Forbidden() {
  const { role } = useAuth();
  const navigate = useNavigate();

  return (
    <Stack spacing={2} sx={{ alignItems: 'center', textAlign: 'center', py: 8 }}>
      <Typography variant="h3" component="h1">
        You do not have access to this page
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ maxWidth: '52ch' }}>
        Your role does not include this area. If you think that is wrong, ask an administrator to
        review your permissions.
      </Typography>
      <Button variant="contained" onClick={() => navigate(landingRouteFor(role), { replace: true })}>
        Go to my dashboard
      </Button>
    </Stack>
  );
}

/**
 * Gate for authenticated routes. `capability` comes from the same navigation
 * manifest the sidebar reads, so the two cannot drift apart.
 */
export function ProtectedRoute({ capability, children }) {
  const { isAuthenticated, restoring, can } = useAuth();
  const location = useLocation();

  if (restoring) return <FullPageSpinner />;

  if (!isAuthenticated) {
    // Remember where they were headed so sign-in can return them there.
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (capability && !can(capability)) return <Forbidden />;

  return children;
}
