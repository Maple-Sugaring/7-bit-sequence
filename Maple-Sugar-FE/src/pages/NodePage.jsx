import { useCallback, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Grid from '@mui/material/Grid';
import { MeterBar } from '../components/common/MeterBar';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';
import dayjs from 'dayjs';
import { estimatedSyrupGallons } from '../business/sugarContent';
import { Capability } from '../business/permissions';
import { LIVE_FROM, LIVE_TO, TIME_UNITS, bucketGallons, bucketPercent, dailyWeightRows } from '../business/liveWeight';
import { ChartCard } from '../components/charts/ChartCard';
import { WeightChart } from '../components/charts/SeriesChart';
import { PageHeader } from '../components/common/PageHeader';
import { dateTime } from '../components/common/format';
import { useAuth } from '../context/auth';
import { useBush, useReadings } from '../services/hooks';
import { useAction, useAsync } from '../services/hooks/useAsync';
import { getUsers } from '../services/adminService';
import { flagNode } from '../services/alertService';
import { runNodeAction } from '../services/nodeService';
import { assignShift, SHIFT_TASKS } from '../services/scheduleService';

const STATUS = {
  0: { label: 'Offline', color: 'error' },
  1: { label: 'Online', color: 'success' },
  2: { label: 'Degraded', color: 'warning' },
  3: { label: 'Maintenance', color: 'info' },
};

export function NodePage() {
  const { nodeId } = useParams();
  const navigate = useNavigate();
  const { can } = useAuth();
  const bush = useBush();
  const canSchedule = can(Capability.MANAGE_SCHEDULE);
  const people = useAsync(useCallback(() => getUsers(), []), { enabled: canSchedule, initialData: null });
  const node = (bush.data ?? []).find((item) => item.NodeID === Number(nodeId));
  const [notes, setNotes] = useState('');
  const [unit, setUnit] = useState('day');
  const [shift, setShift] = useState(() => {
    const start = dayjs().add(1, 'day').hour(9).minute(0).second(0);
    return { Task: SHIFT_TASKS[0], UserID: '', Starts_At: start, Ends_At: start.add(2, 'hour'), Notes: '' };
  });

  const history = useReadings({
    nodeId: Number(nodeId),
    from: LIVE_FROM,
    to: LIVE_TO,
  });
  const action = useAction(async (name) => {
    await runNodeAction(Number(nodeId), { Action: name, Notes: notes });
    await bush.refresh();
  });
  const report = useAction(async (type) => {
    await flagNode(Number(nodeId), {
      type,
      description: notes.trim() || (type === 'Spill' ? 'Bucket spilled. Needs a manual check.' : 'Ice in the bucket. Weight may sit above 10 gallons.'),
    });
  });
  const createShift = useAction(async () => {
    await assignShift({
      Task: shift.Task,
      UserID: shift.UserID,
      BucketIDs: [node.BucketID],
      Starts_At: shift.Starts_At.toISOString(),
      Ends_At: shift.Ends_At.toISOString(),
      Notes: shift.Notes || `Assigned from ${node.Node_Name}`,
    });
  });

  const status = STATUS[node?.Status_Code] ?? STATUS[1];
  const gallons = node ? bucketGallons(node.Weight, node.Tare_Weight ?? 0) : null;
  const fill = node ? bucketPercent(node.Weight, node.Tare_Weight ?? 0) : null;
  const weights = dailyWeightRows(history.data ?? [], { nodeIds: [Number(nodeId)], unit });

  if (!bush.loading && !node) {
    return (
      <>
        <PageHeader title="Tree" />
        <Alert severity="warning">That tree is not one of the taps we are watching.</Alert>
        <Button sx={{ mt: 2 }} onClick={() => navigate('/dashboard')}>
          Back to the bush
        </Button>
      </>
    );
  }

  return (
    <>
      <PageHeader title={node?.Node_Name ?? 'Tree'} />
      <Stack direction="row" spacing={1} sx={{ mb: 2, justifyContent: 'center', flexWrap: 'wrap' }}>
        <Chip label={node?.Stand} />
        <Chip label={status.label} color={status.color} />
        {node?.Ice_Present ? <Chip label="Ice in the bucket" color="info" /> : null}
        <Chip label={node?.Barcode_ID ?? 'No bucket'} variant="outlined" />
      </Stack>

      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Card>
            <CardContent>
              <Typography variant="overline">Battery</Typography>
              <Typography variant="h4">{node?.Battery_Percent == null ? '—' : `${Math.round(node.Battery_Percent)}%`}</Typography>
              <MeterBar percent={node?.Battery_Percent ?? 0} color={node?.Battery_Percent < 20 ? '#c62828' : '#2e7d32'} />
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                Signal {node?.Signal_Rssi ?? '—'} dBm · last seen {dateTime(node?.Last_Seen)}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <Card>
            <CardContent>
              <Typography variant="overline">Bucket</Typography>
              <Typography variant="h4">
                {gallons == null ? '—' : `${gallons.toFixed(1)} gal · ${Number(node.Weight).toFixed(1)} lb`}
              </Typography>
              <MeterBar percent={fill ?? 0} color={(fill ?? 0) >= 90 ? '#ed6c02' : '#F76902'} />
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                {gallons == null
                  ? 'No weight yet'
                  : gallons > 10
                    ? `${gallons.toFixed(1)} gal · past 10 gal because the sap froze`
                    : `${gallons.toFixed(1)} of 10 gal`}
                {gallons == null
                  ? ''
                  : ` · ${estimatedSyrupGallons(gallons, node?.Sugar_Percent).toFixed(2)} gal syrup`}
                {gallons == null ? '' : node?.Sugar_Percent != null ? ` · ${node.Sugar_Percent}% sugar` : ' · 40:1'}
                {node?.Recorded_At ? ` · ${dateTime(node.Recorded_At)}` : ''}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Box sx={{ mb: 2 }}>
        <ChartCard
          title="2026 weight"
          description="Gallons and pounds. The axis starts at 0 and grows past 10 gallons if the sap freezes."
          height={320}
          loading={history.loading}
          isEmpty={weights.rows.length === 0}
          action={
            <Stack direction="row" spacing={1}>
              {TIME_UNITS.map(([id, label]) => (
                <Button key={id} size="small" variant={unit === id ? 'contained' : 'text'} onClick={() => setUnit(id)}>
                  {label}
                </Button>
              ))}
            </Stack>
          }
        >
          <WeightChart rows={weights.rows} series={weights.series} unit={unit} />
        </ChartCard>
      </Box>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Card>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 1 }}>
                At the tree
              </Typography>
              <TextField
                label="Note"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                fullWidth
                sx={{ mb: 2 }}
              />
              {action.error || report.error ? (
                <Alert severity="error" sx={{ mb: 2 }}>
                  {action.error ?? report.error}
                </Alert>
              ) : null}
              <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
                <Button variant="contained" disabled={action.pending} onClick={() => action.execute('collect')}>
                  Collect bucket
                </Button>
                <Button variant="outlined" disabled={action.pending} onClick={() => action.execute('maintenance')}>
                  Maintenance
                </Button>
                <Button variant="outlined" disabled={action.pending} onClick={() => action.execute('online')}>
                  Mark online
                </Button>
                <Button variant="outlined" color="warning" disabled={report.pending} onClick={() => report.execute('Spill')}>
                  Report a spill
                </Button>
                <Button variant="outlined" color="info" disabled={report.pending} onClick={() => report.execute('Freezing')}>
                  Report freezing
                </Button>
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        {can(Capability.MANAGE_SCHEDULE) && node?.BucketID ? (
          <Grid size={{ xs: 12, md: 6 }}>
            <Card>
              <CardContent>
                <Typography variant="h6" sx={{ mb: 1 }}>
                  Create a shift
                </Typography>
                <Stack spacing={2}>
                  <TextField
                    select
                    label="Task"
                    value={shift.Task}
                    onChange={(event) => setShift((prev) => ({ ...prev, Task: event.target.value }))}
                    fullWidth
                  >
                    {SHIFT_TASKS.map((task) => (
                      <MenuItem key={task} value={task}>
                        {task}
                      </MenuItem>
                    ))}
                  </TextField>
                  <TextField
                    select
                    label="Student"
                    value={shift.UserID}
                    onChange={(event) => setShift((prev) => ({ ...prev, UserID: event.target.value }))}
                    fullWidth
                  >
                    {(people.data?.users ?? [])
                      .filter((user) => user.usable)
                      .map((user) => (
                        <MenuItem key={user.UserID} value={user.UserID}>
                          {user.fullName}
                        </MenuItem>
                      ))}
                  </TextField>
                  <DateTimePicker
                    label="Starts"
                    value={shift.Starts_At}
                    onChange={(value) =>
                      setShift((prev) => ({ ...prev, Starts_At: value, Ends_At: value ? value.add(2, 'hour') : prev.Ends_At }))
                    }
                    slotProps={{ textField: { fullWidth: true } }}
                  />
                  <DateTimePicker
                    label="Ends"
                    value={shift.Ends_At}
                    onChange={(value) => setShift((prev) => ({ ...prev, Ends_At: value }))}
                    slotProps={{ textField: { fullWidth: true } }}
                  />
                  {createShift.error ? <Alert severity="error">{createShift.error}</Alert> : null}
                  {createShift.pending ? null : null}
                  <Button
                    variant="contained"
                    disabled={createShift.pending || !shift.UserID}
                    onClick={() => createShift.execute()}
                  >
                    Assign this bucket
                  </Button>
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        ) : null}
      </Grid>
    </>
  );
}
