import { useEffect, useState } from 'react';
import { Alert, Button, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { apiClient, apiMode } from '../data/apiClient';

/** Readable names for audit event types; unknown types show as stored. */
const EVENT_LABELS = {
  node_deleted: 'Node removed',
  node_edited: 'Node edited',
  node_interval_changed: 'Report interval changed',
  node_tare: 'Tare sent',
  node_calibrate: 'Calibration sent',
  calibration_cancelled: 'Calibration cancelled',
  node_flagged: 'Node flagged',
  node_maintenance: 'Node parked',
  node_online: 'Node back in service',
  alert_resolved: 'Alert resolved',
  alert_reopened: 'Alert reopened',
  measurement_overwritten: 'Reading corrected',
  user_updated: 'User changed',
  user_deleted: 'User removed',
};

export function Issue49Admin() {
  const [mode, setMode] = useState('');
  const [page, setPage] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (apiMode !== 'http') return;
    apiClient.get('/settings/data-mode').then((data) => setMode(data.mode)).catch((failure) => setError(failure.message));
  }, []);

  async function changeMode(next) {
    try {
      const data = await apiClient.patch('/settings/data-mode', { mode: next });
      setMode(data.mode);
      window.location.reload();
    } catch (failure) {
      setError(failure.message);
    }
  }

  // A fresh load replaces the list; "older" appends the next page to it.
  async function loadAudit(before) {
    try {
      const next = await apiClient.get('/audit-events', before ? { before } : {});
      setPage((current) => (before && current ? { items: [...current.items, ...next.items], next: next.next } : next));
    } catch (failure) {
      setError(failure.message);
    }
  }

  return (
    <Stack spacing={2} sx={{ my: 3 }}>
      {error && <Alert severity="error">{error}</Alert>}
      {apiMode === 'http' && (
        <TextField select label="Site data mode" value={mode} disabled={!mode} onChange={(event) => void changeMode(event.target.value)}>
          <MenuItem value="test">Test Mode</MenuItem>
          <MenuItem value="production">Production Mode</MenuItem>
        </TextField>
      )}
      <Typography variant="h6" component="h2">Audit history</Typography>
      <Button sx={{ alignSelf: 'flex-start' }} variant="outlined" onClick={() => void loadAudit()}>
        {page ? 'Refresh audit history' : 'Load audit history'}
      </Button>
      {page && !page.items.length && <Typography color="text.secondary">No admin actions recorded yet.</Typography>}
      {page?.items.map((event) => (
        <Typography key={event.id}>
          {new Date(event.created_at).toLocaleString()} · {EVENT_LABELS[event.event_type] ?? event.event_type} ·{' '}
          {event.actor_name ?? (event.actor_id ? `User ${event.actor_id}` : 'system')}
          {event.target_id != null ? ` · Target ${event.target_id}` : ''}
          {event.note ? ` · ${event.note}` : ''}
        </Typography>
      ))}
      {page?.next && <Button sx={{ alignSelf: 'flex-start' }} onClick={() => void loadAudit(page.next)}>Older audit events</Button>}
    </Stack>
  );
}
