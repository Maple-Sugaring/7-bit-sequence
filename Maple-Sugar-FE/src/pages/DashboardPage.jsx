import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardActionArea from '@mui/material/CardActionArea';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Grid from '@mui/material/Grid';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import {
  formatShelfLife,
  remainingShelfLifeHours,
  shelfLifeFromReadings,
  shelfLifeSeverity,
} from '../business/shelfLife';
import { estimatedSyrupGallons } from '../business/sugarContent';
import { isFull } from '../business/yieldMetrics';
import { LIVE_FROM, LIVE_NODE_IDS, LIVE_TO, bucketGallons, bucketPercent, recordedSugar } from '../business/liveWeight';
import { SiteForecastChart } from '../components/charts/SeriesChart';
import { MeterBar } from '../components/common/MeterBar';
import { PageHeader } from '../components/common/PageHeader';
import { dateTime } from '../components/common/format';
import { useBush, useJournal, useLiveWeather, useReadings } from '../services/hooks';

const STATUS = {
  0: { label: 'Offline', color: 'error' },
  1: { label: 'Online', color: 'success' },
  2: { label: 'Degraded', color: 'warning' },
  3: { label: 'Maintenance', color: 'info' },
};

function Meter({ label, value, percent, detail, color }) {
  return (
    <Box sx={{ mt: 1.5 }}>
      <Stack direction="row" sx={{ justifyContent: 'space-between' }}>
        <Typography variant="caption" color="text.secondary">
          {label}
        </Typography>
        <Typography variant="caption">{value}</Typography>
      </Stack>
      <MeterBar percent={percent} color={color} />
      <Typography variant="caption" color="text.secondary">
        {detail}
      </Typography>
    </Box>
  );
}

export function DashboardPage() {
  const navigate = useNavigate();
  const bush = useBush();
  const live = useLiveWeather();
  const readings = useReadings({ from: LIVE_FROM, to: LIVE_TO });
  const journal = useJournal();
  const weather = live.data?.Sites?.[0] ?? (live.data?.Configured ? live.data : null);
  const totals = useMemo(() => {
    const tracked = new Set(LIVE_NODE_IDS);
    const weights = (readings.data ?? []).filter((row) => tracked.has(row.NodeID) && row.Weight != null);
    const sugars = recordedSugar([...(readings.data ?? []), ...(journal.data ?? [])]);
    const sugar = sugars.length ? sugars.reduce((sum, value) => sum + value, 0) / sugars.length : null;
    const syrup = (bush.data ?? []).reduce((sum, node) => {
      const gallons = bucketGallons(node.Weight, node.Tare_Weight ?? 0);
      return sum + (estimatedSyrupGallons(gallons, node.Sugar_Percent) ?? 0);
    }, 0);
    const measured = (bush.data ?? []).some((node) => node.Sugar_Percent != null);
    return { readings: weights.length, sugar, syrup, measured };
  }, [readings.data, journal.data, bush.data]);

  const shelfByNode = useMemo(() => {
    const ambient = weather?.Temperature_F ?? null;
    const map = new Map();
    for (const node of bush.data ?? []) {
      const rows = (readings.data ?? []).filter((row) => row.NodeID === node.NodeID);
      const fromProbe = shelfLifeFromReadings(rows);
      if (fromProbe) {
        map.set(node.NodeID, { ...fromProbe, source: 'sap temperature' });
        continue;
      }
      if (ambient == null || !node.Recorded_At) continue;
      const hours = remainingShelfLifeHours({
        filledAt: node.Recorded_At,
        temperatureF: ambient,
        sugarPercent: node.Sugar_Percent,
      });
      map.set(node.NodeID, {
        hours,
        label: formatShelfLife(hours),
        severity: shelfLifeSeverity(hours),
        source: 'air temperature',
      });
    }
    return map;
  }, [bush.data, readings.data, weather]);

  const offlineNodes = (bush.data ?? []).filter((node) => node.Status_Code === 0);
  const shortestShelf = [...shelfByNode.values()].reduce((soonest, entry) => {
    if (entry.hours == null) return soonest;
    if (!soonest || entry.hours < soonest.hours) return entry;
    return soonest;
  }, null);

  return (
    <>
      <PageHeader
        title="The Bush"
        subtitle="Live weather and bucket fill for every tree on Deploy."
      />

      <Box sx={{ mb: 3 }}>
        <Card>
          <CardContent>
            <Typography variant="h5" component="h2">
              RIT weather
            </Typography>
            {live.error ? <Alert severity="warning">{live.error}</Alert> : null}
            {!live.data?.Configured && live.data?.Message ? <Alert severity="info">{live.data.Message}</Alert> : null}
            {weather ? (
              <>
                <Typography variant="h3" sx={{ mt: 1 }}>
                  {weather.Temperature_F}°F
                </Typography>
                <Typography color="text.secondary">
                  {weather.Description ?? weather.Conditions} · low {weather.Temp_Min_F}° · afternoon high {weather.Temp_Max_F}°
                </Typography>
                <Typography sx={{ mt: 1, mb: 1 }}>{weather.Summary}</Typography>
                <Box sx={{ height: 240 }}>
                  <SiteForecastChart rows={weather.Forecast ?? []} />
                </Box>
              </>
            ) : null}
          </CardContent>
        </Card>
      </Box>

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ justifyContent: 'space-between' }}>
            <Box>
              <Typography variant="h5" component="h2">
                2026 weight
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Gallons of sap in each 10 gallon bucket. Sugar content is the Brix reading from collection.
              </Typography>
            </Box>
            <Button variant="outlined" onClick={() => navigate('/table')}>
              Open Sugar Woods
            </Button>
          </Stack>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid size={{ xs: 12, sm: 6, md: 4 }}>
              <Typography variant="overline">In the buckets now</Typography>
              {(bush.data ?? []).map((node) => {
                const gallons = bucketGallons(node.Weight, node.Tare_Weight ?? 0);
                const full = isFull(node.Weight, node.Tare_Weight ?? 0);
                return (
                  <Stack key={node.NodeID} direction="row" sx={{ justifyContent: 'space-between', py: 0.5 }}>
                    <Typography>{node.Node_Name}</Typography>
                    <Typography fontWeight={700}>
                      {gallons == null ? '—' : `${gallons.toFixed(1)} gal · ${Number(node.Weight).toFixed(1)} lb`}
                      {full ? ' · full' : ''}
                    </Typography>
                  </Stack>
                );
              })}
            </Grid>
            <Grid size={{ xs: 6, sm: 3, md: 2 }}>
              <Typography variant="overline">Weight readings</Typography>
              <Typography variant="h4">{totals.readings}</Typography>
              <Typography variant="body2" color="text.secondary">
                Nodes 001 and 002 in 2026
              </Typography>
            </Grid>
            <Grid size={{ xs: 6, sm: 3, md: 2 }}>
              <Typography variant="overline">Sugar content</Typography>
              <Typography variant="h4">{totals.sugar == null ? '—' : `${totals.sugar.toFixed(1)}%`}</Typography>
              <Typography variant="body2" color="text.secondary">
                {totals.sugar == null ? 'Brix is recorded at collection' : 'Average Brix from recorded readings'}
              </Typography>
            </Grid>
            <Grid size={{ xs: 6, sm: 3, md: 2 }}>
              <Typography variant="overline">Shelf life</Typography>
              <Typography variant="h4">{shortestShelf?.label ?? '—'}</Typography>
              <Typography variant="body2" color="text.secondary">
                {shortestShelf ? `Shortest window, from ${shortestShelf.source}` : 'Needs a temperature and a reading'}
              </Typography>
            </Grid>
            <Grid size={{ xs: 6, sm: 3, md: 2 }}>
              <Typography variant="overline">Estimated syrup</Typography>
              <Typography variant="h4">{totals.syrup.toFixed(2)} gal</Typography>
              <Typography variant="body2" color="text.secondary">
                {totals.measured
                  ? '40:1, replaced where a student recorded sugar'
                  : '40 gallons of sap per gallon of syrup'}
              </Typography>
            </Grid>
          </Grid>
          {(bush.data ?? []).some((node) => isFull(node.Weight, node.Tare_Weight ?? 0)) ? (
            <Alert severity="warning" sx={{ mt: 2 }} action={<Button color="inherit" onClick={() => navigate('/notifications')}>Alerts</Button>}>
              A bucket is full. Collect it before it spills, or open the alerts.
            </Alert>
          ) : null}
          {offlineNodes.length ? (
            <Alert severity="error" sx={{ mt: 2 }} action={<Button color="inherit" onClick={() => navigate('/notifications')}>Alerts</Button>}>
              {offlineNodes.map((node) => node.Node_Name).join(', ')} {offlineNodes.length === 1 ? 'is' : 'are'} offline and not reporting.
            </Alert>
          ) : null}
        </CardContent>
      </Card>

      <Grid container spacing={2}>
        {(bush.data ?? []).map((node) => {
          const status = STATUS[node.Status_Code] ?? STATUS[1];
          const gallons = bucketGallons(node.Weight, node.Tare_Weight ?? 0);
          const fill = bucketPercent(node.Weight, node.Tare_Weight ?? 0);
          const shelf = shelfByNode.get(node.NodeID);
          const tip = [
            node.Node_Name,
            `Status ${status.label}`,
            node.Signal_Rssi != null ? `Signal ${node.Signal_Rssi} dBm` : null,
            node.Sugar_Percent != null ? `Sugar ${node.Sugar_Percent}%` : null,
            node.Ice_Present ? 'Ice in the bucket' : null,
            node.Recorded_At ? `Last reading ${dateTime(node.Recorded_At)}` : 'No reading yet',
            node.Last_Seen ? `Last seen ${dateTime(node.Last_Seen)}` : null,
          ]
            .filter(Boolean)
            .join(' · ');

          return (
            <Grid key={node.NodeID} size={{ xs: 12, md: 4 }}>
              <Tooltip title={tip} placement="top" arrow>
                <Card sx={{ height: '100%' }}>
                  <CardActionArea onClick={() => navigate(`/nodes/${node.NodeID}`)} sx={{ height: '100%' }}>
                    <CardContent>
                      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
                        <Typography variant="h6">{node.Stand}</Typography>
                        <Chip size="small" label={status.label} color={status.color} />
                      </Stack>
                      <Typography variant="body2" color="text.secondary">
                        {node.Node_Name}
                      </Typography>
                      <Meter
                        label="Battery"
                        value={node.Battery_Percent == null ? '—' : `${Math.round(node.Battery_Percent)}%`}
                        percent={node.Battery_Percent ?? 0}
                        detail={node.Battery_Percent == null ? 'No report' : 'Charge on the node pack'}
                        color={node.Battery_Percent < 20 ? '#c62828' : '#2e7d32'}
                      />
                      <Meter
                        label="Bucket"
                        value={gallons == null ? '—' : `${gallons.toFixed(1)} gal · ${Number(node.Weight).toFixed(1)} lb`}
                        percent={fill}
                        detail={
                          gallons == null
                            ? 'No weight yet'
                            : gallons > 10
                              ? `${gallons.toFixed(1)} gal · past 10 gal because the sap froze`
                              : `${gallons.toFixed(1)} of 10 gal`
                        }
                        color={(fill ?? 0) >= 90 ? '#ed6c02' : '#F76902'}
                      />
                      <Typography variant="body2" sx={{ mt: 1.5 }}>
                        Sugar {node.Sugar_Percent == null ? '— not recorded' : `${node.Sugar_Percent}% Brix`}
                      </Typography>
                      <Typography variant="body2" color={shelf ? `${shelf.severity}.main` : 'text.secondary'}>
                        Shelf life {shelf?.label ?? '—'}
                        {shelf ? ` · ${shelf.source}` : ''}
                      </Typography>
                      {node.Temperature != null ? (
                        <Typography variant="body2" color="text.secondary">
                          Sap temperature {node.Temperature}°F
                        </Typography>
                      ) : null}
                      {node.Sap_Flow_Rate_Lph != null ? (
                        <Typography variant="body2" color="text.secondary">
                          Flow {node.Sap_Flow_Rate_Lph} L/h
                        </Typography>
                      ) : null}
                    </CardContent>
                  </CardActionArea>
                </Card>
              </Tooltip>
            </Grid>
          );
        })}
      </Grid>
    </>
  );
}
