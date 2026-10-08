import { useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import SendIcon from '@mui/icons-material/Send';
import { PageHeader } from '../components/common/PageHeader';

export function FeedbackPage() {
  const [category, setCategory] = useState('Idea');
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState(null);
  const [sending, setSending] = useState(false);

  async function submit(event) {
    event.preventDefault();
    if (!message.trim() || sending) return;
    setSending(true);
    setStatus(null);

    try {
      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, message: message.trim() }),
      });
      if (!response.ok) throw new Error('Delivery failed');
      setMessage('');
      setStatus({ severity: 'success', text: 'Thanks, your feedback was sent.' });
    } catch {
      setStatus({ severity: 'error', text: 'Could not send feedback. Please try again.' });
    } finally {
      setSending(false);
    }
  }

  return (
    <Box sx={{ maxWidth: 640, mx: 'auto' }}>
      <PageHeader title="Provide feedback" />
      <Stack component="form" onSubmit={submit} spacing={2} sx={{ mt: 3 }}>
        <TextField
          select
          label="Feedback type"
          value={category}
          onChange={(event) => setCategory(event.target.value)}
          fullWidth
        >
          <MenuItem value="Idea">Idea</MenuItem>
          <MenuItem value="Bug">Bug</MenuItem>
          <MenuItem value="Other">Other</MenuItem>
        </TextField>
        <TextField
          label="Your feedback"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          multiline
          minRows={6}
          required
          fullWidth
          slotProps={{ htmlInput: { maxLength: 1500 } }}
        />
        {status ? <Alert severity={status.severity}>{status.text}</Alert> : null}
        <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button type="submit" variant="contained" startIcon={<SendIcon />} disabled={!message.trim() || sending}>
            {sending ? 'Sending...' : 'Send feedback'}
          </Button>
        </Box>
      </Stack>
    </Box>
  );
}
