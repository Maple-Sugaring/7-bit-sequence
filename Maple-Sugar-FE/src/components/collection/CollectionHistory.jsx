import { useState } from 'react';
import dayjs from 'dayjs';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { entriesInWeek, weekLabel, weekStart } from '../../business/weekWindows';
import { dateTime } from '../common/format';

/**
 * What has been collected, one Sunday to Saturday week at a time, newest
 * first. Sugar shows only on entries where
 * someone tested it, so a row without it reads as untested, not as missing.
 */
export function CollectionHistory({ entries, loading, error }) {
  const [start, setStart] = useState(() => weekStart(dayjs()));
  const visible = entriesInWeek(entries, start);
  const isCurrentWeek = start === weekStart(dayjs());
  const move = (days) => setStart(dayjs(start).add(days, 'day').format('YYYY-MM-DD'));

  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
        <Button onClick={() => move(-7)}>Previous week</Button>
        <Typography variant="h6" component="h2">
          {weekLabel(start)}
        </Typography>
        <Button onClick={() => move(7)} disabled={isCurrentWeek}>
          Next week
        </Button>
      </Stack>
      {error ? <Alert severity="error">{error}</Alert> : null}
      {visible.length === 0 && !loading ? (
        <Card>
          <CardContent>
            <Typography color="text.secondary">
              {entries.length === 0 ? 'No collections logged yet.' : 'No collections logged this week.'}
            </Typography>
          </CardContent>
        </Card>
      ) : null}
      {visible.map((entry) => (
        <Card key={entry.EntryID}>
          <CardContent>
            <Stack spacing={1}>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }} useFlexGap>
                <Typography variant="h6" component="h3" sx={{ flexGrow: 1 }}>
                  {entry.Title}
                </Typography>
                {entry.Round_Label ? <Chip label={entry.Round_Label} size="small" variant="outlined" /> : null}
                {entry.Ice_Present ? <Chip label="Ice" size="small" color="info" /> : null}
              </Stack>
              <Typography variant="body2" color="text.secondary">
                {dateTime(entry.Collected_At)}
                {entry.Author ? ` · ${entry.Author}` : ''}
              </Typography>
              {entry.Process_Notes ? (
                <Typography sx={{ whiteSpace: 'pre-wrap' }}>{entry.Process_Notes}</Typography>
              ) : null}
              <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
                {entry.Weight_Lb != null ? <Chip label={`${entry.Weight_Lb} lb`} size="small" variant="outlined" /> : null}
                {entry.Sugar_Percent != null ? (
                  <Chip label={`${entry.Sugar_Percent}% sugar`} size="small" variant="outlined" />
                ) : null}
              </Stack>
            </Stack>
          </CardContent>
        </Card>
      ))}
    </Stack>
  );
}
