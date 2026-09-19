import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

/** Consistent loading, error, and empty states so every page behaves the same. */

export function LoadingBlock({ label = 'Loading', height = 180 }) {
  return (
    <Box
      role="status"
      aria-live="polite"
      sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2, minHeight: height }}
    >
      <CircularProgress size={24} />
      <Typography variant="body2" color="text.secondary">
        {label}...
      </Typography>
    </Box>
  );
}

export function SkeletonRows({ rows = 4, height = 48 }) {
  return (
    <Stack spacing={1} aria-hidden>
      {Array.from({ length: rows }, (unused, index) => (
        <Skeleton key={index} variant="rounded" height={height} />
      ))}
    </Stack>
  );
}

export function ErrorBlock({ error, onRetry, title = 'Could not load this data' }) {
  return (
    <Alert
      severity="error"
      action={
        onRetry ? (
          <Button color="inherit" size="small" onClick={onRetry}>
            Retry
          </Button>
        ) : null
      }
    >
      <AlertTitle>{title}</AlertTitle>
      {error}
    </Alert>
  );
}

export function EmptyBlock({ title = 'Nothing here yet', description, action }) {
  return (
    <Stack spacing={1.5} sx={{ alignItems: 'center', textAlign: 'center', py: 6, px: 2 }}>
      <Typography variant="h5" component="p">
        {title}
      </Typography>
      {description ? (
        <Typography variant="body2" color="text.secondary" sx={{ maxWidth: '52ch' }}>
          {description}
        </Typography>
      ) : null}
      {action}
    </Stack>
  );
}

/**
 * Renders the right state for an `useAsync` result. Keeps pages free of
 * repeated loading/error branching.
 */
export function AsyncBlock({ loading, error, refresh, data, children, skeleton, isEmpty, empty }) {
  if (loading) return skeleton ?? <LoadingBlock />;
  if (error) return <ErrorBlock error={error} onRetry={refresh} />;
  if (isEmpty?.(data)) return empty ?? <EmptyBlock />;
  return children;
}
