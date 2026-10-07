import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import FormControlLabel from '@mui/material/FormControlLabel';
import Grid from '@mui/material/Grid';
import MenuItem from '@mui/material/MenuItem';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import Checkbox from '@mui/material/Checkbox';
import IconButton from '@mui/material/IconButton';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined';
import dayjs from 'dayjs';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Capability } from '../business/permissions';
import { PageHeader } from '../components/common/PageHeader';
import { AsyncBlock, EmptyBlock, SkeletonRows } from '../components/common/StateBlock';
import { timeOnly } from '../components/common/format';
import { useAuth } from '../context/auth';
import { ShiftAdminPanel } from '../components/schedule/ShiftAdminPanel';
import { TimePickerDialog } from '../components/schedule/TimePickerDialog';
import {
  claimCollectionTime,
  claimShift,
  deleteShift,
  groupByDay,
  releaseShift,
  setShiftComplete,
} from '../services/scheduleService';
import { useAction, useSchedule } from '../services/hooks';
import { withPronouns } from '../services/profileService';

function SlotCard({ slot, canClaim, canManage, onClaim, onRelease, onPickTime, onComplete, onDelete, pending }) {
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
            <Typography variant="subtitle1" component="h3" sx={{ fontWeight: 700, flexGrow: 1 }}>
              {slot.Task}
            </Typography>
            {slot.Is_Complete ? (
              <Chip icon={<CheckCircleIcon />} label="Complete" size="small" color="success" />
            ) : null}
            {slot.isMine ? <Chip label="You" size="small" color="primary" /> : null}
            {canManage ? (
              <Tooltip title="Delete shift">
                <IconButton
                  size="small"
                  onClick={() => onDelete(slot.SlotID)}
                  disabled={pending}
                  aria-label={`Delete ${slot.Task}`}
                >
                  <DeleteOutlineIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            ) : null}
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
                <Chip
                  key={person.userId}
                  label={withPronouns(person.name, person.pronouns)}
                  size="small"
                  variant="outlined"
                />
              ))
            ) : (
              <Chip label="Unclaimed" size="small" color="warning" variant="outlined" />
            )}
          </Stack>

          <Typography variant="caption" color="text.secondary">
            {slot.remaining} of {slot.Capacity} {slot.remaining === 1 ? 'spot' : 'spots'} open
          </Typography>

          {canManage ? (
            <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
              <Checkbox
                size="small"
                checked={Boolean(slot.Is_Complete)}
                onChange={(event) => onComplete(slot.SlotID, event.target.checked)}
                disabled={pending}
                inputProps={{ 'aria-label': `Mark ${slot.Task} complete` }}
              />
              <Typography variant="body2">Mark complete</Typography>
            </Stack>
          ) : null}

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

function matchesShow(slot, show) {
  if (show === 'completed') return slot.Is_Complete;
  if (slot.Is_Complete) return false;
  if (show === 'mine') return slot.isMine;
  if (show === 'open') return !slot.isFull && !slot.isPast && !slot.isMine;
  return true;
}

const SHOW_IDS = ['all', 'mine', 'open', 'completed'];

// Past shifts are hidden by default, but today's stay visible even once they have ended.
const isBeforeToday = (slot) => slot.isPast && !dayjs(slot.Ends_At).isSame(dayjs(), 'day');

export function SchedulePage() {
  const { user, can } = useAuth();
  const canClaim = can(Capability.CLAIM_SHIFT);
  const canManage = can(Capability.MANAGE_SCHEDULE);
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

  const remove = useAction(async (slotId) => {
    await deleteShift(slotId);
    await refresh();
  });
  const complete = useAction(async (slotId, isComplete) => {
    await setShiftComplete(slotId, isComplete);
    await refresh();
  });

  const allSlots = useMemo(() => data?.slots ?? [], [data?.slots]);

  // Filters live in the URL so a link like /schedule?show=mine&past=1 works.
  const showParam = searchParams.get('show');
  const show = SHOW_IDS.includes(showParam) ? showParam : 'all';
  const stand = searchParams.get('stand') ?? '';
  const task = searchParams.get('task') ?? '';
  const viewPast = searchParams.get('past') === '1';
  const setFilter = (key, value) => {
    const next = new URLSearchParams(searchParams);
    if (value && value !== 'all') next.set(key, value);
    else next.delete(key);
    setSearchParams(next, { replace: true });
  };
  const stands = useMemo(() => [...new Set(allSlots.map((slot) => slot.Stand).filter(Boolean))].sort(), [allSlots]);
  const tasks = useMemo(() => [...new Set(allSlots.map((slot) => slot.Task).filter(Boolean))].sort(), [allSlots]);
  const filtering = show !== 'all' || stand || task || viewPast;

  const counts = useMemo(
    () => Object.fromEntries(SHOW_IDS.map((id) => [id, allSlots.filter((slot) => matchesShow(slot, id)).length])),
    [allSlots],
  );
  const showOptions = [
    ['all', `All (${counts.all})`],
    ['mine', `My shifts (${counts.mine})`],
    ['open', `Open (${counts.open})`],
    ['completed', `Completed (${counts.completed})`],
  ];

  const visibleSlots = allSlots.filter(
    (slot) =>
      matchesShow(slot, show) &&
      (!stand || slot.Stand === stand) &&
      (!task || slot.Task === task) &&
      (viewPast || !isBeforeToday(slot)),
  );
  const days = groupByDay(visibleSlots);

  return (
    <Box>
      <PageHeader
        title="Schedule"
        subtitle={
          canManage
            ? 'Post, assign, complete, or delete shifts. Students claim open shifts from here too.'
            : 'Claim a collection shift, or connect Google Calendar so claimed times land on your calendar.'
        }
      />

      {canManage ? <ShiftAdminPanel onChanged={refresh} /> : null}

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

      {(claim.error || release.error || remove.error || complete.error) ? (
        <Alert
          severity="warning"
          sx={{ mb: 3 }}
          onClose={() => { claim.clearError(); release.clearError(); remove.clearError(); complete.clearError(); }}
        >
          {claim.error ?? release.error ?? remove.error ?? complete.error}
        </Alert>
      ) : null}

      <Card variant="outlined" sx={{ mb: 3 }}>
        <CardContent sx={{ '&:last-child': { pb: 2 } }}>
          <Box sx={{ display: 'flex', flexDirection: { xs: 'column', lg: 'row' }, flexWrap: 'wrap', gap: 2, alignItems: { lg: 'center' } }}>
            <ToggleButtonGroup
              exclusive
              size="small"
              color="primary"
              value={show}
              onChange={(_event, value) => value && setFilter('show', value)}
              aria-label="Which shifts to show"
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(4, auto)' },
                gap: 1,
                '& .MuiToggleButton-root': {
                  px: 2,
                  whiteSpace: 'nowrap',
                  // Each button is its own pill so a wrapped row never leaves mismatched edges.
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: '4px !important',
                  marginLeft: '0 !important',
                  '&.Mui-selected': { borderColor: 'primary.main' },
                },
              }}
            >
              {showOptions.map(([id, label]) => (
                <ToggleButton key={id} value={id}>
                  {label}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ alignItems: { sm: 'center' }, flexGrow: 1 }}>
              <TextField select size="small" label="Stand" value={stand} onChange={(e) => setFilter('stand', e.target.value)} sx={{ minWidth: { sm: 180 } }}>
                <MenuItem value="">All stands</MenuItem>
                {stands.map((name) => (
                  <MenuItem key={name} value={name}>{name}</MenuItem>
                ))}
              </TextField>
              <TextField select size="small" label="Task" value={task} onChange={(e) => setFilter('task', e.target.value)} sx={{ minWidth: { sm: 180 } }}>
                <MenuItem value="">All tasks</MenuItem>
                {tasks.map((name) => (
                  <MenuItem key={name} value={name}>{name}</MenuItem>
                ))}
              </TextField>
              <FormControlLabel
                control={<Switch checked={viewPast} onChange={(e) => setFilter('past', e.target.checked ? '1' : '')} />}
                label="View past"
                sx={{ mr: 0, whiteSpace: 'nowrap' }}
              />
              <Box sx={{ flexGrow: 1 }} />
              {filtering ? (
                <Button size="small" onClick={() => setSearchParams(new URLSearchParams(), { replace: true })}>
                  Clear filters
                </Button>
              ) : null}
            </Stack>

            {data?.summary?.unfilledPast > 0 ? (
              <Typography variant="caption" color="warning.main" sx={{ width: '100%' }}>
                {data.summary.unfilledPast} past {data.summary.unfilledPast === 1 ? 'shift' : 'shifts'} went unclaimed.
              </Typography>
            ) : null}
          </Box>
        </CardContent>
      </Card>

      <Box>
        <AsyncBlock
          loading={loading}
          error={error}
          refresh={refresh}
          data={days}
          skeleton={<SkeletonRows rows={4} height={140} />}
          isEmpty={(rows) => rows.length === 0}
          empty={
            <EmptyBlock
              title={filtering ? 'No shifts match these filters' : 'No shifts yet'}
              description={
                filtering
                  ? 'Try clearing a filter to see more shifts.'
                  : show === 'completed'
                  ? 'Finished collection tasks will show up here.'
                  : 'An administrator has not published any open shifts for this period yet.'
              }
            />
          }
        >
          <Stack spacing={3}>
            {days.map(({ day, slots }) => (
              <Box key={day}>
                <Stack direction="row" spacing={1.5} sx={{ alignItems: 'baseline', mb: 1.5 }}>
                  <Typography variant="h6" component="h2">
                    {day === 'needs-time' ? 'Needs a time' : dayjs(day).format('dddd, MMM D')}
                  </Typography>
                  {day !== 'needs-time' && dayjs(day).isSame(dayjs(), 'day') ? (
                    <Chip label="Today" size="small" color="primary" />
                  ) : null}
                </Stack>

                <Grid container spacing={2}>
                  {slots.map((slot) => (
                    <Grid size={{ xs: 12, sm: 6, md: 4 }} key={slot.SlotID}>
                      <SlotCard
                        slot={slot}
                        canClaim={canClaim && show !== 'completed'}
                        canManage={canManage}
                        onComplete={complete.execute}
                        onDelete={remove.execute}
                        onClaim={claim.execute}
                        onRelease={release.execute}
                        onPickTime={setPicking}
                        pending={claim.pending || release.pending || pick.pending || remove.pending || complete.pending}
                      />
                    </Grid>
                  ))}
                </Grid>
              </Box>
            ))}
          </Stack>
        </AsyncBlock>
      </Box>

      <TimePickerDialog
        open={Boolean(picking)}
        slot={picking}
        pending={pick.pending}
        error={pick.error}
        onClose={() => setPicking(null)}
        onPick={(window) => pick.execute(window)}
      />
    </Box>
  );
}
