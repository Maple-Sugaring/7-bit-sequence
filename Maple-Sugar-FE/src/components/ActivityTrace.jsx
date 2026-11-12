import { useState } from 'react';
import { Alert, Button, Stack, TextField, Typography } from '@mui/material';
import { apiClient } from '../data/apiClient';

// FR-036: trace one reading (measured, received, written, read, processed) or
// everything one request did. Admin only; the API enforces it as well.

function when(value) {
  return value ? `${new Date(value).toLocaleString()} (${value})` : '—';
}

function EventLine({ event }) {
  const who = event.Actor_UserID ? `User ${event.Actor_UserID}` : event.GatewayID ? `Gateway ${event.GatewayID}` : 'system';
  const entity = event.Entity_Type ? ` · ${event.Entity_Type} ${event.Entity_ID}` : '';
  const rows = event.Row_Count != null ? ` · ${event.Row_Count} rows` : '';
  return (
    <Typography variant="body2" sx={{ fontFamily: 'monospace', wordBreak: 'break-word' }}>
      {when(event.Occurred_At)} · {event.Kind}/{event.Operation} · {event.Outcome} · {who}{entity}{rows}
      {event.Request_ID ? ` · req ${event.Request_ID}` : ''}
    </Typography>
  );
}

export function ActivityTrace() {
  const [metricId, setMetricId] = useState('');
  const [requestId, setRequestId] = useState('');
  const [trace, setTrace] = useState(null);
  const [events, setEvents] = useState(null);
  const [error, setError] = useState('');

  async function traceReading() {
    setError('');
    setEvents(null);
    try {
      setTrace(await apiClient.get(`/activity-events/metrics/${encodeURIComponent(metricId.trim())}`));
    } catch (failure) {
      setTrace(null);
      setError(failure.message);
    }
  }

  async function traceRequest() {
    setError('');
    setTrace(null);
    try {
      setEvents((await apiClient.get('/activity-events', { requestId: requestId.trim() })).items);
    } catch (failure) {
      setEvents(null);
      setError(failure.message);
    }
  }

  const reading = trace?.Reading;
  return (
    <Stack spacing={1.5}>
      <Typography variant="h6">Activity trace</Typography>
      {error && <Alert severity="error">{error}</Alert>}
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
        <TextField size="small" label="Reading ID" value={metricId} onChange={(event) => setMetricId(event.target.value)} />
        <Button disabled={!/^\d+$/.test(metricId.trim())} onClick={() => void traceReading()}>Trace reading</Button>
        <TextField size="small" label="Request ID" value={requestId} onChange={(event) => setRequestId(event.target.value)} />
        <Button disabled={!requestId.trim()} onClick={() => void traceRequest()}>Trace request</Button>
      </Stack>
      {reading && (
        <Stack spacing={0.5}>
          <Typography variant="body2">
            Reading {reading.MetricID} · Node {reading.NodeID ?? '—'} · {reading.Source ?? 'unknown source'} · {reading.Status}
          </Typography>
          <Typography variant="body2">Measured: {when(reading.Recorded_At)}</Typography>
          <Typography variant="body2">
            Received: {when(reading.Received_At)}
            {reading.Ingest_Delay_Seconds != null ? ` · ${reading.Ingest_Delay_Seconds}s after measurement` : ''}
          </Typography>
          <Typography variant="body2">Written: {when(reading.Created_At)}</Typography>
          {reading.Corrected_At && <Typography variant="body2">Corrected: {when(reading.Corrected_At)}</Typography>}
          {trace.Compaction && (
            <Typography variant="body2">
              Compacted into the {trace.Compaction.Period_Start} hour by retention run {trace.Compaction.Run_ID} at {when(trace.Compaction.Compacted_At)}
            </Typography>
          )}
          {trace.Activity.map((event) => <EventLine key={event.ActivityID} event={event} />)}
          {trace.Audit.map((entry) => (
            <Typography key={`audit-${entry.id}`} variant="body2">
              {when(entry.created_at)} · audit/{entry.event_type} · User {entry.actor_id ?? 'system'} · {entry.note}
            </Typography>
          ))}
        </Stack>
      )}
      {events && (events.length
        ? events.map((event) => <EventLine key={event.ActivityID} event={event} />)
        : <Typography variant="body2">No activity for that request id.</Typography>)}
    </Stack>
  );
}
