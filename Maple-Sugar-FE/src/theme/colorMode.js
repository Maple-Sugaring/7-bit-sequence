import { createContext, useContext, useLayoutEffect } from 'react';

/**
 * Kept apart from the provider component, as with `useAuth`, so fast refresh
 * sees a components-only module. The default lets a component render outside
 * the provider, always in light mode.
 */
export const ColorModeContext = createContext({
  mode: 'light',
  toggleMode: () => {},
  setShellMounted: () => {},
});

export function useColorMode() {
  return useContext(ColorModeContext);
}

/**
 * The public pages are designed for light backgrounds only, so the saved mode
 * applies only while the signed-in app shell is on screen.
 */
export function useColorModeInShell() {
  const { setShellMounted } = useColorMode();
  useLayoutEffect(() => {
    setShellMounted(true);
    return () => setShellMounted(false);
  }, [setShellMounted]);
}
