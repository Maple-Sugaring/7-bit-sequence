import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined';
import UsbIcon from '@mui/icons-material/Usb';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Divider from '@mui/material/Divider';
import LinearProgress from '@mui/material/LinearProgress';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Step from '@mui/material/Step';
import StepLabel from '@mui/material/StepLabel';
import Stepper from '@mui/material/Stepper';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { Capability } from '../business/permissions';
import { PageHeader } from '../components/common/PageHeader';
import { AsyncBlock, EmptyBlock } from '../components/common/StateBlock';
import { useAuth } from '../context/auth';
import { eraseHeltec, flashHeltec } from '../hardware/heltecFlash';
import { useGateways, useNodes } from '../services/hooks';
import { GatewayCard } from '../components/deploy/GatewayCard';
import { NodeRow } from '../components/deploy/NodeRow';
import { LocationPicker } from '../components/map/LocationPicker';
import { useAction } from '../services/hooks/useAsync';
import {
  createGateway,
  createNode,
  deleteGateway,
  deleteNode,
  setReportInterval,
  updateGateway,
  updateNodeDetails,
} from '../services/nodeService';

const STANDS = ['Alumni House', 'Chabad House', 'Red Barn'];

const NODE_STATUS = {
  0: { label: 'Offline', color: 'error' },
  1: { label: 'Online', color: 'success' },
  2: { label: 'Degraded', color: 'warning' },
  3: { label: 'Maintenance', color: 'info' },
};

const emptyDraft = () => ({
  Node_Name: '',
  Stand: STANDS[0],
  GatewayID: '',
  Latitude: '',
  Longitude: '',
  Tare_Weight: '2.5',
  Minutes: '1',
  Rf_Tag: '',
  Notes: '',
});

function serialAvailable() {
  return typeof navigator !== 'undefined' && 'serial' in navigator;
}

/** The draft keeps coordinates as text; the map wants { lat, lon } or null. */
function pointFromDraft(draft) {
  if (draft.Latitude === '' || draft.Longitude === '') return null;
  const lat = Number(draft.Latitude);
  const lon = Number(draft.Longitude);
  return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
}

function gatewayLabel(gateway) {
  if (!gateway) return 'No gateway';
  return gateway.Gateway_Code
    ? `${gateway.Gateway_Name} (${gateway.Gateway_Code})`
    : gateway.Gateway_Name;
}

function draftFromNode(node) {
  return {
    Node_Name: node.Node_Name ?? '',
    Stand: node.Stand || STANDS[0],
    GatewayID: node.GatewayID == null ? '' : String(node.GatewayID),
    Latitude: node.Location?.lat ?? '',
    Longitude: node.Location?.lon ?? '',
    Tare_Weight: '2.5',
    Minutes: String(Math.max(1, Math.round((node.Report_Interval_Seconds ?? 60) / 60))),
    Rf_Tag: node.Rf_Tag ?? '',
    Notes: node.Notes ?? '',
  };
}

export function DeployPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { can } = useAuth();
  const canDeploy = can(Capability.DEPLOY_NODES);
  const nodes = useNodes();
  const gateways = useGateways();
  const nodeList = useMemo(() => nodes.data ?? [], [nodes.data]);
  const gatewayList = useMemo(() => gateways.data ?? [], [gateways.data]);
  const gatewayById = useMemo(
    () => new Map(gatewayList.map((gateway) => [gateway.GatewayID, gateway])),
    [gatewayList],
  );

  const [dialog, setDialog] = useState(null);
  const [draft, setDraft] = useState(emptyDraft);
  const [target, setTarget] = useState(null);
  const [created, setCreated] = useState(null);
  const [flash, setFlash] = useState({ active: false, message: '', progress: null });
  const [notice, setNotice] = useState('');
  const [saved, setSaved] = useState(false);
  const [query, setQuery] = useState('');
  const [menu, setMenu] = useState({ anchor: null, node: null });
  const [handledLink, setHandledLink] = useState('');

  const linkAction = params.get('action') || '';
  const linkEditId = Number(params.get('edit')) || 0;
  const linkFlashId = Number(params.get('flash')) || 0;
  const linkKey = `${linkAction}|${linkEditId}|${linkFlashId}`;

  // Hydrate dialogs from deep links during render (React-recommended vs effect setState).
  if (canDeploy && linkKey !== '||0|0' && linkKey !== handledLink) {
    if (linkAction === 'add' && !gateways.loading) {
      setHandledLink(linkKey);
      setTarget(null);
      setDraft({
        ...emptyDraft(),
        GatewayID: gatewayList[0] ? String(gatewayList[0].GatewayID) : '',
      });
      setCreated(null);
      setNotice('');
      setSaved(false);
      setDialog('node');
    } else if (!nodes.loading && nodeList.length > 0) {
      if (linkEditId) {
        const node = nodeList.find((item) => item.NodeID === linkEditId);
        if (node) {
          setHandledLink(linkKey);
          setTarget(node);
          setDraft(draftFromNode(node));
          setCreated(null);
          setSaved(false);
          setNotice('');
          setDialog('node');
        }
      } else if (linkFlashId) {
        const node = nodeList.find((item) => item.NodeID === linkFlashId);
        if (node) {
          setHandledLink(linkKey);
          setTarget(node);
          setCreated(node);
          setNotice('');
          setDialog('flash');
        }
      }
    }
  }

  useEffect(() => {
    if (!handledLink || handledLink === '||0|0') return;
    if (!params.get('action') && !params.get('edit') && !params.get('flash')) return;
    setParams({}, { replace: true });
  }, [handledLink, params, setParams]);

  const refresh = () => {
    nodes.refresh();
    gateways.refresh();
  };

  const closeDialog = () => {
    if (flash.active) return;
    setDialog(null);
    setTarget(null);
    setCreated(null);
    setSaved(false);
    setNotice('');
  };

  const openAdd = () => {
    setTarget(null);
    setDraft({
      ...emptyDraft(),
      GatewayID: gatewayList[0] ? String(gatewayList[0].GatewayID) : '',
    });
    setCreated(null);
    setNotice('');
    setSaved(false);
    setDialog('node');
  };

  const openEdit = (node) => {
    setTarget(node);
    setDraft(draftFromNode(node));
    setCreated(null);
    setSaved(false);
    setNotice('');
    setDialog('node');
  };

  const openGatewayEdit = (gateway) => {
    setTarget(gateway);
    setNotice('');
    setDialog('gateway');
  };

  const openDelete = (node) => {
    setTarget(node);
    setNotice('');
    setDialog('delete');
  };

  const openFlash = (node) => {
    setTarget(node);
    setCreated(node);
    setNotice('');
    setDialog('flash');
  };

  const setField = (field) => (event) => {
    setDraft((current) => ({ ...current, [field]: event.target.value }));
    setSaved(false);
  };

  const nodePoint = pointFromDraft(draft);
  const setNodePoint = (point) => {
    setDraft((current) => ({
      ...current,
      Latitude: point ? point.lat.toFixed(6) : '',
      Longitude: point ? point.lon.toFixed(6) : '',
    }));
    setSaved(false);
  };

  const saveNode = useAction(async () => {
    const latitude = Number(draft.Latitude);
    const longitude = Number(draft.Longitude);
    if (!draft.Node_Name.trim()) throw new Error('Name the tree.');
    if (!draft.Stand.trim()) throw new Error('Choose a stand.');
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      throw new Error('Place the tree on the map, or use your location.');
    }
    const minutes = Number(draft.Minutes);
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) {
      throw new Error('Use a packet interval from 1 minute to 1 day.');
    }

    if (target) {
      await updateNodeDetails(target.NodeID, {
        Node_Name: draft.Node_Name.trim(),
        Stand: draft.Stand.trim(),
        Latitude: latitude,
        Longitude: longitude,
        Rf_Tag: draft.Rf_Tag.trim(),
        Notes: draft.Notes.trim(),
        ...(draft.GatewayID ? { GatewayID: Number(draft.GatewayID) } : {}),
      });
      await setReportInterval(target.NodeID, minutes);
      return target;
    }

    if (!draft.GatewayID) throw new Error('Choose the gateway this tree reports through.');
    const createdNode = await createNode({
      Node_Name: draft.Node_Name.trim(),
      Stand: draft.Stand.trim(),
      GatewayID: Number(draft.GatewayID),
      Latitude: latitude,
      Longitude: longitude,
      Tare_Weight: draft.Tare_Weight === '' ? undefined : Number(draft.Tare_Weight),
      Rf_Tag: draft.Rf_Tag.trim() || undefined,
      Notes: draft.Notes.trim() || undefined,
    });
    await setReportInterval(createdNode.NodeID, minutes);
    return createdNode;
  });

  const saveGateway = useAction(async (body) =>
    target && dialog === 'gateway' ? updateGateway(target.GatewayID, body) : createGateway(body),
  );
  const removeGateway = useAction(async (gatewayId) => deleteGateway(gatewayId));
  const removeNode = useAction(async (nodeId) => deleteNode(nodeId));

  const runSerial = async (command) => {
    if (!serialAvailable()) {
      setNotice('USB flashing needs Chrome or Edge on this computer.');
      return;
    }
    setNotice('');
    try {
      const port = await navigator.serial.requestPort();
      setFlash({ active: true, message: 'Starting…', progress: 0 });
      if (command === 'erase') {
        await eraseHeltec(port, ({ message, progress }) => {
          setFlash({ active: true, message, progress });
        });
        setNotice('The board flash is clear.');
      } else {
        await flashHeltec(port, command, ({ message, progress }) => {
          setFlash({ active: true, message, progress });
        });
        setNotice(`${command} is on the board. Hold PRG for 3 seconds with the platform empty to tare.`);
      }
    } catch (error) {
      if (error?.name === 'NotFoundError') return;
      setNotice(error?.message || 'The board did not respond. Hold PRG, tap reset, and try again.');
    } finally {
      setFlash({ active: false, message: '', progress: null });
    }
  };

  const onSaveNode = async () => {
    const result = await saveNode.execute();
    if (!result.ok) return;
    refresh();
    if (target) {
      setSaved(true);
      return;
    }
    setCreated(result.data);
    setTarget(result.data);
    setSaved(true);
    setDialog('flash');
  };

  const filteredNodes = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return nodeList;
    return nodeList.filter((node) => {
      const gateway = gatewayById.get(node.GatewayID);
      const haystack = [
        node.Node_Name,
        node.Node_Code,
        node.Stand,
        node.Rf_Tag,
        gateway?.Gateway_Name,
        gateway?.Gateway_Code,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [gatewayById, nodeList, query]);

  const loading = nodes.loading || gateways.loading;
  const error = nodes.error || gateways.error;
  const editing = Boolean(target) && dialog === 'node';
  const stands = draft.Stand && !STANDS.includes(draft.Stand) ? [draft.Stand, ...STANDS] : STANDS;
  const setupStep = gatewayList.length === 0 ? 0 : nodeList.length === 0 ? 1 : 2;
  const closeMenu = () => setMenu({ anchor: null, node: null });

  return (
    <>
      <PageHeader
        title="Deploy"
        subtitle="Register a Pi gateway, then add, edit, flash, or remove Heltec nodes."
        actions={
          canDeploy ? (
            <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', justifyContent: 'center' }}>
              <Button variant="outlined" onClick={() => { setNotice(''); setDialog('gateway'); }}>
                Register gateway
              </Button>
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={openAdd}
                disabled={gatewayList.length === 0}
              >
                Add node
              </Button>
            </Stack>
          ) : null
        }
      />

      {notice && dialog == null ? (
        <Alert severity="info" sx={{ mb: 2 }} onClose={() => setNotice('')}>
          {notice}
        </Alert>
      ) : null}

      {!serialAvailable() && canDeploy ? (
        <Alert severity="warning" sx={{ mb: 2 }}>
          USB flashing needs Chrome or Edge on a computer with a cable. You can still add and edit nodes here.
        </Alert>
      ) : null}

      <AsyncBlock
        loading={loading && nodeList.length === 0 && gatewayList.length === 0}
        error={error}
        refresh={refresh}
        data={{ nodes: nodeList, gateways: gatewayList }}
        isEmpty={(data) => data.nodes.length === 0 && data.gateways.length === 0}
        empty={
          <EmptyBlock
            title="Nothing is deployed yet"
            description="Start with the Raspberry Pi gateway, then add a node and flash the Heltec."
            action={
              canDeploy ? (
                <Stack spacing={2} sx={{ alignItems: 'center', width: '100%', maxWidth: 420 }}>
                  <SetupSteps activeStep={0} />
                  <Button variant="contained" size="large" onClick={() => setDialog('gateway')}>
                    Register gateway
                  </Button>
                </Stack>
              ) : null
            }
          />
        }
      >
        <Stack spacing={3}>
          {canDeploy && setupStep < 2 ? <SetupSteps activeStep={setupStep} /> : null}

          <Box
            sx={{
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: 2,
              bgcolor: 'background.paper',
              p: { xs: 2, sm: 2.5 },
            }}
          >
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              spacing={1.5}
              sx={{ justifyContent: 'space-between', alignItems: { sm: 'center' }, mb: 1.5 }}
            >
              <Box>
                <Typography variant="h6" component="h2">
                  Gateways
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Nodes check in through these Raspberry Pis.
                </Typography>
              </Box>
              {canDeploy ? (
                <Button size="small" onClick={() => { setNotice(''); setDialog('gateway'); }}>
                  Register gateway
                </Button>
              ) : null}
            </Stack>
            {gatewayList.length === 0 ? (
              <Alert severity="warning">
                Add a gateway before you can add a node.
              </Alert>
            ) : (
              <Box
                sx={{
                  display: 'grid',
                  gap: 1.5,
                  gridTemplateColumns: { xs: '1fr', sm: 'repeat(auto-fill, minmax(280px, 1fr))' },
                }}
              >
                {gatewayList.map((gateway) => (
                  <GatewayCard
                    key={gateway.GatewayID}
                    gateway={gateway}
                    nodeCount={nodeList.filter((node) => node.GatewayID === gateway.GatewayID).length}
                    onOpen={canDeploy ? () => openGatewayEdit(gateway) : undefined}
                  />
                ))}
              </Box>
            )}
          </Box>

          <Box
            sx={{
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: 2,
              bgcolor: 'background.paper',
              p: { xs: 2, sm: 2.5 },
            }}
          >
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              spacing={1.5}
              sx={{ justifyContent: 'space-between', alignItems: { sm: 'center' }, mb: 1.5 }}
            >
              <Box>
                <Typography variant="h6" component="h2">
                  Nodes
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Edit details, flash firmware, or remove a tree from the system.
                </Typography>
              </Box>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ width: { xs: '100%', sm: 'auto' } }}>
                <TextField
                  size="small"
                  placeholder="Search nodes"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  sx={{ minWidth: { sm: 220 } }}
                />
                {canDeploy ? (
                  <Button
                    variant="contained"
                    startIcon={<AddIcon />}
                    onClick={openAdd}
                    disabled={gatewayList.length === 0}
                  >
                    Add node
                  </Button>
                ) : null}
              </Stack>
            </Stack>

            {nodeList.length === 0 ? (
              <EmptyBlock
                title="No nodes yet"
                description="Add a node, then flash that code onto the Heltec over USB."
                action={
                  canDeploy ? (
                    <Button variant="contained" onClick={openAdd} disabled={gatewayList.length === 0}>
                      Add node
                    </Button>
                  ) : null
                }
              />
            ) : filteredNodes.length === 0 ? (
              <EmptyBlock title="No matches" description="Try a different name, code, or stand." />
            ) : (
              <Stack spacing={1.25}>
                {filteredNodes.map((node) => (
                  <NodeRow
                    key={node.NodeID}
                    node={node}
                    status={NODE_STATUS[node.Status_Code] ?? { label: 'Unknown', color: 'default' }}
                    gatewayName={gatewayById.get(node.GatewayID)?.Gateway_Name}
                    canDeploy={canDeploy}
                    onOpen={() => navigate(`/nodes/${node.NodeID}`)}
                    onEdit={() => openEdit(node)}
                    onMore={(event) => setMenu({ anchor: event.currentTarget, node })}
                  />
                ))}
              </Stack>
            )}
          </Box>
        </Stack>
      </AsyncBlock>

      <Menu
        anchorEl={menu.anchor}
        open={Boolean(menu.anchor)}
        onClose={closeMenu}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <MenuItem
          onClick={() => {
            const node = menu.node;
            closeMenu();
            openFlash(node);
          }}
        >
          <ListItemIcon><UsbIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Flash firmware</ListItemText>
        </MenuItem>
        <MenuItem
          onClick={() => {
            const node = menu.node;
            closeMenu();
            navigate(`/nodes/${node.NodeID}`);
          }}
        >
          <ListItemText inset>Open tree page</ListItemText>
        </MenuItem>
        <Divider />
        <MenuItem
          onClick={() => {
            const node = menu.node;
            closeMenu();
            openDelete(node);
          }}
        >
          <ListItemIcon><DeleteOutlineIcon fontSize="small" color="error" /></ListItemIcon>
          <ListItemText sx={{ color: 'error.main' }}>Remove node</ListItemText>
        </MenuItem>
      </Menu>

      <Dialog open={dialog === 'gateway'} onClose={closeDialog} fullWidth maxWidth="sm">
        <DialogTitle>{target ? 'Edit gateway' : 'Register gateway'}</DialogTitle>
        {dialog === 'gateway' ? (
          <GatewayForm
            key={target?.GatewayID ?? 'new'}
            gateway={target}
            error={saveGateway.error}
            pending={saveGateway.pending}
            onCancel={closeDialog}
            onRemove={target ? () => setDialog('deleteGateway') : undefined}
            onSave={async (body) => {
              const wasEditing = Boolean(target);
              const result = await saveGateway.execute(body);
              if (!result.ok) return;
              refresh();
              closeDialog();
              setNotice(
                wasEditing
                  ? `${result.data.Gateway_Name} was updated.`
                  : `${result.data.Gateway_Name} is registered. Next, add a node and flash the Heltec.`,
              );
            }}
          />
        ) : null}
      </Dialog>

      <Dialog open={dialog === 'deleteGateway'} onClose={closeDialog} fullWidth maxWidth="sm">
        <DialogTitle>Remove {target?.Gateway_Name}?</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Typography>
              <strong>{target?.Gateway_Code}</strong> leaves the app. Its nodes stay deployed but
              have no gateway until you assign them another one.
            </Typography>
            {removeGateway.error ? <Alert severity="error">{removeGateway.error}</Alert> : null}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={closeDialog}>Cancel</Button>
          <Button
            color="error"
            variant="contained"
            disabled={removeGateway.pending}
            onClick={async () => {
              const name = target.Gateway_Name;
              const result = await removeGateway.execute(target.GatewayID);
              if (!result.ok) return;
              refresh();
              closeDialog();
              setNotice(`${name} was removed.`);
            }}
          >
            Remove gateway
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={dialog === 'node'} onClose={closeDialog} fullWidth maxWidth="sm">
        <DialogTitle>{editing ? 'Edit node' : 'Add a node'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {!editing ? (
              <Typography variant="body2" color="text.secondary">
                Save the tree in the system first. You will flash the Heltec on the next screen.
              </Typography>
            ) : null}
            <TextField label="Tree name" value={draft.Node_Name} onChange={setField('Node_Name')} required fullWidth />
            <TextField select label="Stand" value={draft.Stand} onChange={setField('Stand')} fullWidth>
              {stands.map((stand) => (
                <MenuItem key={stand} value={stand}>{stand}</MenuItem>
              ))}
            </TextField>
            <TextField
              select
              label="Gateway"
              value={draft.GatewayID}
              onChange={setField('GatewayID')}
              helperText={gatewayList.length ? 'The Pi this tree reports through.' : 'Register a gateway first.'}
              fullWidth
            >
              {gatewayList.map((gateway) => (
                <MenuItem key={gateway.GatewayID} value={String(gateway.GatewayID)}>
                  {gatewayLabel(gateway)}
                </MenuItem>
              ))}
            </TextField>
            <LocationPicker value={nodePoint} onChange={setNodePoint} />
            <TextField
              label="Minutes between packets"
              type="number"
              value={draft.Minutes}
              onChange={setField('Minutes')}
              helperText="The board picks this up the next time it checks in."
              fullWidth
              slotProps={{ htmlInput: { min: 1, max: 1440, step: 1 } }}
            />
            {editing ? null : (
              <TextField
                label="Empty bucket weight (lb)"
                type="number"
                value={draft.Tare_Weight}
                onChange={setField('Tare_Weight')}
                fullWidth
              />
            )}
            <TextField label="RF tag" value={draft.Rf_Tag} onChange={setField('Rf_Tag')} fullWidth />
            <TextField label="Notes" value={draft.Notes} onChange={setField('Notes')} multiline minRows={2} fullWidth />
            {saveNode.error ? <Alert severity="error">{saveNode.error}</Alert> : null}
            {notice ? <Alert severity="info">{notice}</Alert> : null}
            {saved && editing ? <Alert severity="success">Saved.</Alert> : null}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, gap: 1, flexWrap: 'wrap' }}>
          <Button onClick={closeDialog}>Cancel</Button>
          {editing && target?.Node_Code ? (
            <Button
              startIcon={<UsbIcon />}
              onClick={() => {
                setCreated(target);
                setDialog('flash');
              }}
            >
              Flash
            </Button>
          ) : null}
          <Button variant="contained" disabled={saveNode.pending} onClick={onSaveNode}>
            {editing ? 'Save changes' : 'Save and continue'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={dialog === 'flash'} onClose={closeDialog} fullWidth maxWidth="sm">
        <DialogTitle>Flash {(created || target)?.Node_Code}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Typography>
              Plug in the Heltec for <strong>{(created || target)?.Node_Name}</strong>. This writes{' '}
              <strong>{(created || target)?.Node_Code}</strong> into the board.
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Hold PRG, tap reset, then release PRG if the port does not appear. After flashing, hold PRG for 3 seconds with the platform empty to tare.
            </Typography>
            {flash.active ? (
              <>
                <LinearProgress
                  variant={flash.progress == null ? 'indeterminate' : 'determinate'}
                  value={flash.progress ?? 0}
                  sx={{ height: 10, borderRadius: 999 }}
                />
                <Typography variant="body2">{flash.message || 'Flashing…'}</Typography>
              </>
            ) : null}
            {notice ? <Alert severity={notice.includes('is on the board') ? 'success' : 'info'}>{notice}</Alert> : null}
            {!serialAvailable() ? (
              <Alert severity="warning">USB flashing needs Chrome or Edge on this computer.</Alert>
            ) : null}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={closeDialog} disabled={flash.active}>Done</Button>
          <Button
            variant="contained"
            startIcon={<UsbIcon />}
            disabled={flash.active || !serialAvailable()}
            onClick={() => runSerial((created || target)?.Node_Code)}
          >
            Flash {(created || target)?.Node_Code}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={dialog === 'delete'} onClose={closeDialog} fullWidth maxWidth="sm">
        <DialogTitle>Remove {target?.Node_Name}?</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Typography>
              <strong>{target?.Node_Code}</strong> leaves the app, including its readings and alerts. The Heltec keeps its firmware until you clear the board.
            </Typography>
            {removeNode.error ? <Alert severity="error">{removeNode.error}</Alert> : null}
            {notice ? <Alert severity="info">{notice}</Alert> : null}
            {flash.active ? (
              <>
                <LinearProgress
                  variant={flash.progress == null ? 'indeterminate' : 'determinate'}
                  value={flash.progress ?? 0}
                  sx={{ height: 10, borderRadius: 999 }}
                />
                <Typography variant="body2">{flash.message || 'Clearing…'}</Typography>
              </>
            ) : null}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, gap: 1, flexWrap: 'wrap' }}>
          <Button onClick={closeDialog} disabled={flash.active}>Cancel</Button>
          <Button disabled={flash.active || !serialAvailable()} onClick={() => runSerial('erase')}>
            Clear the board
          </Button>
          <Button
            color="error"
            variant="contained"
            disabled={removeNode.pending || flash.active}
            onClick={async () => {
              const result = await removeNode.execute(target.NodeID);
              if (!result.ok) return;
              refresh();
              closeDialog();
              setNotice(`${target.Node_Name} was removed.`);
            }}
          >
            Remove node
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

function SetupSteps({ activeStep }) {
  return (
    <Box sx={{ width: '100%', maxWidth: 560, mx: 'auto', mb: 1 }}>
      <Stepper activeStep={activeStep} alternativeLabel>
        <Step completed={activeStep > 0}>
          <StepLabel>Register gateway</StepLabel>
        </Step>
        <Step completed={activeStep > 1}>
          <StepLabel>Add node</StepLabel>
        </Step>
        <Step>
          <StepLabel>Flash Heltec</StepLabel>
        </Step>
      </Stepper>
    </Box>
  );
}

function GatewayForm({ gateway, error, pending, onCancel, onRemove, onSave }) {
  const [code, setCode] = useState(gateway?.Gateway_Code ?? '');
  const [name, setName] = useState(gateway?.Gateway_Name ?? '');
  const [notes, setNotes] = useState(gateway?.Notes ?? '');
  const [point, setPoint] = useState(gateway?.Location ?? null);
  const [localError, setLocalError] = useState('');
  const codeChanged = Boolean(gateway) && code.trim() !== gateway.Gateway_Code;

  const submit = () => {
    const nextCode = code.trim();
    const nextName = name.trim();
    if (!nextCode || !/^[A-Za-z0-9_-]+$/.test(nextCode)) {
      setLocalError('Use letters, numbers, dashes, or underscores for the code.');
      return;
    }
    if (!nextName) {
      setLocalError('Give the gateway a display name.');
      return;
    }
    setLocalError('');
    if (!gateway) {
      onSave({
        Gateway_Code: nextCode,
        Gateway_Name: nextName,
        ...(notes.trim() ? { Notes: notes.trim() } : {}),
        ...(point ? { Latitude: point.lat, Longitude: point.lon } : {}),
      });
      return;
    }
    // An edit sends every field so a cleared one is cleared on the server.
    onSave({
      Gateway_Code: nextCode,
      Gateway_Name: nextName,
      Notes: notes.trim(),
      Latitude: point ? point.lat : null,
      Longitude: point ? point.lon : null,
    });
  };

  return (
    <>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Typography variant="body2" color="text.secondary">
            The code must match <code>GATEWAY_CODE</code> on the Raspberry Pi.
          </Typography>
          <TextField
            label="Gateway code"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="GW-MAPLEGATE"
            required
            fullWidth
          />
          {codeChanged ? (
            <Alert severity="warning">
              Change <code>GATEWAY_CODE</code> on the Pi to <code>{code.trim() || '…'}</code> too,
              or its readings will be rejected.
            </Alert>
          ) : null}
          <TextField
            label="Display name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Maple Gate"
            required
            fullWidth
          />
          <LocationPicker value={point} onChange={setPoint} optional />
          <TextField
            label="Notes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            helperText="Optional. Where it is mounted, how it is powered."
            multiline
            minRows={2}
            slotProps={{ htmlInput: { maxLength: 500 } }}
            fullWidth
          />
          {localError || error ? <Alert severity="error">{localError || error}</Alert> : null}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        {onRemove ? (
          <Button color="error" onClick={onRemove} disabled={pending} sx={{ mr: 'auto' }}>
            Remove gateway
          </Button>
        ) : null}
        <Button onClick={onCancel}>Cancel</Button>
        <Button variant="contained" disabled={pending} onClick={submit}>
          Save gateway
        </Button>
      </DialogActions>
    </>
  );
}
