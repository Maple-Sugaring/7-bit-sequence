import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import NotificationsIcon from '@mui/icons-material/Notifications';
import { useNavigate } from 'react-router-dom';
import { MainNav } from './MainNav';

export function TopBar() {
  const navigate = useNavigate();

  return (
    <Box
      component="header"
      sx={{
        display: 'grid',
        gridTemplateColumns: 'auto 1fr auto',
        alignItems: 'center',
        gap: 1,
        px: { xs: 1.5, md: 3 },
        py: 1,
        bgcolor: '#000',
        color: '#fff',
        borderBottom: '4px solid #F76902',
      }}
    >
      <Typography
        component="button"
        onClick={() => navigate('/dashboard')}
        sx={{
          border: 0,
          bgcolor: 'transparent',
          color: '#fff',
          font: 'inherit',
          fontWeight: 650,
          fontSize: 18,
          letterSpacing: '-0.02em',
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        Maple Sugaring
      </Typography>
      <MainNav />
      <IconButton aria-label="Notifications" onClick={() => navigate('/notifications')} sx={{ color: '#fff' }}>
        <NotificationsIcon />
      </IconButton>
    </Box>
  );
}
