// Shared by the map markers and every status chip, and kept free of Leaflet so
// pages that only show a chip do not pull the map library in.

// Hex values matching the MUI palette keys in STATUS_META, for use inside SVG.
export const STATUS_HEX = {
  success: '#2e7d32',
  warning: '#ed6c02',
  error: '#d32f2f',
  info: '#0288d1',
  default: '#6b7280',
};

// Shape carries the status as well as colour, so it reads without colour vision.
export function shapeSvg(shape, hex) {
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


// The same shapes for a filled chip: drawn in the chip's own text colour, since
// a glyph in the status colour would vanish against a chip filled with it.
export function chipShapeSvg(shape) {
  const stroke = 'stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" fill="none"';
  switch (shape) {
    case 'ring':
      return `<circle cx="14" cy="14" r="9" ${stroke}/>`;
    case 'triangle':
      return `<path d="M14 4 L25 23 H3 Z" ${stroke}/><path d="M14 11 V16 M14 19.5 V20" ${stroke}/>`;
    case 'square':
      return '<rect x="5" y="5" width="18" height="18" rx="3" fill="currentColor"/>';
    case 'slash':
      return `<circle cx="14" cy="14" r="9" ${stroke}/><path d="M8 20 L20 8" ${stroke}/>`;
    default:
      return '<circle cx="14" cy="14" r="9" fill="currentColor"/>';
  }
}
