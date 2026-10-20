import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import MapIcon from '@mui/icons-material/Map';
import DashboardRoundedIcon from '@mui/icons-material/DashboardRounded';
import ParkIcon from '@mui/icons-material/Park';
import SettingsInputAntennaIcon from '@mui/icons-material/SettingsInputAntenna';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import RateReviewIcon from '@mui/icons-material/RateReview';
import { matchPath } from 'react-router-dom';
import { canAny, Capability } from '../business/permissions';
import { apiMode } from '../data/apiClient';

export const NAV_ITEMS = [
  {
    to: '/dashboard',
    label: 'The Bush',
    icon: DashboardRoundedIcon,
    shortLabel: 'Home',
    description: 'Weather, buckets & tree health',
    capability: Capability.VIEW_DASHBOARD,
  },
  {
    to: '/map',
    label: 'Map',
    description: 'Find your trees in the field',
    icon: MapIcon,
    capability: [Capability.VIEW_DASHBOARD, Capability.VIEW_NODES],
  },
  {
    to: '/deploy',
    label: 'Deploy',
    description: 'Set up gateways & sensor nodes',
    icon: SettingsInputAntennaIcon,
    capability: Capability.DEPLOY_NODES,
  },
  {
    to: '/schedule',
    label: 'Schedule',
    description: 'Plan your next collection shift',
    icon: CalendarMonthIcon,
    capability: Capability.VIEW_SCHEDULE,
  },
  {
    to: '/collection',
    label: 'Collection',
    shortLabel: 'Collect',
    description: 'Record sap & collection rounds',
    icon: MenuBookIcon,
    capability: Capability.RECORD_DATA,
  },
  {
    to: '/table',
    label: 'Sugar Woods',
    shortLabel: 'Data',
    description: 'Explore readings & export data',
    icon: ParkIcon,
    capability: Capability.VIEW_DATA_TABLE,
  },
  {
    to: '/admin',
    label: 'Admin',
    description: 'Manage your team & access',
    icon: AdminPanelSettingsIcon,
    capability: Capability.MANAGE_USERS,
  },
  ...(apiMode === 'mock' ? [{ to: '/feedback', label: 'Provide feedback', icon: RateReviewIcon }] : []),
];

export function navItemsFor(role) {
  // `capability` is one capability or a list of which any one is enough.
  return NAV_ITEMS.filter((item) => item.capability == null || canAny(role, [item.capability].flat()));
}

// Roles without collection or shifts get their next available field tools.
export function mobileNavItemsFor(role) {
  const items = navItemsFor(role);
  const order = ['/dashboard', '/map', '/collection', '/schedule', '/table', '/deploy'];
  return order.map((to) => items.find((item) => item.to === to)).filter(Boolean).slice(0, 4);
}

export function isNavItemActive(pathname, to) {
  return pathname === to || pathname.startsWith(`${to}/`) || (to === '/dashboard' && pathname.startsWith('/nodes/'));
}

export function landingRouteFor(role) {
  return navItemsFor(role)[0]?.to ?? '/dashboard';
}

/**
 * Capability gate for every signed-in route. The router and the post-login
 * redirect both read this, so a remembered page is only reopened for a role
 * the router would let in.
 */
export const ROUTE_CAPABILITIES = {
  '/dashboard': Capability.VIEW_DASHBOARD,
  '/map': [Capability.VIEW_DASHBOARD, Capability.VIEW_NODES],
  '/deploy': Capability.DEPLOY_NODES,
  '/table': Capability.VIEW_DATA_TABLE,
  '/collection': Capability.RECORD_DATA,
  '/nodes/:nodeId': Capability.VIEW_DASHBOARD,
  '/notifications': Capability.VIEW_ALERTS,
  '/schedule': Capability.VIEW_SCHEDULE,
  '/admin': Capability.MANAGE_USERS,
  // Every signed-in role has a profile, so there is no capability gate.
  '/profile': null,
  ...(apiMode === 'mock' ? { '/feedback': null } : {}),
};

export function canVisit(role, pathname) {
  const path = Object.keys(ROUTE_CAPABILITIES).find((pattern) => matchPath(pattern, pathname));
  if (!path) return false;
  const capability = ROUTE_CAPABILITIES[path];
  return capability == null || canAny(role, [capability].flat());
}
