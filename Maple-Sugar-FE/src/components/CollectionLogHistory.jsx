import { useEffect, useState } from 'react';
import { Alert, Button, Stack, Typography } from '@mui/material';
import { apiClient } from '../data/apiClient';

export function CollectionLogHistory({ refreshKey }) {
  const [all, setAll] = useState(false);
  const [before, setBefore] = useState(null);
  const [page, setPage] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let current = true;
    apiClient.get('/collection-logs', { limit: 20, ...(before ? { before } : {}) })
      .then((data) => { if (current) setPage(data); })
      .catch((failure) => { if (current) setError(failure.message); });
    return () => { current = false; };
  }, [before, refreshKey]);

  return (
    <Stack spacing={1}>
      <Typography variant="h6">{all ? 'All collections' : 'Recent collections'}</Typography>
      {error && <Alert severity="error">{error}</Alert>}
      {page?.items.length === 0 && <Typography>No collections in this mode.</Typography>}
      {page?.items.map((log) => (
        <Typography key={log.LogID}>
          {new Date(log.Collected_At).toLocaleString()} · Node {log.NodeID} · {log.Volume_Collected == null ? 'Volume unrecorded' : `${log.Volume_Collected} gal`}
          {log.Data_Mode === 'test' ? ' · Test' : ''} {log.Quality_Notes}
        </Typography>
      ))}
      <Button onClick={() => { setAll(!all); setBefore(null); }}>{all ? 'Recent collections' : 'All collections'}</Button>
      {all && page?.next && <Button onClick={() => setBefore(page.next)}>Older collections</Button>}
    </Stack>
  );
}
