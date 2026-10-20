import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/auth';
import { isNavItemActive, navItemsFor } from '../../routes/navigation';

export function MainNav({ onNavigate, tiles = false }) {
  const { pathname } = useLocation();
  const { role } = useAuth();

  return (
    <nav aria-label={tiles ? 'All pages' : 'Primary'} className={tiles ? 'page-tiles' : 'sidebar-links'}>
      {navItemsFor(role).map(({ to, label, description, icon: Icon }) => (
        <Link key={to} to={to} onClick={onNavigate} className="page-link" aria-current={isNavItemActive(pathname, to) ? 'page' : undefined}>
          <span className="nav-icon"><Icon /></span>
          <span><span className="nav-label">{label}</span>{tiles && description ? <span className="nav-description">{description}</span> : null}</span>
        </Link>
      ))}
    </nav>
  );
}
