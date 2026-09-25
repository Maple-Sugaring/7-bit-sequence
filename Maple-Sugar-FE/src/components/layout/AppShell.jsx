import Container from '@mui/material/Container';
import { Outlet } from 'react-router-dom';
import { Footer } from './Footer';
import { TopBar } from './TopBar';
import '../../css/App.css';

export function AppShell() {
  return (
    <Container className="layout" disableGutters maxWidth={false}>
      <TopBar />
      <main className="main-content">
        <Outlet />
      </main>
      <Footer />
    </Container>
  );
}
