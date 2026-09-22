import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import EditCalendarIcon from '@mui/icons-material/EditCalendar';
import NotificationsIcon from '@mui/icons-material/Notifications';
import RestoreIcon from '@mui/icons-material/Restore';
import ParkIcon from '@mui/icons-material/Park';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import { can, Capability } from '../business/permissions';

export const NAV_ITEMS = [
  {
    to: '/dashboard',
    label: 'The Bush',
    icon: RestoreIcon,
    capability: Capability.VIEW_DASHBOARD,
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
    to: '/notifications',
    label: 'Notifications',
    icon: NotificationsIcon,
    capability: Capability.VIEW_ALERTS,
  },
  {
    to: '/schedule-admin',
    label: 'Schedule Admin',
    icon: EditCalendarIcon,
    capability: Capability.MANAGE_SCHEDULE,
  },
  {
    to: '/admin',
    label: 'Admin',
    icon: AdminPanelSettingsIcon,
    capability: Capability.MANAGE_USERS,
  },
];

export function navItemsFor(role) {
  return NAV_ITEMS.filter((item) => can(role, item.capability));
}

export function landingRouteFor(role) {
  return navItemsFor(role)[0]?.to ?? '/dashboard';
}
