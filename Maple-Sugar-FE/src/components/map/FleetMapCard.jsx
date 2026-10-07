import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { lazy, Suspense, useMemo } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { statusCounts } from '../../business/nodeMapStatus';
import { ErrorBlock, LoadingBlock } from '../common/StateBlock';
import { FleetMapLegend } from './FleetMapLegend';

// Leaflet and its stylesheet only load when the card is on screen.
const FleetMap = lazy(() => import('./FleetMap').then((module) => ({ default: module.FleetMap })));

/**
 * Dashboard mini-map. The page owns the fleet data (`fleet` from useFleetMap)
 * so the cards and this map read one fetch and always agree.
 */
export function FleetMapCard({ fleet }) {
  const counts = useMemo(() => statusCounts(fleet.nodes), [fleet.nodes]);
  const noLocation = fleet.nodes.filter((node) => !node.hasLocation).length;
  return (
    <Card sx={{ mb: 2 }}>
      <CardContent>
        <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
          <Typography component="h2" variant="h6">
            Fleet map
          </Typography>
          <Button component={RouterLink} to="/map" size="small">
            Open full map
          </Button>
        </Stack>
        {fleet.error && fleet.nodes.length === 0 ? (
          <ErrorBlock error={fleet.error} onRetry={fleet.refresh} />
        ) : fleet.loading ? (
          <LoadingBlock label="Loading map" height={260} />
        ) : (
          <>
            {fleet.stale ? (
              <Alert severity="warning" sx={{ mb: 1 }}>
                Some data could not be loaded, so faults or readings may be missing. Showing what we have.
              </Alert>
            ) : null}
            <FleetMapLegend counts={counts} noLocation={noLocation} compact />
            <div style={{ marginTop: 12 }}>
              <Suspense fallback={<LoadingBlock label="Loading map" height={260} />}>
                <FleetMap nodes={fleet.nodes} height={260} scrollWheelZoom={false} />
              </Suspense>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
