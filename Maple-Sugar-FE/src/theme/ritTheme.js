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
    background: { default: white, paper: white },
    text: { primary: neutral.black, secondary: '#4A4A4A' },
    divider: inputBorder,
  },
  shape: { borderRadius: 8 },
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
        body: { backgroundColor: white, color: neutral.black },
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: { minHeight: 44, borderRadius: 8 },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          borderRadius: 10,
        },
      },
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
