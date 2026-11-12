import { createContext, useContext } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import FormControlLabel from '@mui/material/FormControlLabel';
import LinearProgress from '@mui/material/LinearProgress';
import Stack from '@mui/material/Stack';
import Step from '@mui/material/Step';
import StepContent from '@mui/material/StepContent';
import StepLabel from '@mui/material/StepLabel';
import Stepper from '@mui/material/Stepper';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import AddIcon from '@mui/icons-material/Add';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined';
import MyLocationIcon from '@mui/icons-material/MyLocation';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import RouterOutlinedIcon from '@mui/icons-material/RouterOutlined';
import UsbIcon from '@mui/icons-material/Usb';
import tigerLogo from '../../assets/RITTigerTransparent.png';
import { can, Capability, ROLE_LABELS } from '../../business/permissions';
import { navItemsFor } from '../../routes/navigation';
import { gatewayAccents } from '../../theme/tokens';
import { NodeStatusChip } from '../common/NodeStatusChip';

/**
 * Practice screens for the Tutorials page. They reuse the components and
 * tokens of the real pages so they look like the app, but they are drawings:
 * the frame that holds them is inert, and only the highlighted spot responds
 * (TutorialsPage hit-tests clicks against it).
 */

const SpotContext = createContext(null);

/** A spot a step can point at. Highlighted when it is the current step's target. */
function Spot({ id, children, sx }) {
  const active = useContext(SpotContext) === id;
  return (
    <Box className="practice-spot" data-spot={id} data-active={active ? 'true' : undefined} sx={sx}>
      {children}
    </Box>
  );
}

function ReadOnlyField(props) {
  return <TextField size="small" fullWidth slotProps={{ input: { readOnly: true } }} {...props} />;
}

function PageTitle({ title, subtitle, actions }) {
  return (
    <Stack direction="row" spacing={2} sx={{ justifyContent: 'space-between', alignItems: 'flex-start', mb: 2, flexWrap: 'wrap' }} useFlexGap>
      <Box sx={{ minWidth: 0 }}>
        <Typography component="p" sx={{ fontSize: '1.6rem', fontWeight: 700, letterSpacing: '-0.5px', lineHeight: 1.2, mb: 0.5 }}>
          {title}
        </Typography>
        {subtitle ? <Typography variant="body2" color="text.secondary">{subtitle}</Typography> : null}
      </Box>
      {actions}
    </Stack>
  );
}

/** The app's top bar and sidebar around a practice page. */
function AppChrome({ role, current, children }) {
  const items = navItemsFor(role);
  return (
    <>
      <div className="practice-topbar">
        <img src={tigerLogo} alt="" width="28" height="28" />
        <span>Maple Sugaring</span>
      </div>
      <div className="practice-layout">
        <div className="practice-sidebar">
          <div className="practice-sidebar-heading">YOUR WORKSPACE <span>{ROLE_LABELS[role]}</span></div>
          {items.map(({ to, label, icon: Icon }) => (
            <div key={to} className="practice-nav" data-current={label === current ? 'true' : undefined}>
              <Icon fontSize="small" /><span>{label}</span>
            </div>
          ))}
        </div>
        <div className="practice-page">{children}</div>
      </div>
    </>
  );
}

/** Hardware screens: a plain panel with no app chrome. */
function Bench({ title, subtitle, children }) {
  return (
    <div className="practice-page">
      <PageTitle title={title} subtitle={subtitle} />
      {children}
    </div>
  );
}

function Board({ lines, prg = false, port = false }) {
  return (
    <div className="practice-board">
      <div className="practice-oled">
        {lines.map((line) => <div key={line}>{line}</div>)}
      </div>
      <Stack direction="row" spacing={1} sx={{ justifyContent: 'center' }}>
        {prg ? <Spot id="prg"><Button size="small" variant="outlined" tabIndex={-1}>PRG</Button></Spot> : <Button size="small" variant="outlined" tabIndex={-1}>PRG</Button>}
        <Button size="small" variant="outlined" tabIndex={-1}>RST</Button>
      </Stack>
      {port ? (
        <Spot id="port" sx={{ mt: 1 }}><div className="practice-port">Lithium battery port (underneath)</div></Spot>
      ) : (
        <div className="practice-port">Lithium battery port (underneath)</div>
      )}
    </div>
  );
}

function Terminal({ lines }) {
  return (
    <Spot id="terminal">
      <div className="practice-terminal">
        {lines.map(([kind, text]) => (
          <div key={text} className={kind === 'in' ? 'practice-terminal-in' : undefined}>{kind === 'in' ? `> ${text}` : text}</div>
        ))}
      </div>
    </Spot>
  );
}

// ---- UI: Deploy --------------------------------------------------------------

function DeployScreen() {
  return (
    <>
      <PageTitle
        title="Deploy"
        subtitle="Register a Pi gateway, then add, edit, flash, or remove Heltec nodes."
        actions={
          <Stack direction="row" spacing={1}>
            <Button variant="outlined" size="small" tabIndex={-1}>Register gateway</Button>
            <Spot id="add-node"><Button variant="contained" size="small" startIcon={<AddIcon />} tabIndex={-1}>Add node</Button></Spot>
          </Stack>
        }
      />
      <Card>
        <CardContent>
          <Typography variant="h6" component="p">Gateways</Typography>
          <Typography variant="body2" sx={{ mb: 1.5 }}>Nodes check in through these Raspberry Pis.</Typography>
          <Spot id="gateway">
            <Card variant="outlined" sx={{ borderLeft: `6px solid ${gatewayAccents[1]}` }}>
              <CardContent sx={{ '&:last-child': { pb: 2 } }}>
                <Stack direction="row" spacing={1.5} sx={{ alignItems: 'flex-start' }}>
                  <RouterOutlinedIcon color="info" />
                  <Box>
                    <Typography sx={{ fontWeight: 600 }}>Alumni House Gateway</Typography>
                    <Typography variant="caption" color="info.main" sx={{ fontWeight: 600 }}>GW-ALUMNI</Typography>
                    <Typography variant="body2" color="success.main" sx={{ fontWeight: 600 }}>Online</Typography>
                    <Typography variant="body2">Last post 1 min ago · No trees yet</Typography>
                  </Box>
                </Stack>
              </CardContent>
            </Card>
          </Spot>
        </CardContent>
      </Card>
    </>
  );
}

function AddNodeScreen() {
  return (
    <Card>
      <CardContent>
        <Typography variant="h6" component="p">Add a node</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Save the tree in the system first. You will flash the Heltec on the next screen.
        </Typography>
        <Stack spacing={1.5}>
          <Spot id="tree-name">
            <Stack spacing={1.5}>
              <ReadOnlyField label="Tree name" required defaultValue="Big maple by the path" />
              <Stack direction="row" spacing={1.5}>
                <ReadOnlyField label="Stand" defaultValue="Alumni House" />
                <ReadOnlyField label="Gateway" defaultValue="Alumni House Gateway (GW-ALUMNI)" />
              </Stack>
            </Stack>
          </Spot>
          <Spot id="location">
            <div className="practice-map">Click the map to drop a pin</div>
            <Button size="small" startIcon={<MyLocationIcon />} tabIndex={-1} sx={{ mt: 1 }}>Use my location</Button>
          </Spot>
          <ReadOnlyField label="Seconds between packets" defaultValue="900" helperText="10 for a live demo, 900 (15 min) in the field." />
          <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end' }}>
            <Button tabIndex={-1}>Cancel</Button>
            <Spot id="save-node"><Button variant="contained" tabIndex={-1}>Save and continue</Button></Spot>
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );
}

function FlashScreen() {
  return (
    <Card>
      <CardContent>
        <Typography variant="h6" component="p">Flash NODE-013</Typography>
        <Typography sx={{ my: 1 }}>
          Plug in the Heltec for <strong>Big maple by the path</strong>. This writes <strong>NODE-013</strong> into the board.
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Hold PRG, tap reset, then release PRG if the port does not appear. After flashing, hold PRG for 3 seconds with the platform empty to tare.
        </Typography>
        <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end' }}>
          <Button tabIndex={-1}>Done</Button>
          <Spot id="flash"><Button variant="contained" startIcon={<UsbIcon />} tabIndex={-1}>Flash NODE-013</Button></Spot>
        </Stack>
      </CardContent>
    </Card>
  );
}

function NodeOnlineScreen() {
  return (
    <>
      <PageTitle title="Deploy" subtitle="Register a Pi gateway, then add, edit, flash, or remove Heltec nodes." />
      <Card>
        <CardContent>
          <Typography variant="h6" component="p" sx={{ mb: 1.5 }}>Nodes</Typography>
          <Card variant="outlined">
            <CardContent sx={{ '&:last-child': { pb: 2 } }}>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }} useFlexGap>
                <Typography sx={{ fontWeight: 600 }}>Big maple by the path</Typography>
                <NodeStatusChip status="online" />
                <Typography variant="caption" color="text.secondary">NODE-013</Typography>
              </Stack>
              <Typography variant="body2" color="text.secondary">Last reading 12 s ago</Typography>
            </CardContent>
          </Card>
        </CardContent>
      </Card>
    </>
  );
}

// ---- UI: Collection ----------------------------------------------------------

function TreeButtons({ selected = 'Tree 1', done = [] }) {
  return ['Alumni House', 'Chabad House'].map((stand) => (
    <Box key={stand} sx={{ mb: 1.5 }}>
      <Typography variant="caption" component="p" sx={{ mb: 0.5 }}>{stand.toUpperCase()}</Typography>
      <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
        {['Tree 1', 'Tree 2', 'Tree 3', 'Tree 4'].map((tree) => {
          const key = `${stand} ${tree}`;
          const isSelected = stand === 'Alumni House' && tree === selected;
          const isDone = done.includes(key);
          return (
            <Button
              key={tree}
              size="small"
              tabIndex={-1}
              variant={isSelected ? 'contained' : 'outlined'}
              color={isDone && !isSelected ? 'success' : 'primary'}
              startIcon={isDone ? <CheckCircleIcon /> : <RadioButtonUncheckedIcon />}
            >
              {tree}
            </Button>
          );
        })}
      </Stack>
    </Box>
  ));
}

function CollectionScreen() {
  return (
    <>
      <PageTitle title="Collection" subtitle="Log each bucket as you empty it. The weight is the only thing you have to enter." />
      <div className="practice-columns">
        <Card>
          <CardContent>
            <Spot id="trees">
              <Stack direction="row" sx={{ justifyContent: 'space-between', mb: 1.5 }}>
                <Typography variant="h6" component="p">This round</Typography>
                <Typography variant="body2">0 of 12 trees logged</Typography>
              </Stack>
              <ReadOnlyField label="Round label" helperText="Optional. Tags every entry in this round." sx={{ mb: 1.5 }} />
              <TreeButtons />
            </Spot>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <Typography variant="h6" component="p">Alumni House - Tree 1</Typography>
            <Typography variant="body2" sx={{ mb: 1.5 }}>Bucket BKT-001 · empty bucket 2.21 lb</Typography>
            <Stack direction="row" spacing={1.5} sx={{ mb: 1 }}>
              <Spot id="weight" sx={{ flex: 1 }}>
                <ReadOnlyField label="Sap weight (lb)" required defaultValue="53.9" helperText="From the sensor at 4:16 PM." />
              </Spot>
              <Spot id="brix" sx={{ flex: 1 }}>
                <ReadOnlyField label="Sugar content (Brix %)" helperText="Optional. Only if you tested it." />
              </Spot>
            </Stack>
            <Spot id="ice">
              <FormControlLabel control={<Switch tabIndex={-1} />} label="Ice in the bucket" />
            </Spot>
            <Spot id="estimate" sx={{ my: 1 }}>
              <Alert icon={false} severity="info">
                <Typography variant="h6" component="p">About 0.19 gal of syrup</Typography>
                <Typography variant="body2">From 6.2 gal of sap, using this tree’s last test, 2.7%.</Typography>
              </Alert>
            </Spot>
            <Stack direction="row" spacing={2} sx={{ mb: 1.5 }}>
              <Typography variant="body2" color="primary" sx={{ fontWeight: 600 }}>Add a note</Typography>
              <Typography variant="body2" color="primary" sx={{ fontWeight: 600 }}>Collected earlier? Change the time</Typography>
            </Stack>
            <Spot id="save">
              <Stack direction="row" spacing={1}>
                <Button variant="contained" sx={{ flex: 1 }} tabIndex={-1}>Save &amp; next tree</Button>
                <Button variant="outlined" tabIndex={-1}>Save &amp; stop here</Button>
              </Stack>
            </Spot>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function CollectionSavedScreen() {
  return (
    <>
      <PageTitle title="Collection" subtitle="Log each bucket as you empty it. The weight is the only thing you have to enter." />
      <Alert severity="success" sx={{ mb: 2 }}>Saved Alumni House - Tree 1. Next up: Alumni House - Tree 2.</Alert>
      <Card>
        <CardContent>
          <Typography variant="h6" component="p" sx={{ mb: 1 }}>This round · 2 of 12 trees logged</Typography>
          {[
            ['Alumni House - Tree 1', '6.2 gal', false],
            ['Red Barn - Tree 2', '4.6 gal', true],
          ].map(([tree, gallons, queued]) => (
            <Stack key={tree} direction="row" spacing={1} sx={{ alignItems: 'center', py: 0.75, flexWrap: 'wrap' }} useFlexGap>
              <Typography sx={{ flexGrow: 1 }}>{tree}</Typography>
              <Chip size="small" variant="outlined" label={gallons} />
              {queued ? <Chip size="small" color="warning" label="Waiting to upload" /> : null}
            </Stack>
          ))}
        </CardContent>
      </Card>
    </>
  );
}

// ---- UI: Ice in the bucket ---------------------------------------------------

/**
 * The tree card of the Collection page through an iced bucket: `start` (weight
 * in, ice off), `blocked` (ice on, Save off until the reweigh), and `ready`
 * (weight after ice removed entered, Save back on).
 */
function IceCollectionScreen({ stage }) {
  const iced = stage !== 'start';
  const blocked = stage === 'blocked';
  return (
    <>
      <PageTitle title="Collection" subtitle="Log each bucket as you empty it. The weight is the only thing you have to enter." />
      <Card>
        <CardContent>
          <Typography variant="h6" component="p">Alumni House - Tree 1</Typography>
          <Typography variant="body2" sx={{ mb: 1.5 }}>Bucket BKT-001 · empty bucket 2.21 lb</Typography>
          <Stack spacing={1.5}>
            <Stack direction="row" spacing={1.5}>
              <Spot id="weight" sx={{ flex: 1 }}>
                <ReadOnlyField
                  label={iced ? 'Weight with ice (lb)' : 'Sap weight (lb)'}
                  required
                  defaultValue="60"
                  helperText="Gross pounds, bucket included."
                />
              </Spot>
              <Box sx={{ flex: 1 }}>
                <ReadOnlyField label="Sugar content (Brix %)" helperText="Optional. Only if you tested it." />
              </Box>
            </Stack>
            <Spot id="ice">
              <FormControlLabel control={<Switch checked={iced} tabIndex={-1} />} label="Ice in the bucket" />
            </Spot>
            {iced ? (
              <Spot id="steps">
                <Alert severity={blocked ? 'warning' : 'success'}>
                  <Typography sx={{ fontWeight: 600, mb: 0.5 }}>
                    {blocked ? 'Remove the ice and reweigh' : 'Reweighed without the ice'}
                  </Typography>
                  {blocked ? (
                    <>
                      <Box component="ol" sx={{ m: 0, pl: 2.5 }}>
                        <li>Take the bucket off the sensor.</li>
                        <li>Remove the ice from the bucket.</li>
                        <li>Put the bucket back on the sensor.</li>
                        <li>Enter the new weight in Weight after ice removed.</li>
                      </Box>
                      <Typography variant="body2" sx={{ mt: 1 }}>Save turns on once the new weight is in.</Typography>
                    </>
                  ) : (
                    'This collection saves the weight after ice removed and is tagged Ice removed.'
                  )}
                </Alert>
              </Spot>
            ) : null}
            {iced ? (
              <Spot id="after-ice">
                <ReadOnlyField
                  label="Weight after ice removed (lb)"
                  required
                  defaultValue={blocked ? '' : '45'}
                  helperText="Gross pounds with the ice out, bucket included."
                />
              </Spot>
            ) : null}
            {stage === 'ready' ? (
              <Alert icon={false} severity="info">
                <Typography variant="h6" component="p">About 0.16 gal of syrup</Typography>
                <Typography variant="body2">From 5.1 gal of sap, using this tree’s last test, 2.7%.</Typography>
              </Alert>
            ) : null}
            <Spot id="save">
              <Stack direction="row" spacing={1}>
                <Button variant="contained" sx={{ flex: 1 }} disabled={blocked} tabIndex={-1}>Save &amp; next tree</Button>
                <Button variant="outlined" disabled={blocked} tabIndex={-1}>Save &amp; stop here</Button>
              </Stack>
            </Spot>
          </Stack>
        </CardContent>
      </Card>
    </>
  );
}

function IceSavedScreen() {
  return (
    <>
      <PageTitle title="Collection" subtitle="Log each bucket as you empty it. The weight is the only thing you have to enter." />
      <Alert severity="success" sx={{ mb: 2 }}>Saved Alumni House - Tree 1: 5.1 gal of sap.</Alert>
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Typography variant="h6" component="p" sx={{ mb: 1 }}>This round · 1 of 12 trees logged</Typography>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }} useFlexGap>
            <Typography sx={{ flexGrow: 1 }}>Alumni House - Tree 1</Typography>
            <Chip size="small" variant="outlined" label="5.1 gal" />
            <Chip size="small" color="warning" label="Ice removed · reweighed" />
          </Stack>
        </CardContent>
      </Card>
      <Card>
        <CardContent>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }} useFlexGap>
            <Typography variant="h6" component="p" sx={{ flexGrow: 1 }}>Collected Alumni House - Tree 1</Typography>
            <Chip size="small" color="warning" label="Ice removed · reweighed" />
          </Stack>
          <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
            <Chip size="small" variant="outlined" label="45 lb" />
            <Chip size="small" variant="outlined" label="60 lb with ice" />
          </Stack>
        </CardContent>
      </Card>
    </>
  );
}

// ---- UI: Schedule ------------------------------------------------------------

function ShiftCard({ title, where, pick = false, mine = false, canManage }) {
  return (
    <Card variant="outlined" sx={{ flex: 1, minWidth: 0 }}>
      <CardContent sx={{ '&:last-child': { pb: 2 } }}>
        <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography sx={{ fontWeight: 600 }}>{title}</Typography>
          <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
            {mine ? <Chip label="You" size="small" color="primary" /> : null}
            {canManage ? <DeleteOutlineIcon fontSize="small" color="action" /> : null}
          </Stack>
        </Stack>
        <Typography variant="body2" sx={{ my: 0.5 }}>{where}</Typography>
        {mine ? null : <Chip label="Unclaimed" size="small" color="warning" variant="outlined" />}
        {pick ? (
          <Spot id="pick-time" sx={{ mt: 1 }}><Button variant="contained" fullWidth size="small" tabIndex={-1}>Pick a time</Button></Spot>
        ) : mine ? null : (
          <Button variant="contained" fullWidth size="small" tabIndex={-1} sx={{ mt: 1 }}>Pick a time</Button>
        )}
      </CardContent>
    </Card>
  );
}

function ScheduleTitle({ canManage }) {
  return (
    <PageTitle
      title="Schedule"
      subtitle={canManage
        ? 'Post, assign, complete, or delete shifts. Students claim open shifts from here too.'
        : 'Claim a collection shift, or connect Google Calendar so claimed times land on your calendar.'}
    />
  );
}

function ScheduleScreen({ canManage }) {
  return (
    <>
      <ScheduleTitle canManage={canManage} />
      {canManage ? (
        <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
          <Typography variant="h6" component="p">Manage shifts</Typography>
          <Spot id="new-shift"><Button variant="contained" size="small" tabIndex={-1}>New shift</Button></Spot>
        </Stack>
      ) : null}
      <Spot id="filters" sx={{ mb: 2 }}>
        <Card variant="outlined">
          <CardContent sx={{ '&:last-child': { pb: 2 } }}>
            <ToggleButtonGroup exclusive size="small" color="primary" value="all" className="practice-toggle">
              {['All (16)', 'My shifts (2)', 'Open (8)', 'Completed (9)'].map((label, index) => (
                <ToggleButton key={label} value={index === 0 ? 'all' : label} tabIndex={-1}>{label}</ToggleButton>
              ))}
            </ToggleButtonGroup>
            <Stack direction="row" spacing={1.5} sx={{ mt: 1.5, alignItems: 'center', flexWrap: 'wrap' }} useFlexGap>
              <ReadOnlyField label="Stand" sx={{ maxWidth: 160 }} />
              <ReadOnlyField label="Task" sx={{ maxWidth: 160 }} />
              <FormControlLabel control={<Switch size="small" tabIndex={-1} />} label="View past" />
            </Stack>
          </CardContent>
        </Card>
      </Spot>
      <Typography variant="h6" component="p" sx={{ mb: 1 }}>Needs a time</Typography>
      <Stack direction="row" spacing={1.5}>
        <ShiftCard title="Sensor Check" where="Chabad House · waiting for a time" pick canManage={canManage} />
        <ShiftCard title="Battery Swap" where="Red Barn · waiting for a time" canManage={canManage} />
      </Stack>
    </>
  );
}

function PickTimeScreen() {
  return (
    <Card>
      <CardContent>
        <Typography variant="h6" component="p">Pick a free time</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Sensor Check at Chabad House. These windows come from your connected Google Calendar and are shown in Eastern time. Choosing one claims the shift.
        </Typography>
        <Stack spacing={1}>
          <Button variant="outlined" tabIndex={-1} sx={{ justifyContent: 'flex-start' }}>Fri, Nov 6 · 8:00 – 10:00 AM</Button>
          <Spot id="window">
            <Button variant="outlined" fullWidth tabIndex={-1} sx={{ justifyContent: 'flex-start' }}>Fri, Nov 6 · 10:00 AM – 12:00 PM</Button>
          </Spot>
          <Button variant="outlined" tabIndex={-1} sx={{ justifyContent: 'flex-start' }}>Fri, Nov 6 · 2:00 – 4:00 PM</Button>
        </Stack>
      </CardContent>
    </Card>
  );
}

function ShiftClaimedScreen({ canManage }) {
  return (
    <>
      <ScheduleTitle canManage={canManage} />
      <Alert severity="success" sx={{ mb: 2 }}>Shift claimed.</Alert>
      <Stack direction="row" spacing={1.5}>
        <ShiftCard title="Sensor Check" where="Chabad House · Fri 10:00 AM – 12:00 PM" mine canManage={canManage} />
      </Stack>
    </>
  );
}

function NewShiftScreen() {
  return (
    <>
      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
        <Typography variant="h6" component="p">Manage shifts</Typography>
        <Button variant="contained" size="small" tabIndex={-1}>Hide form</Button>
      </Stack>
      <Card variant="outlined">
        <CardContent>
          <div className="practice-form-grid">
            <ReadOnlyField label="Task" defaultValue="Sap Collection" />
            <ReadOnlyField label="Student" helperText="Leave blank to post an open shift." />
            <ReadOnlyField label="Buckets" helperText="Choose one or more taps." />
            <ReadOnlyField label="Open spots" defaultValue="1" />
            <ReadOnlyField label="Starts" defaultValue="11/06/2026 09:00 AM" />
            <ReadOnlyField label="Ends" defaultValue="11/06/2026 11:00 AM" />
          </div>
          <ReadOnlyField label="Note" sx={{ my: 1.5 }} />
          <Spot id="post-shift"><Button variant="contained" tabIndex={-1}>Post open shift</Button></Spot>
        </CardContent>
      </Card>
    </>
  );
}

// ---- Hardware: recalibration -------------------------------------------------

/** Mirrors components/deploy/CalibrationCard.jsx in each of its states. */
function CalibrationScreen({ state }) {
  const fault = state === 'fault';
  const step = { weight: 1, check: 2 }[state] ?? 0;
  return (
    <>
      <PageTitle title="Alumni House - Tree 1" subtitle="NODE-001" />
      <Spot id="card">
        <Card>
          <CardContent>
            <Typography variant="h6" component="p">Calibrate the scale</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Over the radio, no cable. Each step reaches the node on its next packet (every 10 s).
            </Typography>
            {fault ? (
              <Spot id="fault" sx={{ mb: 1 }}>
                <Alert severity="error">Load-cell fault. Check the load-cell cable and the HX711 wiring.</Alert>
              </Spot>
            ) : (
              <Typography variant="subtitle2" component="p" sx={{ mb: 1.5 }}>
                The platform reads {step === 2 ? '7.88' : step === 1 ? '0.00' : '2.31'} lb (12 s ago).
              </Typography>
            )}
            {state === 'waiting' ? (
              <Spot id="waiting" sx={{ mb: 1.5 }}>
                <Alert severity="info" action={<Button color="inherit" size="small" tabIndex={-1}>Cancel</Button>}>
                  <Typography variant="body2" component="div">Tare sent. Waiting for the node to confirm.</Typography>
                  <Typography variant="body2" component="div" sx={{ mt: 0.5 }}>Radioed 42 s ago, about 2 packets.</Typography>
                  <LinearProgress sx={{ mt: 1 }} />
                </Alert>
              </Spot>
            ) : null}
            <Stepper activeStep={step} orientation="vertical">
              <Step>
                <StepLabel>Empty the platform and tare</StepLabel>
                <StepContent>
                  <Typography variant="body2" sx={{ mb: 1.5 }}>
                    Take the bucket and anything else off the platform, then tare. The node sets this as 0 lb.
                  </Typography>
                  <Spot id="tare" sx={{ display: 'inline-block' }}>
                    <Button variant="contained" disabled={fault || state === 'waiting'} tabIndex={-1}>Tare</Button>
                  </Spot>
                </StepContent>
              </Step>
              <Step>
                <StepLabel>Place the test weight</StepLabel>
                <StepContent>
                  <Typography variant="body2" sx={{ mb: 1.5 }}>
                    Set a known weight in the middle of the platform and enter exactly what it weighs.
                  </Typography>
                  <Spot id="calibrate">
                    <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
                      <ReadOnlyField label="Test weight (lb)" defaultValue="7.875" sx={{ maxWidth: 160 }} />
                      <Button variant="contained" tabIndex={-1}>Calibrate</Button>
                    </Stack>
                  </Spot>
                </StepContent>
              </Step>
              <Step>
                <StepLabel>Check the reading</StepLabel>
                <StepContent>
                  <Spot id="check">
                    <Alert severity="success">The platform reads 7.88 lb for a 7.875 lb test weight. Calibration is good.</Alert>
                  </Spot>
                </StepContent>
              </Step>
            </Stepper>
          </CardContent>
        </Card>
      </Spot>
    </>
  );
}

function IntervalScreen() {
  return (
    <Card>
      <CardContent>
        <Typography variant="h6" component="p" sx={{ mb: 2 }}>Edit node</Typography>
        <Stack spacing={1.5}>
          <ReadOnlyField label="Tree name" defaultValue="Alumni House - Tree 1" />
          <Spot id="interval">
            <ReadOnlyField
              label="Seconds between packets"
              defaultValue="10"
              helperText="Note the current interval first and restore it after calibration."
            />
          </Spot>
          <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end' }}>
            <Button tabIndex={-1}>Cancel</Button>
            <Button variant="contained" tabIndex={-1}>Save changes</Button>
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );
}

// ---- Hardware: solar ---------------------------------------------------------

function SolarTreeScreen() {
  return (
    <>
      <PageTitle title="Alumni House - Tree 1" subtitle="NODE-001" />
      <div className="practice-columns">
        <Spot id="battery">
          <Card variant="outlined">
            <CardContent sx={{ '&:last-child': { pb: 2 } }}>
              <Typography variant="body2" color="text.secondary">Battery</Typography>
              <Typography variant="h6" component="p" color="error">14%</Typography>
              <Typography variant="body2">Last report 3 h ago (usually every 15 min)</Typography>
            </CardContent>
          </Card>
        </Spot>
        <Card variant="outlined">
          <CardContent sx={{ '&:last-child': { pb: 2 } }}>
            <Typography variant="body2" color="text.secondary">Bucket</Typography>
            <Typography variant="h6" component="p">62% full</Typography>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function SolarKitScreen() {
  return (
    <Bench title="Check the solar kit">
      <Spot id="kit">
        <div className="practice-kit">
          <div className="practice-panel">5 W panel<br />clear of snow and shade</div>
          <span aria-hidden="true">→</span>
          <div className="practice-part">18650 pack<br /><small>in the D5 enclosure</small></div>
          <span aria-hidden="true">→</span>
          <div className="practice-part">Heltec<br /><small>lithium port, underneath</small></div>
        </div>
      </Spot>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5, textAlign: 'center' }}>
        Below 3.15 V the node stops reporting and sleeps an hour at a time.
      </Typography>
    </Bench>
  );
}

const SCREENS = {
  deploy: { current: 'Deploy', render: () => <DeployScreen /> },
  'add-node': { current: 'Deploy', render: () => <AddNodeScreen /> },
  flash: { current: 'Deploy', render: () => <FlashScreen /> },
  tare: {
    render: () => (
      <Bench title="Tare the scale" subtitle="Platform empty. Hold PRG for 3 seconds.">
        <Board lines={['NODE-013', 'Platform empty', 'Hold PRG 3 s to tare']} prg />
      </Bench>
    ),
  },
  'node-online': { current: 'Deploy', render: () => <NodeOnlineScreen /> },
  collection: { current: 'Collection', render: () => <CollectionScreen /> },
  'collection-saved': { current: 'Collection', render: () => <CollectionSavedScreen /> },
  'ice-start': { current: 'Collection', render: () => <IceCollectionScreen stage="start" /> },
  'ice-blocked': { current: 'Collection', render: () => <IceCollectionScreen stage="blocked" /> },
  'ice-reading': {
    render: () => (
      <Bench title="Read the new weight" subtitle="Bucket back on the sensor, ice out.">
        <Spot id="reading">
          <Board lines={['NODE-001', 'Weight 45.0 lb', 'Next report 41 s']} />
        </Spot>
      </Bench>
    ),
  },
  'ice-ready': { current: 'Collection', render: () => <IceCollectionScreen stage="ready" /> },
  'ice-saved': { current: 'Collection', render: () => <IceSavedScreen /> },
  schedule: { current: 'Schedule', render: (role) => <ScheduleScreen canManage={can(role, Capability.MANAGE_SCHEDULE)} /> },
  'pick-time': { current: 'Schedule', render: () => <PickTimeScreen /> },
  'shift-claimed': { current: 'Schedule', render: (role) => <ShiftClaimedScreen canManage={can(role, Capability.MANAGE_SCHEDULE)} /> },
  'new-shift': { current: 'Schedule', render: () => <NewShiftScreen /> },
  calibration: { current: 'The Bush', render: () => <CalibrationScreen state="idle" /> },
  'calibration-fault': { current: 'The Bush', render: () => <CalibrationScreen state="fault" /> },
  'calibration-waiting': { current: 'The Bush', render: () => <CalibrationScreen state="waiting" /> },
  'calibration-weight': { current: 'The Bush', render: () => <CalibrationScreen state="weight" /> },
  'calibration-check': { current: 'The Bush', render: () => <CalibrationScreen state="check" /> },
  interval: { current: 'Deploy', render: () => <IntervalScreen /> },
  'usb-calibrate': {
    render: () => (
      <Bench title="Calibrate over USB" subtitle="Serial monitor at 115200 baud. Press PRG first if the node is asleep.">
        <Terminal
          lines={[
            ['in', 'TARE'], ['out', 'TARE queued'], ['out', 'TARE ok'],
            ['in', 'CAL 7.875'], ['out', 'CAL ok'],
            ['in', 'STATUS'], ['out', 'fw=2.0.0 code=NODE-001 mode=service wiring=ok pounds=7.88 fault=none'],
          ]}
        />
      </Bench>
    ),
  },
  'solar-tree': { current: 'The Bush', render: () => <SolarTreeScreen /> },
  'solar-wake': {
    render: () => (
      <Bench title="Wake the node" subtitle="Press PRG once. The screen stays on for about 2 minutes.">
        <Board lines={['NODE-001', 'Pack 14%  3.68 V', 'Weight 35.9 lb', 'Next report 41 s']} prg />
      </Bench>
    ),
  },
  'solar-usb': {
    render: () => (
      <Bench title="Pack not detected" subtitle="The screen shows USB instead of a pack percentage.">
        <Board lines={['NODE-001', 'Power: USB', 'Weight 35.9 lb', 'Next report 41 s']} port />
      </Bench>
    ),
  },
  'solar-kit': { render: () => <SolarKitScreen /> },
  'solar-charging': {
    render: () => (
      <Bench title="Reading while on USB">
        <Spot id="charging">
          <Board lines={['NODE-001', 'Pack 99%  4.18 V', '(charging over USB)', 'Next report 41 s']} />
        </Spot>
      </Bench>
    ),
  },
  'battery-calibrate': {
    render: () => (
      <Bench title="Correct the battery reading" subtitle="Measure the pack with a multimeter. Wake the node with PRG, then send that voltage in millivolts.">
        <Terminal
          lines={[
            ['in', 'BATCAL 3712'], ['out', 'BATCAL ok factor=1.052'],
            ['in', 'STATUS'], ['out', 'fw=2.0.0 code=NODE-001 pack=3712mV 22% bat_k=1.052'],
          ]}
        />
      </Bench>
    ),
  },
};

/** One practice screen, with `target` highlighted. */
export function PracticeScreen({ screen, target, role }) {
  const entry = SCREENS[screen];
  if (!entry) return null;
  return (
    <SpotContext.Provider value={target}>
      {entry.current ? (
        <AppChrome role={role} current={entry.current}>{entry.render(role)}</AppChrome>
      ) : (
        entry.render(role)
      )}
    </SpotContext.Provider>
  );
}