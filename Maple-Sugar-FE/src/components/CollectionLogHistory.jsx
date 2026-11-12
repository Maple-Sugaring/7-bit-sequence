import { useEffect, useMemo, useState } from 'react';
import { Alert, Box, Button, Card, CardContent, Chip, Divider, Stack, Typography } from '@mui/material';
import { apiClient } from '../data/apiClient';
import { groupCollections } from '../business/collectionLogHistory';
import { useNodes } from '../services/hooks';
import { dateTime } from './common/format';

const PAGE_SIZE = 20;

function gallons(value) {
  return `${value.toFixed(2).replace(/\.?0+$/, '')} gal`;
}

function Round({ round }) {
  return (
    <Box>
      <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
        <Typography variant="subtitle1" component="h3" sx={{ fontWeight: 600, flexGrow: 1 }}>
          {dateTime(round.at)}
        </Typography>
        {round.isTest && <Chip size="small" label="Test" />}
        <Chip size="small" variant="outlined" label={`${round.trees.length} ${round.trees.length === 1 ? 'tree' : 'trees'}`} />
        <Chip size="small" color="primary" label={gallons(round.totalGallons)} />
      </Stack>
      {round.note && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
          {round.note}
        </Typography>
      )}
      <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', mt: 1 }}>
        {round.trees.map((tree) => (
          <Chip
            key={tree.id}
            size="small"
            variant="outlined"
            label={`${tree.name} · ${tree.gallons == null ? 'volume unrecorded' : gallons(tree.gallons)}`}
          />
        ))}
      </Stack>
      {round.unrecorded > 0 && (
        <Typography variant="caption" color="text.secondary">
          {round.unrecorded} without a recorded volume, not in the total.
        </Typography>
      )}
    </Box>
  );
}

/** Collection logs from the API, grouped into rounds, newest first. */
export function CollectionLogHistory({ refreshKey }) {
  const nodes = useNodes();
  const [items, setItems] = useState([]);
  const [next, setNext] = useState(null);
  const [before, setBefore] = useState(null);
  const [loaded, setLoaded] = useState(null);
  const [error, setError] = useState('');
  const [seenRefresh, setSeenRefresh] = useState(refreshKey);

  // A new collection starts the list over from the newest page.
  if (seenRefresh !== refreshKey) {
    setSeenRefresh(refreshKey);
    setBefore(null);
  }

  useEffect(() => {
    let current = true;
    apiClient.get('/collection-logs', { limit: PAGE_SIZE, ...(before ? { before } : {}) })
      .then((data) => {
        if (!current) return;
        setItems((existing) => (before ? [...existing, ...data.items] : data.items));
        setNext(data.next);
        setError('');
      })
      .catch((failure) => { if (current) setError(failure.message); })
      .finally(() => { if (current) setLoaded({ before, refreshKey }); });
    return () => { current = false; };
  }, [before, refreshKey]);

  const loading = loaded?.before !== before || loaded?.refreshKey !== refreshKey;

  const nodesById = useMemo(() => new Map((nodes.data ?? []).map((node) => [node.NodeID, node])), [nodes.data]);
  const rounds = useMemo(() => groupCollections(items, nodesById), [items, nodesById]);

  return (
    <Card>
      <CardContent>
        <Typography variant="h6" component="h2" sx={{ mb: 0.5 }}>Recent collections</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Trees emptied together are grouped into one round.
        </Typography>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {!loading && !error && rounds.length === 0 && (
          <Typography color="text.secondary">No collections in this mode.</Typography>
        )}
        <Stack spacing={2} divider={<Divider flexItem />}>
          {rounds.map((round) => <Round key={round.key} round={round} />)}
        </Stack>
        {next && (
          <Box sx={{ textAlign: 'center', mt: 2 }}>
            <Button disabled={loading} onClick={() => setBefore(next)}>Show older collections</Button>
          </Box>
        )}
      </CardContent>
    </Card>
  );
}
