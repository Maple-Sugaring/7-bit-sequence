import { useState } from 'react';
import Alert from '@mui/material/Alert';
import Autocomplete from '@mui/material/Autocomplete';
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Grid from '@mui/material/Grid';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { Capability } from '../business/permissions';
import { PageHeader } from '../components/common/PageHeader';
import { AsyncBlock, SkeletonRows } from '../components/common/StateBlock';
import { dateTime } from '../components/common/format';
import { EmailPreferencesCard } from '../components/notifications/EmailPreferencesCard';
import { useAuth } from '../context/auth';
import { PRONOUN_SUGGESTIONS, withPronouns } from '../services/profileService';
import { useProfile, useSaveProfile } from '../services/hooks';

function initials(profile) {
  const letters = `${profile.First_Name?.[0] ?? ''}${profile.Last_Name?.[0] ?? ''}`;
  return letters.toUpperCase() || profile.Email?.[0]?.toUpperCase() || '?';
}

function formFrom(profile) {
  return {
    First_Name: profile.First_Name ?? '',
    Last_Name: profile.Last_Name ?? '',
    Pronouns: profile.Pronouns ?? '',
  };
}

function DetailsCard({ profile, onSaved }) {
  const save = useSaveProfile();
  const [form, setForm] = useState(() => formFrom(profile));
  const [saved, setSaved] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});

  const original = formFrom(profile);
  const dirty = Object.keys(form).some((key) => form[key].trim() !== original[key].trim());
  const preview = withPronouns(`${form.First_Name} ${form.Last_Name}`.trim() || profile.Email, form.Pronouns.trim());

  function update(key, value) {
    setForm((previous) => ({ ...previous, [key]: value }));
    setSaved(false);
    setFieldErrors((previous) => ({ ...previous, [key]: undefined }));
  }

  async function submit(event) {
    event.preventDefault();
    if (!form.First_Name.trim()) {
      setFieldErrors({ First_Name: 'Enter your first name.' });
      return;
    }
    const result = await save.execute(form);
    if (result.ok) {
      setSaved(true);
      setForm(formFrom(result.data));
      onSaved(result.data);
    } else if (result.details) {
      setFieldErrors(result.details);
    }
  }

  return (
    <Card component="form" onSubmit={submit} noValidate>
      <CardContent>
        <Stack direction="row" spacing={2} sx={{ alignItems: 'center', mb: 3 }}>
          <Avatar sx={{ bgcolor: '#F76902', width: 56, height: 56, fontWeight: 700 }}>
            {initials(profile)}
          </Avatar>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="h6" component="h2" noWrap>
              {preview}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              This is how your name appears on the schedule and the roster.
            </Typography>
          </Box>
        </Stack>

        <Grid container spacing={2}>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              label="First name"
              value={form.First_Name}
              onChange={(event) => update('First_Name', event.target.value)}
              error={Boolean(fieldErrors.First_Name)}
              helperText={fieldErrors.First_Name}
              required
              fullWidth
              slotProps={{ htmlInput: { maxLength: 100, autoComplete: 'given-name' } }}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              label="Last name"
              value={form.Last_Name}
              onChange={(event) => update('Last_Name', event.target.value)}
              error={Boolean(fieldErrors.Last_Name)}
              helperText={fieldErrors.Last_Name}
              fullWidth
              slotProps={{ htmlInput: { maxLength: 100, autoComplete: 'family-name' } }}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <Autocomplete
              freeSolo
              options={PRONOUN_SUGGESTIONS}
              inputValue={form.Pronouns}
              onInputChange={(event, value) => update('Pronouns', value)}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Pronouns"
                  error={Boolean(fieldErrors.Pronouns)}
                  helperText={fieldErrors.Pronouns ?? 'Optional. Pick one or type your own.'}
                  // Merge, not replace: Autocomplete passes its own slot props
                  // (label shrink, input ref) that the field needs to work.
                  slotProps={{
                    ...params.slotProps,
                    htmlInput: {
                      ...(params.slotProps?.htmlInput ?? params.inputProps),
                      maxLength: 40,
                    },
                  }}
                />
              )}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              label="Email"
              value={profile.Email}
              disabled
              fullWidth
              helperText="Your RIT Google sign-in. An admin can change it."
            />
          </Grid>
        </Grid>

        {save.error ? (
          <Alert severity="error" sx={{ mt: 2 }}>
            {save.error}
          </Alert>
        ) : null}
        {saved ? (
          <Alert severity="success" sx={{ mt: 2 }}>
            Profile saved.
          </Alert>
        ) : null}

        <Stack direction="row" spacing={1} sx={{ mt: 3, justifyContent: 'flex-end' }}>
          <Button
            onClick={() => {
              setForm(original);
              setFieldErrors({});
            }}
            disabled={!dirty || save.pending}
          >
            Reset
          </Button>
          <Button type="submit" variant="contained" disabled={!dirty || save.pending}>
            {save.pending ? 'Saving…' : 'Save changes'}
          </Button>
        </Stack>
      </CardContent>
    </Card>
  );
}

function AccountCard({ profile }) {
  return (
    <Card>
      <CardContent>
        <Typography variant="h6" component="h2" gutterBottom>
          Account
        </Typography>
        <Stack spacing={1.5}>
          <Box>
            <Typography variant="caption" color="text.secondary">
              Role
            </Typography>
            <Box>
              <Chip label={profile.Role_Label} size="small" color="primary" variant="outlined" />
            </Box>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary">
              Access ends
            </Typography>
            <Typography variant="body2">
              {profile.Account_Expiry ? dateTime(profile.Account_Expiry) : 'No end date'}
            </Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary">
              Google Calendar
            </Typography>
            <Box>
              <Chip
                label={profile.Calendar_Connected ? 'Connected' : 'Not connected'}
                size="small"
                color={profile.Calendar_Connected ? 'success' : 'default'}
                variant="outlined"
              />
            </Box>
          </Box>
          <Typography variant="body2" color="text.secondary">
            Role and access dates are set by an administrator.
          </Typography>
        </Stack>
      </CardContent>
    </Card>
  );
}

export function ProfilePage() {
  const { can, refreshUser } = useAuth();
  const { data, loading, error, refresh } = useProfile();
  const preferences = useSaveProfile();
  const [overrides, setOverrides] = useState({});

  const profile = data ? { ...data, ...overrides } : null;

  function onSaved(next) {
    setOverrides(next);
    refreshUser(next);
  }

  async function savePreference(change) {
    const before = profile;
    setOverrides((previous) => ({ ...previous, ...change }));
    const result = await preferences.execute(change);
    if (result.ok) onSaved(result.data);
    else setOverrides((previous) => ({ ...previous, ...before }));
  }

  return (
    <>
      <PageHeader title="Your profile" subtitle="Your name, pronouns, and which emails you get." />

      <AsyncBlock
        loading={loading}
        error={error}
        refresh={refresh}
        data={data}
        skeleton={<SkeletonRows rows={4} height={72} />}
      >
        {profile ? (
          <Grid container spacing={3}>
            <Grid size={{ xs: 12, md: 8 }}>
              <Stack spacing={3}>
                <DetailsCard key={data.UserID} profile={profile} onSaved={onSaved} />
                <EmailPreferencesCard
                  profile={profile}
                  onSave={savePreference}
                  saving={preferences.pending}
                  canTest={can(Capability.MANAGE_USERS)}
                />
                {preferences.error ? <Alert severity="error">{preferences.error}</Alert> : null}
              </Stack>
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <AccountCard profile={profile} />
            </Grid>
          </Grid>
        ) : null}
      </AsyncBlock>
    </>
  );
}
