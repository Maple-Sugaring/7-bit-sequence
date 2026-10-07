import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import MapIcon from '@mui/icons-material/Map';
import RestoreIcon from '@mui/icons-material/Restore';
import ParkIcon from '@mui/icons-material/Park';
import SettingsInputAntennaIcon from '@mui/icons-material/SettingsInputAntenna';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import { matchPath } from 'react-router-dom';
import { canAny, Capability } from '../business/permissions';

export const NAV_ITEMS = [
  {
    to: '/dashboard',
    label: 'The Bush',
    icon: RestoreIcon,
    capability: Capability.VIEW_DASHBOARD,
  },
  {
    to: '/map',
    label: 'Map',
    icon: MapIcon,
    capability: [Capability.VIEW_DASHBOARD, Capability.VIEW_NODES],
  },
  {
    to: '/deploy',
    label: 'Deploy',
    icon: SettingsInputAntennaIcon,
    capability: Capability.DEPLOY_NODES,
  },
  {
    to: '/schedule',
    label: 'Schedule',
    icon: CalendarMonthIcon,
    capability: Capability.VIEW_SCHEDULE,
  },
  {
    to: '/collection',
    label: 'Collection',
    icon: MenuBookIcon,
    capability: Capability.RECORD_DATA,
  },
  {
    to: '/table',
    label: 'Sugar Woods',
    icon: ParkIcon,
    capability: Capability.VIEW_DATA_TABLE,
  },
  {
    to: '/admin',
    label: 'Admin',
    icon: AdminPanelSettingsIcon,
    capability: Capability.MANAGE_USERS,
  },
];

export function navItemsFor(role) {
  // `capability` is one capability or a list of which any one is enough.
  return NAV_ITEMS.filter((item) => canAny(role, [item.capability].flat()));
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
};

export function canVisit(role, pathname) {
  const path = Object.keys(ROUTE_CAPABILITIES).find((pattern) => matchPath(pattern, pathname));
  if (!path) return false;
  const capability = ROUTE_CAPABILITIES[path];
  return capability == null || canAny(role, [capability].flat());
}
