import L from 'leaflet';
import { STATUS_META } from '../../business/nodeMapStatus';
import { shapeSvg, STATUS_HEX } from '../common/statusGlyph';

const SIZE = 28;

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
