import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardActionArea from '@mui/material/CardActionArea';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Grid from '@mui/material/Grid';
import LinearProgress from '@mui/material/LinearProgress';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { fillPercent, gallonsFromWeight, netWeight } from '../business/yieldMetrics';
import { ChartCard } from '../components/charts/ChartCard';
import { SiteForecastChart } from '../components/charts/SeriesChart';
import { PageHeader } from '../components/common/PageHeader';
import { dateTime } from '../components/common/format';
import { useBush, useLiveWeather } from '../services/hooks';

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
  const weather = live.data?.Sites?.[0] ?? (live.data?.Configured ? live.data : null);

  return (
    <>
      <PageHeader title="The Bush" />
      <Typography color="text.secondary" sx={{ mt: -2, mb: 2, textAlign: 'center' }}>
        One tap at Alumni House, Chabad House, and the Red Barn.
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
