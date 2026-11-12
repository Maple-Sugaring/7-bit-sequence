import { useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
  useMediaQuery,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { apiClient } from '../data/apiClient';
import { describeAuditEvent } from '../business/auditEvents';
import { dateTime } from './common/format';

function EventChip({ row }) {
  return <Chip size="small" color={row.tone} variant="outlined" label={row.label} />;
}

function TestChip() {
  return <Chip size="small" label="Test" sx={{ ml: 1, height: 20, fontSize: 11 }} />;
}

function When({ at }) {
  return (
    <Tooltip title={at ?? ''}>
      <span>{dateTime(at)}</span>
    </Tooltip>
  );
}

function Actor({ row }) {
  return (
    <Typography variant="body2" color={row.isSystem ? 'text.secondary' : 'text.primary'}>
      {row.actor}
    </Typography>
  );
}

function AuditTable({ rows }) {
  return (
    <TableContainer>
      <Table size="small" aria-label="Audit history">
        <TableHead>
          <TableRow>
            <TableCell sx={{ whiteSpace: 'nowrap' }}>When</TableCell>
            <TableCell>Event</TableCell>
            <TableCell>By</TableCell>
            <TableCell>Target</TableCell>
            <TableCell>Details</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id} hover>
              <TableCell sx={{ whiteSpace: 'nowrap', verticalAlign: 'top' }}><When at={row.at} /></TableCell>
              <TableCell sx={{ whiteSpace: 'nowrap', verticalAlign: 'top' }}><EventChip row={row} /></TableCell>
              <TableCell sx={{ whiteSpace: 'nowrap', verticalAlign: 'top' }}><Actor row={row} /></TableCell>
              <TableCell sx={{ whiteSpace: 'nowrap', verticalAlign: 'top' }}>{row.target}</TableCell>
              <TableCell sx={{ verticalAlign: 'top' }}>
                {row.note}
                {row.isTest && <TestChip />}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

function AuditList({ rows }) {
  return (
    <Stack divider={<Divider flexItem />} spacing={1.5}>
      {rows.map((row) => (
        <Box key={row.id}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5 }}>
            <EventChip row={row} />
            {row.isTest && <TestChip />}
            <Typography variant="caption" color="text.secondary"><When at={row.at} /></Typography>
          </Stack>
          <Typography variant="body2" sx={{ mt: 0.5 }}>{row.note}</Typography>
          <Typography variant="caption" color="text.secondary">
            {row.actor} · {row.target}
          </Typography>
        </Box>
      ))}
    </Stack>
  );
}

/** Admin audit trail from GET /audit-events, newest first, paged by id. */
export function AuditLog({ users = [] }) {
  const theme = useTheme();
  const compact = useMediaQuery(theme.breakpoints.down('md'));
  const [events, setEvents] = useState(null);
  const [next, setNext] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const usersById = useMemo(() => new Map(users.map((user) => [user.UserID, user])), [users]);
  const rows = useMemo(() => (events ?? []).map((event) => describeAuditEvent(event, usersById)), [events, usersById]);

  async function load(before) {
    setLoading(true);
    setError('');
    try {
      const page = await apiClient.get('/audit-events', before ? { before } : {});
      setEvents((current) => (before ? [...(current ?? []), ...page.items] : page.items));
      setNext(page.next);
    } catch (failure) {
      setError(failure.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card sx={{ my: 2 }}>
      <CardContent>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 1.5, flexWrap: 'wrap', rowGap: 1 }}>
          <Box>
            <Typography variant="h6">Audit history</Typography>
            <Typography variant="body2" color="text.secondary">
              Setups, collections, corrections and account changes. Permanent record.
            </Typography>
          </Box>
          <Button variant={events ? 'text' : 'outlined'} disabled={loading} onClick={() => void load()}>
            {events ? 'Refresh' : 'Load audit history'}
          </Button>
        </Stack>

        {error && <Alert severity="error" sx={{ mb: 1.5 }}>{error}</Alert>}

        {events && !rows.length && <Typography variant="body2" color="text.secondary">No audit events yet.</Typography>}
        {rows.length > 0 && (compact ? <AuditList rows={rows} /> : <AuditTable rows={rows} />)}

        {next && (
          <Box sx={{ textAlign: 'center', mt: 1.5 }}>
            <Button disabled={loading} onClick={() => void load(next)}>Load older</Button>
          </Box>
        )}
      </CardContent>
    </Card>
  );
}
