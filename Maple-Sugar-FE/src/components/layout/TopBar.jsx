import { useEffect, useRef, useState } from 'react';
import Badge from '@mui/material/Badge';
import Box from '@mui/material/Box';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import MenuIcon from '@mui/icons-material/Menu';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import NotificationsIcon from '@mui/icons-material/Notifications';
import Tooltip from '@mui/material/Tooltip';
import Divider from '@mui/material/Divider';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import EventIcon from '@mui/icons-material/Event';
import LogoutIcon from '@mui/icons-material/Logout';
import SettingsIcon from '@mui/icons-material/Settings';
import { Capability } from '../../business/permissions';
import { useAuth } from '../../context/auth';
import { useOpenAlertCount } from '../../services/hooks';
import { MainNav } from './MainNav';
import { useNavigate } from "react-router-dom";


export function TopBar() {
  const navigate = useNavigate();
  const { user, can, signOut } = useAuth();
  const [profileAnchor, setProfileAnchor] = useState(null);
  const compact = useMediaQuery('(max-width:900px)');
  const [menuOpen, setMenuOpen] = useState(false);
  const alerts = useOpenAlertCount();
  const openCount = Number(alerts.data) || 0;
  const previousCount = useRef(null);

  useEffect(() => {
    if (previousCount.current == null) {
      previousCount.current = openCount;
      return;
    }
    const increased = openCount > previousCount.current;
    previousCount.current = openCount;
    if (!increased) return;
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    const notice = new Notification('Maple Sugaring', {
      body: openCount === 1 ? '1 open alert needs attention.' : `${openCount} open alerts need attention.`,
    });
    notice.onclick = () => navigate('/notifications');
  }, [navigate, openCount]);

  const profileItems = [
    { to: '/profile', label: 'Profile & settings', Icon: SettingsIcon },
    ...(can(Capability.VIEW_SCHEDULE) ? [{ to: '/schedule?show=mine', label: 'My upcoming shifts', Icon: EventIcon }] : []),
    { to: '/notifications', label: 'Notifications', Icon: NotificationsIcon },
  ];

  const goTo = (to) => {
    setProfileAnchor(null);
    navigate(to);
  };

  const handleSignOut = async () => {
    setProfileAnchor(null);
    await signOut();
    navigate('/login', { replace: true });
  };

  return (
    <Box
      component="header"
      sx={{
        display: "grid",
        gridTemplateColumns: compact ? "1fr auto auto" : "auto 1fr auto auto",
        alignItems: "center",
        gap: 1,
        px: { xs: 1.5, md: 3 },
        py: 1,
        bgcolor: "#000",
        color: "#fff",
        borderBottom: "4px solid #F76902",
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
      {compact ? (
        <IconButton aria-label="Open menu" onClick={() => setMenuOpen(true)} sx={{ color: '#fff' }}>
          <MenuIcon />
        </IconButton>
      ) : null}
      <Typography
        component="button"
        onClick={() => navigate("/dashboard")}
        sx={{
          border: 0,
          bgcolor: "transparent",
          color: "#fff",
          font: "inherit",
          fontWeight: 650,
          fontSize: 18,
          letterSpacing: "-0.02em",
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        Maple Sugaring
      </Typography>
      </Box>
      {compact ? null : <MainNav />}
      <IconButton aria-label={`Notifications${openCount ? `, ${openCount} open` : ''}`} onClick={() => navigate('/notifications')} sx={{ color: '#fff' }}>
        <Badge badgeContent={openCount} color="error" invisible={openCount === 0}>
          <NotificationsIcon />
        </Badge>
      </IconButton>
      <Tooltip title={user?.fullName ? `${user.fullName} · Profile` : 'Profile'}>
        <IconButton aria-label="Your profile" aria-haspopup="menu" aria-expanded={profileAnchor ? 'true' : undefined} onClick={(event) => setProfileAnchor(event.currentTarget)} sx={{ color: '#fff' }}>
          <AccountCircleIcon />
        </IconButton>
      </Tooltip>
      <Menu
        anchorEl={profileAnchor}
        open={Boolean(profileAnchor)}
        onClose={() => setProfileAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { minWidth: 220, mt: 0.5 } } }}
      >
        <Box sx={{ px: 2, py: 1 }}>
          <Typography sx={{ fontWeight: 600 }}>{user?.fullName || 'Your account'}</Typography>
          {user?.email ? (
            <Typography variant="caption" color="text.secondary">
              {user.email}
            </Typography>
          ) : null}
        </Box>
        <Divider />
        {profileItems.map(({ to, label, Icon }) => (
          <MenuItem key={to} onClick={() => goTo(to)}>
            <ListItemIcon>
              <Icon fontSize="small" />
            </ListItemIcon>
            <ListItemText>{label}</ListItemText>
          </MenuItem>
        ))}
        <Divider />
        <MenuItem onClick={handleSignOut}>
          <ListItemIcon>
            <LogoutIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Log out</ListItemText>
        </MenuItem>
      </Menu>
      <Drawer
        anchor="left"
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        slotProps={{ paper: { sx: { bgcolor: '#000', width: 280, pt: 2 } } }}
      >
        <MainNav direction="column" onNavigate={() => setMenuOpen(false)} />
      </Drawer>
    </Box>
  );
}
