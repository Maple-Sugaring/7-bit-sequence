import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { Link as RouterLink } from 'react-router-dom';
import { useAuth } from '../context/auth';
import { landingRouteFor } from '../routes/navigation';

export function NotFoundPage() {
  const { role } = useAuth();

  return (
    <Stack spacing={2} sx={{ alignItems: 'center', textAlign: 'center', py: 8 }}>
      <Typography variant="h2" component="h1">
        Page not found
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ maxWidth: '52ch' }}>
        That address does not match anything in the sap monitoring system.
      </Typography>
      <Button variant="contained" component={RouterLink} to={landingRouteFor(role)}>
        Back to my dashboard
      </Button>
    </Stack>
  );
}
