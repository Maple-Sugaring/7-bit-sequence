import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormGroup from '@mui/material/FormGroup';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import dayjs from 'dayjs';
import { 
  COMPARE_REF_YEAR,
  LIVE_FROM,
  LIVE_TO,
  LIVE_YEAR,
  TIME_UNITS,
  dailyWeightRows,
  presetRange,
  yearlyWeightRows, 
} from '../business/liveWeight';
import { exportFileName, exportRows, buildPdf, toCsv } from '../business/weightExport';
import { Capability } from '../business/permissions';
import { ChartCard } from '../components/charts/ChartCard';
import { TREE_COLORS, WeightChart } from '../components/charts/SeriesChart';
import { PageHeader } from '../components/common/PageHeader';
import { EmptyBlock } from '../components/common/StateBlock';
import { useAuth } from '../context/auth';
import { useBush, useReadings } from '../services/hooks';

function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

function exportCsv(readings, from, to) {
  const csv = toCsv(exportRows(readings, from, to));
  download(new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' }), exportFileName(from, to, 'csv'));
}

const PRESETS = [
  ['today', 'Today'],
  ['7d', '7 days'],
  ['30d', '30 days'],
  ['2026', 'Overall year'],
];

// Years offered in Compare mode. Years with no node readings simply draw no lines.
const YEAR_OPTIONS = Array.from({ length: 5 }, (_, index) => LIVE_YEAR - index);

// In Compare mode color = year, dash = tree.
const TREE_DASHES = [undefined, '6 3', '2 3', '10 3 2 3'];

const monthDay = (iso) => String(iso).slice(5, 10);
const yearOf = (iso) => Number(String(iso).slice(0, 4));

function nodeLabel(node) {
  const code = node.Node_Code ? ` · ${node.Node_Code}` : '';
  return `${node.Node_Name}${code}`;
}

export function SapDataPage() {
  const navigate = useNavigate();
  const phone = useMediaQuery('(max-width:600px)');
  const { can, user } = useAuth();
  const canDeploy = can(Capability.DEPLOY_NODES);
  const bush = useBush();
  const initial = presetRange('7d');
  const [from, setFrom] = useState(dayjs(initial.from));
  const [to, setTo] = useState(dayjs(initial.to));
  const [preset, setPreset] = useState('7d');
  const [unit, setUnit] = useState('day');
  // null = untouched (every tree selected); an array is the user's explicit choice, possibly empty.
  const [picked, setPicked] = useState(null);
  const [pdfState, setPdfState] = useState({ busy: false, error: '' });
  const [mode, setMode] = useState('range'); // 'range' | 'compare'
  const [years, setYears] = useState([LIVE_YEAR, LIVE_YEAR - 1]);
  // Earliest year fetched so far. Only ever moves back, so deselecting a year never refetches.
  const [loadedFrom, setLoadedFrom] = useState(LIVE_YEAR);
  const [windowFrom, setWindowFrom] = useState(dayjs(`${COMPARE_REF_YEAR}-01-01`));
  const [windowTo, setWindowTo] = useState(dayjs(`${COMPARE_REF_YEAR}-12-31`));
  const compare = mode === 'compare';
  const readings = useReadings({
    from: loadedFrom === LIVE_YEAR ? LIVE_FROM : `${loadedFrom}-01-01T00:00:00.000Z`,
    to: LIVE_TO,
  });

  const sortedYears = useMemo(() => [...years].sort((a, b) => b - a), [years]);

  function changeMode(next) {
    if (!next) return;
    setMode(next);
    if (next === 'compare') setLoadedFrom((current) => Math.min(current, ...years));
  }

  function changeYears(value) {
    const next = typeof value === 'string' ? value.split(',').map(Number) : value;
    setYears(next);
    if (next.length) setLoadedFrom((current) => Math.min(current, ...next));
  }

  const nodes = useMemo(() => {
    return [...(bush.data ?? [])].sort((a, b) => {
      const stand = String(a.Stand ?? '').localeCompare(String(b.Stand ?? ''));
      if (stand) return stand;
      return String(a.Node_Name ?? '').localeCompare(String(b.Node_Name ?? ''));
    });
  }, [bush.data]);

  const boardIds = useMemo(() => new Set(nodes.map((node) => node.NodeID)), [nodes]);
  const selectedIds = useMemo(() => picked ?? nodes.map((node) => node.NodeID), [picked, nodes]);

  const tracked = useMemo(
    () => (readings.data ?? []).filter((row) => boardIds.has(row.NodeID)),
    [readings.data, boardIds],
  );

  const weights = useMemo(() => {
    if (compare) {
      const startMd = windowFrom?.isValid() ? windowFrom.format('MM-DD') : '01-01';
      const endMd = windowTo?.isValid() ? windowTo.format('MM-DD') : '12-31';
      const yearSet = new Set(years);
      const ranged = tracked.filter((row) => {
        if (!selectedIds.includes(row.NodeID)) return false;
        if (!yearSet.has(yearOf(row.Recorded_At))) return false;
        const day = monthDay(row.Recorded_At);
        return day >= startMd && day <= endMd;
      });
      return {
        ranged,
        ...yearlyWeightRows(ranged, { nodeIds: selectedIds, years: sortedYears, unit }),
      };
    }
    const start = from?.format('YYYY-MM-DD');
    const end = to?.format('YYYY-MM-DD');
    const ranged = tracked.filter((row) => {
      if (!selectedIds.includes(row.NodeID)) return false;
      const date = String(row.Recorded_At).slice(0, 10);
      if (start && date < start) return false;
      if (end && date > end) return false;
      return true;
    });
    return {
      ranged,
      ...dailyWeightRows(ranged, {
        nodeIds: selectedIds,
        unit,
      }),
    };
  }, [tracked, selectedIds, from, to, unit, compare, years, sortedYears, windowFrom, windowTo]);

  // Compare mode: color by year, dash by tree, so many lines stay readable.
  const chartSeries = useMemo(() => {
    if (!compare) return weights.series;
    const nodeOrder = nodes.map((node) => String(node.NodeID));
    return weights.series.map((item) => ({
      ...item,
      color: TREE_COLORS[sortedYears.indexOf(item.year) % TREE_COLORS.length],
      dash: TREE_DASHES[nodeOrder.indexOf(item.nodeId) % TREE_DASHES.length],
    }));
  }, [compare, weights.series, nodes, sortedYears]);

  // Export covers the span of the selected years; `ranged` is already trimmed to the chosen
  // years, trees and month/day window, so unselected years never reach the file.
  const exportStart = compare ? `${Math.min(...years, LIVE_YEAR)}-01-01` : from?.format('YYYY-MM-DD');
  const exportEnd = compare ? `${Math.max(...years, 0) || LIVE_YEAR}-12-31` : to?.format('YYYY-MM-DD');

  const stands = useMemo(() => {
    const names = [...new Set(nodes.map((node) => node.Stand).filter(Boolean))];
    return names;
  }, [nodes]);

  const treeSummary = `${stands.length === 1 ? stands[0] : 'Deployed trees'} · ${nodes.length} node${nodes.length === 1 ? '' : 's'}`;
  const chartDescription = nodes.length
    ? compare
      ? `${treeSummary}. Color is the year, line style is the tree.`
      : `${treeSummary}. All start selected.`
    : 'Weight history for every tree registered on Deploy.';
  const chartTitle = compare ? 'Year-over-year weight' : `${LIVE_YEAR} weight`;

  const emptyTitle = nodes.length === 0
    ? 'No trees deployed yet'
    : selectedIds.length === 0
      ? 'No trees selected'
      : compare && years.length === 0
        ? 'No years selected'
        : compare
          ? 'No weight in these years'
          : 'No weight in this range';
  const emptyDescription = nodes.length === 0
    ? 'Register a gateway and add nodes on Deploy, then flash the Heltecs. Readings show up here once packets arrive.'
    : selectedIds.length === 0
      ? 'Pick at least one tree to chart its weight.'
      : compare && years.length === 0
        ? 'Pick at least one year to compare.'
        : compare
          ? 'Widen the date window or add another year. Years before the nodes went live have no readings.'
          : 'Widen the dates, or wait for the next LoRa packet from a selected tree.';

  const loading = bush.loading || readings.loading;

  const exportActions = can(Capability.EXPORT_DATA) ? (
    <Stack direction="row" spacing={1}>
      <Button
        size="small"
        variant="outlined"
        disabled={weights.ranged.length === 0}
        onClick={() => exportCsv(weights.ranged, exportStart, exportEnd)}
      >
        Export CSV
      </Button>
      <Button
        size="small"
        variant="outlined"
        disabled={weights.ranged.length === 0 || pdfState.busy}
        onClick={async () => {
          const start = exportStart;
          const end = exportEnd;
          setPdfState({ busy: true, error: '' });
          try {
            const doc = await buildPdf(exportRows(weights.ranged, start, end), {
              from: start,
              to: end,
              user: user?.fullName ?? user?.email,
            });
            download(doc.output('blob'), exportFileName(start, end, 'pdf'));
            setPdfState({ busy: false, error: '' });
          } catch {
            setPdfState({ busy: false, error: 'Could not create the PDF. Try again.' });
          }
        }}
      >
        {pdfState.busy ? 'Preparing PDF…' : 'Export PDF'}
      </Button>
    </Stack>
  ) : null;

  return (
    <>
      <PageHeader
        title="Sugar Woods"
        subtitle="Chart gallons in each bucket over time, then export a CSV or PDF when you need it."
      />

      <Box sx={{ maxWidth: 900, mx: 'auto', mb: 1.5 }}>
        <ToggleButtonGroup size="small" exclusive value={mode} onChange={(_, next) => changeMode(next)} aria-label="View">
          <ToggleButton value="range">Current range</ToggleButton>
          <ToggleButton value="compare">Compare years</ToggleButton>
        </ToggleButtonGroup>
      </Box>

      <Box
        sx={{
          display: 'grid',
          // One column on phones, where `order` puts each heading above its own control.
          gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1.7fr)' },
          gridTemplateRows: { md: 'auto auto' },
          columnGap: 2,
          rowGap: 1.5,
          maxWidth: 900,
          mx: 'auto',
          mb: 2,
        }}
      >
        <Typography variant="subtitle2" component="h2" sx={{ order: { xs: 1, md: 0 } }}>
          {compare ? 'Years' : 'Time period'}
        </Typography>
        <Typography variant="subtitle2" component="h2" sx={{ order: { xs: 3, md: 0 } }}>
          Time increment
        </Typography>
        <Typography variant="subtitle2" component="h2" sx={{ order: { xs: 5, md: 0 } }}>
          {compare ? 'Date window (each year)' : 'Date selection'}
        </Typography>
        {compare ? (
          <TextField
            select
            size="small"
            label="Select"
            value={years}
            onChange={(event) => changeYears(event.target.value)}
            slotProps={{
              select: { multiple: true, renderValue: (value) => [...value].sort((a, b) => b - a).join(', ') },
              inputLabel: { shrink: true },
            }}
            sx={{ order: { xs: 2, md: 0 } }}
          >
            {YEAR_OPTIONS.map((year) => (
              <MenuItem key={year} value={year}>
                <Checkbox size="small" checked={years.includes(year)} />
                {year}
              </MenuItem>
            ))}
          </TextField>
        ) : (
        <TextField
          select
          size="small"
          label="Select"
          value={preset}
          onChange={(event) => {
            const range = presetRange(event.target.value);
            setPreset(event.target.value);
            setFrom(dayjs(range.from));
            setTo(dayjs(range.to));
          }}
          slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
          sx={{ order: { xs: 2, md: 0 } }}
        >
          {preset === '' ? (
            <MenuItem value="" disabled>
              Custom dates
            </MenuItem>
          ) : null}
          {PRESETS.map(([id, label]) => (
            <MenuItem key={id} value={id}>
              {label}
            </MenuItem>
          ))}
        </TextField>
        )}
        <TextField
          select
          size="small"
          label="Select"
          value={unit}
          onChange={(event) => setUnit(event.target.value)}
          sx={{ order: { xs: 4, md: 0 } }}
        >
          {TIME_UNITS.map(([id, label]) => (
            <MenuItem key={id} value={id}>
              {label}
            </MenuItem>
          ))}
        </TextField>
        {compare ? (
        <Stack direction="row" spacing={1} sx={{ order: { xs: 6, md: 0 } }}>
          <DatePicker
            label="From"
            value={windowFrom}
            views={['month', 'day']}
            format="MMM D"
            onChange={setWindowFrom}
            slotProps={{ textField: { size: 'small' } }}
            sx={{ flex: 1, minWidth: 0 }}
          />
          <DatePicker
            label="To"
            value={windowTo}
            views={['month', 'day']}
            format="MMM D"
            minDate={windowFrom ?? undefined}
            onChange={setWindowTo}
            slotProps={{ textField: { size: 'small' } }}
            sx={{ flex: 1, minWidth: 0 }}
          />
        </Stack>
        ) : (
        <Stack direction="row" spacing={1} sx={{ order: { xs: 6, md: 0 } }}>
          <DatePicker
            label="From"
            value={from}
            onChange={(value) => {
              setPreset('');
              setFrom(value);
            }}
            slotProps={{ textField: { size: 'small' } }}
            sx={{ flex: 1, minWidth: 0 }}
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
            sx={{ flex: 1, minWidth: 0 }}
          />
        </Stack>
        )}
      </Box>

      {pdfState.error ? (
        <Typography color="error" role="alert" sx={{ mb: 1 }}>
          {pdfState.error}
        </Typography>
      ) : null}

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
                        checked={selectedIds.includes(node.NodeID)}
                        onChange={() =>
                          setPicked((current) => {
                            const base = current ?? nodes.map((item) => item.NodeID);
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
            {nodes.length > 0 ? (
              <Button
                size="small"
                sx={{ mt: 1 }}
                onClick={() => setPicked(selectedIds.length === nodes.length ? [] : null)}
              >
                {selectedIds.length === nodes.length ? 'Clear all' : 'Select all'}
              </Button>
            ) : null}
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <ChartCard
              title={chartTitle}
              description={chartDescription}
              action={exportActions}
              height={phone ? 300 : 420}
              loading={loading}
              isEmpty={weights.rows.length === 0}
              emptyTitle={emptyTitle}
              emptyDescription={emptyDescription}
            >
              <WeightChart rows={weights.rows} series={chartSeries} unit={unit} />
            </ChartCard>
          </Box>
        </Stack>
      )}
    </>
  );
}
