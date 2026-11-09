import { apiClient, apiMode } from '../../data/apiClient';
import Container from '@mui/material/Container';
import { Outlet } from 'react-router-dom';
import { Footer } from './Footer';
import { TopBar } from './TopBar';
import { AppNavigation } from './AppNavigation';
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useColorModeInShell } from '../../theme/colorMode';
import '../../css/App.css';

export function AppShell() {
  useColorModeInShell();
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    document.getElementById('main-content')?.focus({ preventScroll: true });
  }, [pathname]);
  useEffect(() => {
    if (apiMode !== 'http') return;
    let active = true;
    let mode;
    async function checkMode() {
      try {
        const next = (await apiClient.get('/settings/data-mode')).mode;
        if (!active) return;
        if (mode && next !== mode) window.location.reload();
        mode = next;
      } catch {
        // Retry on the next poll after a connection failure.
      }
    }
    void checkMode();
    const timer = window.setInterval(checkMode, 5000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);
  return (
    <Container className="layout" disableGutters maxWidth={false}>
      <a className="skip-link" href="#main-content">Skip to content</a>
      <TopBar />
      <AppNavigation />
      <main id="main-content" className="main-content" tabIndex={-1}>
        <div className="page-container">
          <Outlet />
        </div>
      </main>
      <Footer />
    </Container>
  );
}
