import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useAvailability } from '../../services/hooks';

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '/api').replace(/\/$/, '');

export function TimePickerDialog({ open, slot, pending, error, onClose, onPick }) {
  const availability = useAvailability(open);

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Pick a free time</DialogTitle>
      <DialogContent>
        <Stack spacing={1.5} sx={{ pt: 0.5 }}>
          <Typography variant="body2" color="text.secondary">
            {slot ? `${slot.Task} at ${slot.Stand}. ` : null}
            Open windows come from your Google Calendar in Eastern time. Choosing one
            adds the collection to your calendar.
          </Typography>

          {error ? <Alert severity="error">{error}</Alert> : null}
          {availability.error ? (
            <Alert
              severity="warning"
              action={
                <Button color="inherit" size="small" href={`${API_BASE}/auth/google/calendar`}>
                  Connect
                </Button>
              }
            >
              {availability.error}
            </Alert>
          ) : null}

          {(availability.data?.Windows ?? []).map((window) => (
            <Button
              key={window.Starts_At}
              variant="outlined"
              disabled={pending}
              onClick={() => onPick(window)}
              sx={{ justifyContent: 'flex-start' }}
            >
              {window.Label}
            </Button>
          ))}

          {!availability.loading && !availability.error && (availability.data?.Windows ?? []).length === 0 ? (
            <Typography variant="body2">No open two-hour windows in the next week.</Typography>
          ) : null}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
