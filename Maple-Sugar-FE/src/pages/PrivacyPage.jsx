import Box from '@mui/material/Box';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { Link as RouterLink } from 'react-router-dom';

const CONTACT = 'ir8643@g.rit.edu';

function Section({ title, children }) {
  return (
    <Stack spacing={1}>
      <Typography variant="h2" sx={{ fontSize: 22, fontWeight: 600 }}>
        {title}
      </Typography>
      {children}
    </Stack>
  );
}

/**
 * Public: Google's OAuth consent screen links here, so it must load without
 * signing in. Keep it in step with what the API actually stores and sends.
 */
export function PrivacyPage() {
  return (
    <Box sx={{ minHeight: '100svh', bgcolor: '#F6F3F0', px: 2, py: { xs: 4, md: 8 } }}>
      <Stack spacing={3} sx={{ maxWidth: '68ch', mx: 'auto', color: '#222' }}>
        <Typography variant="h1" sx={{ fontSize: { xs: 34, sm: 42 }, fontWeight: 500 }}>
          Privacy policy
        </Typography>
        <Typography color="text.secondary">
          RIT Maple Sugaring monitors sap collection at the RIT sugarbush. This page explains what the
          app does with your information. Last updated October 23, 2026.
        </Typography>

        <Section title="What we collect">
          <Typography>
            When you sign in with Google we receive your name, email address and Google account ID. We
            also keep what you enter in the app: shift signups, collection records, your pronouns, and
            your email preferences.
          </Typography>
          <Typography>
            The app also records sensor readings from the collection buckets. Those describe sap, not
            people.
          </Typography>
        </Section>

        <Section title="Google Calendar">
          <Typography>
            Signing in asks for permission to add events to your Google Calendar and to check when you
            are busy. We use it only to put the shifts you sign up for on your calendar and to avoid
            booking you when you are busy. The access token is stored encrypted, and you can revoke it
            at any time from your Google account&apos;s security settings.
          </Typography>
        </Section>

        <Section title="Email">
          <Typography>
            We email you about shifts and sensor alerts, unless you turn those emails off on your profile
            page. Alert emails are sent from the club&apos;s Gmail account; the app never sends mail from
            your account.
          </Typography>
        </Section>

        <Section title="Sharing">
          <Typography>
            We do not sell your information or share it with advertisers. Club administrators can see
            member names, email addresses and shift signups so they can run the season. Email delivery
            and weather data use outside services that receive only what they need to do that job.
          </Typography>
          <Typography>
            The app&apos;s use of information received from Google APIs adheres to the{' '}
            <Link href="https://developers.google.com/terms/api-services-user-data-policy">
              Google API Services User Data Policy
            </Link>
            , including the Limited Use requirements.
          </Typography>
        </Section>

        <Section title="Keeping and deleting your information">
          <Typography>
            Accounts last for the season they were created for. Ask us and we will delete your account
            and the information tied to it.
          </Typography>
        </Section>

        <Section title="Contact">
          <Typography>
            Questions or deletion requests: <Link href={`mailto:${CONTACT}`}>{CONTACT}</Link>.
          </Typography>
        </Section>

        <Link component={RouterLink} to="/">
          Back to sign in
        </Link>
      </Stack>
    </Box>
  );
}
