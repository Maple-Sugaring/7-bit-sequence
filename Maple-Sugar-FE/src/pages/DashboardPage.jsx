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
import { visuallyHidden } from '@mui/utils';
import { batchesByNode, shelfLifeSummary } from '../business/shelfLife';
import { weekForecastRows, weekLabel, weekStart } from '../business/weekWindows';
import { bushAverageSugar, syrupEstimate } from '../business/sugarContent';
import { healthReading } from '../business/sensorLifecycle';
import { MapStatus, STATUS_META } from '../business/nodeMapStatus';
import { isFull } from '../business/yieldMetrics';
import { LIVE_FROM, LIVE_NODE_IDS, LIVE_TO, bucketGallons, bucketPercent, recordedSugar } from '../business/liveWeight';
import { SiteForecastFigure } from '../components/charts/SeriesChart';
import { FleetMapCard } from '../components/map/FleetMapCard';
import { NodeStatusChip } from '../components/common/NodeStatusChip';
import { MeterBar } from '../components/common/MeterBar';
import { batteryMeterColor, bucketMeterColor } from '../components/common/meterColors';
import { PageHeader } from '../components/common/PageHeader';
import { FieldOverview } from '../components/layout/FieldOverview';
import { useAuth } from '../context/auth';
import { Capability } from '../business/permissions';
import { dateOnly, dateTime } from '../components/common/format';
import { useAutoRefresh, useBucketShelfLife, useFleetMap, useLiveWeather, useReadings } from '../services/hooks';
 
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
 
const NO_BATCHES = [];
 
export function DashboardPage() {
  const navigate = useNavigate();
  const { can } = useAuth();
  // One fetch feeds the cards below and the fleet map, so they cannot disagree.
  const fleet = useFleetMap();
  const bushNodes = fleet.nodes;
  // The fleet refreshes every minute; a node on a faster interval (a demo at
  // 10 s) refetches at its packet rate, down to 5 s.
  const fastestSeconds = Math.min(60, ...bushNodes.map((node) => node.Report_Interval_Seconds ?? 60));
  useAutoRefresh(fleet.refresh, fastestSeconds < 60 ? Math.max(5, fastestSeconds) * 1000 : 0);
  const live = useLiveWeather();
  const readings = useReadings({ from: LIVE_FROM, to: LIVE_TO });
  const weather = live.data?.Sites?.[0] ?? (live.data?.Configured ? live.data : null);
  const totals = useMemo(() => {
    const tracked = new Set(LIVE_NODE_IDS);
    const weights = (readings.data ?? []).filter((row) => tracked.has(row.NodeID) && row.Weight != null);
    // A collection with a Brix test also files a reading carrying it, so the
    // readings alone hold every test. Counting the journal too would count each
    // test twice.
    const sugars = recordedSugar(readings.data ?? []);
    const sugar = sugars.length ? sugars.reduce((sum, value) => sum + value, 0) / sugars.length : null;
    const bushSugar = bushAverageSugar(bushNodes);
    const syrup = bushNodes.reduce((sum, node) => {
      const gallons = bucketGallons(node.Weight, node.Tare_Weight ?? 0);
      // A tree's own last test, then the bush average, then 43:1.
      const estimate = syrupEstimate({ sapGallons: gallons, tree: node.Sugar_Percent, bush: bushSugar });
      return sum + (estimate?.syrupGallons ?? 0);
    }, 0);
    const measured = bushNodes.some((node) => node.Sugar_Percent != null);
    return { readings: weights.length, sugar, syrup, measured };
  }, [readings.data, bushNodes]);
 
  // Shelf life belongs to the sap in a bucket, so each tree shows whichever
  // bucket is sitting on it now, and a tree with an empty bucket shows none.
  const batches = useBucketShelfLife(weather?.Temperature_F ?? null).data ?? NO_BATCHES;
  const batchByNode = useMemo(() => batchesByNode(batches), [batches]);
 
  const offlineNodes = bushNodes.filter((node) => node.mapStatus === MapStatus.OFFLINE);
  const { shortest: shortestShelf, holdingSap } = useMemo(() => shelfLifeSummary(batches), [batches]);
 
  return (
    <>
      <PageHeader
        title="The Bush"
        subtitle="Your field day starts here. Check the trees, then head into the woods."
      />
 
      <FieldOverview fleet={fleet} />
 
      <FleetMapCard fleet={fleet} />
 
      <div className="section-heading"><h2>Your Trees</h2><span>Tap a tree for readings & details.</span></div>
      <Grid container spacing={2}>
        {bushNodes.map((node, index) => {
          const status = node.mapStatus;
          const gallons = bucketGallons(node.Weight, node.Tare_Weight ?? 0);
          const fill = bucketPercent(node.Weight, node.Tare_Weight ?? 0);
          const shelf = batchByNode.get(node.NodeID);
          const tip = [
            node.Node_Name,
            `Status ${STATUS_META[status].label}`,
            `Signal ${healthReading(node.Signal_Rssi, ' dBm', node.Signal_Reported_At,
              node.Report_Interval_Seconds, node.Signal_Rssi != null && node.Signal_Rssi < -110 && 'weak signal')}`,
            node.Sugar_Percent != null ? `Sugar ${node.Sugar_Percent}%` : null,
            node.Ice_Present ? 'Ice in the bucket' : null,
            node.Recorded_At ? `Last reading ${dateTime(node.Recorded_At)}` : 'No reading yet',
            node.Last_Seen ? `Last seen ${dateTime(node.Last_Seen)}` : null,
          ]
            .filter(Boolean)
            .join(' · ');
 
          return (
            <Grid key={node.NodeID} size={{ xs: 12, sm: 6, xl: 4 }}>
              <Card sx={{ height: '100%' }}>
                {/* WCAG 1.4.13 / 4.1.2: tooltip sits on the focusable button and
                    describes it, so keyboard and screen-reader users get it too. */}
                <Tooltip title={tip} placement="top" arrow describeChild>
                  <CardActionArea
                    data-tour={index === 0 ? 'tree-card' : undefined}
                    onClick={() => navigate(`/nodes/${node.NodeID}`)}
                    sx={{ height: '100%' }}
                  >
                    <CardContent>
                      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
                        <Typography variant="h6" component="h3">{node.Stand}</Typography>
                        <NodeStatusChip status={status} />
                      </Stack>
                      <Typography variant="body2" color="text.secondary">
                        {node.Node_Name}
                      </Typography>
                      <Meter
                        label="Battery"
                        value={node.Battery_Percent == null ? '—' : `${Math.round(node.Battery_Percent)}%`}
                        percent={node.Battery_Percent ?? 0}
                        detail={healthReading(node.Battery_Percent, '%', node.Battery_Reported_At,
                          node.Report_Interval_Seconds, node.Battery_Percent != null && node.Battery_Percent < 20 && 'low battery')}
                        color={batteryMeterColor(node.Battery_Percent)}
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
                        color={bucketMeterColor(fill)}
                      />
                      <Typography variant="body2" sx={{ mt: 1.5 }}>
                        Sugar {node.Sugar_Percent == null ? '— not recorded' : `${node.Sugar_Percent}% Brix`}
                      </Typography>
                      <Typography variant="body2" color={shelf ? `${shelf.severity}.main` : 'text.secondary'}>
                        Shelf life {shelf?.label ?? 'none, no sap in the bucket'}
                        {shelf?.source ? ` · ${shelf.source}` : ''}
                      </Typography>
                      {shelf ? (
                        <Typography variant="caption" color="text.secondary">
                          {shelf.barcode ? `Bucket ${shelf.barcode} · ` : ''}filling since {dateTime(shelf.startedAt)}
                        </Typography>
                      ) : null}
                      {node.Temperature != null ? (
                        <Typography variant="body2" color="text.secondary">
                          Sap Temperature {node.Temperature}°F
                        </Typography>
                      ) : null}
                      {node.Sap_Flow_Rate_Lph != null ? (
                        <Typography variant="body2" color="text.secondary">
                          Flow {node.Sap_Flow_Rate_Lph} L/h
                        </Typography>
                      ) : null}
                    </CardContent>
                  </CardActionArea>
                </Tooltip>
              </Card>
            </Grid>
          );
        })}
      </Grid>
 
      <div className="section-heading"><h2>Conditions & Yield</h2><span>Take a closer look at the season.</span></div>
      <Box sx={{ mb: 3 }}>
        <Card>
          <CardContent>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'baseline', justifyContent: 'space-between' }}>
              <Typography variant="h6" component="h3">
                RIT Weather
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {dateOnly(new Date())}
              </Typography>
            </Stack>
            {live.error ? <Alert severity="warning">{live.error}</Alert> : null}
            {!live.data?.Configured && live.data?.Message ? <Alert severity="info">{live.data.Message}</Alert> : null}
            {weather ? (
              <>
                <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap', mt: 1 }}>
                  {/* WCAG 1.3.1 / 2.4.6: a value, not a heading — same look */}
                  <Typography variant="h3" component="p">
                    <Box component="span" sx={visuallyHidden}>Current temperature </Box>
                    {weather.Temperature_F}°F
                  </Typography>
                  <Chip label={weather.Description ?? weather.Conditions} size="small" variant="outlined" />
                </Stack>
                <Typography color="text.secondary">
                  L {weather.Temp_Min_F}° · H {weather.Temp_Max_F}°
                </Typography>
                <Typography sx={{ mt: 1, mb: 1 }}>{weather.Summary}</Typography>
                <Typography variant="overline" color="text.secondary">
                  Week of {weekLabel(weekStart(new Date()))}
                </Typography>
                <SiteForecastFigure rows={weekForecastRows(weather.Forecast)} height={240} />
              </>
            ) : null}
          </CardContent>
        </Card>
      </Box>
 
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ justifyContent: 'space-between' }}>
            <Box>
              <Typography variant="h6" component="h3">
                2026 Weight
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Gallons of sap in each 10 gallon bucket. Sugar content is the Brix reading from collection.
              </Typography>
            </Box>
            <Button variant="outlined" onClick={() => navigate('/table')}>
              Open Sugar Woods
            </Button>
          </Stack>
          {/* WCAG 1.3.1 / 2.4.6: label/value pairs as a description list, values not headings */}
          <Grid container spacing={2} component="dl" sx={{ mt: 1, mb: 0 }}>
            <Grid size={{ xs: 12, sm: 6, md: 4 }}>
              <Typography variant="overline" component="dt">In the buckets now</Typography>
              <Box component="dd" sx={{ m: 0 }}>
              {bushNodes.map((node) => {
                const gallons = bucketGallons(node.Weight, node.Tare_Weight ?? 0);
                const full = isFull(node.Weight, node.Tare_Weight ?? 0);
                return (
                  <Stack key={node.NodeID} direction="row" sx={{ justifyContent: 'space-between', gap: 1, flexWrap: 'wrap', py: 0.5 }}>
                    <Typography>{node.Node_Name}</Typography>
                    <Typography sx={{ fontWeight: 700 }}>
                      {gallons == null ? '—' : `${gallons.toFixed(1)} gal · ${Number(node.Weight).toFixed(1)} lb`}
                      {full ? ' · full' : ''}
                    </Typography>
                  </Stack>
                );
              })}
              </Box>
            </Grid>
            <Grid size={{ xs: 6, sm: 3, md: 2 }}>
              <Typography variant="overline" component="dt">Weight readings</Typography>
              <Typography variant="h4" component="dd" sx={{ m: 0 }}>{totals.readings}</Typography>
              <Typography variant="body2" color="text.secondary" component="dd" sx={{ m: 0 }}>
                Nodes 001 and 002 in 2026
              </Typography>
            </Grid>
            <Grid size={{ xs: 6, sm: 3, md: 2 }}>
              <Typography variant="overline" component="dt">Sugar content</Typography>
              <Typography variant="h4" component="dd" sx={{ m: 0 }}>{totals.sugar == null ? '—' : `${totals.sugar.toFixed(1)}%`}</Typography>
              <Typography variant="body2" color="text.secondary" component="dd" sx={{ m: 0 }}>
                {totals.sugar == null ? 'Brix is recorded at collection' : 'Average Brix from recorded readings'}
              </Typography>
            </Grid>
            <Grid size={{ xs: 6, sm: 3, md: 2 }}>
              <Typography variant="overline" component="dt">Shelf life</Typography>
              <Typography variant="h4" component="dd" sx={{ m: 0 }}>{shortestShelf?.label ?? '—'}</Typography>
              <Typography variant="body2" color="text.secondary" component="dd" sx={{ m: 0 }}>
                {shortestShelf
                  ? `Bucket ${shortestShelf.barcode ?? shortestShelf.bucketId} is closest, from ${shortestShelf.source}`
                  : holdingSap
                    ? 'Needs a temperature to time the sap in the buckets'
                    : 'No sap in any bucket yet'}
              </Typography>
            </Grid>
            <Grid size={{ xs: 6, sm: 3, md: 2 }}>
              <Typography variant="overline" component="dt">Estimated syrup</Typography>
              <Typography variant="h4" component="dd" sx={{ m: 0 }}>{totals.syrup.toFixed(2)} gal</Typography>
              <Typography variant="body2" color="text.secondary" component="dd" sx={{ m: 0 }}>
                {totals.measured
                  ? 'Rule of 86 where a tree was tested, the bush average elsewhere'
                  : '43 gallons of sap per gallon of syrup until a tree is tested'}
              </Typography>
            </Grid>
          </Grid>
          {bushNodes.some((node) => isFull(node.Weight, node.Tare_Weight ?? 0)) ? (
            <Alert severity="warning" sx={{ mt: 2 }} action={can(Capability.VIEW_ALERTS) ? <Button color="inherit" onClick={() => navigate('/notifications')}>Alerts</Button> : null}>
              A bucket is full. Arrange a collection before it spills.
            </Alert>
          ) : null}
          {offlineNodes.length ? (
            <Alert severity="error" sx={{ mt: 2 }} action={can(Capability.VIEW_ALERTS) ? <Button color="inherit" onClick={() => navigate('/notifications')}>Alerts</Button> : null}>
              {offlineNodes.map((node) => node.Node_Name).join(', ')} {offlineNodes.length === 1 ? 'is' : 'are'} offline and not reporting.
            </Alert>
          ) : null}
        </CardContent>
      </Card>
 
    </>
  );
}
