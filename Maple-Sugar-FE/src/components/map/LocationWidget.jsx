import { lazy, Suspense } from 'react';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Skeleton from '@mui/material/Skeleton';
import Typography from '@mui/material/Typography';
import { formatPoint } from './formatPoint';

const LocationViewMap = lazy(() => import('./LocationViewMap'));

/** A small read-only map card for a node or gateway; renders nothing without a location. */
export function LocationWidget({ location, title = 'Location', height = 220, sx }) {
  if (!location) return null;

  return (
    <Card sx={sx}>
      <CardContent>
        <Typography variant="h6" component="h2">
          {title}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          {formatPoint(location)}
        </Typography>
        <Suspense fallback={<Skeleton variant="rounded" height={height} />}>
          <LocationViewMap location={location} height={height} />
        </Suspense>
      </CardContent>
    </Card>
  );
}
