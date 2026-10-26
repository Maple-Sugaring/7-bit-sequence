import { useEffect, useState } from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import LinearProgress from '@mui/material/LinearProgress';
import Stack from '@mui/material/Stack';
import Step from '@mui/material/Step';
import StepContent from '@mui/material/StepContent';
import StepLabel from '@mui/material/StepLabel';
import Stepper from '@mui/material/Stepper';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import {
  calibrationCheck,
  commandState,
  liveStatus,
  packetIntervalLabel,
  readingAfterAck,
  testWeightError,
  waitingStatus,
} from '../../business/calibration';
import { dateTime } from '../common/format';
import { useAction, useAutoRefresh, useCalibration } from '../../services/hooks';
import { calibrateNode, cancelCalibration, tareNode } from '../../services/nodeService';

const POLL_MS = 3000;

/** Which step the wizard is on, read from the newest command. */
function stepFor(command, restartedAfter) {
  if (!command || command.CommandID === restartedAfter) return 0;
  if (command.Action === 'tare') return command.Status === 'done' ? 1 : 0;
  if (command.Action === 'calibrate') return command.Status === 'done' ? 2 : 1;
  return 0;
}

/** The scale factor line. Every ack carries the node's counts/lb, so it also covers a USB calibration. */
function scaleLine(last, scale) {
  const reported = scale?.Counts_Per_Lb != null ? `The node reports ${Math.round(scale.Counts_Per_Lb)} counts/lb` : null;
  if (last && reported) return `Last calibrated ${dateTime(last.Completed_At)} with ${last.Pounds} lb. ${reported}.`;
  if (last) {
    return `Last calibrated ${dateTime(last.Completed_At)} with ${last.Pounds} lb${last.Counts_Per_Lb ? ` · ${Math.round(last.Counts_Per_Lb)} counts/lb` : ''}.`;
  }
  if (reported) return `${reported}. Not calibrated from the app yet.`;
  return 'Not calibrated from the app yet. The node uses its datasheet value.';
}

/**
 * Tare and test-weight calibration over LoRa. Each request rides to the node on
 * its next packet, so the card polls quickly until the node answers, and about
 * once a packet otherwise so the live weight keeps up with the platform.
 */
export function CalibrationCard({ node, onSettled }) {
  const nodeId = node?.NodeID;
  const calibration = useCalibration(nodeId);
  const command = calibration.data?.Command ?? null;
  const last = calibration.data?.Last_Calibration ?? null;
  const live = calibration.data?.Live ?? null;
  const intervalSeconds = calibration.data?.Report_Interval_Seconds ?? node?.Report_Interval_Seconds;
  const state = commandState(command);
  const status = liveStatus(live);
  const blocked = Boolean(status.fault?.blocksCommands);
  const waiting = waitingStatus(command, intervalSeconds);
  const [pounds, setPounds] = useState('');
  const [restartedAfter, setRestartedAfter] = useState(null);
  const step = stepFor(command, restartedAfter);

  const idleMs = Math.min(60, Math.max(5, intervalSeconds ?? 900)) * 1000;
  useAutoRefresh(calibration.refresh, state.open ? POLL_MS : idleMs);

  // A settled command changed what the node reports, so the page refetches.
  const settledId = command && !state.open ? `${command.CommandID}:${command.Status}` : null;
  useEffect(() => {
    if (settledId) onSettled?.();
  }, [settledId, onSettled]);

  const send = useAction(async (action) => {
    if (action === 'tare') await tareNode(nodeId);
    else await calibrateNode(nodeId, pounds);
    calibration.refresh();
  });

  const cancel = useAction(async () => {
    await cancelCalibration(nodeId);
    calibration.refresh();
  });

  const weightError = pounds === '' ? null : testWeightError(pounds);
  // The packet that carries the ack already weighs with the new scale; anything
  // older was weighed before the calibration and says nothing about it.
  const reading = command?.Action === 'calibrate' ? readingAfterAck(command, live) : null;
  const check = reading ? calibrationCheck(reading.Weight, command.Pounds) : null;
  const intervalLabel = packetIntervalLabel(intervalSeconds).toLowerCase();

  return (
    <Card sx={{ mb: 2 }}>
      <CardContent>
        <Typography variant="h6" component="h2">
          Calibrate the scale
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Over the radio, no cable. Each step reaches the node on its next packet ({intervalLabel}).
        </Typography>
        <Typography variant="body2" sx={{ mb: 2 }}>
          {scaleLine(last, calibration.data?.Last_Scale ?? null)}
        </Typography>

        {calibration.error ? <Alert severity="error" sx={{ mb: 2 }}>{calibration.error}</Alert> : null}
        {send.error ? <Alert severity="error" sx={{ mb: 2 }}>{send.error}</Alert> : null}
        {cancel.error ? <Alert severity="error" sx={{ mb: 2 }}>{cancel.error}</Alert> : null}
        {status.fault ? (
          <Alert severity={status.fault.severity} sx={{ mb: 1 }}>
            {status.fault.text}
          </Alert>
        ) : null}
        {status.weight ? (
          <Typography variant="subtitle2" component="p" sx={{ mb: 2 }} aria-live="polite">
            {status.weight}
          </Typography>
        ) : null}
        {waiting ? (
          <Alert
            severity="info"
            sx={{ mb: 2 }}
            action={
              <Button color="inherit" size="small" disabled={cancel.pending} onClick={() => cancel.execute()}>
                Cancel
              </Button>
            }
          >
            <Typography variant="body2" component="div">
              {waiting.label}
            </Typography>
            <Typography variant="body2" component="div" sx={{ mt: 0.5 }}>
              {waiting.hint}
            </Typography>
            <LinearProgress sx={{ mt: 1 }} />
          </Alert>
        ) : command && (command.Status === 'failed' || command.Status === 'cancelled') ? (
          <Alert severity={state.severity} sx={{ mb: 2 }}>
            {state.label}
          </Alert>
        ) : null}

        <Stepper activeStep={step} orientation="vertical">
          <Step>
            <StepLabel>Empty the platform and tare</StepLabel>
            <StepContent>
              <Typography variant="body2" sx={{ mb: 1.5 }}>
                Take the bucket and anything else off the platform, then tare. The node sets this as 0 lb.
              </Typography>
              <Button
                variant="contained"
                disabled={send.pending || state.open || blocked}
                onClick={() => send.execute('tare')}
              >
                Tare
              </Button>
            </StepContent>
          </Step>
          <Step>
            <StepLabel>Place the test weight</StepLabel>
            <StepContent>
              <Typography variant="body2" sx={{ mb: 1.5 }}>
                Set a known weight in the middle of the platform and enter exactly what it weighs.
              </Typography>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ alignItems: { sm: 'flex-start' } }}>
                <TextField
                  label="Test weight (lb)"
                  type="number"
                  size="small"
                  value={pounds}
                  onChange={(event) => setPounds(event.target.value)}
                  error={Boolean(weightError)}
                  helperText={weightError ?? ' '}
                  slotProps={{ htmlInput: { min: 0.5, max: 400, step: 0.001 } }}
                />
                <Button
                  variant="contained"
                  disabled={send.pending || state.open || blocked || pounds === '' || Boolean(weightError)}
                  onClick={() => send.execute('calibrate')}
                >
                  Calibrate
                </Button>
                <Button disabled={send.pending || state.open} onClick={() => setRestartedAfter(command?.CommandID ?? null)}>
                  Tare again
                </Button>
              </Stack>
            </StepContent>
          </Step>
          <Step>
            <StepLabel>Check the reading</StepLabel>
            <StepContent>
              {check?.removed ? (
                <Alert severity="info" sx={{ mb: 1.5 }}>
                  The platform reads {Number(reading.Weight).toFixed(2)} lb, so the test weight is off. Put the{' '}
                  {command.Pounds} lb test weight back on to check the calibration.
                </Alert>
              ) : check ? (
                <Alert severity={check.ok ? 'success' : 'warning'} sx={{ mb: 1.5 }}>
                  The platform reads {Number(reading.Weight).toFixed(2)} lb for a {command.Pounds} lb test weight
                  {check.ok ? '. Calibration is good.' : ` (${check.off > 0 ? '+' : ''}${check.off.toFixed(2)} lb). Calibrate again.`}
                </Alert>
              ) : (
                <Alert severity="info" sx={{ mb: 1.5 }}>
                  Calibrated{command?.Counts_Per_Lb ? ` at ${Math.round(command.Counts_Per_Lb)} counts/lb` : ''}. Waiting for the
                  next reading to check it.
                  <LinearProgress sx={{ mt: 1 }} />
                </Alert>
              )}
              <Typography variant="body2" sx={{ mb: 1.5 }}>
                Take the test weight off and hang the bucket back on when you are done.
              </Typography>
              <Button onClick={() => setRestartedAfter(command?.CommandID ?? null)}>Start over</Button>
            </StepContent>
          </Step>
        </Stepper>
      </CardContent>
    </Card>
  );
}
