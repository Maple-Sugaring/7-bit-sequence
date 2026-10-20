import Container from '@mui/material/Container';
import { Outlet } from 'react-router-dom';
import { Footer } from './Footer';
import { TopBar } from './TopBar';
import { AppNavigation } from './AppNavigation';
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import '../../css/App.css';

export function AppShell() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    document.getElementById('main-content')?.focus({ preventScroll: true });
  }, [pathname]);
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
