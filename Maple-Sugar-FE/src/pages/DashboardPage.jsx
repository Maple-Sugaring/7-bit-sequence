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
import LinearProgress from '@mui/material/LinearProgress';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { sapToSyrupRatio } from '../business/sugarContent';
import { fillPercent, gallonsFromWeight, isFull, netWeight } from '../business/yieldMetrics';
import { ChartCard } from '../components/charts/ChartCard';
import { SiteForecastChart } from '../components/charts/SeriesChart';
import { PageHeader } from '../components/common/PageHeader';
import { dateTime } from '../components/common/format';
import { useBush, useLiveWeather, useSapCompare } from '../services/hooks';

const STATUS = {
  0: { label: 'Offline', color: 'error' },
  1: { label: 'Online', color: 'success' },
  2: { label: 'Degraded', color: 'warning' },
  3: { label: 'Maintenance', color: 'info' },
};

function Meter({ label, value, detail, color = 'primary' }) {
  return (
    <Box sx={{ mt: 1.5 }}>
      <Stack direction="row" sx={{ justifyContent: 'space-between' }}>
        <Typography variant="caption" color="text.secondary">
          {label}
        </Typography>
        <Typography variant="caption">{value}</Typography>
      </Stack>
      <LinearProgress
        variant="determinate"
        value={Math.min(100, Number.parseFloat(value) || 0)}
        color={color}
        sx={{ mt: 0.5, height: 8, borderRadius: 4 }}
      />
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
  const season = useSapCompare(2024);
  const weather = live.data?.Sites?.[0] ?? (live.data?.Configured ? live.data : null);
  const totals = useMemo(() => {
    let gallons = 0;
    let sugarSum = 0;
    let sugarCount = 0;
    for (const node of season.data?.Nodes ?? []) {
      for (const point of node.Points) {
        gallons += point.Flow_Gal ?? 0;
        if (point.Sugar_Percent) {
          sugarSum += point.Sugar_Percent;
          sugarCount += 1;
        }
      }
    }
    const sugar = sugarCount ? sugarSum / sugarCount : null;
    const ratio = sapToSyrupRatio(sugar);
    return {
      gallons,
      sugar,
      syrup: ratio ? gallons / ratio : null,
    };
  }, [season.data]);

  return (
    <>
      <PageHeader title="The Bush" />
      <Typography color="text.secondary" sx={{ mt: -2, mb: 2, textAlign: 'center' }}>
        One tap at Alumni House, Chabad House, and the Red Barn.{' '}
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
                2024 sap year
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Simple totals. The day-by-day chart is one step deeper.
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
                const gallons = gallonsFromWeight(netWeight(node.Weight, node.Tare_Weight ?? 0));
                const full = isFull(node.Weight, node.Tare_Weight ?? 0);
                return (
                  <Stack key={node.NodeID} direction="row" sx={{ justifyContent: 'space-between', py: 0.5 }}>
                    <Typography>{node.Stand}</Typography>
                    <Typography fontWeight={700}>
                      {gallons == null ? '—' : `${gallons.toFixed(1)} gal`}
                      {full ? ' · full' : ''}
                    </Typography>
                  </Stack>
                );
              })}
            </Grid>
            <Grid size={{ xs: 6, sm: 4 }}>
              <Typography variant="overline">Sap run</Typography>
              <Typography variant="h4">{totals.gallons.toFixed(0)} gal</Typography>
              <Typography variant="body2" color="text.secondary">
                Modeled across the three taps
              </Typography>
            </Grid>
            <Grid size={{ xs: 6, sm: 4 }}>
              <Typography variant="overline">Estimated syrup</Typography>
              <Typography variant="h4">{totals.syrup == null ? '—' : `${totals.syrup.toFixed(1)} gal`}</Typography>
              <Typography variant="body2" color="text.secondary">
                {totals.sugar == null
                  ? 'Needs sugar readings'
                  : `From an average ${totals.sugar.toFixed(1)}% sugar, rule of 86`}
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
          const gallons = gallonsFromWeight(netWeight(node.Weight, node.Tare_Weight ?? 0));
          const fill = fillPercent(node.Weight, node.Tare_Weight ?? 0);
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
                        value={node.Battery_Percent == null ? '0' : `${Math.round(node.Battery_Percent)}%`}
                        detail={node.Battery_Percent == null ? 'No report' : 'Charge on the node pack'}
                        color={node.Battery_Percent < 20 ? 'error' : 'success'}
                      />
                      <Meter
                        label="Bucket"
                        value={fill == null ? '0' : `${Math.min(100, Math.round(fill))}%`}
                        detail={gallons == null ? 'Empty or unread' : `${gallons.toFixed(1)} gal of 10`}
                        color={(fill ?? 0) >= 90 ? 'warning' : 'primary'}
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
