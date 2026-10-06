import { useState } from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import FormControlLabel from '@mui/material/FormControlLabel';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import Typography from '@mui/material/Typography';
import { useSendTestEmail } from '../../services/hooks';

/**
 * Per-user email opt-ins. Critical alerts default on for admins and off for
 * everyone else; shift emails default on. Each switch saves on its own, and
 * flips back if the save fails. Admins can send themselves a test to confirm
 * the server's Brevo setup.
 */
export function EmailPreferencesCard({ profile, onSave, saving = false, canTest = false }) {
  const test = useSendTestEmail();
  const [testResult, setTestResult] = useState(null);

  async function sendTest() {
    setTestResult(null);
    const result = await test.execute();
    if (result.ok) setTestResult(`Sent to ${result.data.to}. Check your inbox and spam folder.`);
  }

  return (
    <Card>
      <CardContent>
        <Typography variant="h6" component="h2" gutterBottom>
          Email notifications
        </Typography>

        {!profile.Mail_Enabled ? (
          <Alert severity="info" sx={{ mb: 2 }}>
            Email is not set up on this server yet, so nothing will be sent. Your choices are saved
            for when it is.
          </Alert>
        ) : null}

        <Stack spacing={1}>
          {profile.Can_Receive_Alerts ? (
            <FormControlLabel
              control={
                <Switch
                  checked={profile.Email_Alerts}
                  disabled={saving}
                  onChange={(event) => onSave({ Email_Alerts: event.target.checked })}
                />
              }
              label="Critical alerts: full buckets, spoilage, tipped buckets, and offline nodes"
            />
          ) : null}
          <FormControlLabel
            control={
              <Switch
                checked={profile.Email_Shifts}
                disabled={saving}
                onChange={(event) => onSave({ Email_Shifts: event.target.checked })}
              />
            }
            label="Shifts: signups, changes, cancellations, and a reminder before each shift"
          />
        </Stack>

        {canTest ? (
          <Stack direction="row" spacing={2} sx={{ mt: 2, alignItems: 'center', flexWrap: 'wrap' }}>
            <Button variant="outlined" onClick={sendTest} disabled={test.pending}>
              {test.pending ? 'Sending…' : 'Send me a test email'}
            </Button>
            {testResult ? <Typography variant="body2">{testResult}</Typography> : null}
          </Stack>
        ) : null}
        {test.error ? (
          <Alert severity="error" sx={{ mt: 2 }}>
            {test.error}
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  );
}
