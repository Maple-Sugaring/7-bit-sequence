import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import FormControlLabel from '@mui/material/FormControlLabel';
import LinearProgress from '@mui/material/LinearProgress';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Step from '@mui/material/Step';
import StepLabel from '@mui/material/StepLabel';
import Stepper from '@mui/material/Stepper';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import { PageHeader } from '../components/common/PageHeader';
import { eraseHeltec, flashHeltec } from '../hardware/heltecFlash';
import { useGateways } from '../services/hooks';
import { useAction } from '../services/hooks/useAsync';
import { createGateway, createNode } from '../services/nodeService';

const STANDS = ['Alumni House', 'Chabad House', 'Red Barn'];
const ADD_STEPS = ['Check the gear', 'Name the tree', 'Place it', 'Flash the board'];

const emptyDraft = () => ({
  ready: false,
  GatewayID: '',
  Node_Name: '',
  Stand: STANDS[0],
  Tare_Weight: '2.5',
  Barcode_ID: '',
  Tree_Species: 'Sugar Maple',
  Rf_Tag: '',
  Notes: '',
  Latitude: '',
  Longitude: '',
});

function serialAvailable() {
  return typeof navigator !== 'undefined' && 'serial' in navigator;
}

export function DeployPage() {
  const navigate = useNavigate();
  const gateways = useGateways();
  const [gatewayDraft, setGatewayDraft] = useState({ Gateway_Code: '', Gateway_Name: '' });
  const [gatewaySaved, setGatewaySaved] = useState(null);
  const [mode, setMode] = useState('add');
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState(emptyDraft);
  const [created, setCreated] = useState(null);
  const [status, setStatus] = useState('');
  const [progress, setProgress] = useState(null);
  const [flashing, setFlashing] = useState(false);
  const [notice, setNotice] = useState('');
  const [cleared, setCleared] = useState(false);

  const save = useAction((body) => createNode(body));
  const saveGateway = useAction(async (body) => {
    const createdGateway = await createGateway(body);
    await gateways.refresh();
    return createdGateway;
  });

  const set = (field) => (event) => {
    const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
    setDraft((current) => ({ ...current, [field]: value }));
  };

  const useMyLocation = () => {
    if (!navigator.geolocation) {
      setNotice('This browser cannot read a location. Type the latitude and longitude.');
      return;
    }
    setNotice('');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setDraft((current) => ({
          ...current,
          Latitude: position.coords.latitude.toFixed(6),
          Longitude: position.coords.longitude.toFixed(6),
        }));
      },
      () => setNotice('Location was blocked. Stand at the tree and allow location, or type the coordinates.'),
      { enableHighAccuracy: true, timeout: 12000 },
    );
  };

  const register = async () => {
    setNotice('');
    const result = await save.execute({
      Node_Name: draft.Node_Name.trim(),
      Stand: draft.Stand,
      GatewayID: draft.GatewayID ? Number(draft.GatewayID) : undefined,
      Latitude: Number(draft.Latitude),
      Longitude: Number(draft.Longitude),
      Tare_Weight: draft.Tare_Weight === '' ? undefined : Number(draft.Tare_Weight),
      Barcode_ID: draft.Barcode_ID.trim() || undefined,
      Tree_Species: draft.Tree_Species.trim() || undefined,
      Rf_Tag: draft.Rf_Tag.trim() || undefined,
      Notes: draft.Notes.trim() || undefined,
    });
    if (!result.ok) return;
    setCreated(result.data);
    setStep(3);
  };

  const connectAndFlash = async (command) => {
    if (!serialAvailable()) {
      setNotice('This browser cannot flash over USB. Use Chrome or Edge on a laptop or Android phone.');
      return false;
    }
    setNotice('');
    try {
      const port = await navigator.serial.requestPort();
      setStatus('Starting…');
      setProgress(0);
      setFlashing(true);
      await flashHeltec(port, command, ({ message, progress: next }) => {
        setStatus(message);
        setProgress(next);
      });
    } catch (error) {
      if (error?.name === 'NotFoundError') return false;
      setNotice(error?.message || 'The board did not flash. Hold the PRG button, tap reset, and try again.');
      return false;
    } finally {
      setFlashing(false);
    }
    return true;
  };

  const clearFlash = async () => {
    if (!serialAvailable()) {
      setNotice('This browser cannot clear flash over USB. Use Chrome or Edge on a laptop or Android phone.');
      return;
    }
    setNotice('');
    setCleared(false);
    try {
      const port = await navigator.serial.requestPort();
      setStatus('Starting…');
      setProgress(null);
      setFlashing(true);
      await eraseHeltec(port, ({ message, progress: next }) => {
        setStatus(message);
        setProgress(next);
      });
      setCleared(true);
    } catch (error) {
      if (error?.name === 'NotFoundError') return;
      setNotice(error?.message || 'The board did not erase. Hold the PRG button, tap reset, and try again.');
    } finally {
      setFlashing(false);
    }
  };

  const lat = Number(draft.Latitude);
  const lon = Number(draft.Longitude);
  const placed = Number.isFinite(lat) && Number.isFinite(lon) && draft.Latitude !== '' && draft.Longitude !== '';
  const mapSrc = placed
    ? `https://www.openstreetmap.org/export/embed.html?bbox=${lon - 0.004}%2C${lat - 0.003}%2C${lon + 0.004}%2C${lat + 0.003}&layer=mapnik&marker=${lat}%2C${lon}`
    : '';

  return (
    <Box sx={{ maxWidth: 560, mx: 'auto', pb: 4 }}>
      <PageHeader title="Deploy" />
      <Typography color="text.secondary" sx={{ mt: -1, mb: 2 }}>
        For an admin or the service account, after the load cell, amplifier, and enclosure are already on the board.
      </Typography>

      {flashing ? null : (
      <ToggleButtonGroup
        exclusive
        fullWidth
        value={mode}
        onChange={(_event, next) => {
          if (!next) return;
          setMode(next);
          setStep(0);
          setNotice('');
          setStatus('');
          setCreated(null);
          setCleared(false);
        }}
        sx={{ mb: 2 }}
      >
        <ToggleButton value="add">Add a node</ToggleButton>
        <ToggleButton value="gateway">Add a gateway</ToggleButton>
        <ToggleButton value="remove">Clear flash</ToggleButton>
      </ToggleButtonGroup>
      )}

      {notice ? (
        <Alert severity="warning" sx={{ mb: 2 }} onClose={() => setNotice('')}>
          {notice}
        </Alert>
      ) : null}
      {save.error ? <Alert severity="error" sx={{ mb: 2 }}>{save.error}</Alert> : null}
      {saveGateway.error ? <Alert severity="error" sx={{ mb: 2 }}>{saveGateway.error}</Alert> : null}

      {mode === 'gateway' ? (
        <Card>
          <CardContent>
            <Stack spacing={2}>
              <Typography variant="h6" component="h2">Add a gateway</Typography>
              <Typography variant="body2" color="text.secondary">
                This is the Raspberry Pi that relays the Heltec radios. The code must match GATEWAY_CODE on that Pi.
              </Typography>
              <TextField
                label="Gateway code"
                value={gatewayDraft.Gateway_Code}
                onChange={(event) => setGatewayDraft((prev) => ({ ...prev, Gateway_Code: event.target.value }))}
                placeholder="GW-ALUMNI"
                helperText="Letters, numbers, dashes, or underscores."
                fullWidth
              />
              <TextField
                label="Display name"
                value={gatewayDraft.Gateway_Name}
                onChange={(event) => setGatewayDraft((prev) => ({ ...prev, Gateway_Name: event.target.value }))}
                placeholder="Alumni House Pi"
                fullWidth
              />
              <Button
                variant="contained"
                size="large"
                disabled={saveGateway.pending || !gatewayDraft.Gateway_Code.trim() || !gatewayDraft.Gateway_Name.trim()}
                onClick={async () => {
                  const result = await saveGateway.execute({
                    Gateway_Code: gatewayDraft.Gateway_Code.trim(),
                    Gateway_Name: gatewayDraft.Gateway_Name.trim(),
                  });
                  if (!result.ok) return;
                  setGatewaySaved(result.data);
                  setGatewayDraft({ Gateway_Code: '', Gateway_Name: '' });
                }}
              >
                Save gateway
              </Button>
              {gatewaySaved ? (
                <Alert severity="success">
                  {gatewaySaved.Gateway_Name} is registered as {gatewaySaved.Gateway_Code}. It shows online after the Pi checks in.
                </Alert>
              ) : null}
              {(gateways.data ?? []).length ? (
                <Stack spacing={0.5}>
                  <Typography variant="overline">Already registered</Typography>
                  {(gateways.data ?? []).map((gateway) => (
                    <Typography key={gateway.GatewayID} variant="body2">
                      {gateway.Gateway_Name}
                      {gateway.Gateway_Code ? ` · ${gateway.Gateway_Code}` : ''} · {gateway.Status}
                    </Typography>
                  ))}
                </Stack>
              ) : null}
            </Stack>
          </CardContent>
        </Card>
      ) : null}

      {mode === 'add' ? (
        <>
          {flashing ? null : (
          <Stepper activeStep={step} alternativeLabel sx={{ mb: 2 }}>
            {ADD_STEPS.map((label) => (
              <Step key={label}>
                <StepLabel>{label}</StepLabel>
              </Step>
            ))}
          </Stepper>
          )}

          {step === 0 ? (
            <Card>
              <CardContent>
                <Stack spacing={2}>
                  <Typography variant="h6" component="h2">The board is already built</Typography>
                  <Typography>
                    The Heltec is in its enclosure, with the load cell and the amplifier connected. This step only names the tree, marks it on the map, and loads the field firmware.
                  </Typography>
                  <FormControlLabel
                    control={<Switch checked={draft.ready} onChange={set('ready')} />}
                    label="Load cell, amplifier, and enclosure are connected"
                  />
                  <Button variant="contained" size="large" disabled={!draft.ready} onClick={() => setStep(1)}>
                    Next
                  </Button>
                </Stack>
              </CardContent>
            </Card>
          ) : null}

          {step === 1 ? (
            <Card>
              <CardContent>
                <Stack spacing={2}>
                  <TextField label="Tree name" value={draft.Node_Name} onChange={set('Node_Name')} required fullWidth />
                  <TextField
                    select
                    label="Gateway"
                    value={draft.GatewayID}
                    onChange={set('GatewayID')}
                    helperText={(gateways.data ?? []).length ? 'The Pi this tree reports through.' : 'Add a gateway before this node can check in.'}
                    fullWidth
                  >
                    {(gateways.data ?? []).map((gateway) => (
                      <MenuItem key={gateway.GatewayID} value={String(gateway.GatewayID)}>
                        {gateway.Gateway_Name}
                        {gateway.Gateway_Code ? ` (${gateway.Gateway_Code})` : ''}
                      </MenuItem>
                    ))}
                  </TextField>
                  <TextField select label="Stand" value={draft.Stand} onChange={set('Stand')} fullWidth>
                    {STANDS.map((stand) => (
                      <MenuItem key={stand} value={stand}>{stand}</MenuItem>
                    ))}
                  </TextField>
                  <TextField label="Empty bucket weight (lb)" type="number" value={draft.Tare_Weight} onChange={set('Tare_Weight')} fullWidth />
                  <TextField label="Bucket barcode" value={draft.Barcode_ID} onChange={set('Barcode_ID')} placeholder="Filled in if you leave this blank" fullWidth />
                  <TextField label="Tree species" value={draft.Tree_Species} onChange={set('Tree_Species')} fullWidth />
                  <TextField
                    label="RF tag"
                    value={draft.Rf_Tag}
                    onChange={set('Rf_Tag')}
                    helperText="Optional. Tags are not on the trees yet. Leave this blank until they are."
                    fullWidth
                  />
                  <TextField label="Install notes" value={draft.Notes} onChange={set('Notes')} multiline minRows={2} fullWidth />
                  <Stack direction="row" spacing={1}>
                    <Button onClick={() => setStep(0)}>Back</Button>
                    <Button variant="contained" size="large" disabled={!draft.Node_Name.trim()} onClick={() => setStep(2)} sx={{ flexGrow: 1 }}>
                      Next
                    </Button>
                  </Stack>
                </Stack>
              </CardContent>
            </Card>
          ) : null}

          {step === 2 ? (
            <Card>
              <CardContent>
                <Stack spacing={2}>
                  <Typography>Stand at the tree and use this phone's location, then check the pin.</Typography>
                  <Button variant="outlined" size="large" onClick={useMyLocation}>Use this phone's location</Button>
                  <Stack direction="row" spacing={1}>
                    <TextField label="Latitude" value={draft.Latitude} onChange={set('Latitude')} fullWidth />
                    <TextField label="Longitude" value={draft.Longitude} onChange={set('Longitude')} fullWidth />
                  </Stack>
                  {placed ? (
                    <Box
                      component="iframe"
                      title="Where this node will sit"
                      src={mapSrc}
                      sx={{ width: '100%', height: 240, border: 0, borderRadius: 1 }}
                    />
                  ) : null}
                  <Stack direction="row" spacing={1}>
                    <Button onClick={() => setStep(1)}>Back</Button>
                    <Button variant="contained" size="large" disabled={!placed || save.pending} onClick={register} sx={{ flexGrow: 1 }}>
                      Save and flash
                    </Button>
                  </Stack>
                </Stack>
              </CardContent>
            </Card>
          ) : null}

          {flashing ? (
            <Card>
              <CardContent>
                <Stack spacing={2} sx={{ py: 2 }}>
                  <Typography variant="h5" component="h2">
                    Flashing {created?.Node_Code ?? 'the board'}
                  </Typography>
                  <Typography color="text.secondary">
                    Keep this tab open and leave the USB cable plugged in.
                  </Typography>
                  <LinearProgress
                    variant={progress == null ? 'indeterminate' : 'determinate'}
                    value={progress ?? 0}
                    aria-label="Flash progress"
                    sx={{ height: 10, borderRadius: 999 }}
                  />
                  <Typography variant="body2">{status || 'Starting…'}</Typography>
                </Stack>
              </CardContent>
            </Card>
          ) : null}

          {step === 3 && created && !flashing ? (
            <Card>
              <CardContent>
                <Stack spacing={2}>
                  <Typography variant="h6" component="h2">{created.Node_Name}</Typography>
                  <Typography>
                    This board will be {created.Node_Code}. That code is written into the firmware before it is flashed. When the Heltec starts, the screen shows {created.Node_Code}.
                  </Typography>
                  {!serialAvailable() ? (
                    <Alert severity="info">
                      USB flashing needs Chrome or Edge on this computer. The node is already saved, so you can open Deploy here again from a laptop.
                    </Alert>
                  ) : null}
                  {status ? <Alert severity="info">{status}</Alert> : null}
                  <Button
                    variant="contained"
                    size="large"
                    disabled={!serialAvailable()}
                    onClick={() => connectAndFlash(created.Node_Code)}
                  >
                    Flash
                  </Button>
                  <Button onClick={() => navigate(`/nodes/${created.NodeID}`)}>Done, skip flashing</Button>
                </Stack>
              </CardContent>
            </Card>
          ) : null}
        </>
      ) : null}

      {mode === 'remove' ? (
        <Card>
          <CardContent>
            <Stack spacing={2}>
              {flashing ? (
                <>
                  <Typography variant="h5" component="h2">Clearing flash</Typography>
                  <Typography color="text.secondary">
                    Keep this tab open and leave the USB cable plugged in. This can take a minute.
                  </Typography>
                  <LinearProgress
                    variant={progress == null ? 'indeterminate' : 'determinate'}
                    value={progress ?? 0}
                    aria-label="Erase progress"
                    sx={{ height: 10, borderRadius: 999 }}
                  />
                  <Typography variant="body2">{status || 'Starting…'}</Typography>
                </>
              ) : cleared ? (
                <>
                  <Alert severity="success">The Heltec flash is clear. Firmware and the stored tree code are gone.</Alert>
                  <Typography>
                    Use Add a node to load field firmware before this board goes back out.
                  </Typography>
                  <Button variant="contained" onClick={() => { setCleared(false); setStatus(''); }}>Clear another board</Button>
                </>
              ) : (
                <>
                  <Typography variant="h6" component="h2">Clear the Heltec flash</Typography>
                  <Typography>
                    Plug in the board. This erases the ESP32 flash, including the firmware and the tree code stored on it. The node stays in the app.
                  </Typography>
                  {!serialAvailable() ? (
                    <Alert severity="info">
                      USB erase needs Chrome or Edge on this computer.
                    </Alert>
                  ) : null}
                  <Button
                    variant="contained"
                    color="error"
                    size="large"
                    disabled={!serialAvailable()}
                    onClick={clearFlash}
                  >
                    Clear flash
                  </Button>
                </>
              )}
            </Stack>
          </CardContent>
        </Card>
      ) : null}
    </Box>
  );
}
