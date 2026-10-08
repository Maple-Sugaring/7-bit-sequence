import Alert from '@mui/material/Alert';
import Typography from '@mui/material/Typography';
import { basisLabel } from '../../business/sugarContent';

/**
 * The syrup a bucket should make, and what that number leans on. Most buckets
 * are never tested, so the source matters as much as the figure.
 */
export function SyrupEstimate({ estimate }) {
  if (!estimate) return null;

  return (
    <Alert icon={false} severity={estimate.approximate ? 'warning' : 'info'} role="status">
      <Typography variant="h6" component="p">
        About {estimate.syrupGallons.toFixed(2)} gal of syrup
      </Typography>
      <Typography variant="body2">
        From {estimate.sapGallons.toFixed(1)} gal of sap, using {basisLabel(estimate)}.
      </Typography>
      {estimate.approximate ? (
        <Typography variant="body2" sx={{ mt: 0.5 }}>
          There is ice in this bucket. The refractometer reads only the liquid, which is sweeter than the whole
          bucket, so this runs high.
        </Typography>
      ) : null}
    </Alert>
  );
}
