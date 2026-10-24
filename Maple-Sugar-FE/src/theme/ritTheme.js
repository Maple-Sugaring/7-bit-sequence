import { createTheme } from '@mui/material/styles';
import {
  accent,
  accessibleOrange,
  inputBorder,
  neutral,
  ritOrange,
  ritSansStack,
  white,
} from './ritColors';

const semantic = {
  error: { main: accent.red },
  warning: { main: accent.amber },
  success: { main: accent.green },
  info: { main: accent.blue },
};

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: ritOrange,
      dark: accessibleOrange,
      light: '#FF8C3A',
      contrastText: white,
    },
    secondary: {
      main: neutral.black,
      dark: '#333333',
      light: '#4A4A4A',
      contrastText: white,
    },
    ...semantic,
    background: { default: '#F6F3F0', paper: white },
    text: { primary: neutral.black, secondary: '#4A4A4A' },
    divider: inputBorder,
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
        html: { WebkitFontSmoothing: 'antialiased' },
        body: { backgroundColor: '#F6F3F0', color: neutral.black },
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
          border: '1px solid #E2DDD7',
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
        notchedOutline: { borderColor: inputBorder },
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

export default theme;
