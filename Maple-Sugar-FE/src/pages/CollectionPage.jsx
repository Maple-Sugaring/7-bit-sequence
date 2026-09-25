import { useMemo, useState } from 'react';
import Alert from '@mui/material/Alert';
import Autocomplete from '@mui/material/Autocomplete';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import FormControlLabel from '@mui/material/FormControlLabel';
import Grid from '@mui/material/Grid';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';
import dayjs from 'dayjs';
import { estimatedSyrupGallons, sugarPercentForSyrup } from '../business/sugarContent';
import { gallonsFromWeight } from '../business/yieldMetrics';
import { PageHeader } from '../components/common/PageHeader';
import { dateTime } from '../components/common/format';
import { useJournal, useRecordingTargets } from '../services/hooks';
import { useAction } from '../services/hooks/useAsync';
import { saveJournalEntry } from '../services/journalService';
import { submitReading } from '../services/metricsService';

function emptyForm() {
  return {
    Title: '',
    Process_Notes: '',
    NodeID: '',
    Weight: '',
    Sugar_Percent: '',
    Syrup_Gallons: '',
    Ice_Present: false,
    Collected_At: dayjs(),
  };
}

export function CollectionPage() {
  const journal = useJournal();
  const { data: targets } = useRecordingTargets();
  const [form, setForm] = useState(emptyForm);
  const save = useAction(async (entry) => {
    if (entry.Weight != null || entry.Sugar_Percent != null) {
      await submitReading({
        NodeID: entry.NodeID,
        BucketID: entry.BucketID,
        Weight: entry.Weight,
        Sugar_Percent: entry.Sugar_Percent,
        Ice_Present: entry.Ice_Present,
        Recorded_At: entry.Collected_At,
      });
    }
    await saveJournalEntry(entry);
    await journal.refresh();
  });

  const selected = useMemo(
    () => (targets ?? []).find((target) => target.nodeId === form.NodeID) ?? null,
    [targets, form.NodeID],
  );

  const update = (field) => (value) => setForm((prev) => ({ ...prev, [field]: value }));

  const sapGallons = form.Weight === '' ? null : gallonsFromWeight(Number(form.Weight));

  const changeWeight = (value) => {
    setForm((prev) => {
      const sap = value === '' ? null : gallonsFromWeight(Number(value));
      const sugar = prev.Sugar_Percent === '' ? null : Number(prev.Sugar_Percent);
      const syrup = sap == null ? '' : estimatedSyrupGallons(sap, sugar).toFixed(2);
      return { ...prev, Weight: value, Syrup_Gallons: syrup };
    });
  };

  const changeSugar = (value) => {
    setForm((prev) => {
      const sap = prev.Weight === '' ? null : gallonsFromWeight(Number(prev.Weight));
      const sugar = value === '' ? null : Number(value);
      const syrup = sap == null ? prev.Syrup_Gallons : estimatedSyrupGallons(sap, sugar).toFixed(2);
      return { ...prev, Sugar_Percent: value, Syrup_Gallons: syrup };
    });
  };

  const changeSyrup = (value) => {
    setForm((prev) => {
      const sap = prev.Weight === '' ? null : gallonsFromWeight(Number(prev.Weight));
      const implied = sap == null || value === '' ? null : sugarPercentForSyrup(sap, Number(value));
      return {
        ...prev,
        Syrup_Gallons: value,
        Sugar_Percent: implied == null ? prev.Sugar_Percent : implied.toFixed(2),
      };
    });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const result = await save.execute({
      Title: form.Title.trim(),
      Process_Notes: form.Process_Notes.trim(),
      NodeID: form.NodeID || null,
      BucketID: selected?.bucketId ?? null,
      Collected_At: form.Collected_At.toISOString(),
      Weight: form.Weight === '' ? null : Number(form.Weight),
      Sugar_Percent: form.Sugar_Percent === '' ? null : Number(form.Sugar_Percent),
      Ice_Present: form.Ice_Present,
    });
    if (result.ok) setForm(emptyForm());
  };

  return (
    <>
      <PageHeader title="Collection" />

      <Grid container spacing={2.5}>
        <Grid size={{ xs: 12, lg: 5 }}>
          <Card component="form" onSubmit={handleSubmit}>
            <CardContent>
              <Stack spacing={2}>
                <Typography variant="h5" component="h2">
                  Document a collection
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Write how the round went. Weight, sugar, and the ice tag are saved with the note
                  and count as a bucket reading.
                </Typography>
                {save.error ? <Alert severity="error">{save.error}</Alert> : null}
                <TextField
                  label="Title"
                  value={form.Title}
                  onChange={(event) => update('Title')(event.target.value)}
                  required
                  fullWidth
                />
                <Autocomplete
                  options={targets ?? []}
                  value={selected}
                  onChange={(_event, option) => update('NodeID')(option?.nodeId ?? '')}
                  getOptionLabel={(option) => option.label}
                  groupBy={(option) => option.stand}
                  isOptionEqualToValue={(option, value) => option.nodeId === value.nodeId}
                  renderInput={(params) => <TextField {...params} label="Tree" />}
                />
                <TextField
                  label="What you did"
                  value={form.Process_Notes}
                  onChange={(event) => update('Process_Notes')(event.target.value)}
                  required
                  multiline
                  minRows={5}
                  placeholder="Taps checked, bucket pulled, ice broken up, sap carried to the shack..."
                  fullWidth
                />
                <Grid container spacing={2}>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <TextField
                      label="Sap weight"
                      type="number"
                      value={form.Weight}
                      onChange={(event) => changeWeight(event.target.value)}
                      fullWidth
                      slotProps={{ htmlInput: { min: 0, step: 0.1 } }}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <TextField
                      label="Sugar content"
                      type="number"
                      value={form.Sugar_Percent}
                      onChange={(event) => changeSugar(event.target.value)}
                      helperText="A reading replaces the 40:1 estimate."
                      fullWidth
                      slotProps={{ htmlInput: { min: 0, step: 0.1 } }}
                    />
                  </Grid>
                  <Grid size={{ xs: 12 }}>
                    <TextField
                      label="Estimated syrup (gal)"
                      type="number"
                      value={form.Syrup_Gallons}
                      onChange={(event) => changeSyrup(event.target.value)}
                      helperText={
                        sapGallons == null
                          ? 'Enter the sap weight. The estimate starts at 40:1.'
                          : form.Sugar_Percent === ''
                            ? `${sapGallons.toFixed(1)} gal of sap at 40:1.`
                            : `${sapGallons.toFixed(1)} gal of sap at ${form.Sugar_Percent}% sugar.`
                      }
                      fullWidth
                      slotProps={{ htmlInput: { min: 0, step: 0.01 } }}
                    />
                  </Grid>
                </Grid>
                <FormControlLabel
                  control={
                    <Switch
                      checked={form.Ice_Present}
                      onChange={(event) => update('Ice_Present')(event.target.checked)}
                    />
                  }
                  label="Ice in the bucket"
                />
                <DateTimePicker
                  label="Collected at"
                  value={form.Collected_At}
                  onChange={(value) => update('Collected_At')(value ?? dayjs())}
                  disableFuture
                  slotProps={{ textField: { fullWidth: true } }}
                />
                <Button type="submit" variant="contained" disabled={save.pending}>
                  Save entry
                </Button>
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, lg: 7 }}>
          <Stack spacing={2}>
            {journal.error ? <Alert severity="error">{journal.error}</Alert> : null}
            {(journal.data ?? []).length === 0 && !journal.loading ? (
              <Card>
                <CardContent>
                  <Typography color="text.secondary">No collection notes yet.</Typography>
                </CardContent>
              </Card>
            ) : null}
            {(journal.data ?? []).map((entry) => (
              <Card key={entry.EntryID}>
                <CardContent>
                  <Stack spacing={1}>
                    <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
                      <Typography variant="h6" component="h3" sx={{ flexGrow: 1 }}>
                        {entry.Title}
                      </Typography>
                      {entry.Ice_Present ? <Chip label="Ice" size="small" color="info" /> : null}
                    </Stack>
                    <Typography variant="body2" color="text.secondary">
                      {dateTime(entry.Collected_At)}
                      {entry.Node_Name ? ` · ${entry.Node_Name}` : ''}
                      {entry.Author ? ` · ${entry.Author}` : ''}
                    </Typography>
                    <Typography sx={{ whiteSpace: 'pre-wrap' }}>{entry.Process_Notes}</Typography>
                    <Stack direction="row" spacing={1}>
                      {entry.Weight_Lb != null ? <Chip label={`${entry.Weight_Lb} lb`} size="small" variant="outlined" /> : null}
                      {entry.Sugar_Percent != null ? (
                        <Chip label={`${entry.Sugar_Percent}% sugar`} size="small" variant="outlined" />
                      ) : null}
                    </Stack>
                  </Stack>
                </CardContent>
              </Card>
            ))}
          </Stack>
        </Grid>
      </Grid>
    </>
  );
}
