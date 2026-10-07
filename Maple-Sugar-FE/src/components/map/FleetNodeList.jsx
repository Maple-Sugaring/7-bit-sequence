import Button from '@mui/material/Button';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import ListSubheader from '@mui/material/ListSubheader';
import Typography from '@mui/material/Typography';
import { Link as RouterLink } from 'react-router-dom';
import { STATUS_META, STATUS_ORDER } from '../../business/nodeMapStatus';
import { relativeMinutes } from '../common/format';
import { STATUS_HEX } from './statusMarker';

const bySeverity = (a, b) =>
  STATUS_ORDER.indexOf(a.mapStatus) - STATUS_ORDER.indexOf(b.mapStatus) || a.Node_Name.localeCompare(b.Node_Name);

function Row({ node, selected, onSelect }) {
  const meta = STATUS_META[node.mapStatus];
  const secondary = `${meta.label} · seen ${node.Last_Seen ? relativeMinutes(node.minutesSinceSeen) : 'never'}`;
  const accent = { minHeight: 48, borderLeft: `6px solid ${STATUS_HEX[meta.color]}` };

  // No siting: nothing to show on the map, so the whole row is the link.
  if (!node.hasLocation) {
    return (
      <ListItem disablePadding>
        <ListItemButton component={RouterLink} to={`/nodes/${node.NodeID}`} sx={accent}>
          <ListItemText primary={node.Node_Name} secondary={secondary} />
        </ListItemButton>
      </ListItem>
    );
  }
  // Two sibling controls rather than a link nested inside a button.
  return (
    <ListItem
      disablePadding
      secondaryAction={
        <Button
          component={RouterLink}
          to={`/nodes/${node.NodeID}`}
          size="small"
          aria-label={`Open ${node.Node_Name}`}
          sx={{ minWidth: 44, minHeight: 44 }}
        >
          Open
        </Button>
      }
    >
      <ListItemButton
        selected={selected}
        onClick={() => onSelect(node.NodeID)}
        aria-label={`${node.Node_Name}, ${meta.label}. Show on map`}
        sx={{ ...accent, pr: 9 }}
      >
        <ListItemText primary={node.Node_Name} secondary={secondary} />
      </ListItemButton>
    </ListItem>
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
