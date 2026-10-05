import { lazy, Suspense, useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { formatPoint } from './formatPoint';

const LocationPickerMap = lazy(() => import('./LocationPickerMap'));

/**
 * Pick a spot by clicking the map, dragging the pin, or using this device's
 * location. `value` and `onChange` use the API's { lat, lon } shape (or null).
 */
export function LocationPicker({ value, onChange, optional = false, height = 280 }) {
  const [error, setError] = useState('');
  const [locating, setLocating] = useState(false);

  const useMyLocation = () => {
    if (!navigator.geolocation) {
      setError('This browser cannot read a location. Click the map to drop a pin instead.');
      return;
    }
    setError('');
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        onChange({ lat: position.coords.latitude, lon: position.coords.longitude });
      },
      () => {
        setLocating(false);
        setError('Location was blocked. Click the map to drop a pin instead.');
      },
      { enableHighAccuracy: true, timeout: 12000 },
    );
  };

  const place = (point) => {
    setError('');
    onChange(point);
  };

  return (
    <Stack spacing={1}>
      <Suspense fallback={<Skeleton variant="rounded" height={height} />}>
        <LocationPickerMap value={value} onChange={place} height={height} />
      </Suspense>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={1}
        sx={{ alignItems: { sm: 'center' }, justifyContent: 'space-between' }}
      >
        <Typography variant="body2" color="text.secondary" aria-live="polite">
          {value ? formatPoint(value) : 'Click the map to drop a pin, or use your location.'}
        </Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button size="small" variant="outlined" onClick={useMyLocation} disabled={locating}>
            {locating ? 'Locating…' : 'Use my location'}
          </Button>
          {optional && value ? (
            <Button size="small" onClick={() => place(null)}>
              Clear
            </Button>
          ) : null}
        </Box>
      </Stack>
      {error ? <Alert severity="warning">{error}</Alert> : null}
    </Stack>
  );
}
