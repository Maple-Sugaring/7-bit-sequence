import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Grid from '@mui/material/Grid';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import dayjs from 'dayjs';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Capability } from '../business/permissions';
import { PageHeader } from '../components/common/PageHeader';
import { AsyncBlock, EmptyBlock, SkeletonRows } from '../components/common/StateBlock';
import { timeOnly } from '../components/common/format';
import { useAuth } from '../context/auth';
import { apiMode } from '../data/apiClient';
import { TimePickerDialog } from '../components/schedule/TimePickerDialog';
import { claimCollectionTime, claimShift, groupByDay, releaseShift } from '../services/scheduleService';
import { useAction, useSchedule } from '../services/hooks';

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '/api').replace(/\/$/, '');
const CALENDAR_START = `${API_BASE}/auth/google/calendar`;

function SlotCard({ slot, canClaim, onClaim, onRelease, onPickTime, pending }) {
  const claimDisabled = !slot.canClaim || pending;

  // Explains a disabled button rather than leaving the user guessing.
  const blockedReason = slot.isMine
    ? null
    : slot.isPast
      ? 'This shift has already passed.'
      : slot.isFull
        ? 'This shift is full.'
        : slot.conflictsWith
          ? `Overlaps your ${slot.conflictsWith} shift.`
          : null;

  return (
    <Card
      sx={{
        borderLeftWidth: 4,
        borderLeftStyle: 'solid',
        borderLeftColor: slot.isMine ? 'primary.main' : 'divider',
        opacity: slot.isPast ? 0.7 : 1,
        height: '100%',
      }}
    >
      <CardContent sx={{ '&:last-child': { pb: 2 } }}>
        <Stack spacing={1.25}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5 }}>
            <Typography variant="subtitle1" component="h3" fontWeight={700} sx={{ flexGrow: 1 }}>
              {slot.Task}
            </Typography>
            {slot.Is_Complete ? (
              <Chip icon={<CheckCircleIcon />} label="Complete" size="small" color="success" />
            ) : null}
            {slot.isMine ? <Chip label="You" size="small" color="primary" /> : null}
          </Stack>

          <Typography variant="body2" color="text.secondary">
            {slot.Stand}
            {slot.awaiting
              ? ' · waiting for a time'
              : ` · ${timeOnly(slot.Starts_At)} to ${timeOnly(slot.Ends_At)}`}
          </Typography>

          <Stack direction="row" spacing={0.75} sx={{ flexWrap: 'wrap', gap: 0.75 }}>
            {slot.assigned.length ? (
              slot.assigned.map((person) => (
                <Chip key={person.userId} label={person.name} size="small" variant="outlined" />
              ))
            ) : (
              <Chip label="Unclaimed" size="small" color="warning" variant="outlined" />
            )}
          </Stack>

          <Typography variant="caption" color="text.secondary">
            {slot.remaining} of {slot.Capacity} {slot.remaining === 1 ? 'spot' : 'spots'} open
          </Typography>

          {canClaim && slot.canPickTime ? (
            <Button size="small" variant="contained" onClick={() => onPickTime(slot)} disabled={pending} fullWidth>
              Pick a time
            </Button>
          ) : null}

          {canClaim && !slot.awaiting ? (
            slot.isMine ? (
              <Button
                size="small"
                variant="outlined"
                color="secondary"
                onClick={() => onRelease(slot.SlotID)}
                disabled={pending || slot.isPast}
              >
                Give up this shift
              </Button>
            ) : (
              <Tooltip title={blockedReason ?? ''}>
                <span>
                  <Button
                    size="small"
                    variant="contained"
                    onClick={() => onClaim(slot.SlotID)}
                    disabled={claimDisabled}
                    fullWidth
                  >
                    Sign up
                  </Button>
                </span>
              </Tooltip>
            )
          ) : null}
        </Stack>
      </CardContent>
    </Card>
  );
}

export function SchedulePage() {
  const { user, can } = useAuth();
  const canClaim = can(Capability.CLAIM_SHIFT);
  const [searchParams, setSearchParams] = useSearchParams();
  const calendarConnected = searchParams.get('calendar') === 'connected';
  const calendarError = searchParams.get('calendarError');
  const { data, loading, error, refresh } = useSchedule({ userId: user?.id });

  const [picking, setPicking] = useState(null);
  const claim = useAction(async (slotId) => {
    await claimShift(slotId, user.id);
    await refresh();
  });
  const pick = useAction(async (window) => {
    await claimCollectionTime(picking.SlotID, window);
    setPicking(null);
    await refresh();
  });
  const release = useAction(async (slotId) => {
    await releaseShift(slotId, user.id);
    await refresh();
  });

  const days = groupByDay(data?.slots ?? []);

  return (
    <>
      <PageHeader
        title="Schedule"
        actions={
          <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', justifyContent: 'center' }}>
            {apiMode === 'http' && canClaim ? (
              user?.calendarConnected || calendarConnected ? (
                <Chip label="Google Calendar connected" color="success" variant="outlined" />
              ) : (
                <Button variant="contained" href={CALENDAR_START}>
                  Add shifts to Google Calendar
                </Button>
              )
            ) : null}
            <Button variant="outlined" onClick={refresh} disabled={loading}>
              Refresh
            </Button>
          </Stack>
        }
      />

      {calendarError ? (
        <Alert
          severity="warning"
          sx={{ mb: 3 }}
          onClose={() => {
            searchParams.delete('calendarError');
            setSearchParams(searchParams, { replace: true });
          }}
        >
          {calendarError}
        </Alert>
      ) : null}

      {calendarConnected ? (
        <Alert
          severity="success"
          sx={{ mb: 3 }}
          onClose={() => {
            searchParams.delete('calendar');
            setSearchParams(searchParams, { replace: true });
          }}
        >
          Upcoming claimed shifts were added to your Google Calendar.
        </Alert>
      ) : null}

      {(claim.error || release.error) ? (
        <Alert severity="warning" sx={{ mb: 3 }} onClose={() => { claim.clearError(); release.clearError(); }}>
          {claim.error ?? release.error}
        </Alert>
      ) : null}

      {data?.summary ? (
        <Stack direction="row" spacing={1} sx={{ mb: 3, flexWrap: 'wrap', gap: 1 }}>
          <Chip label={`${data.summary.open} open shifts`} color="primary" variant="outlined" />
          <Chip label={`${data.summary.mine} assigned to you`} variant="outlined" />
          {data.summary.unfilledPast > 0 ? (
            <Chip label={`${data.summary.unfilledPast} past shifts went unclaimed`} color="warning" variant="outlined" />
          ) : null}
        </Stack>
      ) : null}

      <AsyncBlock
        loading={loading}
        error={error}
        refresh={refresh}
        data={days}
        skeleton={<SkeletonRows rows={4} height={140} />}
        isEmpty={(rows) => rows.length === 0}
        empty={
          <EmptyBlock
            title="No shifts scheduled"
            description="An administrator has not published any shifts for this period yet."
          />
        }
      >
        <Stack spacing={3}>
          {days.map(({ day, slots }) => (
            <Box key={day}>
              <Stack direction="row" spacing={1.5} sx={{ alignItems: 'baseline', mb: 1.5 }}>
                <Typography variant="h5" component="h2">
                  {day === 'needs-time' ? 'Needs a time' : dayjs(day).format('dddd, MMM D')}
                </Typography>
                {day !== 'needs-time' && dayjs(day).isSame(dayjs(), 'day') ? (
                  <Chip label="Today" size="small" color="primary" />
                ) : null}
              </Stack>

              <Grid container spacing={2}>
                {slots.map((slot) => (
                  <Grid size={{ xs: 12, sm: 6, lg: 4 }} key={slot.SlotID}>
                    <SlotCard
                      slot={slot}
                      canClaim={canClaim}
                      onClaim={claim.execute}
                      onRelease={release.execute}
                      onPickTime={setPicking}
                      pending={claim.pending || release.pending || pick.pending}
                    />
                  </Grid>
                ))}
              </Grid>
            </Box>
          ))}
        </Stack>
      </AsyncBlock>

      <TimePickerDialog
        open={Boolean(picking)}
        slot={picking}
        pending={pick.pending}
        error={pick.error}
        onClose={() => setPicking(null)}
        onPick={(window) => pick.execute(window)}
      />
    </>
  );
}
