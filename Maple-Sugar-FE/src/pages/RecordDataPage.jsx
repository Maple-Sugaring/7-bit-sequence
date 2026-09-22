import { useMemo, useState } from 'react';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardHeader from '@mui/material/CardHeader';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import FormControlLabel from '@mui/material/FormControlLabel';
import Grid from '@mui/material/Grid';
import InputAdornment from '@mui/material/InputAdornment';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import MenuItem from '@mui/material/MenuItem';
import Snackbar from '@mui/material/Snackbar';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';
import dayjs from 'dayjs';
import {
  RAW_SAP_TYPICAL_MAX,
  RAW_SAP_TYPICAL_MIN,
  sapToSyrupRatio,
} from '../business/sugarContent';
import { BUCKET_CAPACITY_GALLONS, gallonsFromWeight, netWeight } from '../business/yieldMetrics';
import { validateReading } from '../business/validation';
import { PageHeader } from '../components/common/PageHeader';
import { ratio } from '../components/common/format';
import { useRecordingTargets, useSubmitReading } from '../services/hooks';

const WEATHER_OPTIONS = [
  'Clear',
  'Partly Cloudy',
  'Overcast',
  'Light Rain',
  'Snowing',
  'Freezing Fog',
];

function emptyForm() {
  return {
    NodeID: '',
    Sugar_Percent: '',
    Weight: '',
    Temperature: '',
    Weather_Conditions: '',
    Ice_Present: false,
    Recorded_At: dayjs(),
  };
}

export function RecordDataPage() {
  const { data: targets, loading: targetsLoading } = useRecordingTargets();
  const { execute: submit, pending } = useSubmitReading();

  const [form, setForm] = useState(emptyForm);
  const [touched, setTouched] = useState({});
  const [submitError, setSubmitError] = useState(null);
  const [confirmation, setConfirmation] = useState(null);
  // FR-057: keep the tree and conditions between saves so a student walking a
  // stand does not re-enter the same context for every tree.
  const [batchMode, setBatchMode] = useState(true);
  const [batch, setBatch] = useState([]);

  const { errors, warnings, isValid } = useMemo(() => validateReading(form), [form]);

  const selected = (targets ?? []).find((target) => target.nodeId === form.NodeID) ?? null;

  const update = (field) => (value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setTouched((prev) => ({ ...prev, [field]: true }));
    setSubmitError(null);
  };

  const fromEvent = (field) => (event) => update(field)(event.target.value);

  const showError = (field) => (touched[field] ? errors[field] : undefined);

  const handleSubmit = async (event) => {
    event.preventDefault();

    // Reveal every message at once rather than one field at a time.
    setTouched(Object.fromEntries(Object.keys(form).map((key) => [key, true])));
    if (!isValid) return;

    const result = await submit({
      NodeID: form.NodeID,
      BucketID: selected?.bucketId ?? null,
      Sugar_Percent: form.Sugar_Percent === '' ? null : Number(form.Sugar_Percent),
      Weight: form.Weight === '' ? null : Number(form.Weight),
      Temperature: form.Temperature === '' ? null : Number(form.Temperature),
      Weather_Conditions: form.Weather_Conditions || null,
      Ice_Present: Boolean(form.Ice_Present),
      Recorded_At: form.Recorded_At.toISOString(),
    });

    if (!result.ok) {
      setSubmitError(result.error);
      return;
    }

    setConfirmation(`Reading saved for ${selected?.label ?? 'the selected tree'}.`);
    setBatch((prev) => [
      {
        id: result.data.MetricID,
        label: selected?.label ?? `Node ${form.NodeID}`,
        sugar: form.Sugar_Percent,
        weight: form.Weight,
        at: form.Recorded_At.format('h:mm A'),
      },
      ...prev,
    ]);

    setForm((prev) =>
      batchMode
        ? // Keep the stand context, clear the per-tree measurements.
          { ...prev, NodeID: '', Sugar_Percent: '', Weight: '', Ice_Present: false, Recorded_At: dayjs() }
        : emptyForm(),
    );
    setTouched({});
  };

  const previewRatio = form.Sugar_Percent ? sapToSyrupRatio(Number(form.Sugar_Percent)) : null;

  return (
    <>
      <PageHeader title="Input" />

      <Grid container spacing={2.5}>
        <Grid size={{ xs: 12, lg: 7 }}>
          <Card component="form" onSubmit={handleSubmit} noValidate>
            <CardHeader
              title={
                <Typography variant="h5" component="h2">
                  New reading
                </Typography>
              }
              subheader="Sugar content, weight, or both. Everything else is optional."
            />
            <CardContent>
              {submitError ? (
                <Alert severity="error" sx={{ mb: 2.5 }}>
                  {submitError}
                </Alert>
              ) : null}

              <Stack spacing={2.5}>
                <Autocomplete
                  options={targets ?? []}
                  loading={targetsLoading}
                  value={selected}
                  onChange={(unused, option) => update('NodeID')(option?.nodeId ?? '')}
                  getOptionLabel={(option) => option.label}
                  groupBy={(option) => option.stand}
                  isOptionEqualToValue={(option, value) => option.nodeId === value.nodeId}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="Tree"
                      required
                      error={Boolean(showError('NodeID'))}
                      helperText={showError('NodeID') ?? 'Grouped by stand.'}
                    />
                  )}
                  renderOption={(props, option) => (
                    <li {...props} key={option.nodeId}>
                      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', width: '100%' }}>
                        <Typography variant="body2" sx={{ flexGrow: 1 }}>
                          {option.label}
                        </Typography>
                        {option.barcode ? (
                          <Chip label={option.barcode} size="small" variant="outlined" />
                        ) : null}
                        {option.isOffline ? (
                          <Chip label="Offline" size="small" color="error" variant="outlined" />
                        ) : null}
                      </Stack>
                    </li>
                  )}
                />

                {/* FR-025: prepopulate what the system already knows. */}
                {selected ? (
                  <Alert severity="info" icon={false}>
                    <Stack direction="row" spacing={2} sx={{ flexWrap: 'wrap', rowGap: 0.5 }}>
                      <Typography variant="body2">
                        Bucket <strong>{selected.barcode ?? 'unassigned'}</strong>
                      </Typography>
                      <Typography variant="body2">
                        Tare <strong>{selected.tareWeight ?? '—'} lb</strong>
                      </Typography>
                      <Typography variant="body2">
                        Stand <strong>{selected.stand}</strong>
                      </Typography>
                    </Stack>
                  </Alert>
                ) : null}

                <Grid container spacing={2}>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <TextField
                      label="Sugar content"
                      type="number"
                      value={form.Sugar_Percent}
                      onChange={fromEvent('Sugar_Percent')}
                      error={Boolean(showError('Sugar_Percent'))}
                      helperText={
                        showError('Sugar_Percent') ??
                        warnings.Sugar_Percent ??
                        `Raw sap is normally ${RAW_SAP_TYPICAL_MIN}-${RAW_SAP_TYPICAL_MAX}%.`
                      }
                      slotProps={{
                        input: { endAdornment: <InputAdornment position="end">%</InputAdornment> },
                        htmlInput: { step: 0.1, min: 0 },
                      }}
                      color={warnings.Sugar_Percent && !errors.Sugar_Percent ? 'warning' : undefined}
                      fullWidth
                    />
                  </Grid>

                  <Grid size={{ xs: 12, sm: 6 }}>
                    <TextField
                      label="Gross weight"
                      type="number"
                      value={form.Weight}
                      onChange={fromEvent('Weight')}
                      error={Boolean(showError('Weight'))}
                      helperText={
                        showError('Weight') ??
                        warnings.Weight ??
                        `Gross weight. Liquid capacity is ${BUCKET_CAPACITY_GALLONS} gallons. Ice can weigh more.`
                      }
                      slotProps={{
                        input: { endAdornment: <InputAdornment position="end">lb</InputAdornment> },
                        htmlInput: { step: 0.1, min: 0 },
                      }}
                      fullWidth
                    />
                  </Grid>

                  <Grid size={{ xs: 12, sm: 6 }}>
                    <TextField
                      label="Temperature"
                      type="number"
                      value={form.Temperature}
                      onChange={fromEvent('Temperature')}
                      error={Boolean(showError('Temperature'))}
                      helperText={showError('Temperature') ?? 'Optional. Sensors report this automatically.'}
                      slotProps={{
                        input: {
                          endAdornment: <InputAdornment position="end">{'\u00B0F'}</InputAdornment>,
                        },
                        htmlInput: { step: 0.5 },
                      }}
                      fullWidth
                    />
                  </Grid>

                  <Grid size={{ xs: 12, sm: 6 }}>
                    <TextField
                      select
                      label="Weather"
                      value={form.Weather_Conditions}
                      onChange={fromEvent('Weather_Conditions')}
                      helperText="Optional."
                      fullWidth
                    >
                      <MenuItem value="">Not recorded</MenuItem>
                      {WEATHER_OPTIONS.map((option) => (
                        <MenuItem key={option} value={option}>
                          {option}
                        </MenuItem>
                      ))}
                    </TextField>
                  </Grid>

                  <Grid size={12}>
                    <FormControlLabel
                      control={
                        <Switch
                          checked={form.Ice_Present}
                          onChange={(event) => update('Ice_Present')(event.target.checked)}
                        />
                      }
                      label="Ice in the bucket"
                    />
                    {form.Ice_Present ? (
                      <Chip label="Ice" color="info" size="small" sx={{ ml: 1 }} />
                    ) : null}
                    {form.Weight !== '' && selected ? (
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                        About{' '}
                        {gallonsFromWeight(netWeight(Number(form.Weight), selected.tareWeight ?? 0))?.toFixed(1)}{' '}
                        gallons of sap.
                      </Typography>
                    ) : null}
                  </Grid>

                  <Grid size={12}>
                    <DateTimePicker
                      label="Recorded at"
                      value={form.Recorded_At}
                      onChange={update('Recorded_At')}
                      disableFuture
                      slotProps={{
                        textField: {
                          fullWidth: true,
                          required: true,
                          error: Boolean(showError('Recorded_At')),
                          helperText: showError('Recorded_At') ?? 'Defaults to now.',
                        },
                      }}
                    />
                  </Grid>
                </Grid>

                {previewRatio ? (
                  <Alert severity="success" icon={false}>
                    At {form.Sugar_Percent}% sugar, this run needs about{' '}
                    <strong>{ratio(previewRatio)}</strong> gallons of sap per gallon of syrup.
                  </Alert>
                ) : null}

                <Divider />

                <Stack
                  direction={{ xs: 'column', sm: 'row' }}
                  spacing={2}
                  sx={{ alignItems: { sm: 'center' }, justifyContent: 'space-between' }}
                >
                  <FormControlLabel
                    control={
                      <Switch
                        checked={batchMode}
                        onChange={(event) => setBatchMode(event.target.checked)}
                      />
                    }
                    label="Keep stand and weather between saves"
                  />
                  <Button type="submit" variant="contained" size="large" loading={pending}>
                    Save reading
                  </Button>
                </Stack>
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, lg: 5 }}>
          <Card sx={{ height: '100%' }}>
            <CardHeader
              title={
                <Typography variant="h5" component="h2">
                  Saved this session
                </Typography>
              }
              subheader="Confirmation of each reading you have submitted."
            />
            <CardContent>
              {batch.length === 0 ? (
                <Box sx={{ py: 4, textAlign: 'center' }}>
                  <Typography variant="body2" color="text.secondary">
                    Nothing saved yet. Readings you submit will be listed here.
                  </Typography>
                </Box>
              ) : (
                <List disablePadding>
                  {batch.map((entry) => (
                    <ListItem key={entry.id} divider disableGutters sx={{ px: 1 }}>
                      <CheckCircleIcon color="success" fontSize="small" sx={{ mr: 1.5 }} />
                      <ListItemText
                        primary={entry.label}
                        secondary={[
                          entry.sugar ? `${entry.sugar}% sugar` : null,
                          entry.weight ? `${entry.weight} lb` : null,
                          entry.at,
                        ]
                          .filter(Boolean)
                          .join(' \u00B7 ')}
                      />
                    </ListItem>
                  ))}
                </List>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Snackbar
        open={Boolean(confirmation)}
        autoHideDuration={4000}
        onClose={() => setConfirmation(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity="success" onClose={() => setConfirmation(null)} variant="filled">
          <AlertTitle>Reading saved</AlertTitle>
          {confirmation}
        </Alert>
      </Snackbar>
    </>
  );
}
