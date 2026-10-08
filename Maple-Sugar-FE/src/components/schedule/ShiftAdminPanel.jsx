import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
import Collapse from '@mui/material/Collapse';
import Grid from '@mui/material/Grid';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';
import dayjs from 'dayjs';
import { assignShift, SHIFT_TASKS } from '../../services/scheduleService';
import { useAction, useBush, useUsers } from '../../services/hooks';

function emptyForm() {
  const start = dayjs().add(1, 'day').hour(9).minute(0).second(0);
  return {
    Task: SHIFT_TASKS[0],
    UserID: '',
    bucketIds: [],
    Starts_At: start,
    Ends_At: start.add(2, 'hour'),
    Notes: '',
    Capacity: '1',
  };
}

function formFromSearch(params, bucketOptions) {
  const next = emptyForm();
  const nodeId = Number(params.get('nodeId'));
  const task = params.get('shiftTask');
  const notes = params.get('notes');
  const node = bucketOptions.find((item) => item.NodeID === nodeId);
  return {
    ...next,
    Task: SHIFT_TASKS.includes(task) ? task : next.Task,
    bucketIds: node?.BucketID ? [node.BucketID] : next.bucketIds,
    Notes: notes || next.Notes,
  };
}

/**
 * Admin-only form on the Schedule page: post an open shift or assign one now.
 * Opens by itself when the URL carries a tree/task (from an alert).
 */
export function ShiftAdminPanel({ onChanged }) {
  const [params] = useSearchParams();
  const people = useUsers();
  const bush = useBush();
  const bucketOptions = useMemo(
    () => (bush.data ?? []).filter((node) => node.BucketID),
    [bush.data],
  );
  const seedKey = `${params.get('nodeId') || ''}|${params.get('shiftTask') || ''}|${params.get('notes') || ''}`;
  const [seededKey, setSeededKey] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState('');
  const [open, setOpen] = useState(seedKey !== '||');

  if (
    seedKey !== '||' &&
    seedKey !== seededKey &&
    !(params.get('nodeId') && bush.loading)
  ) {
    setSeededKey(seedKey);
    setForm(formFromSearch(params, bucketOptions));
    setOpen(true);
  }

  const create = useAction(async (assignment) => {
    await assignShift(assignment);
    await onChanged();
  });

  const students = (people.data?.users ?? []).filter((user) => user.usable);

  const submit = async (event) => {
    event.preventDefault();
    if (form.bucketIds.length === 0) {
      setFormError('Choose at least one bucket.');
      return;
    }
    if (!form.Starts_At?.isValid() || !form.Ends_At?.isValid()) {
      setFormError('Pick a start and an end.');
      return;
    }
    setFormError('');
    const result = await create.execute({
      Task: form.Task,
      ...(form.UserID ? { UserID: form.UserID } : {}),
      BucketIDs: form.bucketIds,
      Starts_At: form.Starts_At.toISOString(),
      Ends_At: form.Ends_At.toISOString(),
      Notes: form.Notes,
      Capacity: Number(form.Capacity) || 1,
    });
    if (result?.ok) {
      setForm(emptyForm());
      setFormError('');
    }
  };

  return (
    <Box sx={{ mb: 3 }}>
      <Stack direction="row" spacing={2} sx={{ alignItems: 'center', mb: open ? 1.5 : 0 }}>
        <Typography variant="h6" component="h2" sx={{ flexGrow: 1 }}>
          Manage shifts
        </Typography>
        <Button variant={open ? 'outlined' : 'contained'} onClick={() => setOpen((prev) => !prev)}>
          {open ? 'Hide form' : 'New shift'}
        </Button>
      </Stack>
      <Collapse in={open} unmountOnExit>
      <Card component="form" noValidate onSubmit={submit}>
        <CardContent>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, md: 4 }}>
              <TextField
                select
                label="Task"
                value={form.Task}
                onChange={(event) => setForm((prev) => ({ ...prev, Task: event.target.value }))}
                fullWidth
              >
                {SHIFT_TASKS.map((task) => (
                  <MenuItem key={task} value={task}>
                    {task}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <TextField
                select
                label="Student"
                value={form.UserID}
                onChange={(event) => setForm((prev) => ({ ...prev, UserID: event.target.value }))}
                helperText="Leave blank to post an open shift students can claim."
                fullWidth
              >
                <MenuItem value="">
                  <em>Unclaimed — open for signup</em>
                </MenuItem>
                {students.map((user) => (
                  <MenuItem key={user.UserID} value={user.UserID}>
                    {user.fullName}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <TextField
                select
                label="Buckets"
                value={form.bucketIds}
                onChange={(event) => {
                  const value = event.target.value;
                  setForm((prev) => ({
                    ...prev,
                    bucketIds: typeof value === 'string' ? value.split(',').map(Number) : value,
                  }));
                  setFormError('');
                }}
                error={form.bucketIds.length === 0 && Boolean(formError)}
                helperText={form.bucketIds.length === 0 && formError ? formError : 'Choose one or more taps.'}
                fullWidth
                sx={{
                  '& .MuiSelect-select': {
                    display: 'flex',
                    alignItems: 'center',
                    whiteSpace: 'normal',
                    minHeight: '1.5em',
                  },
                }}
                slotProps={{
                  select: {
                    multiple: true,
                    renderValue: (selected) => (
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, py: 0.5 }}>
                        {selected.map((id) => {
                          const node = bucketOptions.find((item) => item.BucketID === id);
                          return <Chip key={id} size="small" label={node ? `${node.Barcode_ID} · ${node.Stand}` : id} />;
                        })}
                      </Box>
                    ),
                  },
                }}
              >
                {bucketOptions.map((node) => (
                  <MenuItem key={node.BucketID} value={node.BucketID}>
                    <Checkbox checked={form.bucketIds.includes(node.BucketID)} size="small" sx={{ pointerEvents: 'none' }} />
                    {node.Barcode_ID} · {node.Node_Name}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, md: 3 }}>
              <DateTimePicker
                label="Starts"
                value={form.Starts_At}
                onChange={(value) =>
                  setForm((prev) => ({
                    ...prev,
                    Starts_At: value,
                    Ends_At: value ? value.add(2, 'hour') : prev.Ends_At,
                  }))
                }
                slotProps={{ textField: { fullWidth: true } }}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 3 }}>
              <DateTimePicker
                label="Ends"
                value={form.Ends_At}
                onChange={(value) => setForm((prev) => ({ ...prev, Ends_At: value }))}
                minDateTime={form.Starts_At}
                slotProps={{ textField: { fullWidth: true } }}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 2 }}>
              <TextField
                label="Open spots"
                type="number"
                value={form.Capacity}
                onChange={(event) => setForm((prev) => ({ ...prev, Capacity: event.target.value }))}
                helperText="How many people can claim it."
                fullWidth
                slotProps={{ htmlInput: { min: 1, max: 20, step: 1 } }}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <TextField
                label="Note"
                value={form.Notes}
                onChange={(event) => setForm((prev) => ({ ...prev, Notes: event.target.value }))}
                fullWidth
                placeholder="Bring a spare lid"
              />
            </Grid>
            <Grid size={12}>
              <Button type="submit" variant="contained" disabled={create.pending}>
                {form.UserID ? 'Assign shift' : 'Post open shift'}
              </Button>
            </Grid>
          </Grid>
          {formError && form.bucketIds.length > 0 ? (
            <Alert severity="warning" sx={{ mt: 2 }}>
              {formError}
            </Alert>
          ) : null}
          {create.error ? (
            <Alert severity="error" sx={{ mt: 2 }}>
              {create.error}
            </Alert>
          ) : null}
        </CardContent>
      </Card>
      </Collapse>
    </Box>
  );
}
