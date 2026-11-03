import { createTheme } from '@mui/material/styles';
import { accent, accessibleOrange, ritOrange, ritSansStack, white } from './ritColors';
import { componentBorders, cssTokens, muiPalettes, primaryLight } from './tokens';

const semantic = {
  error: { main: accent.red },
  warning: { main: accent.amber },
  success: { main: accent.green },
  info: { main: accent.blue },
};

function buildTheme(mode) {
  const palette = { ...semantic, ...muiPalettes[mode] };
  const borders = componentBorders[mode];
  return createTheme({
    palette: {
      mode,
      primary: {
        main: ritOrange,
        dark: accessibleOrange,
        light: primaryLight,
        contrastText: white,
      },
      ...palette,
    },
    shape: { borderRadius: 12 },
    typography: {
      fontFamily: ritSansStack,
      h1: { fontFamily: ritSansStack, fontWeight: 500, fontSize: '50px', letterSpacing: 0 },
      h2: { fontFamily: ritSansStack, fontWeight: 500, fontSize: '1.75rem' },
      h3: { fontFamily: ritSansStack, fontWeight: 700, fontSize: '1.5rem' },
      button: { fontWeight: 600, textTransform: 'none', letterSpacing: 0 },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          // On :root because dialogs and drawers render outside the app layout.
          ':root': cssTokens[mode],
          html: { WebkitFontSmoothing: 'antialiased' },
          body: { backgroundColor: palette.background.default, color: palette.text.primary },
          // Leaflet's own popup styles beat MUI's single-class rules: they add
          // paragraph margins and a different font to popup content.
          '.leaflet-popup-content p': { margin: 0 },
          '.leaflet-container': { fontFamily: 'inherit' },
        },
      },
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: {
          root: { minHeight: 44, borderRadius: 12 },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: {
            backgroundImage: 'none',
            borderRadius: 16,
            border: `1px solid ${borders.paperBorder}`,
          },
        },
      },
      MuiCard: {
        defaultProps: { elevation: 0 },
      },
      MuiDialog: {
        styleOverrides: {
          paper: { '@media (max-width:599px)': { margin: 12, maxWidth: 'calc(100% - 24px)', width: 'calc(100% - 24px)' } },
        },
      },
      MuiDialogContent: {
        styleOverrides: { root: { '@media (max-width:599px)': { padding: 16 } } },
      },
      MuiDialogActions: {
        styleOverrides: { root: { flexWrap: 'wrap', gap: 8, '& > :not(style) ~ :not(style)': { marginLeft: 0 } } },
      },
      MuiChip: {
        styleOverrides: {
          root: { maxWidth: '100%', height: 'auto', minHeight: 24 },
          label: { whiteSpace: 'normal', overflowWrap: 'anywhere', paddingTop: 3, paddingBottom: 3 },
        },
      },
      MuiPickersTextField: {
        styleOverrides: { root: { minWidth: 0, '@media (max-width:359px)': { '& .MuiPickersInputBase-root': { fontSize: 14 } } } },
      },
      MuiIconButton: {
        styleOverrides: { root: { minWidth: 44, minHeight: 44 } },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: { borderRadius: 8 },
          notchedOutline: { borderColor: borders.inputBorder },
        },
      },
      MuiBottomNavigationAction: {
        styleOverrides: {
          root: {
            flexDirection: 'row',
            gap: 8,
            minWidth: 96,
            opacity: 1,
          },
        },
      },
    },
  });
}

export const lightTheme = buildTheme('light');
export const darkTheme = buildTheme('dark');
