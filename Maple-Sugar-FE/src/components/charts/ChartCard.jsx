import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardHeader from '@mui/material/CardHeader';
import Skeleton from '@mui/material/Skeleton';
import Typography from '@mui/material/Typography';
import { EmptyBlock } from '../common/StateBlock';

/** Titled chart container with its own loading and empty states. */
export function ChartCard({ title, description, action, height = 300, loading, isEmpty, children }) {
  return (
    <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <CardHeader
        title={
          <Typography variant="h5" component="h2">
            {title}
          </Typography>
        }
        subheader={description}
        action={action}
        sx={{ pb: 0 }}
      />
      <CardContent sx={{ flexGrow: 1, pt: 2 }}>
        {loading ? (
          <Skeleton variant="rounded" height={height} />
        ) : isEmpty ? (
          <EmptyBlock
            title="No data for this range"
            description="Try widening the date range or selecting a different season."
          />
        ) : (
          <Box sx={{ height }}>{children}</Box>
        )}
      </CardContent>
    </Card>
  );
}
