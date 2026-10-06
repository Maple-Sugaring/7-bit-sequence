import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormGroup from '@mui/material/FormGroup';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import dayjs from 'dayjs';
import { LIVE_FROM, LIVE_TO, TIME_UNITS, dailyWeightRows, presetRange } from '../business/liveWeight';
import { Capability } from '../business/permissions';
import { ChartCard } from '../components/charts/ChartCard';
import { WeightChart } from '../components/charts/SeriesChart';
import { PageHeader } from '../components/common/PageHeader';
import { EmptyBlock } from '../components/common/StateBlock';
import { useAuth } from '../context/auth';
import { useBush, useReadings } from '../services/hooks';

function exportWeights(readings, from, to) {
  const lines = ['date,node,tree,stand,weight_lb,sugar_percent'];
  for (const row of readings) {
    const date = String(row.Recorded_At).slice(0, 10);
    if (from && date < from) continue;
    if (to && date > to) continue;
    lines.push(
      [
        date,
        row.NodeID,
        `"${row.nodeName ?? ''}"`,
        `"${row.stand ?? ''}"`,
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

function nodeLabel(node) {
  const code = node.Node_Code ? ` · ${node.Node_Code}` : '';
  return `${node.Node_Name}${code}`;
}

export function SapDataPage() {
  const navigate = useNavigate();
  const phone = useMediaQuery('(max-width:600px)');
  const { can } = useAuth();
  const canDeploy = can(Capability.DEPLOY_NODES);
  const bush = useBush();
  const initial = presetRange('7d');
  const [from, setFrom] = useState(dayjs(initial.from));
  const [to, setTo] = useState(dayjs(initial.to));
  const [preset, setPreset] = useState('7d');
  const [unit, setUnit] = useState('day');
  const [picked, setPicked] = useState([]);
  const readings = useReadings({ from: LIVE_FROM, to: LIVE_TO });

  const nodes = useMemo(() => {
    return [...(bush.data ?? [])].sort((a, b) => {
      const stand = String(a.Stand ?? '').localeCompare(String(b.Stand ?? ''));
      if (stand) return stand;
      return String(a.Node_Name ?? '').localeCompare(String(b.Node_Name ?? ''));
    });
  }, [bush.data]);

  const boardIds = useMemo(() => new Set(nodes.map((node) => node.NodeID)), [nodes]);
  const selectedIds = picked.length ? picked : nodes.map((node) => node.NodeID);

  const tracked = useMemo(
    () => (readings.data ?? []).filter((row) => boardIds.has(row.NodeID)),
    [readings.data, boardIds],
  );

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
        nodeIds: selectedIds.length ? selectedIds : [...boardIds],
        unit,
      }),
    };
  }, [tracked, selectedIds, from, to, unit, boardIds]);

  const stands = useMemo(() => {
    const names = [...new Set(nodes.map((node) => node.Stand).filter(Boolean))];
    return names;
  }, [nodes]);

  const chartDescription = nodes.length
    ? `${stands.length === 1 ? stands[0] : 'Deployed trees'} · ${nodes.length} node${nodes.length === 1 ? '' : 's'}. All start selected.`
    : 'Weight history for every tree registered on Deploy.';

  const emptyTitle = nodes.length === 0
    ? 'No trees deployed yet'
    : 'No weight in this range';
  const emptyDescription = nodes.length === 0
    ? 'Register a gateway and add nodes on Deploy, then flash the Heltecs. Readings show up here once packets arrive.'
    : 'Widen the dates, or wait for the next LoRa packet from a selected tree.';

  const loading = bush.loading || readings.loading;

  return (
    <>
      <PageHeader
        title="Sugar Woods"
        subtitle="Chart gallons in each bucket over time, then export a CSV when you need it."
        actions={
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center', justifyContent: 'center', width: '100%' }}>
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
            {TIME_UNITS.map(([id, label]) => (
              <Button key={id} size="small" variant={unit === id ? 'contained' : 'outlined'} onClick={() => setUnit(id)}>
                {label}
              </Button>
            ))}
            <DatePicker
              label="From"
              value={from}
              onChange={(value) => {
                setPreset('');
                setFrom(value);
              }}
              slotProps={{ textField: { size: 'small' } }}
              sx={{ flex: { xs: '1 1 140px', sm: '0 1 auto' }, minWidth: 0 }}
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
              sx={{ flex: { xs: '1 1 140px', sm: '0 1 auto' }, minWidth: 0 }}
            />
            {can(Capability.EXPORT_DATA) ? (
              <Button
                variant="outlined"
                sx={{ flex: { xs: '1 1 100%', sm: '0 0 auto' } }}
                disabled={weights.ranged.length === 0}
                onClick={() => exportWeights(weights.ranged, from?.format('YYYY-MM-DD'), to?.format('YYYY-MM-DD'))}
              >
                Export CSV
              </Button>
            ) : null}
          </Box>
        }
      />

      {nodes.length === 0 && !loading ? (
        <EmptyBlock
          title="Nothing to chart yet"
          description="Sugar Woods follows the trees registered on Deploy. Add the Alumni House nodes there, flash them, and weight packets will fill this chart."
          action={
            canDeploy ? (
              <Button variant="contained" onClick={() => navigate('/deploy')}>
                Open Deploy
              </Button>
            ) : null
          }
        />
      ) : (
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
          <Box
            sx={{
              minWidth: { md: 240 },
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: 2,
              bgcolor: 'background.paper',
              p: 2,
            }}
          >
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              Trees
            </Typography>
            {nodes.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                No deployed nodes yet.
              </Typography>
            ) : (
              <FormGroup>
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
                    label={
                      <Box>
                        <Typography variant="body2">{nodeLabel(node)}</Typography>
                        {node.Stand ? (
                          <Typography variant="caption" color="text.secondary">
                            {node.Stand}
                          </Typography>
                        ) : null}
                      </Box>
                    }
                  />
                ))}
              </FormGroup>
            )}
            {picked.length > 0 ? (
              <Button size="small" sx={{ mt: 1 }} onClick={() => setPicked([])}>
                Select all
              </Button>
            ) : null}
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <ChartCard
              title="2026 weight"
              description={chartDescription}
              height={phone ? 300 : 420}
              loading={loading}
              isEmpty={weights.rows.length === 0}
              emptyTitle={emptyTitle}
              emptyDescription={emptyDescription}
            >
              <WeightChart rows={weights.rows} series={weights.series} unit={unit} />
            </ChartCard>
          </Box>
        </Stack>
      )}
    </>
  );
}
