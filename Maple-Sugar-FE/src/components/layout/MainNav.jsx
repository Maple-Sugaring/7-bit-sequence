import Box from '@mui/material/Box';
import BottomNavigation from '@mui/material/BottomNavigation';
import BottomNavigationAction from '@mui/material/BottomNavigationAction';
import FavoriteIcon from '@mui/icons-material/Favorite';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import RestoreIcon from '@mui/icons-material/Restore';
import { useLocation, useNavigate } from 'react-router-dom';

const NAV_ITEMS = [
  { label: 'Home', value: '/dashboard', icon: <RestoreIcon /> },
  { label: 'Schedule', value: '/schedule', icon: <FavoriteIcon /> },
  { label: 'Input', value: '/input', icon: <LocationOnIcon /> },
  { label: 'Table', value: '/table', icon: <LocationOnIcon /> },
];

export function MainNav() {
  const navigate = useNavigate();
  const location = useLocation();

  const current = NAV_ITEMS.some((item) => item.value === location.pathname)
    ? location.pathname
    : false;

  return (
    <Box>
      <BottomNavigation
        value={current}
        onChange={(_event, newValue) => navigate(newValue)}
        className="navbar"
        showLabels
      >
        {NAV_ITEMS.map((item) => (
          <BottomNavigationAction
            key={item.value}
            label={item.label}
            value={item.value}
            icon={item.icon}
            sx={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 1 }}
          />
        ))}
      </BottomNavigation>
    </Box>
  );
}
