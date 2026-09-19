import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import GoogleIcon from '@mui/icons-material/Google';
import { Navigate, useLocation, useSearchParams } from 'react-router-dom';
import mapleLogo from '../assets/MapleLogo.png';
import { useAuth } from '../context/auth';
import { landingRouteFor } from '../routes/navigation';
import '../css/App.css';
import '../css/login.css';

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '/api').replace(/\/$/, '');
const GOOGLE_START = `${API_BASE}/auth/google`;

export function LoginPage() {
  const { isAuthenticated, restoring, role } = useAuth();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const banner = searchParams.get('error');

  if (!restoring && isAuthenticated) {
    return <Navigate to={location.state?.from ?? landingRouteFor(role)} replace />;
  }

  return (
    <div id="login-content">
      <img id="login-img" src={mapleLogo} alt="RIT Maple Leaf" />
      <h1>Login</h1>
      <Paper id="login-paper">
        {banner ? (
          <Alert severity="error" sx={{ mb: 2 }}>
            {banner}
          </Alert>
        ) : null}
        <Button
          variant="contained"
          size="large"
          href={GOOGLE_START}
          startIcon={<GoogleIcon />}
          sx={{ bgcolor: '#000', color: '#fff', '&:hover': { bgcolor: '#333' } }}
        >
          Sign in with Google
        </Button>
      </Paper>
    </div>
  );
}
