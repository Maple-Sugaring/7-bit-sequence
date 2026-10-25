import { useEffect, useRef } from 'react';
import Badge from '@mui/material/Badge';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import tigerLogo from '../../assets/RITTigerTransparent.png';
import NotificationsIcon from '@mui/icons-material/Notifications';
import Tooltip from '@mui/material/Tooltip';
import ExploreOutlinedIcon from '@mui/icons-material/ExploreOutlined';
import { Capability } from '../../business/permissions';
import { useAuth } from '../../context/auth';
import { useOpenAlertCount } from '../../services/hooks';
import { useTour } from '../tour/tour';
import { apiMode } from '../../data/apiClient';
import { landingRouteFor } from '../../routes/navigation';
import { Link, useNavigate } from 'react-router-dom';


export function TopBar() {
  const navigate = useNavigate();
  const { role, can } = useAuth();
  const tour = useTour();
  const canViewAlerts = can(Capability.VIEW_ALERTS);
  const alerts = useOpenAlertCount(canViewAlerts);
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
      className="app-topbar"
      sx={{
        display: "flex",
        alignItems: "center",
        gap: { xs: 0, sm: 1 },
        px: { xs: 1, sm: 2, md: 3 },
        '& > .MuiIconButton-root': { width: 40, height: 44, flexShrink: 0 },
        color: "#fff",
      }}
    >
      <Link className="app-brand" to={landingRouteFor(role)}>
        <img className="brand-tiger" src={tigerLogo} alt="RIT tiger mascot" width="40" height="40" />
        <span className="brand-copy">Maple Sugaring<span className="brand-caption">RIT · FIELD WORKSPACE</span></span>
      </Link>
      {apiMode === 'mock' ? <span className="demo-badge">Demo</span> : null}
      <Tooltip title="Take the tour">
        <IconButton aria-label="Take the tour" onClick={tour.start} disabled={tour.active} sx={{ color: '#fff', '&.Mui-disabled': { color: 'rgba(255, 255, 255, 0.45)' } }}>
          <ExploreOutlinedIcon />
        </IconButton>
      </Tooltip>
      {canViewAlerts ? (
        <IconButton aria-label={`Notifications${openCount ? `, ${openCount} open` : ''}`} onClick={() => navigate('/notifications')} sx={{ color: '#fff' }}>
          <Badge badgeContent={openCount} color="error" invisible={openCount === 0} sx={{ '& .MuiBadge-badge': { minWidth: 28, px: 0.75, right: 3, letterSpacing: '0.04em', fontVariantNumeric: 'tabular-nums' } }}>
            <NotificationsIcon />
          </Badge>
        </IconButton>
      ) : null}
    </Box>
  );
}
