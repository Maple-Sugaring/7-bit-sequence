import { useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormGroup from '@mui/material/FormGroup';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import dayjs from 'dayjs';
import { LIVE_FROM, LIVE_NODE_IDS, LIVE_TO, dailyWeightRows, presetRange } from '../business/liveWeight';
import { Capability } from '../business/permissions';
import { ChartCard } from '../components/charts/ChartCard';
import { WeightChart } from '../components/charts/SeriesChart';
import { PageHeader } from '../components/common/PageHeader';
import { useAuth } from '../context/auth';
import { useReadings } from '../services/hooks';

function exportWeights(readings, from, to) {
  const lines = ['date,node,tree,weight_lb,sugar_percent'];
  for (const row of readings) {
    const date = String(row.Recorded_At).slice(0, 10);
    if (from && date < from) continue;
    if (to && date > to) continue;
    lines.push(
      [
        date,
        row.NodeID,
        `"${row.nodeName ?? ''}"`,
        row.Weight ?? '',
        row.Sugar_Percent ?? '',
      ].join(','),
    );
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `sugar-woods-${from ?? 'start'}-to-${to ?? 'end'}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

const PRESETS = [
  ['today', 'Today'],
  ['7d', '7 days'],
  ['30d', '30 days'],
  ['2026', '2026'],
];

export function SapDataPage() {
  const { can } = useAuth();
  const initial = presetRange('7d');
  const [from, setFrom] = useState(dayjs(initial.from));
  const [to, setTo] = useState(dayjs(initial.to));
  const [preset, setPreset] = useState('7d');
  const [daily, setDaily] = useState(true);
  const [picked, setPicked] = useState([]);
  const readings = useReadings({ from: LIVE_FROM, to: LIVE_TO });
  const tracked = useMemo(
    () => (readings.data ?? []).filter((row) => LIVE_NODE_IDS.includes(row.NodeID)),
    [readings.data],
  );
  const nodes = useMemo(() => {
    const byId = new Map();
    for (const row of tracked) {
      if (!byId.has(row.NodeID)) {
        byId.set(row.NodeID, { NodeID: row.NodeID, label: row.nodeName ?? `Node ${row.NodeID}` });
      }
    }
    return [...byId.values()];
  }, [tracked]);
  const selectedIds = picked.length ? picked : nodes.map((node) => node.NodeID);
  const weights = useMemo(() => {
    const start = from?.format('YYYY-MM-DD');
    const end = to?.format('YYYY-MM-DD');
    const ranged = tracked.filter((row) => {
      if (selectedIds.length && !selectedIds.includes(row.NodeID)) return false;
      const date = String(row.Recorded_At).slice(0, 10);
      if (start && date < start) return false;
      if (end && date > end) return false;
      return true;
    });
    return {
      ranged,
      ...dailyWeightRows(ranged, {
        nodeIds: selectedIds.length ? selectedIds : LIVE_NODE_IDS,
        daily,
      }),
    };
  }, [tracked, selectedIds, from, to, daily]);

  return (
    <>
      <PageHeader
        title="Sugar Woods"
        actions={
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ alignItems: { sm: 'center' } }}>
            {PRESETS.map(([id, label]) => (
              <Button
                key={id}
                size="small"
                variant={preset === id ? 'contained' : 'outlined'}
                onClick={() => {
                  const range = presetRange(id);
                  setPreset(id);
                  setFrom(dayjs(range.from));
                  setTo(dayjs(range.to));
                }}
              >
                {label}
              </Button>
            ))}
            <Button size="small" variant={daily ? 'contained' : 'outlined'} onClick={() => setDaily((value) => !value)}>
              {daily ? 'Daily' : 'Each reading'}
            </Button>
            <DatePicker
              label="From"
              value={from}
              onChange={(value) => {
                setPreset('');
                setFrom(value);
              }}
              slotProps={{ textField: { size: 'small' } }}
            />
            <DatePicker
              label="To"
              value={to}
              minDate={from ?? undefined}
              onChange={(value) => {
                setPreset('');
                setTo(value);
              }}
              slotProps={{ textField: { size: 'small' } }}
            />
            {can(Capability.EXPORT_DATA) ? (
              <Button
                variant="outlined"
                onClick={() => exportWeights(weights.ranged, from?.format('YYYY-MM-DD'), to?.format('YYYY-MM-DD'))}
              >
                Export CSV
              </Button>
            ) : null}
          </Stack>
        }
      />
      <Typography color="text.secondary" sx={{ mt: -1, mb: 2, textAlign: 'center' }}>
        Gallons of sap, from 0 to a full 10 gallon bucket. Daily keeps the last report of each day.
      </Typography>

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
        <FormGroup sx={{ minWidth: 200 }}>
          {nodes.map((node) => (
            <FormControlLabel
              key={node.NodeID}
              control={
                <Checkbox
                  size="small"
                  checked={picked.length === 0 || picked.includes(node.NodeID)}
                  onChange={() =>
                    setPicked((current) => {
                      const base = current.length ? current : nodes.map((item) => item.NodeID);
                      return base.includes(node.NodeID)
                        ? base.filter((id) => id !== node.NodeID)
                        : [...base, node.NodeID];
                    })
                  }
                />
              }
              label={node.label}
            />
          ))}
        </FormGroup>
        <Box sx={{ flex: 1 }}>
          <ChartCard
            title="2026 weight"
            description="Nodes 001 and 002. Both start selected."
            height={420}
            loading={readings.loading}
            isEmpty={weights.rows.length === 0}
          >
            <WeightChart rows={weights.rows} series={weights.series} />
          </ChartCard>
        </Box>
      </Stack>
    </>
  );
}
