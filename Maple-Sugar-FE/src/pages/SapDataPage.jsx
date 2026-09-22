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
import { Capability } from '../business/permissions';
import { ChartCard } from '../components/charts/ChartCard';
import { OverlayChart } from '../components/charts/SeriesChart';
import { PageHeader } from '../components/common/PageHeader';
import { useAuth } from '../context/auth';
import { useSapCompare } from '../services/hooks';

const COLORS = ['#F76902', '#009CBD', '#84BD00'];

function exportSeason(nodes, from, to) {
  const lines = ['date,site,tree,flow_gal,afternoon_high_f,sugar_percent,weight_lb'];
  for (const node of nodes) {
    for (const point of node.Points) {
      if (from && point.Date < from) continue;
      if (to && point.Date > to) continue;
      lines.push(
        [
          point.Date,
          node.Stand,
          `"${node.Node_Name}"`,
          point.Flow_Gal ?? '',
          point.Temp_Max_F ?? '',
          point.Sugar_Percent ?? '',
          point.Weight_Lb ?? '',
        ].join(','),
      );
    }
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `sugar-woods-${from ?? 'start'}-to-${to ?? 'end'}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export function SapDataPage() {
  const { can } = useAuth();
  const [from, setFrom] = useState(dayjs('2024-02-01'));
  const [to, setTo] = useState(dayjs('2024-04-15'));
  const [picked, setPicked] = useState([]);
  const year = from?.year() ?? 2024;
  const compare = useSapCompare(year);
  const nodes = compare.data?.Nodes ?? [];
  const selected = nodes.filter((node) => (picked.length ? picked.includes(node.NodeID) : true));

  const rows = useMemo(() => {
    const start = from?.format('YYYY-MM-DD');
    const end = to?.format('YYYY-MM-DD');
    const byDate = new Map();
    for (const node of selected) {
      for (const point of node.Points) {
        if (start && point.Date < start) continue;
        if (end && point.Date > end) continue;
        const row = byDate.get(point.Date) ?? { Date: point.Date };
        row[`${node.NodeID}-flow`] = point.Flow_Gal;
        row[`${node.NodeID}-temp`] = point.Temp_Max_F;
        byDate.set(point.Date, row);
      }
    }
    return [...byDate.values()];
  }, [selected, from, to]);

  const flowSeries = selected.map((node, index) => ({
    key: `${node.NodeID}-flow`,
    name: `${node.Stand} sap`,
    color: COLORS[index % COLORS.length],
  }));
  const tempSeries = selected.map((node, index) => ({
    key: `${node.NodeID}-temp`,
    name: `${node.Stand} afternoon high`,
    color: COLORS[index % COLORS.length],
  }));

  return (
    <>
      <PageHeader
        title="Sugar Woods"
        actions={
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            <DatePicker
              label="From"
              value={from}
              onChange={(value) => setFrom(value)}
              slotProps={{ textField: { size: 'small' } }}
            />
            <DatePicker
              label="To"
              value={to}
              minDate={from ?? undefined}
              onChange={(value) => setTo(value)}
              slotProps={{ textField: { size: 'small' } }}
            />
            {can(Capability.EXPORT_DATA) ? (
              <Button
                variant="outlined"
                onClick={() => exportSeason(selected, from?.format('YYYY-MM-DD'), to?.format('YYYY-MM-DD'))}
              >
                Export CSV
              </Button>
            ) : null}
          </Stack>
        }
      />
      <Typography color="text.secondary" sx={{ mt: -1, mb: 2, textAlign: 'center' }}>
        Solid lines are sap flow. Dashed lines are the afternoon high, over the same days.
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
              label={node.Stand}
            />
          ))}
        </FormGroup>
        <Box sx={{ flex: 1 }}>
          <ChartCard
            title="Flow over the afternoon high"
            description="Pick any stretch of the sap year. All three taps start selected."
            height={420}
            loading={compare.loading}
            isEmpty={rows.length === 0}
          >
            <OverlayChart rows={rows} flowSeries={flowSeries} tempSeries={tempSeries} />
          </ChartCard>
        </Box>
      </Stack>
    </>
  );
}
