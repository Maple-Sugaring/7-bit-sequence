import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import ListSubheader from '@mui/material/ListSubheader';
import Typography from '@mui/material/Typography';
import dayjs from 'dayjs';
import { Link as RouterLink } from 'react-router-dom';
import { STATUS_META, STATUS_ORDER } from '../../business/nodeMapStatus';
import { relativeMinutes } from '../common/format';
import { STATUS_HEX } from './statusMarker';

const bySeverity = (a, b) =>
  STATUS_ORDER.indexOf(a.mapStatus) - STATUS_ORDER.indexOf(b.mapStatus) || a.Node_Name.localeCompare(b.Node_Name);

function Row({ node, selected, onSelect }) {
  const meta = STATUS_META[node.mapStatus];
  const minutes = node.Last_Seen ? dayjs().diff(dayjs(node.Last_Seen), 'minute') : null;
  const secondary = `${meta.label} · seen ${node.Last_Seen ? relativeMinutes(minutes) : 'never'}`;
  return (
    <ListItemButton
      selected={selected}
      // Rows with a point select it on the map; rows without one go straight to the node.
      {...(node.hasLocation
        ? { onClick: () => onSelect(node.NodeID) }
        : { component: RouterLink, to: `/nodes/${node.NodeID}` })}
      sx={{ minHeight: 48, borderLeft: `6px solid ${STATUS_HEX[meta.color]}` }}
    >
      <ListItemText primary={node.Node_Name} secondary={secondary} />
      {node.hasLocation ? (
        <RouterLink
          to={`/nodes/${node.NodeID}`}
          onClick={(event) => event.stopPropagation()}
          aria-label={`Open ${node.Node_Name}`}
          style={{ padding: '12px 8px', minWidth: 44, textAlign: 'center' }}
        >
          Open
        </RouterLink>
      ) : null}
    </ListItemButton>
  );
}

/** The map's accessible twin: same filters, same status text, links to each node. */
export function FleetNodeList({ nodes, selectedId, onSelect }) {
  const located = nodes.filter((node) => node.hasLocation).sort(bySeverity);
  const unplaced = nodes.filter((node) => !node.hasLocation).sort(bySeverity);
  if (nodes.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
        No nodes match these filters.
      </Typography>
    );
  }
  return (
    <List dense aria-label="Nodes" disablePadding>
      {located.map((node) => (
        <Row key={node.NodeID} node={node} selected={node.NodeID === selectedId} onSelect={onSelect} />
      ))}
      {unplaced.length > 0 ? (
        <>
          <ListSubheader disableSticky>No location ({unplaced.length})</ListSubheader>
          {unplaced.map((node) => (
            <Row key={node.NodeID} node={node} selected={false} onSelect={onSelect} />
          ))}
        </>
      ) : null}
    </List>
  );
}
