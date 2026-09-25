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
    return { readings: weights.length, sugar };
  }, [readings.data, journal.data]);

  return (
    <>
      <PageHeader title="The Bush" />
      <Typography color="text.secondary" sx={{ mt: -2, mb: 2, textAlign: 'center' }}>
        Alumni House trees 1 and 2, nodes 001 and 002.{' '}
        <Button size="small" onClick={() => navigate('/placement')}>
          Where the gear lives
        </Button>
      </Typography>

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
                Gallons of sap in each 10 gallon bucket. Sugar is filled in at collection.
              </Typography>
            </Box>
            <Button variant="outlined" onClick={() => navigate('/table')}>
              Open Sugar Woods
            </Button>
          </Stack>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid size={{ xs: 12, sm: 4 }}>
              <Typography variant="overline">In the buckets now</Typography>
              {(bush.data ?? []).map((node) => {
                const gallons = bucketGallons(node.Weight, node.Tare_Weight ?? 0);
                const full = isFull(node.Weight, node.Tare_Weight ?? 0);
                return (
                  <Stack key={node.NodeID} direction="row" sx={{ justifyContent: 'space-between', py: 0.5 }}>
                    <Typography>{node.Node_Name}</Typography>
                    <Typography fontWeight={700}>
                      {gallons == null ? '—' : `${gallons.toFixed(1)} / 10 gal`}
                      {full ? ' · full' : ''}
                    </Typography>
                  </Stack>
                );
              })}
            </Grid>
            <Grid size={{ xs: 6, sm: 4 }}>
              <Typography variant="overline">Weight readings</Typography>
              <Typography variant="h4">{totals.readings}</Typography>
              <Typography variant="body2" color="text.secondary">
                Nodes 001 and 002 in 2026
              </Typography>
            </Grid>
            <Grid size={{ xs: 6, sm: 4 }}>
              <Typography variant="overline">Estimated syrup</Typography>
              <Typography variant="h4">—</Typography>
              <Typography variant="body2" color="text.secondary">
                {totals.sugar == null
                  ? 'Needs a student sugar reading'
                  : `Average ${totals.sugar.toFixed(1)}% from collection`}
              </Typography>
            </Grid>
          </Grid>
          {(bush.data ?? []).some((node) => isFull(node.Weight, node.Tare_Weight ?? 0)) ? (
            <Alert severity="warning" sx={{ mt: 2 }} action={<Button color="inherit" onClick={() => navigate('/notifications')}>Alerts</Button>}>
              A bucket is full. Collect it or open the alerts.
            </Alert>
          ) : null}
        </CardContent>
      </Card>

      <Grid container spacing={2}>
        {(bush.data ?? []).map((node) => {
          const status = STATUS[node.Status_Code] ?? STATUS[1];
          const gallons = bucketGallons(node.Weight, node.Tare_Weight ?? 0);
          const fill = bucketPercent(node.Weight, node.Tare_Weight ?? 0);
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
                        value={gallons == null ? '—' : `${gallons.toFixed(1)} gal`}
                        percent={fill}
                        detail={gallons == null ? 'No weight yet' : `${gallons.toFixed(1)} of 10 gal`}
                        color={(fill ?? 0) >= 90 ? '#ed6c02' : '#F76902'}
                      />
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
