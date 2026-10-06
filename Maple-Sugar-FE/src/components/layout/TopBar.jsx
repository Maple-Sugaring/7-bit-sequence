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
import { useAuth } from '../../context/auth';
import { useOpenAlertCount } from '../../services/hooks';
import { MainNav } from './MainNav';
import { useLocation, useNavigate } from "react-router-dom";
import { can, Capability } from "../business/permissions";


export function TopBar() {
  const navigate = useNavigate();
  const { user } = useAuth();
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

  return (
    <Box
      component="header"
      sx={{
        display: "grid",
        gridTemplateColumns: "auto 1fr auto",
        alignItems: "center",
        display: 'grid',
        gridTemplateColumns: 'auto 1fr auto auto',
        alignItems: 'center',
        gap: 1,
        px: { xs: 1.5, md: 3 },
        py: 1,
        bgcolor: "#000",
        color: "#fff",
        borderBottom: "4px solid #F76902",
      }}
    >
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
      <MainNav />
      {canViewAlerts ? (
        <IconButton
          aria-label="Notifications"
          aria-current={onAlerts ? "page" : undefined}
          onClick={() => navigate("/notifications")}
          sx={{
            color: "#fff",
            bgcolor: onAlerts ? "#F76902" : "transparent",
            "&hover": {
              bgcolor: onAlerts ? "#C75300" : "rgba(255,255,255,0.08",
            },
          }}
        >
          <NotificationsIcon />
        </IconButton>
      ) : (
        <Box />
      )}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        {compact ? (
          <IconButton aria-label="Open menu" onClick={() => setMenuOpen(true)} sx={{ color: '#fff' }}>
            <MenuIcon />
          </IconButton>
        ) : null}
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
      </Box>
      {compact ? null : <MainNav />}
      {compact ? <Box /> : null}
      <IconButton aria-label={`Notifications${openCount ? `, ${openCount} open` : ''}`} onClick={() => navigate('/notifications')} sx={{ color: '#fff' }}>
        <Badge badgeContent={openCount} color="error" invisible={openCount === 0}>
          <NotificationsIcon />
        </Badge>
      </IconButton>
      <Tooltip title={user?.fullName ? `${user.fullName} · Profile` : 'Profile'}>
        <IconButton aria-label="Your profile" onClick={() => navigate('/profile')} sx={{ color: '#fff' }}>
          <AccountCircleIcon />
        </IconButton>
      </Tooltip>
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
