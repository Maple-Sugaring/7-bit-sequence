import { useState } from 'react';
import { Alert, Button, Card, CardContent, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { deriveMapStatus, STATUS_META } from '../../business/nodeMapStatus';
import { lifecycleCsv, lifecycleRow, SENSOR_KIT } from '../../business/sensorLifecycle';
import { listSensorLifecycle, recordSensorEvent } from '../../data/repositories/nodesRepository';
import { useAction, useAsync } from '../../services/hooks/useAsync';
import { dateTime } from '../common/format';

function downloadBudget(rows) {
  const url = URL.createObjectURL(new Blob([lifecycleCsv(rows)], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'sensor-replacement-budget.csv';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function SensorLifecycleCard() {
  const lifecycle = useAsync(listSensorLifecycle);
  const save = useAction(recordSensorEvent);
  const [nodeId, setNodeId] = useState('');
  const [type, setType] = useState('installation');
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
  const [date, setDate] = useState(today);
  const [sensorType, setSensorType] = useState(SENSOR_KIT);
  const [notes, setNotes] = useState('');
  const [kitCost, setKitCost] = useState('20');
  const [serviceYears, setServiceYears] = useState('3');
  const [attentionOnly, setAttentionOnly] = useState(false);

  const rows = (lifecycle.data ?? []).map((node) => {
    const plan = lifecycleRow(node, {
      kitCost: kitCost === '' ? NaN : Number(kitCost),
      serviceYears: Number(serviceYears),
    }, today);
    const status = STATUS_META[deriveMapStatus({
      NodeID: node.NodeID, Last_Seen: node.LastSeen, Status_Code: node.Status,
    }, { faultNodeIds: new Set(node.Fault ? [node.NodeID] : []) })].label;
    return { node, plan, status };
  });
  const visible = attentionOnly ? rows.filter(({ node, plan, status }) =>
    status !== 'Online' || node.Fault || !plan.due || plan.due <= today ||
    /unknown|stale|weak|low/i.test(`${plan.battery} ${plan.signal}`),
  ) : rows;
  const budget = visible.reduce((sum, { plan }) => sum + (plan.cost ?? 0), 0);

  async function submit(event) {
    event.preventDefault();
    const result = await save.execute(nodeId, {
      type, date, notes, ...(type === 'maintenance' ? {} : { sensorType }),
    });
    if (result.ok) {
      setNotes('');
      lifecycle.refresh();
    }
  }

  return (
    <Card sx={{ my: 2 }}>
      <CardContent>
        <Stack spacing={2}>
          <Typography variant="h6" component="h2">Sensor health and replacement budget</Typography>
          <Typography variant="body2">
            Budget covers one load-cell kit and a $4.95 HX711 per weighing assembly.
            The $20 kit allowance and three-year service life are planning assumptions.
            Changes to these inputs apply to the current view and its export.
            Battery below 20% and signal below −110 dBm are flagged.
            Readings are stale after two expected report intervals.
          </Typography>
          {lifecycle.error && <Alert severity="error">{lifecycle.error}</Alert>}
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            <TextField label="Kit cost (USD)" type="number" value={kitCost}
              slotProps={{ htmlInput: { min: 0, step: 0.01 } }}
              onChange={(event) => setKitCost(event.target.value)} />
            <TextField label="Service life (whole years)" type="number" value={serviceYears}
              slotProps={{ htmlInput: { min: 1, max: 100, step: 1 } }}
              onChange={(event) => setServiceYears(event.target.value)} />
            <Button onClick={lifecycle.refresh} disabled={lifecycle.loading}>Refresh</Button>
            <Button onClick={() => setAttentionOnly(!attentionOnly)}>
              {attentionOnly ? 'Show all sensors' : 'Show sensors needing attention'}
            </Button>
            <Button onClick={() => downloadBudget(visible)} disabled={!visible.length}>Export CSV</Button>
          </Stack>
          <Typography variant="body2">
            Known replacement costs for displayed sensors: ${budget.toFixed(2)} USD
            ({visible.filter(({ plan }) => plan.cost == null).length} unpriced).
          </Typography>
          {visible.map(({ node, plan, status }) => (
            <Stack key={node.NodeID} spacing={0.5} sx={{ borderTop: 1, borderColor: 'divider', pt: 1 }}>
              <Typography fontWeight={600}>
                {node.Name} · {status}{node.Fault ? ` · Fault: ${node.Fault}` : ''}
              </Typography>
              <Typography variant="body2">
                Battery {plan.battery} · Signal {plan.signal} · Last seen {dateTime(node.LastSeen)}
              </Typography>
              <Typography variant="body2">
                {plan.installed
                  ? `${plan.installed.sensorType} · ${plan.ageDays} days old · Installed ${plan.installed.date}${plan.installed.assumed ? ' (assumed)' : ''}`
                  : 'Installation unknown'}
                {' · '}{plan.due ? `Replacement due ${plan.due}` : 'Replacement date unknown'}
                {' · '}{plan.cost == null ? 'Cost unknown' : `$${plan.cost.toFixed(2)}`}
              </Typography>
              {node.History.length > 0 && (
                <details>
                  <summary>Lifecycle history</summary>
                  <ul>{node.History.map((entry) => (
                    <li key={entry.id}>
                      {entry.date} · {entry.type}{entry.assumed ? ' (assumed)' : ''}
                      {entry.sensorType ? ` · ${entry.sensorType}` : ''}
                      {entry.notes ? ` · ${entry.notes}` : ''}
                    </li>
                  ))}</ul>
                </details>
              )}
            </Stack>
          ))}
          <Stack component="form" spacing={1} onSubmit={submit}>
            <Typography variant="subtitle1">Record lifecycle event</Typography>
            {save.error && <Alert severity="error">{save.error}</Alert>}
            <TextField select label="Node" required value={nodeId} onChange={(event) => setNodeId(event.target.value)}>
              {rows.map(({ node }) => <MenuItem key={node.NodeID} value={node.NodeID}>{node.Name}</MenuItem>)}
            </TextField>
            <TextField select label="Event" value={type} onChange={(event) => setType(event.target.value)}>
              <MenuItem value="installation">Installation</MenuItem>
              <MenuItem value="replacement">Replacement</MenuItem>
              <MenuItem value="maintenance">Maintenance</MenuItem>
            </TextField>
            <TextField label="Date" type="date" required value={date}
              slotProps={{ htmlInput: { max: today }, inputLabel: { shrink: true } }}
              onChange={(event) => setDate(event.target.value)} />
            {type !== 'maintenance' && <TextField label="Sensor type" required value={sensorType}
              onChange={(event) => setSensorType(event.target.value)} />}
            <TextField label="Notes" required={type === 'maintenance'} value={notes}
              onChange={(event) => setNotes(event.target.value)} />
            <Button type="submit" variant="contained" disabled={save.pending || !nodeId}>Save event</Button>
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );
}
