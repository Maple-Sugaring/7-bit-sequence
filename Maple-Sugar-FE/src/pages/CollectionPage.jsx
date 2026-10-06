import { useEffect, useMemo, useState } from 'react';
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
import { validateReading } from '../business/validation';
import { gallonsFromWeight } from '../business/yieldMetrics';
import { PageHeader } from '../components/common/PageHeader';
import { dateTime } from '../components/common/format';
import { enqueueCollection, flushCollectionQueue, queuedCollections } from '../data/offlineQueue';
import { useBush, useJournal, useRecordingTargets } from '../services/hooks';
import { useAction } from '../services/hooks/useAsync';
import { saveJournalEntry } from '../services/journalService';
import { submitReading } from '../services/metricsService';

function emptyForm() {
  return {
    Process_Notes: '',
    NodeID: '',
    Weight: '',
    Sugar_Percent: '',
    Syrup_Gallons: '',
    Ice_Present: false,
    Collected_At: dayjs(),
    Batch_Label: '',
    Keep_Batch: false,
  };
}

function withEstimate(next) {
  const sap = next.Weight === '' ? null : gallonsFromWeight(Number(next.Weight));
  const sugar = next.Sugar_Percent === '' ? null : Number(next.Sugar_Percent);
  return {
    ...next,
    Syrup_Gallons: sap == null ? next.Syrup_Gallons : estimatedSyrupGallons(sap, sugar).toFixed(2),
  };
}

async function persistEntry(entry) {
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
}

export function CollectionPage() {
  const journal = useJournal();
  const bush = useBush();
  const { data: targets } = useRecordingTargets();
  const [form, setForm] = useState(emptyForm);
  const [fieldErrors, setFieldErrors] = useState({});
  const [notice, setNotice] = useState('');
  const [queued, setQueued] = useState(() => queuedCollections().length);
  const [session, setSession] = useState([]);
  const save = useAction(async (entry) => {
    await persistEntry(entry);
    await journal.refresh();
  });

  const refreshJournal = journal.refresh;

  useEffect(() => {
    let cancelled = false;
    flushCollectionQueue(persistEntry)
      .then(async (result) => {
        if (cancelled) return;
        setQueued(result.remaining);
        if (result.flushed) {
          setNotice(
            result.flushed === 1
              ? 'Uploaded 1 collection saved while offline.'
              : `Uploaded ${result.flushed} collections saved while offline.`,
          );
          await refreshJournal();
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [refreshJournal]);

  const selected = useMemo(
    () => (targets ?? []).find((target) => target.nodeId === form.NodeID) ?? null,
    [targets, form.NodeID],
  );

  const update = (field) => (value) => setForm((prev) => ({ ...prev, [field]: value }));

  const readingCheck = useMemo(
    () =>
      validateReading({
        NodeID: form.NodeID,
        Weight: form.Weight,
        Sugar_Percent: form.Sugar_Percent,
        Ice_Present: form.Ice_Present,
        Recorded_At: form.Collected_At?.toISOString?.() ?? form.Collected_At,
      }),
    [form.NodeID, form.Weight, form.Sugar_Percent, form.Ice_Present, form.Collected_At],
  );

  const chooseTree = (option) => {
    const node = (bush.data ?? []).find((row) => row.NodeID === option?.nodeId) ?? null;
    setFieldErrors({});
    setForm((prev) =>
      withEstimate({
        ...prev,
        NodeID: option?.nodeId ?? '',
        Weight: node?.Weight != null ? String(node.Weight) : prev.Weight,
        Sugar_Percent: node?.Sugar_Percent != null ? String(node.Sugar_Percent) : prev.Sugar_Percent,
        Ice_Present: node?.Ice_Present ?? prev.Ice_Present,
      }),
    );
  };

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
    setNotice('');
    const hasMeasurement = form.Weight !== '' || form.Sugar_Percent !== '';
    if (hasMeasurement && !readingCheck.isValid) {
      setFieldErrors(readingCheck.errors);
      return;
    }
    setFieldErrors({});

    const batch = form.Batch_Label.trim();
    const notes = form.Process_Notes.trim();
    const entry = {
      Process_Notes: batch ? `Batch ${batch}.\n${notes}` : notes,
      NodeID: form.NodeID || null,
      BucketID: selected?.bucketId ?? null,
      Collected_At: form.Collected_At.toISOString(),
      Weight: form.Weight === '' ? null : Number(form.Weight),
      Sugar_Percent: form.Sugar_Percent === '' ? null : Number(form.Sugar_Percent),
      Ice_Present: form.Ice_Present,
    };

    const kept = {
      NodeID: form.NodeID,
      Ice_Present: form.Ice_Present,
      Batch_Label: form.Batch_Label,
      Keep_Batch: true,
    };
    const reset = () => {
      if (!form.Keep_Batch) {
        setForm(emptyForm());
        return;
      }
      const node = (bush.data ?? []).find((row) => row.NodeID === form.NodeID) ?? null;
      setForm(
        withEstimate({
          ...emptyForm(),
          ...kept,
          Weight: node?.Weight != null ? String(node.Weight) : '',
          Sugar_Percent: node?.Sugar_Percent != null ? String(node.Sugar_Percent) : '',
          Ice_Present: node?.Ice_Present ?? form.Ice_Present,
        }),
      );
    };

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setQueued(enqueueCollection(entry));
      setSession((prev) => [...prev, form.Title.trim()]);
      setNotice('No connection. This entry is saved on this phone and will upload when you are back online.');
      reset();
      return;
    }

    const result = await save.execute(entry);
    if (result.offline) {
      save.clearError();
      setQueued(enqueueCollection(entry));
      setNotice('Cannot reach the server. This entry is saved on this phone and will upload when the connection returns.');
      reset();
      return;
    }
    if (result.ok) {
      setSession((prev) => [...prev, form.Title.trim()]);
      reset();
    }
  };

  return (
    <>
      <PageHeader
        title="Collection"
        subtitle="Log what you pulled from a tree: weight, Brix, ice, and notes from the round."
      />

      <Grid container spacing={2.5}>
        <Grid size={{ xs: 12, lg: 5 }}>
          <Card component="form" onSubmit={handleSubmit}>
            <CardContent>
              <Stack spacing={2}>
                <Typography variant="h5" component="h2">
                  Document a collection
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Write how the round went. Choosing a tree fills in the latest weight and Brix.
                  Weight, sugar, and the ice tag are saved with the note and count as a bucket reading.
                </Typography>
                {notice ? <Alert severity="info">{notice}</Alert> : null}
                {queued > 0 ? (
                  <Alert severity="warning">
                    {queued === 1 ? '1 entry is waiting on this phone.' : `${queued} entries are waiting on this phone.`}
                  </Alert>
                ) : null}
                {save.error ? <Alert severity="error">{save.error}</Alert> : null}
                {session.length ? (
                  <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }} useFlexGap>
                    {session.map((title, index) => (
                      <Chip key={`${title}-${index}`} label={title} size="small" />
                    ))}
                  </Stack>
                ) : null}
                <Autocomplete
                  options={targets ?? []}
                  value={selected}
                  onChange={(_event, option) => chooseTree(option)}
                  getOptionLabel={(option) => option.label}
                  groupBy={(option) => option.stand}
                  isOptionEqualToValue={(option, value) => option.nodeId === value.nodeId}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="Tree"
                      error={Boolean(fieldErrors.NodeID)}
                      helperText={fieldErrors.NodeID}
                    />
                  )}
                />
                {selected ? (
                  <Alert severity="info" icon={false}>
                    Bucket {selected.barcode ?? 'unassigned'}
                    {selected.tareWeight != null ? ` · tare ${selected.tareWeight} lb` : ''}.
                    The weight and Brix fields start from the latest sensor reading. Change them if you measured something else.
                  </Alert>
                ) : null}
                {selected?.isOffline ? (
                  <Alert severity="warning">
                    This tree&apos;s device is offline. You can still record the collection. It will be checked against the sensor when the node reports again.
                  </Alert>
                ) : null}
                <TextField
                  label="Batch label"
                  value={form.Batch_Label}
                  onChange={(event) => update('Batch_Label')(event.target.value)}
                  placeholder="Morning round, north line"
                  helperText="Optional. Tags every entry in this round."
                  fullWidth
                />
                <FormControlLabel
                  control={
                    <Switch
                      checked={form.Keep_Batch}
                      onChange={(event) => update('Keep_Batch')(event.target.checked)}
                    />
                  }
                  label="Keep this tree, ice tag, and batch label for the next entry"
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
                      error={Boolean(fieldErrors.Weight)}
                      color={readingCheck.warnings.Weight ? 'warning' : 'primary'}
                      helperText={fieldErrors.Weight || readingCheck.warnings.Weight || 'Gross pounds, bucket included.'}
                      fullWidth
                      slotProps={{ htmlInput: { min: 0, step: 0.1 } }}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <TextField
                      label="Sugar content (Brix %)"
                      type="number"
                      value={form.Sugar_Percent}
                      onChange={(event) => changeSugar(event.target.value)}
                      error={Boolean(fieldErrors.Sugar_Percent)}
                      color={readingCheck.warnings.Sugar_Percent ? 'warning' : 'primary'}
                      helperText={
                        fieldErrors.Sugar_Percent ||
                        readingCheck.warnings.Sugar_Percent ||
                        'Refractometer Brix. A reading replaces the 40:1 estimate.'
                      }
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
