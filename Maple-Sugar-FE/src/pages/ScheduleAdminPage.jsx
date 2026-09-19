import { useState } from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Grid from '@mui/material/Grid';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined';
import { DataGrid } from '@mui/x-data-grid';
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';
import dayjs from 'dayjs';
import { validateSlot } from '../business/validation';
import { PageHeader } from '../components/common/PageHeader';
import { ErrorBlock } from '../components/common/StateBlock';
import { dateTime } from '../components/common/format';
import {
  createShift,
  deleteShift,
  setShiftComplete,
  SHIFT_TASKS,
  STANDS,
} from '../services/scheduleService';
import { useAction, useSchedule } from '../services/hooks';

function emptySlot() {
  const start = dayjs().add(1, 'day').hour(9).minute(0).second(0);
  return {
    Task: SHIFT_TASKS[0],
    Stand: STANDS[0],
    Starts_At: start,
    Ends_At: start.add(2, 'hour'),
    Capacity: 2,
  };
}

function NewSlotDialog({ open, onClose, onCreate, pending, error }) {
  const [form, setForm] = useState(emptySlot);
  const [touched, setTouched] = useState(false);

  const { errors, isValid } = validateSlot({
    ...form,
    Starts_At: form.Starts_At?.toISOString(),
    Ends_At: form.Ends_At?.toISOString(),
  });

  const update = (field) => (value) => setForm((prev) => ({ ...prev, [field]: value }));

  const handleCreate = async () => {
    setTouched(true);
    if (!isValid) return;

    const result = await onCreate({
      Task: form.Task,
      Stand: form.Stand,
      Starts_At: form.Starts_At.toISOString(),
      Ends_At: form.Ends_At.toISOString(),
      Capacity: Number(form.Capacity),
    });

    if (result?.ok) {
      setForm(emptySlot());
      setTouched(false);
      onClose();
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Publish a shift</DialogTitle>
      <DialogContent>
        {error ? (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        ) : null}

        <Grid container spacing={2} sx={{ mt: 0.5 }}>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              select
              label="Task"
              value={form.Task}
              onChange={(event) => update('Task')(event.target.value)}
              error={touched && Boolean(errors.Task)}
              helperText={touched ? errors.Task : undefined}
              fullWidth
            >
              {SHIFT_TASKS.map((task) => (
                <MenuItem key={task} value={task}>
                  {task}
                </MenuItem>
              ))}
            </TextField>
          </Grid>

          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              select
              label="Stand"
              value={form.Stand}
              onChange={(event) => update('Stand')(event.target.value)}
              error={touched && Boolean(errors.Stand)}
              helperText={touched ? errors.Stand : undefined}
              fullWidth
            >
              {STANDS.map((stand) => (
                <MenuItem key={stand} value={stand}>
                  {stand}
                </MenuItem>
              ))}
            </TextField>
          </Grid>

          <Grid size={{ xs: 12, sm: 6 }}>
            <DateTimePicker
              label="Starts at"
              value={form.Starts_At}
              onChange={update('Starts_At')}
              slotProps={{
                textField: {
                  fullWidth: true,
                  size: 'small',
                  error: touched && Boolean(errors.Starts_At),
                  helperText: touched ? errors.Starts_At : undefined,
                },
              }}
            />
          </Grid>

          <Grid size={{ xs: 12, sm: 6 }}>
            <DateTimePicker
              label="Ends at"
              value={form.Ends_At}
              onChange={update('Ends_At')}
              minDateTime={form.Starts_At}
              slotProps={{
                textField: {
                  fullWidth: true,
                  size: 'small',
                  error: touched && Boolean(errors.Ends_At),
                  helperText: touched ? errors.Ends_At : undefined,
                },
              }}
            />
          </Grid>

          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              label="Capacity"
              type="number"
              value={form.Capacity}
              onChange={(event) => update('Capacity')(event.target.value)}
              error={touched && Boolean(errors.Capacity)}
              helperText={touched ? errors.Capacity : 'How many students can claim it.'}
              slotProps={{ htmlInput: { min: 1, max: 10 } }}
              fullWidth
            />
          </Grid>
        </Grid>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleCreate} loading={pending}>
          Publish shift
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export function ScheduleAdminPage() {
  const { data, loading, error, refresh } = useSchedule();
  const [dialogOpen, setDialogOpen] = useState(false);

  const create = useAction(async (slot) => {
    await createShift(slot);
    await refresh();
  });
  const remove = useAction(async (slotId) => {
    await deleteShift(slotId);
    await refresh();
  });
  const complete = useAction(async (slotId, isComplete) => {
    await setShiftComplete(slotId, isComplete);
    await refresh();
  });

  const columns = [
    { field: 'Task', headerName: 'Task', width: 170 },
    { field: 'Stand', headerName: 'Stand', width: 140 },
    {
      field: 'Starts_At',
      headerName: 'Starts',
      width: 190,
      renderCell: (params) => dateTime(params.value),
    },
    {
      field: 'assigned',
      headerName: 'Signed up',
      width: 260,
      sortable: false,
      renderCell: (params) =>
        params.value.length ? (
          <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap', gap: 0.5, py: 0.5 }}>
            {params.value.map((person) => (
              <Chip key={person.userId} label={person.name} size="small" variant="outlined" />
            ))}
          </Stack>
        ) : (
          <Chip label="Unclaimed" size="small" color="warning" variant="outlined" />
        ),
    },
    {
      field: 'capacityLabel',
      headerName: 'Filled',
      width: 100,
      valueGetter: (unused, row) => `${row.assigned.length}/${row.Capacity}`,
    },
    {
      field: 'Is_Complete',
      headerName: 'Complete',
      width: 110,
      sortable: false,
      renderCell: (params) => (
        <Checkbox
          checked={params.value}
          onChange={(event) => complete.execute(params.row.SlotID, event.target.checked)}
          disabled={complete.pending}
          inputProps={{ 'aria-label': `Mark ${params.row.Task} complete` }}
        />
      ),
    },
    {
      field: 'actions',
      headerName: '',
      width: 70,
      sortable: false,
      filterable: false,
      renderCell: (params) => (
        <Tooltip title="Delete shift">
          <IconButton
            size="small"
            onClick={() => remove.execute(params.row.SlotID)}
            disabled={remove.pending}
            aria-label={`Delete ${params.row.Task} shift`}
          >
            <DeleteOutlineIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      ),
    },
  ];

  if (error) {
    return (
      <>
        <PageHeader title="Schedule Admin" />
        <ErrorBlock error={error} onRetry={refresh} />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Schedule Admin"
        actions={
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setDialogOpen(true)}>
            Publish shift
          </Button>
        }
      />

      {(remove.error || complete.error) ? (
        <Alert severity="error" sx={{ mb: 3 }}>
          {remove.error ?? complete.error}
        </Alert>
      ) : null}

      {data?.summary?.incomplete > 0 ? (
        <Alert severity="warning" sx={{ mb: 3 }}>
          {data.summary.incomplete} past {data.summary.incomplete === 1 ? 'shift was' : 'shifts were'}{' '}
          claimed but never marked complete.
        </Alert>
      ) : null}

      <Grid container spacing={2} sx={{ mb: 3 }}>
        {[
          { label: 'Total shifts', value: data?.summary.total },
          { label: 'Open', value: data?.summary.open },
          { label: 'Unclaimed in the past', value: data?.summary.unfilledPast },
          { label: 'Not marked complete', value: data?.summary.incomplete },
        ].map((stat) => (
          <Grid size={{ xs: 6, md: 3 }} key={stat.label}>
            <Card sx={{ p: 2 }}>
              <Typography variant="caption" color="text.secondary" display="block">
                {stat.label}
              </Typography>
              <Typography variant="h4" component="p">
                {stat.value ?? '—'}
              </Typography>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Card sx={{ height: 600 }}>
        <DataGrid
          rows={data?.slots ?? []}
          columns={columns}
          loading={loading}
          disableRowSelectionOnClick
          getRowHeight={() => 'auto'}
          pageSizeOptions={[25, 50]}
          initialState={{
            pagination: { paginationModel: { pageSize: 25 } },
            sorting: { sortModel: [{ field: 'Starts_At', sort: 'asc' }] },
          }}
          sx={{ border: 0, '& .MuiDataGrid-cell': { py: 1 } }}
        />
      </Card>

      <NewSlotDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onCreate={create.execute}
        pending={create.pending}
        error={create.error}
      />
    </>
  );
}
