import { useState } from 'react';
import { Alert, Button, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { correctReading } from '../services/metricsService';

const fields = { Weight: 'Weight (lb)', Temperature: 'Temperature (°F)', Sugar_Percent: 'Sugar (%)' };

export function ReadingCorrections({ readings, refresh, canOverwrite }) {
  const [id, setId] = useState('');
  const [field, setField] = useState('Weight');
  const [value, setValue] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const rows = readings.filter((row) => !row.Aggregated && row.MetricID != null);
  const selected = rows.find((row) => row.MetricID === id);

  async function save(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await correctReading(selected.MetricID, {
        [field]: Number(value),
        Expected_Revision: selected.Revision,
        Correction_Reason: reason.trim(),
      });
      setReason('');
      await refresh();
    } catch (failure) {
      setError(failure.status === 409 ? 'This reading changed. Refresh the readings before trying again.' : failure.message);
    } finally {
      setBusy(false);
    }
  }

  if (!rows.length) return null;
  return (
    <Stack component="form" onSubmit={save} spacing={2} sx={{ mt: 3 }}>
      <Typography variant="h6">Individual readings</Typography>
      <TextField select label="Reading" value={selected ? id : ''} onChange={(event) => {
        const row = rows.find((item) => item.MetricID === Number(event.target.value));
        setId(row.MetricID);
        setValue(row[field] ?? '');
        setReason('');
        setError('');
      }}>
        {rows.map((row) => (
          <MenuItem key={row.MetricID} value={row.MetricID}>
            {new Date(row.Recorded_At).toLocaleString()} · Node {row.NodeID} · {row.Weight ?? '—'} lb
            {row.Corrected_At ? ' · Corrected' : ''}{row.Data_Mode === 'test' ? ' · Test' : ''}
          </MenuItem>
        ))}
      </TextField>
      {selected?.Correction_Note && <Typography>{selected.Correction_Note}</Typography>}
      {selected && canOverwrite && (
        <>
          <TextField select label="Measurement" value={field} onChange={(event) => {
            setField(event.target.value);
            setValue(selected[event.target.value] ?? '');
          }}>
            {Object.entries(fields).map(([key, label]) => <MenuItem key={key} value={key}>{label}</MenuItem>)}
          </TextField>
          <Typography>Current {fields[field]} · {selected[field] ?? '—'}</Typography>
          <TextField label={`Replacement ${fields[field]}`} type="number" value={value} onChange={(event) => setValue(event.target.value)} slotProps={{ htmlInput: { step: 'any' } }} required />
          <TextField label="Correction reason" value={reason} onChange={(event) => setReason(event.target.value)} required />
          <Stack direction="row" spacing={1}>
            <Button type="submit" disabled={busy || !reason.trim() || value === '' || Number(value) === selected[field]}>Overwrite reading</Button>
            <Button onClick={() => { setId(''); void refresh(); }}>Refresh readings</Button>
          </Stack>
        </>
      )}
      {error && <Alert severity="error">{error}</Alert>}
    </Stack>
  );
}
