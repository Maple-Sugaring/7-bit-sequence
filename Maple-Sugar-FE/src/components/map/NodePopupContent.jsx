import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import dayjs from 'dayjs';
import { Link as RouterLink } from 'react-router-dom';
import { STATUS_META } from '../../business/nodeMapStatus';
import { dateTime, fahrenheit, pounds, relativeMinutes } from '../common/format';

function NodeSummary({ node }) {
  const meta = STATUS_META[node.mapStatus];
  const reading = node.reading;
  const minutes = node.Last_Seen ? dayjs().diff(dayjs(node.Last_Seen), 'minute') : null;
  return (
    <Stack spacing={0.5}>
      <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
        <Typography component="h3" variant="subtitle2" fontWeight={700}>
          {node.Node_Name}
        </Typography>
        <Chip size="small" color={meta.color === 'neutral' ? 'default' : meta.color} label={meta.label} />
      </Stack>
      <Typography variant="body2" color="text.secondary">
        Last seen {node.Last_Seen ? `${relativeMinutes(minutes)} (${dateTime(node.Last_Seen)})` : 'never'}
      </Typography>
      <Typography variant="body2">
        {reading
          ? [
              pounds(reading.Weight),
              reading.Temperature == null ? null : fahrenheit(reading.Temperature),
              reading.Ice_Present ? 'ice' : null,
            ]
              .filter(Boolean)
              .join(' · ')
          : 'No reading yet'}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        Battery {node.Battery_Percent == null ? '—' : `${Math.round(node.Battery_Percent)}%`} · Signal{' '}
        {node.Signal_Rssi == null ? '—' : `${node.Signal_Rssi} dBm`}
      </Typography>
      <Button
        component={RouterLink}
        to={`/nodes/${node.NodeID}`}
        size="small"
        variant="contained"
        sx={{ alignSelf: 'flex-start', minHeight: 36 }}
      >
        Open node
      </Button>
    </Stack>
  );
}

/** One popup for a marker; lists every node when several share the point. */
export function NodePopupContent({ nodes }) {
  return (
    <Stack spacing={1} sx={{ minWidth: 220, maxHeight: 280, overflowY: 'auto' }}>
      {nodes.map((node, index) => (
        <div key={node.NodeID}>
          {index > 0 ? <Divider sx={{ mb: 1 }} /> : null}
          <NodeSummary node={node} />
        </div>
      ))}
    </Stack>
  );
}
