import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { Link as RouterLink } from 'react-router-dom';
import { NodeStatusChip } from '../common/NodeStatusChip';
import { dateTime, fahrenheit, pounds, relativeMinutes } from '../common/format';

function NodeSummary({ node }) {
  const reading = node.reading;
  return (
    <Stack spacing={0.5}>
      <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
        <Typography component="h3" variant="subtitle2" fontWeight={700}>
          {node.Node_Name}
        </Typography>
        <NodeStatusChip status={node.mapStatus} />
      </Stack>
      {node.faultReason ? (
        <Typography variant="body2" color="error">
          {node.faultReason}
        </Typography>
      ) : null}
      <Typography variant="body2" color="text.secondary">
        Last seen {node.Last_Seen ? `${relativeMinutes(node.minutesSinceSeen)} (${dateTime(node.Last_Seen)})` : 'never'}
      </Typography>
      <Typography variant="body2">
        {reading
          ? [
              pounds(reading.Weight),
              reading.Temperature == null ? null : fahrenheit(reading.Temperature),
              reading.Sap_Flow_Rate_Lph == null ? null : `${reading.Sap_Flow_Rate_Lph} L/h`,
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
