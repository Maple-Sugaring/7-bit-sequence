import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { PageHeader } from '../components/common/PageHeader';

export function PlacementPage() {
  return (
    <>
      <PageHeader title="Where the gear lives" />
      <Stack spacing={2} sx={{ maxWidth: 720, mx: 'auto' }}>
        <Card>
          <CardContent>
            <Typography variant="h5" component="h2" gutterBottom>
              One hub
            </Typography>
            <Typography>
              Everything runs on one system. The hub stays indoors, near a window so the radios
              reach the trees, and next to a wall outlet. It is not left outside.
            </Typography>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <Typography variant="h5" component="h2" gutterBottom>
              Three taps
            </Typography>
            <Typography>
              One node and one bucket at Alumni House, one at Chabad House, and one at the Red Barn.
              The load cell hangs where students can still reach it, with a cover so weather and
              debris stay out of the sensor. Buckets tip if the wind is up, so a spill is reported
              from the tree page rather than guessed from the scale alone.
            </Typography>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <Typography variant="h5" component="h2" gutterBottom>
              Where the numbers live
            </Typography>
            <Typography>
              Each node keeps a short cache of readings if the link drops. The server stores the
              season in Postgres. Sugar Woods can export that season as a CSV when it needs to move
              somewhere more locked down. A freeze, a spill, or a full bucket shows up as an alert.
            </Typography>
          </CardContent>
        </Card>
      </Stack>
    </>
  );
}
