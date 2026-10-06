/** "43.08400, -77.68000", or a prompt when nothing is placed. */
export function formatPoint(point) {
  return point ? `${point.lat.toFixed(5)}, ${point.lon.toFixed(5)}` : 'Not placed yet';
}
