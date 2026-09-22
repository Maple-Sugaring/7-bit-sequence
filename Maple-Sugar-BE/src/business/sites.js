/**
 * The three stands on the RIT campus. Coordinates are the buildings themselves,
 * not a developer's machine.
 */
export const CAMPUS_SITES = [
  { name: 'Alumni House', latitude: 43.084, longitude: -77.6738, offsetF: 0.4 },
  { name: 'Chabad House', latitude: 43.0849, longitude: -77.6802, offsetF: 0 },
  { name: 'Red Barn', latitude: 43.0897, longitude: -77.6688, offsetF: -0.8 },
];

export const SITE_NAMES = CAMPUS_SITES.map((site) => site.name);

export function offsetForStand(stand) {
  return CAMPUS_SITES.find((site) => site.name === stand)?.offsetF ?? 0;
}
