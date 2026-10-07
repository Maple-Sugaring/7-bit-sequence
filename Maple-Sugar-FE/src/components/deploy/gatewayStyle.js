import RouterIcon from '@mui/icons-material/Router';

// Every gateway wears the same icon; only the accent color tells them apart.
// Each gateway keeps one color for good, chosen from its id, so cards do not
// shuffle when the list reorders.
export const GatewayIcon = RouterIcon;

const ACCENTS = ['#F76902', '#1E6FB8', '#2E7D4F', '#7A4FB0', '#0F8B8D', '#B5483A'];

export function gatewayLook(gatewayId) {
  const index = Math.abs(Number(gatewayId) || 0) % ACCENTS.length;
  return { accent: ACCENTS[index], icon: GatewayIcon };
}

/** "12 s ago", "3 min 12 s ago", "2 h 5 min ago", "3 d ago", or "No posts yet". */
export function sincePostText(lastSeen, now = Date.now()) {
  const time = lastSeen ? new Date(lastSeen).getTime() : NaN;
  if (!Number.isFinite(time)) return 'No posts yet';

  const seconds = Math.max(0, Math.floor((now - time) / 1000));
  if (seconds < 60) return `${seconds} s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ${seconds % 60} s ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ${minutes % 60} min ago`;
  return `${Math.floor(hours / 24)} d ${hours % 24} h ago`;
}
