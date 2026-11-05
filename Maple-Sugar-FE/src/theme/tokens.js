import { accent, accessibleOrange, inputBorder, neutral, ritOrange, white } from './ritColors';

// The one place app colors are defined. Brand values come from ritColors.js.
// test/colorTokens.test.js fails on a raw color anywhere else in the signed-in app.

/** The same in both modes: the top bar stays dark, and the rest sits on it or on the map. */
const fixedCssTokens = {
  '--brand-orange': ritOrange,
  '--topbar-bg': '#20221e',
  '--topbar-ink': white,
  '--topbar-ink-disabled': 'rgba(255, 255, 255, 0.45)',
  '--topbar-muted': '#c3c6bc',
  '--topbar-focus': '#ffae71',
  '--badge-ink': '#fbd8bb',
  '--badge-line': '#76634d',
  '--nav-shadow': '#24241f08',
  '--scrim': 'rgba(0, 0, 0, 0.45)',
  '--marker-badge': '#1f2937',
  '--marker-badge-ink': white,
};

/** Set on :root by the theme, so CSS files and inline styles read them with var(). */
export const cssTokens = {
  light: {
    ...fixedCssTokens,
    '--on-primary': white,
    '--ink': '#24241f',
    '--muted': '#69675f',
    '--line': '#e2ddd7',
    '--handle': '#d6d4cd',
    '--orange-dark': '#a34300',
    '--hover-border': '#b04b00',
    '--surface': white,
    '--surface-page': '#f6f3f0',
    '--surface-sidebar': '#fffdf9',
    '--surface-hover': '#f2eee8',
    '--accent-soft': '#fff0e3',
    '--accent-hover': '#fff8f2',
    '--nav-ink': '#57594f',
    '--sidebar-ink': '#33392e',
    '--sidebar-muted': '#77776f',
    '--field-bg': '#eaf0e3',
    '--field-line': '#d5ddce',
    '--field-ink': '#263520',
    '--field-muted': '#506247',
    '--field-eyebrow': '#4e6341',
    '--meter-track': 'rgba(0, 0, 0, 0.12)',
    '--chart-contrast': neutral.black,
    '--chart-grid': neutral.gray427,
    '--chart-text': neutral.black,
    '--chart-tick': '#4A4A4A',
    '--chart-blue': '#007A94',
    '--chart-green': '#4D6B00',
    '--chart-purple': accent.purple,
    '--chart-red': accent.red,
    '--chart-orange': accessibleOrange,
    '--chart-gray': '#6B7378',
  },
  dark: {
    ...fixedCssTokens,
    '--on-primary': neutral.black,
    '--ink': '#f2efea',
    '--muted': '#bdb9b0',
    '--line': '#3d3f39',
    '--handle': '#5a5c55',
    '--orange-dark': '#ff9a52',
    '--hover-border': '#ff9a52',
    '--surface': '#20221e',
    '--surface-page': '#161714',
    '--surface-sidebar': '#1b1c19',
    '--surface-hover': '#2a2c27',
    '--accent-soft': '#4a2c14',
    '--accent-hover': '#2c241c',
    '--nav-ink': '#d4d0c8',
    '--sidebar-ink': '#e3dfd7',
    '--sidebar-muted': '#a5a198',
    '--field-bg': '#232b1e',
    '--field-line': '#3a4732',
    '--field-ink': '#e6efdd',
    '--field-muted': '#b7c6aa',
    '--field-eyebrow': '#a9c495',
    '--meter-track': 'rgba(255, 255, 255, 0.16)',
    '--chart-contrast': '#f2efea',
    '--chart-grid': '#3d3f39',
    '--chart-text': '#f2efea',
    '--chart-tick': '#bdb9b0',
    '--chart-blue': accent.blue,
    '--chart-green': accent.green,
    '--chart-purple': '#B39AE0',
    '--chart-red': '#F2665A',
    '--chart-orange': '#ff9a52',
    '--chart-gray': '#A2AAAD',
  },
};

const light = cssTokens.light;
const dark = cssTokens.dark;

/** MUI palette values for each mode. Surfaces and text reuse the tokens above. */
export const muiPalettes = {
  light: {
    primary: { main: accessibleOrange, dark: '#8A3900', light: ritOrange, contrastText: white },
    secondary: {
      main: neutral.black,
      dark: '#333333',
      light: '#4A4A4A',
      contrastText: white,
    },
    background: { default: light['--surface-page'], paper: light['--surface'] },
    text: { primary: neutral.black, secondary: '#4A4A4A', disabled: '#707070' },
    divider: inputBorder,
  },
  dark: {
    primary: { main: ritOrange, dark: '#C75300', light: '#FF8C3A', contrastText: neutral.black },
    success: { main: accent.green, contrastText: neutral.black },
    info: { main: accent.blue, contrastText: neutral.black },
    secondary: {
      main: '#E6E2DC',
      dark: '#CFCAC2',
      light: '#F2EFEA',
      contrastText: neutral.black,
    },
    // accent.red is too dim to read as text on the dark surfaces.
    error: { main: '#F2665A' },
    background: { default: dark['--surface-page'], paper: dark['--surface'] },
    text: { primary: dark['--ink'], secondary: dark['--muted'] },
    divider: dark['--line'],
  },
};

export const componentBorders = {
  light: { paperBorder: light['--line'], inputBorder },
  dark: { paperBorder: dark['--line'], inputBorder: dark['--handle'] },
};

/**
 * Map markers and fleet list borders. These are MUI's default status colors, not
 * the theme's RIT palette, so they differ from the status chips.
 */
export const statusColors = {
  success: '#2e7d32',
  warning: '#ed6c02',
  error: '#d32f2f',
  info: '#0288d1',
  default: '#6b7280',
};

export const meterColors = {
  batteryOk: '#2e7d32',
  batteryLow: '#c62828',
  bucket: ritOrange,
  bucketNearlyFull: '#ed6c02',
};

export const gatewayAccents = [ritOrange, '#1E6FB8', '#2E7D4F', '#7A4FB0', '#0F8B8D', '#B5483A'];
