import { useEffect, useState } from 'react';
import { Alert, Button, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { apiClient, apiMode } from '../data/apiClient';

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

  async function loadAudit(before) {
    try {
      setPage(await apiClient.get('/audit-events', before ? { before } : {}));
    } catch (failure) {
      setError(failure.message);
    }
  }

  if (apiMode !== 'http') return null;
  return (
    <Stack spacing={2} sx={{ my: 3 }}>
      {error && <Alert severity="error">{error}</Alert>}
      <TextField select label="Site data mode" value={mode} disabled={!mode} onChange={(event) => void changeMode(event.target.value)}>
        <MenuItem value="test">Test Mode</MenuItem>
        <MenuItem value="production">Production Mode</MenuItem>
      </TextField>
      <Button onClick={() => void loadAudit()}>Load audit history</Button>
      {page?.items.map((event) => (
        <Typography key={event.id}>
          {new Date(event.created_at).toLocaleString()} · {event.event_type} · User {event.actor_id ?? 'system'} · Target {event.target_id} · {event.note}
        </Typography>
      ))}
      {page?.next && <Button onClick={() => void loadAudit(page.next)}>Older audit events</Button>}
    </Stack>
  );
}
