import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import TrendingFlatIcon from '@mui/icons-material/TrendingFlat';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import { signedPercent } from '../common/format';

/**
 * Headline metric with an optional season-over-season delta.
 *
 * `higherIsBetter` decides whether an increase reads as good, since a rise in
 * average sugar is welcome but a rise in spoilage risk is not.
 */
export function KpiCard({
  label,
  value,
  caption,
  change,
  higherIsBetter = true,
  severity,
  icon: Icon,
  loading = false,
  comparisonLabel,
}) {
  const delta = signedPercent(change);
  const improving = change == null ? null : higherIsBetter ? change > 0 : change < 0;
  const TrendIcon =
    change == null || Math.abs(change) < 0.5
      ? TrendingFlatIcon
      : change > 0
        ? TrendingUpIcon
        : TrendingDownIcon;

  return (
    <Card sx={{ height: '100%' }}>
      <CardContent>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start', mb: 1 }}>
          <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 1.4, flexGrow: 1 }}>
            {label}
          </Typography>
          {Icon ? <Icon fontSize="small" color={severity ?? 'action'} /> : null}
        </Stack>

        {loading ? (
          <Skeleton variant="text" width="60%" height={44} />
        ) : (
          <Typography
            variant="h3"
            component="p"
            sx={{ color: severity ? `${severity}.main` : 'text.primary', lineHeight: 1.15 }}
          >
            {value}
          </Typography>
        )}

        <Box sx={{ mt: 1, minHeight: 26 }}>
          {loading ? (
            <Skeleton variant="text" width="40%" />
          ) : (
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5 }}>
              {delta ? (
                <Tooltip title={comparisonLabel ?? 'Compared with the previous season'}>
                  <Chip
                    size="small"
                    icon={<TrendIcon />}
                    label={delta}
                    color={improving ? 'success' : 'warning'}
                    variant="outlined"
                  />
                </Tooltip>
              ) : null}
              {caption ? (
                <Typography variant="caption" color="text.secondary">
                  {caption}
                </Typography>
              ) : null}
            </Stack>
          )}
        </Box>
      </CardContent>
    </Card>
  );
}
