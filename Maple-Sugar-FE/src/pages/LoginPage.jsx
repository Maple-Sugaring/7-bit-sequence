import Box from '@mui/material/Box';
import Link from '@mui/material/Link';
import { Link as RouterLink } from 'react-router-dom';
import { LandingPage } from './LandingPage';

export function LoginPage() {
  return (
    <>
      <LandingPage />
      <Box component="footer" sx={{ py: 2, textAlign: 'center' }}>
        <Link component={RouterLink} to="/privacy" sx={{ color: '#4A4A4A' }}>
          Privacy policy
        </Link>
      </Box>
    </>
  );
}