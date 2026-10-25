import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardHeader from '@mui/material/CardHeader';
import Skeleton from '@mui/material/Skeleton';
import Typography from '@mui/material/Typography';
import { EmptyBlock } from '../common/StateBlock';

/** Titled chart container with its own loading and empty states. */
export function ChartCard({
  title,
  description,
  action,
  height = 300,
  loading,
  isEmpty,
  emptyTitle = 'No data for this range',
  emptyDescription = 'Try widening the date range or selecting a different season.',
  children,
}) {
  return (
    <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <CardHeader
        title={
          <Typography variant="h6" component="h2">
            {title}
          </Typography>
        }
        subheader={description}
        sx={{ pb: 0 }}
      />
      {action ? <Box sx={{ px: 2, pt: 1.5, minWidth: 0, maxWidth: '100%', '& > *': { flexWrap: 'wrap', maxWidth: '100%' } }}>{action}</Box> : null}
      <CardContent sx={{ flexGrow: 1, pt: 2 }}>
        {loading ? (
          <Box className="chart-plot" sx={{ height }}><Skeleton variant="rounded" height="100%" /></Box>
        ) : isEmpty ? (
          <EmptyBlock title={emptyTitle} description={emptyDescription} />
        ) : (
          <Box className="chart-plot" sx={{ height }}>{children}</Box>
        )}
      </CardContent>
    </Card>
  );
}
