import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useMemo } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { statusCounts } from '../../business/nodeMapStatus';
import { useFleetMap } from '../../services/hooks';
import { ErrorBlock, LoadingBlock } from '../common/StateBlock';
import { FleetMap } from './FleetMap';
import { FleetMapLegend } from './FleetMapLegend';

/** Dashboard mini-map: same data and statuses as the full /map page. */
export function FleetMapCard() {
  const fleet = useFleetMap();
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
            <FleetMapLegend counts={counts} noLocation={noLocation} compact />
            <div style={{ marginTop: 12 }}>
              <FleetMap nodes={fleet.nodes} height={260} scrollWheelZoom={false} />
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
