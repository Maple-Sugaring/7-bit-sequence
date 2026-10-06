import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
import Grid from '@mui/material/Grid';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined';
import useMediaQuery from '@mui/material/useMediaQuery';
import { DataGrid } from '@mui/x-data-grid';
import { ColumnCards } from '../components/common/ColumnCards';
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';
import dayjs from 'dayjs';
import { PageHeader } from '../components/common/PageHeader';
import { ErrorBlock } from '../components/common/StateBlock';
import { dateTime } from '../components/common/format';
import { assignShift, deleteShift, setShiftComplete, SHIFT_TASKS } from '../services/scheduleService';
import { useAction, useBush, useSchedule, useUsers } from '../services/hooks';

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
  const task = params.get('task');
  const notes = params.get('notes');
  const node = bucketOptions.find((item) => item.NodeID === nodeId);
  return {
    ...next,
    Task: SHIFT_TASKS.includes(task) ? task : next.Task,
    bucketIds: node?.BucketID ? [node.BucketID] : next.bucketIds,
    Notes: notes || next.Notes,
  };
}

export function ScheduleAdminPage() {
  const [params] = useSearchParams();
  const { data, loading, error, refresh } = useSchedule();
  const people = useUsers();
  const bush = useBush();
  const bucketOptions = useMemo(
    () => (bush.data ?? []).filter((node) => node.BucketID),
    [bush.data],
  );
  const seedKey = `${params.get('nodeId') || ''}|${params.get('task') || ''}|${params.get('notes') || ''}`;
  const [seededKey, setSeededKey] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState('');
  const [tab, setTab] = useState('active');

  if (
    seedKey !== '||' &&
    seedKey !== seededKey &&
    !(params.get('nodeId') && bush.loading)
  ) {
    setSeededKey(seedKey);
    setForm(formFromSearch(params, bucketOptions));
  }

  const create = useAction(async (assignment) => {
    await assignShift(assignment);
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

  const students = (people.data?.users ?? []).filter((user) => user.usable);
  const activeSlots = useMemo(
    () => (data?.slots ?? []).filter((slot) => !slot.Is_Complete),
    [data?.slots],
  );
  const completedSlots = useMemo(
    () => (data?.slots ?? []).filter((slot) => slot.Is_Complete),
    [data?.slots],
  );
  const visibleSlots = tab === 'completed' ? completedSlots : activeSlots;

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

  const phone = useMediaQuery('(max-width:600px)');
  const columns = [
    { field: 'Task', headerName: 'Task', width: 160 },
    { field: 'Stand', headerName: 'Site', width: 180 },
    {
      field: 'Starts_At',
      headerName: 'Starts',
      width: 180,
      renderCell: (params) => (params.row.awaiting ? 'Awaiting a time' : dateTime(params.value)),
    },
    {
      field: 'Bucket_Labels',
      headerName: 'Buckets',
      width: 180,
      sortable: false,
      renderCell: (params) =>
        (params.value ?? []).length
          ? (params.value ?? []).join(', ')
          : '—',
    },
    {
      field: 'assigned',
      headerName: 'Student',
      width: 200,
      sortable: false,
      renderCell: (params) =>
        params.value.length ? (
          params.value.map((person) => person.name).join(', ')
        ) : (
          <Chip label="Unclaimed" size="small" color="warning" variant="outlined" />
        ),
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
      renderCell: (params) => (
        <Tooltip title="Delete shift">
          <IconButton
            size="small"
            onClick={() => remove.execute(params.row.SlotID)}
            disabled={remove.pending}
            aria-label={`Delete ${params.row.Task}`}
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
        <PageHeader title="Schedule Admin" subtitle="Post an open shift for students to claim, or assign someone now." />
        <ErrorBlock error={error} onRetry={refresh} />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Schedule Admin"
        subtitle="Post an open shift for students to claim, or assign someone now."
      />

      <Card component="form" noValidate onSubmit={submit} sx={{ mb: 3 }}>
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

      {(remove.error || complete.error) ? (
        <Alert severity="error" sx={{ mb: 2 }}>
          {remove.error ?? complete.error}
        </Alert>
      ) : null}

      <Card sx={{ height: phone ? 'auto' : 560 }}>
        <Tabs
          value={tab}
          onChange={(_event, value) => setTab(value)}
          sx={{ px: 2, borderBottom: 1, borderColor: 'divider' }}
        >
          <Tab
            value="active"
            label={`Active (${activeSlots.length})`}
            id="schedule-admin-tab-active"
            aria-controls="schedule-admin-panel-active"
          />
          <Tab
            value="completed"
            label={`Completed (${completedSlots.length})`}
            id="schedule-admin-tab-completed"
            aria-controls="schedule-admin-panel-completed"
          />
        </Tabs>
        <Box
          role="tabpanel"
          id={tab === 'completed' ? 'schedule-admin-panel-completed' : 'schedule-admin-panel-active'}
          aria-labelledby={tab === 'completed' ? 'schedule-admin-tab-completed' : 'schedule-admin-tab-active'}
          sx={{ height: phone ? 'auto' : 'calc(100% - 49px)' }}
        >
          {phone ? (
            <ColumnCards
              rows={visibleSlots}
              columns={columns}
              getRowId={(row) => row.SlotID}
              loading={loading}
              emptyLabel={tab === 'completed' ? 'No completed shifts yet.' : 'No active shifts.'}
            />
          ) : (
          <DataGrid
            rows={visibleSlots}
            columns={columns}
            loading={loading}
            disableRowSelectionOnClick
            getRowHeight={() => 'auto'}
            pageSizeOptions={[25, 50]}
            initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
            localeText={{
              noRowsLabel: tab === 'completed' ? 'No completed shifts yet.' : 'No active shifts.',
            }}
            sx={{ border: 0, height: '100%', '& .MuiDataGrid-cell': { py: 1 } }}
          />
          )}
        </Box>
      </Card>
    </>
  );
}
