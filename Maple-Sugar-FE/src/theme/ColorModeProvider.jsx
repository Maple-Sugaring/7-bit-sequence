import { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider } from '@mui/material/styles';
import { ColorModeContext } from './colorMode';
import { darkTheme, lightTheme } from './ritTheme';

const STORAGE_KEY = 'maple-color-mode';

function readSavedMode() {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

function saveMode(mode) {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // Storage can be blocked; the choice still lasts until the page reloads.
  }
}

export function ColorModeProvider({ children }) {
  const [mode, setMode] = useState(readSavedMode);
  const [shellMounted, setShellMounted] = useState(false);
  const activeMode = shellMounted ? mode : 'light';

  // App.css reads this attribute. It also has to reach dialogs and drawers,
  // which render outside the app layout, so it goes on <html>.
  useLayoutEffect(() => {
    document.documentElement.dataset.colorMode = activeMode;
  }, [activeMode]);

  const toggleMode = useCallback(() => {
    setMode((current) => {
      const next = current === 'dark' ? 'light' : 'dark';
      saveMode(next);
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({ mode: activeMode, toggleMode, setShellMounted }),
    [activeMode, toggleMode],
  );

  return (
    <ColorModeContext.Provider value={value}>
      <ThemeProvider theme={activeMode === 'dark' ? darkTheme : lightTheme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </ColorModeContext.Provider>
  );
}
