import { useState } from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import Grid from '@mui/material/Grid';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined';
import MoreTimeIcon from '@mui/icons-material/MoreTime';
import PersonAddAltIcon from '@mui/icons-material/PersonAddAlt';
import { DataGrid } from '@mui/x-data-grid';
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';
import dayjs from 'dayjs';
import { ROLE_LABELS } from '../business/permissions';
import { validateInvite } from '../business/validation';
import { PageHeader } from '../components/common/PageHeader';
import { ErrorBlock } from '../components/common/StateBlock';
import { dateTime } from '../components/common/format';
import { useAuth } from '../context/auth';
import {
  changeRole,
  inviteUser,
  setAccountExpiry,
  removeUser,
  setActive,
} from '../services/adminService';
import { useAction, useUsers } from '../services/hooks';

function ExpiryDialog({ user, onClose, onSave, pending, error }) {
  const [value, setValue] = useState(() =>
    user?.Account_Expiry ? dayjs(user.Account_Expiry) : dayjs().add(4, 'month').hour(23).minute(59).second(0),
  );

  return (
    <Dialog open={Boolean(user)} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Set end date</DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ mb: 2 }}>
          {user?.fullName} loses access at the date and time you pick. Eastern time.
        </DialogContentText>
        {error ? (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        ) : null}
        <DateTimePicker
          label="Access ends"
          value={value}
          onChange={(next) => setValue(next)}
          ampm
          slotProps={{ textField: { fullWidth: true } }}
        />
      </DialogContent>
      <DialogActions sx={{ justifyContent: 'space-between', px: 3, pb: 2 }}>
        <Button color="inherit" disabled={pending} onClick={() => onSave(null)}>
          No end date
        </Button>
        <Stack direction="row" spacing={1}>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="contained"
            disabled={pending || !value?.isValid()}
            onClick={() => onSave(value.toISOString())}
          >
            Save
          </Button>
        </Stack>
      </DialogActions>
    </Dialog>
  );
}

function InviteDialog({ open, onClose, roles, onInvite, pending, error }) {
  const [form, setForm] = useState({
    email: '',
    roleId: 2,
    firstName: '',
    lastName: '',
    accountExpiry: dayjs().add(4, 'month').hour(23).minute(59).second(0),
  });
  const [touched, setTouched] = useState(false);
  const { errors, isValid } = validateInvite(form);

  const update = (field) => (event) => setForm((prev) => ({ ...prev, [field]: event.target.value }));

  const handleInvite = async () => {
    setTouched(true);
    if (!isValid) return;

    if (!form.accountExpiry?.isValid()) return;
    const result = await onInvite({
      ...form,
      accountExpiry: form.accountExpiry.toISOString(),
    });
    if (result?.ok) {
      setForm({
        email: '',
        roleId: 2,
        firstName: '',
        lastName: '',
        accountExpiry: dayjs().add(4, 'month').hour(23).minute(59).second(0),
      });
      setTouched(false);
      onClose();
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Invite a user</DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ mb: 2 }}>
          Only administrators create accounts. Pick the exact date and time access should end.
        </DialogContentText>

        {error ? (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        ) : null}

        <Grid container spacing={2}>
          <Grid size={12}>
            <TextField
              label="Email address"
              type="email"
              value={form.email}
              onChange={update('email')}
              error={touched && Boolean(errors.email)}
              helperText={touched ? errors.email : 'An RIT address, for example ab1234@g.rit.edu'}
              fullWidth
              required
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField label="First name" value={form.firstName} onChange={update('firstName')} fullWidth />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField label="Last name" value={form.lastName} onChange={update('lastName')} fullWidth />
          </Grid>
          <Grid size={12}>
            <DateTimePicker
              label="Access ends"
              value={form.accountExpiry}
              onChange={(next) => setForm((prev) => ({ ...prev, accountExpiry: next }))}
              ampm
              slotProps={{ textField: { fullWidth: true, required: true } }}
            />
          </Grid>
          <Grid size={12}>
            <TextField
              select
              label="Role"
              value={form.roleId}
              onChange={update('roleId')}
              error={touched && Boolean(errors.roleId)}
              helperText={touched ? errors.roleId : undefined}
              fullWidth
              required
            >
              {(roles ?? []).map((role) => (
                <MenuItem key={role.RoleID} value={role.RoleID}>
                  {ROLE_LABELS[role.Role_Name] ?? role.Role_Name}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
        </Grid>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleInvite} loading={pending}>
          Send invite
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export function AdminPage() {
  const { user: currentUser } = useAuth();
  const { data, loading, error, refresh } = useUsers();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [pendingRemoval, setPendingRemoval] = useState(null);
  const [expiryUser, setExpiryUser] = useState(null);

  const invite = useAction(async (form) => {
    await inviteUser(form);
    await refresh();
  });
  const updateRole = useAction(async (userId, roleId) => {
    await changeRole(userId, roleId);
    await refresh();
  });
  const toggleActive = useAction(async (userId, isActive) => {
    await setActive(userId, isActive);
    await refresh();
  });
  const saveExpiry = useAction(async (userId, accountExpiry) => {
    await setAccountExpiry(userId, accountExpiry);
    await refresh();
  });
  const remove = useAction(async (userId) => {
    await removeUser(userId);
    await refresh();
  });

  const columns = [
    { field: 'fullName', headerName: 'Name', width: 180 },
    { field: 'Email', headerName: 'Email', width: 220 },
    {
      field: 'RoleID',
      headerName: 'Role',
      width: 170,
      sortable: false,
      renderCell: (params) => (
        <Select
          value={params.value}
          size="small"
          variant="standard"
          onChange={(event) => updateRole.execute(params.row.UserID, event.target.value)}
          // An admin demoting themselves would lock everyone out of this page.
          disabled={updateRole.pending || params.row.UserID === currentUser?.id}
          inputProps={{ 'aria-label': `Role for ${params.row.fullName}` }}
          sx={{ minWidth: 130 }}
        >
          {(data?.roles ?? []).map((role) => (
            <MenuItem key={role.RoleID} value={role.RoleID}>
              {ROLE_LABELS[role.Role_Name] ?? role.Role_Name}
            </MenuItem>
          ))}
        </Select>
      ),
    },
    {
      field: 'expiry',
      headerName: 'Account status',
      width: 160,
      sortable: false,
      renderCell: (params) => (
        <Chip label={params.value.label} color={params.value.level} size="small" variant="outlined" />
      ),
    },
    {
      field: 'Account_Expiry',
      headerName: 'Ends',
      width: 190,
      renderCell: (params) => (params.value ? dateTime(params.value) : 'No end date'),
    },
    {
      field: 'Last_Login',
      headerName: 'Last login',
      width: 190,
      renderCell: (params) =>
        params.row.invitePending ? (
          <Chip label="Invite pending" size="small" color="info" variant="outlined" />
        ) : (
          dateTime(params.value)
        ),
    },
    {
      field: 'Is_Active',
      headerName: 'Active',
      width: 90,
      sortable: false,
      renderCell: (params) => (
        <Switch
          checked={params.value}
          onChange={(event) => toggleActive.execute(params.row.UserID, event.target.checked)}
          disabled={toggleActive.pending || params.row.UserID === currentUser?.id}
          inputProps={{ 'aria-label': `Active status for ${params.row.fullName}` }}
        />
      ),
    },
    {
      field: 'actions',
      headerName: '',
      width: 110,
      sortable: false,
      filterable: false,
      renderCell: (params) => (
        <Stack direction="row">
          <Tooltip title="Set end date">
            <IconButton
              size="small"
              onClick={() => setExpiryUser(params.row)}
              aria-label={`Set end date for ${params.row.fullName}`}
            >
              <MoreTimeIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Remove user">
            <IconButton
              size="small"
              onClick={() => setPendingRemoval(params.row)}
              disabled={remove.pending || params.row.UserID === currentUser?.id}
              aria-label={`Remove ${params.row.fullName}`}
            >
              <DeleteOutlineIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>
      ),
    },
  ];

  if (error) {
    return (
      <>
        <PageHeader title="Admin" />
        <ErrorBlock error={error} onRetry={refresh} />
      </>
    );
  }

  const actionError = updateRole.error ?? toggleActive.error ?? remove.error;

  return (
    <>
      <PageHeader
        title="Admin"
        actions={
          <Button variant="contained" startIcon={<PersonAddAltIcon />} onClick={() => setInviteOpen(true)}>
            Invite user
          </Button>
        }
      />

      {actionError ? (
        <Alert severity="error" sx={{ mb: 3 }}>
          {actionError}
        </Alert>
      ) : null}

      {data?.summary?.expiringSoon > 0 ? (
        <Alert severity="warning" sx={{ mb: 3 }}>
          {data.summary.expiringSoon}{' '}
          {data.summary.expiringSoon === 1 ? 'account expires' : 'accounts expire'} within two weeks.
          Open the calendar on that row to choose a later end date.
        </Alert>
      ) : null}

      <Grid container spacing={2} sx={{ mb: 3 }}>
        {[
          { label: 'Total users', value: data?.summary.total },
          { label: 'Active', value: data?.summary.active },
          { label: 'Locked or expired', value: data?.summary.locked },
          { label: 'Pending invites', value: data?.summary.pendingInvites },
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

      <Card sx={{ height: 560 }}>
        <DataGrid
          rows={data?.users ?? []}
          columns={columns}
          loading={loading}
          disableRowSelectionOnClick
          pageSizeOptions={[10, 25, 50]}
          initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
          sx={{ border: 0 }}
        />
      </Card>

      <ExpiryDialog
        key={expiryUser?.UserID ?? 'none'}
        user={expiryUser}
        onClose={() => setExpiryUser(null)}
        pending={saveExpiry.pending}
        error={saveExpiry.error}
        onSave={async (accountExpiry) => {
          const result = await saveExpiry.execute(expiryUser.UserID, accountExpiry);
          if (result?.ok) setExpiryUser(null);
        }}
      />

      <InviteDialog
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        roles={data?.roles}
        onInvite={invite.execute}
        pending={invite.pending}
        error={invite.error}
      />

      <Dialog open={Boolean(pendingRemoval)} onClose={() => setPendingRemoval(null)}>
        <DialogTitle>Remove {pendingRemoval?.fullName}?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This deletes the account. Readings they recorded stay in the system, but the account will
            no longer be attributed. Deactivate the account if they may come back later.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPendingRemoval(null)}>Cancel</Button>
          <Button
            color="error"
            variant="contained"
            loading={remove.pending}
            onClick={async () => {
              await remove.execute(pendingRemoval.UserID);
              setPendingRemoval(null);
            }}
          >
            Remove user
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
