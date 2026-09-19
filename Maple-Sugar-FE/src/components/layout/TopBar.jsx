import IconButton from '@mui/material/IconButton';
import NotificationsIcon from '@mui/icons-material/Notifications';
import { useNavigate } from 'react-router-dom';
import { MainNav } from './MainNav';
import '../../css/header.css';

export function TopBar() {
  const navigate = useNavigate();

  return (
    <header className="header">
      <div className="webTitle">
        <h1>Maple Sugaring</h1>
        <IconButton
          className="bell"
          aria-label="Notifications"
          onClick={() => navigate('/notifications')}
          sx={{ color: 'white' }}
        >
          <NotificationsIcon sx={{ fontSize: 40 }} />
        </IconButton>
      </div>
      <MainNav />
    </header>
  );
}
