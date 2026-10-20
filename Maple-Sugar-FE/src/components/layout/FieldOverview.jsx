import { Link } from 'react-router-dom';
import ForestRoundedIcon from '@mui/icons-material/ForestRounded';
import { useAuth } from '../../context/auth';
import { navItemsFor } from '../../routes/navigation';
import { isFull } from '../../business/yieldMetrics';
import { MapStatus } from '../../business/nodeMapStatus';

const ACTIONS = {
  '/collection': ['Start collecting', 'Record a round'],
  '/map': ['Explore the map', 'Find a tree'],
  '/schedule': ['Your schedule', 'Plan a shift'],
  '/table': ['Sugar Woods', 'Readings & trends'],
  '/deploy': ['Deploy nodes', 'Manage hardware'],
};

export function FieldOverview({ fleet }) {
  const { role } = useAuth();
  const allowed = navItemsFor(role);
  const actions = Object.keys(ACTIONS).map((to) => allowed.find((item) => item.to === to)).filter(Boolean).slice(0, 4);
  const full = fleet.nodes.filter((node) => isFull(node.Weight, node.Tare_Weight ?? 0)).length;
  const offline = fleet.nodes.filter((node) => node.mapStatus === MapStatus.OFFLINE).length;
  const unavailable = fleet.loading || (fleet.error && fleet.nodes.length === 0);
  return (
    <section className="dashboard-overview" aria-label="Field overview">
      <div className="field-summary">
        <div className="field-eyebrow"><ForestRoundedIcon fontSize="small" /> The sugarbush at a glance</div>
        <h2>{fleet.loading ? 'Getting the woods ready…' : unavailable ? 'Waiting for field data' : full ? 'Time to make the rounds.' : 'A little closer to the woods.'}</h2>
        <p>{fleet.error || fleet.stale ? 'Some field data is unavailable. Check the fleet map below for details.' : full ? `${full} ${full === 1 ? 'bucket is' : 'buckets are'} full. Check the map before heading out.` : 'Check your trees, plan a shift, and keep the sap moving.'}</p>
        <div className="field-stats">
          <div className="field-stat"><strong>{unavailable ? '—' : fleet.nodes.length}</strong><span>Deployed trees</span></div>
          <div className="field-stat"><strong>{unavailable ? '—' : full}</strong><span>Full buckets</span></div>
          <div className="field-stat"><strong>{unavailable ? '—' : offline}</strong><span>Offline nodes</span></div>
        </div>
      </div>
      <nav className="quick-actions" aria-label="Field shortcuts">
        {actions.map(({ to, icon: Icon }) => <Link className="quick-action" key={to} to={to}><Icon /><span>{ACTIONS[to][0]}<small>{ACTIONS[to][1]}</small></span></Link>)}
      </nav>
    </section>
  );
}
