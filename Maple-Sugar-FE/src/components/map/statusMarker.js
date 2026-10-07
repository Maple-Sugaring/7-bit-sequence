import L from 'leaflet';
import { STATUS_META } from '../../business/nodeMapStatus';

// Hex values matching the MUI palette keys in STATUS_META, for use inside SVG.
export const STATUS_HEX = {
  success: '#2e7d32',
  warning: '#ed6c02',
  error: '#d32f2f',
  info: '#0288d1',
  neutral: '#6b7280',
};

const SIZE = 28;

// Shape carries the status as well as colour, so it reads without colour vision.
function shapeSvg(shape, hex) {
  const common = `stroke="#fff" stroke-width="2"`;
  switch (shape) {
    case 'ring':
      return `<circle cx="14" cy="14" r="9" fill="#fff" stroke="${hex}" stroke-width="4"/>`;
    case 'triangle':
      return `<path d="M14 3 L26 24 H2 Z" fill="${hex}" ${common} stroke-linejoin="round"/><path d="M14 11 V17 M14 20 V21" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/>`;
    case 'square':
      return `<rect x="4" y="4" width="20" height="20" rx="3" fill="${hex}" ${common}/>`;
    case 'slash':
      return `<circle cx="14" cy="14" r="10" fill="#fff" stroke="${hex}" stroke-width="3"/><path d="M7 21 L21 7" stroke="${hex}" stroke-width="3"/>`;
    default:
      return `<circle cx="14" cy="14" r="10" fill="${hex}" ${common}/>`;
  }
}

export function statusIcon(status, count = 1, selected = false) {
  const meta = STATUS_META[status];
  const hex = STATUS_HEX[meta.color];
  const badge =
    count > 1
      ? `<span style="position:absolute;top:-6px;right:-8px;min-width:16px;height:16px;border-radius:8px;background:#1f2937;color:#fff;font:700 11px/16px sans-serif;text-align:center;padding:0 3px">${count}</span>`
      : '';
  const ring = selected ? 'filter:drop-shadow(0 0 4px #F76902);' : '';
  return L.divIcon({
    className: 'fleet-status-marker',
    html: `<div style="position:relative;width:${SIZE}px;height:${SIZE}px;${ring}"><svg viewBox="0 0 28 28" width="${SIZE}" height="${SIZE}" aria-hidden="true">${shapeSvg(meta.shape, hex)}</svg>${badge}</div>`,
    iconSize: [SIZE, SIZE],
    iconAnchor: [SIZE / 2, SIZE / 2],
    popupAnchor: [0, -SIZE / 2],
  });
}
