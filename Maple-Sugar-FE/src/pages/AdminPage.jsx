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
import { ROLE_LABELS } from '../business/permissions';
import { validateInvite } from '../business/validation';
import { PageHeader } from '../components/common/PageHeader';
import { ErrorBlock } from '../components/common/StateBlock';
import { dateOnly, dateTime } from '../components/common/format';
import { useAuth } from '../context/auth';
import {
  changeRole,
  extendAccount,
  inviteUser,
  removeUser,
  setActive,
} from '../services/adminService';
import { useAction, useUsers } from '../services/hooks';

function InviteDialog({ open, onClose, roles, onInvite, pending, error }) {
  const [form, setForm] = useState({ email: '', roleId: 2, firstName: '', lastName: '' });
  const [touched, setTouched] = useState(false);
  const { errors, isValid } = validateInvite(form);

  const update = (field) => (event) => setForm((prev) => ({ ...prev, [field]: event.target.value }));

  const handleInvite = async () => {
    setTouched(true);
    if (!isValid) return;

    const result = await onInvite(form);
    if (result?.ok) {
      setForm({ email: '', roleId: 2, firstName: '', lastName: '' });
      setTouched(false);
      onClose();
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Invite a user</DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ mb: 2 }}>
          Only administrators create accounts. Student accounts expire at the end of the semester
          unless an extension is granted.
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
  const extend = useAction(async (userId) => {
    await extendAccount(userId);
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
      headerName: 'Expires',
      width: 130,
      renderCell: (params) => (params.value ? dateOnly(params.value) : 'Never'),
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
          <Tooltip title="Extend by one semester">
            <IconButton
              size="small"
              onClick={() => extend.execute(params.row.UserID)}
              disabled={extend.pending}
              aria-label={`Extend account for ${params.row.fullName}`}
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

  const actionError = updateRole.error ?? toggleActive.error ?? extend.error ?? remove.error;

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
          Grant an extension to keep them active past the end of the semester.
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
            no longer be attributed. Consider deactivating instead if they may return next semester.
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
