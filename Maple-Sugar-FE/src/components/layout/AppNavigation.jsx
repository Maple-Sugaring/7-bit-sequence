import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import useMediaQuery from '@mui/material/useMediaQuery';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import GridViewRoundedIcon from '@mui/icons-material/GridViewRounded';
import SettingsRoundedIcon from '@mui/icons-material/SettingsRounded';
import NotificationsOutlinedIcon from '@mui/icons-material/NotificationsOutlined';
import { Capability, ROLE_LABELS } from '../../business/permissions';
import { useAuth } from '../../context/auth';
import { isNavItemActive, mobileNavItemsFor } from '../../routes/navigation';
import { MainNav } from './MainNav';

export function AppNavigation() {
  const { key } = useLocation();
  // A history change also dismisses the sheet, including browser back/forward.
  return <Navigation key={key} />;
}

function Navigation() {
  const location = useLocation();
  const { role, can } = useAuth();
  const [open, setOpen] = useState(false);
  const desktop = useMediaQuery('(min-width:1200px)');
  const items = mobileNavItemsFor(role);
  const secondarySelected = !items.some((item) => isNavItemActive(location.pathname, item.to));
  const close = () => setOpen(false);
  const utilityLinks = (
    <>
      {can(Capability.VIEW_ALERTS) ? (
        <Link className="page-link" to="/notifications" onClick={close} aria-current={location.pathname === '/notifications' ? 'page' : undefined}>
          <NotificationsOutlinedIcon /><span>Notifications</span>
        </Link>
      ) : null}
      <Link className="page-link" to="/profile" onClick={close} aria-current={location.pathname === '/profile' ? 'page' : undefined}>
        <SettingsRoundedIcon /><span>Profile & settings</span>
      </Link>
    </>
  );

  return (
    <>
      <aside className="app-sidebar">
        <div className="sidebar-heading">YOUR WORKSPACE <span>{ROLE_LABELS[role]}</span></div>
        <MainNav />
        <nav className="sidebar-utilities" aria-label="Account">{utilityLinks}</nav>
        <div className="sidebar-note">Rooted at RIT.<br /><strong>Connected to the woods.</strong></div>
      </aside>
      <nav className="mobile-nav" aria-label="Mobile navigation">
        {items.map(({ to, label, shortLabel, icon: Icon }) => (
          <Link key={to} to={to} aria-label={label} aria-current={isNavItemActive(location.pathname, to) ? 'page' : undefined}>
            <span className="mobile-nav-icon"><Icon /></span><span>{shortLabel || label}</span>
          </Link>
        ))}
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={open ? 'all-pages-sheet' : undefined}
          className={secondarySelected || open ? 'is-active' : ''}
        >
          <span className="mobile-nav-icon"><GridViewRoundedIcon /></span><span>All pages</span>
        </button>
      </nav>
      <Drawer
        anchor="bottom"
        open={open && !desktop}
        onClose={close}
        slotProps={{
          paper: {
            id: 'all-pages-sheet',
            role: 'dialog',
            'aria-modal': true,
            'aria-labelledby': 'all-pages-title',
            sx: {
              borderRadius: '24px 24px 0 0',
              maxHeight: '85dvh',
              p: 2,
              pb: 'max(24px, env(safe-area-inset-bottom))',
            },
          },
        }}
      >
        <div className="sheet-handle" />
        <div className="sheet-heading">
          <div><h2 id="all-pages-title">All pages</h2><p>Your sugarbush, a tap away.</p></div>
          <IconButton aria-label="Close all pages" onClick={close}><CloseRoundedIcon /></IconButton>
        </div>
        <MainNav tiles onNavigate={close} />
        <nav className="sheet-utilities" aria-label="Account">{utilityLinks}</nav>
      </Drawer>
    </>
  );
}
