import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/auth';
import { landingRouteFor } from '../routes/navigation';

export function AuthCallbackPage() {
  const { restoring, isAuthenticated, role } = useAuth();

  if (restoring) {
    return (
      <Box
        role="status"
        aria-live="polite"
        sx={{ minHeight: '100svh', display: 'grid', placeItems: 'center', bgcolor: '#fff' }}
      >
        <CircularProgress sx={{ color: '#000' }} />
      </Box>
    );
  }

  if (isAuthenticated) {
    return <Navigate to={landingRouteFor(role)} replace />;
  }

  return (
    <Navigate
      to="/login?error=Sign-in%20did%20not%20complete.%20Ask%20an%20administrator%20for%20an%20invite%20if%20this%20keeps%20happening."
      replace
    />
  );
}
