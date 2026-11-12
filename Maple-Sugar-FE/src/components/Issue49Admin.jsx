import { useEffect, useState } from 'react';
import { Alert, Card, CardContent, MenuItem, TextField } from '@mui/material';
import { apiClient, apiMode } from '../data/apiClient';
import { ActivityTrace } from './ActivityTrace';
import { AuditLog } from './AuditLog';

export function Issue49Admin({ users = [] }) {
  const [mode, setMode] = useState('');
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

  if (apiMode !== 'http') return null;
  return (
    <>
      {error && <Alert severity="error" sx={{ my: 2 }}>{error}</Alert>}
      <TextField
        select
        fullWidth
        label="Site data mode"
        value={mode}
        disabled={!mode}
        onChange={(event) => void changeMode(event.target.value)}
        sx={{ mt: 3 }}
      >
        <MenuItem value="test">Test Mode</MenuItem>
        <MenuItem value="production">Production Mode</MenuItem>
      </TextField>
      <AuditLog users={users} />
      <Card sx={{ my: 2 }}>
        <CardContent>
          <ActivityTrace />
        </CardContent>
      </Card>
    </>
  );
}
