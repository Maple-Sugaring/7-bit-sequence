import { useEffect, useMemo, useState } from 'react';
import { Alert, Box, Button, Chip, Stack, Typography } from '@mui/material';
import { apiClient } from '../data/apiClient';
import { displayNote, formatGallons, groupLogsByDay, volumeOf } from '../business/collectionLogGroups';

const tabular = { fontVariantNumeric: 'tabular-nums' };

/** One collection: when, which tree, what came out. The bar is that volume against the day's biggest pull. */
function LogRow({ log, largest, showTest }) {
  const volume = volumeOf(log);
  const note = displayNote(log);
  const share = volume != null && largest > 0 ? Math.max(0.03, volume / largest) : 0;
  const time = new Date(log.Collected_At).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  return (
    <Box
      component="li"
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '4.75rem 1fr auto', sm: '6rem 1fr auto' },
        columnGap: 1.5,
        alignItems: 'baseline',
        py: 1.25,
        borderBottom: 1,
        borderColor: 'divider',
        '&:last-of-type': { borderBottom: 0 },
      }}
    >
      <Typography variant="body2" color="text.secondary" sx={tabular}>
        {time}
      </Typography>

      <Box sx={{ minWidth: 0 }}>
        <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
          <Typography sx={{ fontWeight: 600 }}>Node {log.NodeID}</Typography>
          {log.Weight_Before_Ice_Lb != null ? (
            <Chip size="small" color="warning" label="Ice removed · reweighed" />
          ) : log.Ice_Not_Reweighed ? (
            <Chip size="small" color="error" label="Ice · not reweighed" />
          ) : log.Ice_Present ? (
            <Chip size="small" color="info" label="Ice" />
          ) : null}
          {showTest && log.Data_Mode === 'test' ? <Chip size="small" variant="outlined" label="Test" /> : null}
        </Stack>
        {note ? (
          <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>
            {note}
          </Typography>
        ) : null}
      </Box>

      <Typography sx={{ ...tabular, textAlign: 'right', fontWeight: 600, fontSize: '1.125rem', lineHeight: 1.3 }}>
        {volume == null ? (
          <Typography component="span" variant="body2" color="text.secondary">
            Not recorded
          </Typography>
        ) : (
          <>
            {formatGallons(volume)}
            <Typography component="span" variant="body2" color="text.secondary" sx={{ ml: 0.5, fontWeight: 400 }}>
              gal
            </Typography>
          </>
        )}
      </Typography>

      <Box
        aria-hidden="true"
        sx={{
          gridColumn: '2 / -1',
          height: 3,
          mt: 0.75,
          borderRadius: 1.5,
          bgcolor: 'action.hover',
          overflow: 'hidden',
        }}
      >
        <Box sx={{ width: `${share * 100}%`, height: '100%', bgcolor: 'primary.main', borderRadius: 1.5 }} />
      </Box>
    </Box>
  );
}

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

  const { days, largest } = useMemo(() => groupLogsByDay(page?.items), [page]);
  // In test mode every row is test data, so the tag only helps when the list is mixed.
  const showTest = useMemo(() => (page?.items ?? []).some((log) => log.Data_Mode !== 'test'), [page]);

  return (
    <Stack spacing={1.5}>
      <Typography variant="h6" component="h2">
        {all ? 'All collections' : 'Recent collections'}
      </Typography>
      {error && <Alert severity="error">{error}</Alert>}
      {page?.items.length === 0 && (
        <Typography color="text.secondary">No collections yet. Log a bucket above and it shows up here.</Typography>
      )}

      {days.map((day) => (
        <Box key={day.key} component="section" aria-label={day.label}>
          <Stack
            direction="row"
            sx={{ alignItems: 'baseline', justifyContent: 'space-between', pb: 0.75, borderBottom: 2, borderColor: 'primary.main' }}
          >
            <Typography component="h3" sx={{ fontWeight: 700 }}>
              {day.label}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={tabular}>
              {day.logs.length === 1 ? '1 collection' : `${day.logs.length} collections`}, {formatGallons(day.totalGallons)} gal
            </Typography>
          </Stack>
          <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
            {day.logs.map((log) => (
              <LogRow key={log.LogID} log={log} largest={largest} showTest={showTest} />
            ))}
          </Box>
        </Box>
      ))}

      <Stack direction="row" spacing={1} sx={{ justifyContent: 'center' }}>
        <Button onClick={() => { setAll(!all); setBefore(null); }}>{all ? 'Recent collections' : 'All collections'}</Button>
        {all && page?.next && <Button onClick={() => setBefore(page.next)}>Older collections</Button>}
      </Stack>
    </Stack>
  );
}
