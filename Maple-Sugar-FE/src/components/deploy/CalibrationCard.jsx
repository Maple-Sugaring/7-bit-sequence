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
import { calibrationCheck, commandState, packetIntervalLabel, testWeightError } from '../../business/calibration';
import { dateTime } from '../common/format';
import { useAction, useAutoRefresh, useCalibration } from '../../services/hooks';
import { calibrateNode, tareNode } from '../../services/nodeService';

const POLL_MS = 3000;
const ACK_CLOCK_SLACK_MS = 3000;

/** Which step the wizard is on, read from the newest command. */
function stepFor(command, restartedAfter) {
  if (!command || command.CommandID === restartedAfter) return 0;
  if (command.Action === 'tare') return command.Status === 'done' ? 1 : 0;
  if (command.Action === 'calibrate') return command.Status === 'done' ? 2 : 1;
  return 0;
}

/**
 * Tare and test-weight calibration over LoRa. Each request rides to the node on
 * its next packet, so the card polls until the node answers.
 */
export function CalibrationCard({ node, onSettled }) {
  const nodeId = node?.NodeID;
  const calibration = useCalibration(nodeId);
  const command = calibration.data?.Command ?? null;
  const last = calibration.data?.Last_Calibration ?? null;
  const state = commandState(command);
  const [pounds, setPounds] = useState('');
  const [restartedAfter, setRestartedAfter] = useState(null);
  const step = stepFor(command, restartedAfter);

  useAutoRefresh(calibration.refresh, POLL_MS, { enabled: state.open });

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

  const weightError = pounds === '' ? null : testWeightError(pounds);
  // The packet that carries the ack already weighs with the new scale, and the
  // Pi stamps it a moment before the API settles the command.
  const fresh =
    command?.Completed_At &&
    node?.Recorded_At &&
    Date.parse(node.Recorded_At) >= Date.parse(command.Completed_At) - ACK_CLOCK_SLACK_MS;
  const check = fresh && command?.Action === 'calibrate' ? calibrationCheck(node.Weight, command.Pounds) : null;
  const intervalLabel = packetIntervalLabel(node?.Report_Interval_Seconds).toLowerCase();

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
          {last
            ? `Last calibrated ${dateTime(last.Completed_At)} with ${last.Pounds} lb${last.Counts_Per_Lb ? ` · ${Math.round(last.Counts_Per_Lb)} counts/lb` : ''}.`
            : 'Not calibrated from the app yet. The node uses its datasheet value.'}
        </Typography>

        {calibration.error ? <Alert severity="error" sx={{ mb: 2 }}>{calibration.error}</Alert> : null}
        {send.error ? <Alert severity="error" sx={{ mb: 2 }}>{send.error}</Alert> : null}
        {command && (state.open || command.Status === 'failed') ? (
          <Alert severity={state.severity} sx={{ mb: 2 }}>
            {state.label}
            {state.open ? <LinearProgress sx={{ mt: 1 }} /> : null}
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
                disabled={send.pending || state.open}
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
                  disabled={send.pending || state.open || pounds === '' || Boolean(weightError)}
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
              {check ? (
                <Alert severity={check.ok ? 'success' : 'warning'} sx={{ mb: 1.5 }}>
                  The platform reads {Number(node.Weight).toFixed(2)} lb for a {command.Pounds} lb test weight
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
