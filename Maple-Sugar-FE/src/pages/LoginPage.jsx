import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import GoogleIcon from '@mui/icons-material/Google';
import { Navigate, useLocation, useSearchParams } from 'react-router-dom';
import mapleLogo from '../assets/MapleLogo.png';
import ritLogo from '../assets/RITLogo.png';
import { useAuth } from '../context/auth';
import { landingRouteFor } from '../routes/navigation';

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
    <Box
      sx={{
        minHeight: '100svh',
        display: 'flex',
        flexDirection: 'column',
        bgcolor: '#F6F3F0',
      }}
    >
      <Box
        component="header"
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: { xs: 2, md: 4 },
          py: 1.5,
          bgcolor: '#000',
          color: '#fff',
          borderBottom: '4px solid #F76902',
        }}
      >
        <Typography sx={{ fontWeight: 650, letterSpacing: '-0.02em', fontSize: 18 }}>
          Maple Sugaring
        </Typography>
        <Box component="img" src={ritLogo} alt="Rochester Institute of Technology" sx={{ height: 28 }} />
      </Box>

      <Box
        sx={{
          flex: 1,
          display: 'grid',
          placeItems: 'center',
          px: 2,
          py: { xs: 4, md: 8 },
        }}
      >
        <Box
          sx={{
            width: '100%',
            maxWidth: 460,
            bgcolor: '#fff',
            border: '1px solid #D0D3D4',
            borderRadius: 3,
            overflow: 'hidden',
            boxShadow: '0 18px 50px rgba(0,0,0,0.08)',
          }}
        >
          <Box sx={{ px: 4, pt: 5, pb: 3, textAlign: 'center' }}>
            <Box
              component="img"
              src={mapleLogo}
              alt=""
              sx={{ width: 88, height: 'auto', mb: 2, filter: 'drop-shadow(0 8px 0 #F76902)' }}
            />
            <Typography variant="h1" sx={{ fontSize: { xs: 36, sm: 44 }, fontWeight: 500, lineHeight: 1.05 }}>
              The sugarbush
            </Typography>
            <Typography sx={{ mt: 1.5, color: '#4A4A4A' }}>
              Alumni House, Chabad House, and the Red Barn.
            </Typography>
          </Box>

          <Stack spacing={2.5} sx={{ px: 4, pb: 4 }}>
            {restoring ? (
              <Box sx={{ display: 'grid', placeItems: 'center', py: 2 }}>
                <CircularProgress size={28} sx={{ color: '#000' }} />
              </Box>
            ) : (
              <>
                {banner ? <Alert severity="error">{banner}</Alert> : null}
                <Typography sx={{ color: '#4A4A4A', textAlign: 'center' }}>
                  Sign in with your RIT Google account to see the taps, the weather, and your shifts.
                </Typography>
                <Button
                  variant="contained"
                  size="large"
                  href={GOOGLE_START}
                  startIcon={<GoogleIcon />}
                  fullWidth
                  sx={{ py: 1.4, fontSize: 16 }}
                >
                  Sign in with Google
                </Button>
              </>
            )}
          </Stack>
        </Box>
      </Box>
    </Box>
  );
}
