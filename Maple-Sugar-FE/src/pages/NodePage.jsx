import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Grid from '@mui/material/Grid';
import LinearProgress from '@mui/material/LinearProgress';
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
import { flashHeltec } from '../hardware/heltecFlash';
import { runNodeAction, setReportInterval, updateNodeDetails } from '../services/nodeService';
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
  const [minutes, setMinutes] = useState('15');
  const [intervalSaved, setIntervalSaved] = useState(false);
  const [edit, setEdit] = useState(null);
  const [flashing, setFlashing] = useState(false);
  const [flashStatus, setFlashStatus] = useState('');
  const [flashProgress, setFlashProgress] = useState(0);
  const canDeploy = can(Capability.DEPLOY_NODES);
  const [unit, setUnit] = useState('day');
  const [shift, setShift] = useState(() => {
    const start = dayjs().add(1, 'day').hour(9).minute(0).second(0);
    return { Task: SHIFT_TASKS[0], UserID: '', Starts_At: start, Ends_At: start.add(2, 'hour'), Notes: '' };
  });

  useEffect(() => {
    if (node?.Report_Interval_Seconds == null) return;
    setMinutes(String(Math.round(node.Report_Interval_Seconds / 60)));
  }, [node?.Report_Interval_Seconds]);

  useEffect(() => {
    if (!node) return;
    setEdit({
      Node_Name: node.Node_Name ?? '',
      Stand: node.Stand ?? '',
      Latitude: node.Location?.lat ?? '',
      Longitude: node.Location?.lon ?? '',
      Rf_Tag: node.Rf_Tag ?? '',
      Notes: node.Notes ?? '',
    });
  }, [node]);

  const history = useReadings({
    nodeId: Number(nodeId),
    from: LIVE_FROM,
    to: LIVE_TO,
  });
  const action = useAction(async (name) => {
    await runNodeAction(Number(nodeId), { Action: name, Notes: notes });
    await bush.refresh();
  });
  const saveDetails = useAction(async () => {
    await updateNodeDetails(Number(nodeId), {
      Node_Name: edit.Node_Name.trim(),
      Stand: edit.Stand.trim(),
      Latitude: Number(edit.Latitude),
      Longitude: Number(edit.Longitude),
      Rf_Tag: edit.Rf_Tag.trim(),
      Notes: edit.Notes.trim(),
    });
    await bush.refresh();
  });

  const pushFirmware = async () => {
    if (!node?.Node_Code || !navigator.serial) return;
    setFlashStatus('Starting…');
    setFlashProgress(0);
    setFlashing(true);
    try {
      const port = await navigator.serial.requestPort();
      await flashHeltec(port, node.Node_Code, ({ message, progress }) => {
        setFlashStatus(message);
        setFlashProgress(progress ?? 0);
      });
    } catch (error) {
      if (error?.name === 'NotFoundError') return;
      setFlashStatus(error?.message || 'The firmware did not reach the Heltec.');
    } finally {
      setFlashing(false);
    }
  };

  const interval = useAction(async () => {
    await setReportInterval(Number(nodeId), Number(minutes));
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

      {canDeploy && edit ? (
        <Card sx={{ mb: 2 }}>
          <CardContent>
            <Typography variant="h6" component="h2">Edit this node</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              {node?.Node_Code} is written into the firmware. Push firmware to put that code on the Heltec.
            </Typography>
            {flashing ? (
              <Stack spacing={1.5}>
                <LinearProgress variant="determinate" value={flashProgress ?? 0} sx={{ height: 10, borderRadius: 999 }} />
                <Typography variant="body2">{flashStatus || 'Flashing…'}</Typography>
              </Stack>
            ) : (
              <Stack spacing={2}>
                <TextField label="Tree name" value={edit.Node_Name} onChange={(event) => setEdit((prev) => ({ ...prev, Node_Name: event.target.value }))} fullWidth />
                <TextField label="Stand" value={edit.Stand} onChange={(event) => setEdit((prev) => ({ ...prev, Stand: event.target.value }))} fullWidth />
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                  <TextField label="Latitude" value={edit.Latitude} onChange={(event) => setEdit((prev) => ({ ...prev, Latitude: event.target.value }))} fullWidth />
                  <TextField label="Longitude" value={edit.Longitude} onChange={(event) => setEdit((prev) => ({ ...prev, Longitude: event.target.value }))} fullWidth />
                </Stack>
                <TextField label="RF tag" value={edit.Rf_Tag} onChange={(event) => setEdit((prev) => ({ ...prev, Rf_Tag: event.target.value }))} fullWidth />
                <TextField label="Notes" value={edit.Notes} onChange={(event) => setEdit((prev) => ({ ...prev, Notes: event.target.value }))} multiline minRows={2} fullWidth />
                {saveDetails.error ? <Alert severity="error">{saveDetails.error}</Alert> : null}
                {flashStatus && !flashing ? <Alert severity="info">{flashStatus}</Alert> : null}
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                  <Button variant="outlined" disabled={saveDetails.pending} onClick={() => saveDetails.execute()}>Save details</Button>
                  <Button variant="contained" disabled={!navigator.serial} onClick={pushFirmware}>Push firmware</Button>
                </Stack>
              </Stack>
            )}
          </CardContent>
        </Card>
      ) : null}

      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Typography variant="h6" component="h2">
            Packet interval
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            How often this node radios its weight. The board picks up a new interval the next time it checks in.
          </Typography>
          {canDeploy ? (
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ alignItems: { sm: 'center' } }}>
              <TextField
                label="Minutes between packets"
                type="number"
                value={minutes}
                onChange={(event) => {
                  setIntervalSaved(false);
                  setMinutes(event.target.value);
                }}
                helperText="From 1 minute to 1 day."
                sx={{ maxWidth: 280 }}
                slotProps={{ htmlInput: { min: 1, max: 1440, step: 1 } }}
              />
              <Button
                variant="contained"
                size="large"
                disabled={interval.pending || !Number(minutes)}
                onClick={async () => {
                  const result = await interval.execute();
                  setIntervalSaved(result.ok);
                }}
              >
                Save interval
              </Button>
            </Stack>
          ) : (
            <Typography>
              Every {node?.Report_Interval_Seconds == null ? '15' : Math.round(node.Report_Interval_Seconds / 60)} minutes.
            </Typography>
          )}
          {interval.error ? <Alert severity="error" sx={{ mt: 2 }}>{interval.error}</Alert> : null}
          {intervalSaved ? (
            <Alert severity="success" sx={{ mt: 2 }}>
              Saved. This node will use the new interval the next time it checks in.
            </Alert>
          ) : null}
        </CardContent>
      </Card>

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
