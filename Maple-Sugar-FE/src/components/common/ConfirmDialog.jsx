import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';

/**
 * Asks before an action that changes the system and cannot simply be undone
 * (FR-019). `danger` colours the confirm button for removals.
 */
export function ConfirmDialog({ open, title, body, confirmLabel = 'Confirm', danger = false, pending = false, onConfirm, onClose }) {
  return (
    <Dialog open={open} onClose={pending ? undefined : onClose} fullWidth maxWidth="xs">
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <DialogContentText>{body}</DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={pending}>Go back</Button>
        <Button onClick={onConfirm} loading={pending} color={danger ? 'error' : 'primary'} variant="contained">
          {confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
