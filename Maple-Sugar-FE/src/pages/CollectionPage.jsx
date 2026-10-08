import { useEffect, useMemo, useState } from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import FormControlLabel from '@mui/material/FormControlLabel';
import Grid from '@mui/material/Grid';
import Snackbar from '@mui/material/Snackbar';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';
import dayjs from 'dayjs';
import { addToRound, loggedNodeIds, nextTreeToLog, sapGallonsFor, sensorDefaults, startRound } from '../business/collectionRound';
import { bushAverageSugar, syrupEstimate } from '../business/sugarContent';
import { validateCollectionEntry } from '../business/validation';
import { CollectionHistory } from '../components/collection/CollectionHistory';
import { RoundSummary } from '../components/collection/RoundSummary';
import { SyrupEstimate } from '../components/collection/SyrupEstimate';
import { TreeChecklist } from '../components/collection/TreeChecklist';
import { PageHeader } from '../components/common/PageHeader';
import { dateOnly, dateTime, timeOnly } from '../components/common/format';
import { collectionLocal, useBush, useJournal, useRecordCollection, useRecordingTargets } from '../services/hooks';

/**
 * Logging a collection (issue #28, FR-007).
 *
 * A student walks a round: pick a tree, confirm the weight, save, and the next
 * tree comes up. Weight is prefilled from the sensor and is the only thing that
 * has to be entered. Sugar is optional and is never prefilled, because it is
 * only there when the student actually tested the sap.
 */

/** Fields the student has not touched are null and fall back to the sensor. */
function untouchedForm() {
  return { weight: null, ice: null, sugar: '', notes: '', collectedAt: null };
}

function weightHelp(sensor, touched) {
  if (touched) return 'Gross pounds, bucket included.';
  if (sensor.usable) return `From the sensor at ${timeOnly(sensor.recordedAt)}. Change it if your scale says different.`;
  if (sensor.reason === 'offline') return "This tree's sensor is offline. Weigh the bucket and enter gross pounds.";
  if (sensor.reason === 'stale') {
    return `The last sensor reading was ${dateTime(sensor.recordedAt)}. Weigh the bucket and enter gross pounds.`;
  }
  return 'Weigh the bucket and enter gross pounds, bucket included.';
}

export function CollectionPage() {
  const journal = useJournal();
  const bush = useBush();
  const targets = useRecordingTargets();
  const save = useRecordCollection();

  const [round, setRound] = useState(() => collectionLocal.loadRound() ?? startRound());
  const [selectedId, setSelectedId] = useState(null);
  const [finished, setFinished] = useState(false);
  const [form, setForm] = useState(untouchedForm);
  const [showNote, setShowNote] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [serverErrors, setServerErrors] = useState({});
  const [notice, setNotice] = useState(null);
  const [toast, setToast] = useState('');
  const [queued, setQueued] = useState(() => collectionLocal.queuedCount());

  const refreshJournal = journal.refresh;
  const refreshBush = bush.refresh;

  // Keeps the round across a refresh or a walk out of signal.
  useEffect(() => {
    collectionLocal.saveRound(round.entries.length || round.label ? round : null);
  }, [round]);

  // Uploads whatever was saved while out of signal, now and whenever the phone
  // comes back online while the page is open.
  useEffect(() => {
    let cancelled = false;

    const flush = () =>
      collectionLocal
        .flushQueue()
        .then(async (result) => {
          if (cancelled) return;
          setQueued(result.remaining);
          if (result.remaining === 0 && result.rejected.length === 0) {
            setRound((prev) => ({ ...prev, entries: prev.entries.map((entry) => ({ ...entry, queued: false })) }));
          }
          if (result.rejected.length) {
            const count = result.rejected.length;
            setNotice({
              severity: 'warning',
              text: `${count === 1 ? '1 entry saved on this phone was' : `${count} entries saved on this phone were`} refused by the server and kept on this phone for recovery: ${result.rejected[0].message}`,
            });
          } else if (result.flushed) {
            setNotice({
              severity: 'success',
              text:
                result.flushed === 1
                  ? 'Uploaded 1 collection saved while offline.'
                  : `Uploaded ${result.flushed} collections saved while offline.`,
            });
          }
          // The board carries each tree's last tested sugar, which the next estimate leans on.
          if (result.flushed) await Promise.all([refreshJournal(), refreshBush()]);
        })
        .catch(() => {});

    flush();
    window.addEventListener('online', flush);
    return () => {
      cancelled = true;
      window.removeEventListener('online', flush);
    };
  }, [refreshJournal, refreshBush]);

  const trees = useMemo(() => targets.data ?? [], [targets.data]);
  const done = useMemo(() => loggedNodeIds(round), [round]);

  const pending = nextTreeToLog(trees, round, null);
  const activeId = selectedId ?? pending?.nodeId ?? null;
  const tree = trees.find((candidate) => candidate.nodeId === activeId) ?? null;
  const node = (bush.data ?? []).find((row) => row.NodeID === activeId) ?? null;
  const showSummary = round.entries.length > 0 && (finished || activeId == null);

  const sensor = useMemo(() => sensorDefaults(node), [node]);
  const bushSugar = useMemo(() => bushAverageSugar(bush.data), [bush.data]);

  const weightValue = form.weight ?? (sensor.usable ? sensor.weight.toFixed(1) : '');
  const iceValue = form.ice ?? (sensor.usable ? sensor.ice : false);

  const check = validateCollectionEntry(
    {
      NodeID: activeId,
      Weight: weightValue,
      Sugar_Percent: form.sugar,
      Ice_Present: iceValue,
      Recorded_At: form.collectedAt?.toISOString(),
    },
    { tareWeight: tree?.tareWeight ?? null },
  );
  const errors = attempted ? { ...check.errors, ...serverErrors } : serverErrors;

  const sapGallons = weightValue === '' || check.errors.Weight ? null : sapGallonsFor(weightValue, tree?.tareWeight);
  const estimate =
    sapGallons == null
      ? null
      : syrupEstimate({
          sapGallons,
          tested: form.sugar === '' ? null : form.sugar,
          tree: node?.Sugar_Percent,
          bush: bushSugar,
          ice: iceValue,
        });

  const remainingAfter = trees.filter((candidate) => !done.has(candidate.nodeId) && candidate.nodeId !== activeId);

  const edit = (changes) => {
    setServerErrors({});
    setForm((prev) => ({ ...prev, ...changes }));
  };

  const chooseTree = (nodeId) => {
    setSelectedId(nodeId);
    setFinished(false);
    setForm(untouchedForm());
    setShowNote(false);
    setAttempted(false);
    setServerErrors({});
    save.clearError();
  };

  const submit = async ({ finish = false } = {}) => {
    setNotice(null);
    setAttempted(true);
    if (!check.isValid || !tree) return;

    const collectedAt = (form.collectedAt ?? dayjs()).toISOString();
    const body = {
      NodeID: tree.nodeId,
      Weight: Number(weightValue),
      // Null unless the student tested it. Never carried over or worked out.
      Sugar_Percent: form.sugar === '' ? null : Number(form.sugar),
      Ice_Present: iceValue,
      Collected_At: collectedAt,
      Notes: form.notes.trim(),
      Round_Label: round.label.trim() || null,
      Client_Ref: collectionLocal.newRef(),
    };

    const entryOf = (isQueued) => ({
      ref: body.Client_Ref,
      nodeId: tree.nodeId,
      treeLabel: tree.label,
      collectedAt,
      weight: body.Weight,
      sugar: body.Sugar_Percent,
      ice: body.Ice_Present,
      sapGallons: estimate?.sapGallons ?? 0,
      syrupGallons: estimate?.syrupGallons ?? 0,
      basis: estimate?.basis ?? null,
      queued: isQueued,
    });

    const finishSave = (isQueued) => {
      const nextRound = addToRound(round, entryOf(isQueued));
      const upNext = nextTreeToLog(trees, nextRound, tree.nodeId);
      setRound(nextRound);
      setForm(untouchedForm());
      setShowNote(false);
      setAttempted(false);
      setServerErrors({});
      setSelectedId(upNext?.nodeId ?? null);
      setFinished(finish || upNext == null);
    };

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setQueued(collectionLocal.addToQueue(body));
      setNotice({
        severity: 'warning',
        text: 'No connection. This entry is saved on this phone and will upload when you are back online.',
      });
      finishSave(true);
      return;
    }

    const result = await save.execute(body);
    if (result.offline) {
      save.clearError();
      setQueued(collectionLocal.addToQueue(body));
      setNotice({
        severity: 'warning',
        text: 'Cannot reach the server. This entry is saved on this phone and will upload when the connection returns.',
      });
      finishSave(true);
      return;
    }
    if (!result.ok) {
      if (result.details) setServerErrors(result.details);
      return;
    }

    setToast(`Saved ${tree.label}: ${(estimate?.sapGallons ?? 0).toFixed(1)} gal of sap.`);
    finishSave(false);
    // A sugar test just filed changes what the next untested tree is estimated from.
    await Promise.all([refreshJournal(), refreshBush()]);
  };

  const newRound = () => {
    setRound(startRound());
    setSelectedId(null);
    setFinished(false);
    setForm(untouchedForm());
    setShowNote(false);
    setAttempted(false);
    setNotice(null);
  };

  const keepGoing = () => {
    setFinished(false);
    setSelectedId(trees[0]?.nodeId ?? null);
  };

  const lastTested = node?.Sugar_Percent == null
    ? null
    : `Last tested on this tree: ${node.Sugar_Percent}%${node.Sugar_Measured_At ? ` on ${dateOnly(node.Sugar_Measured_At)}` : ''}.`;

  return (
    <>
      <PageHeader
        title="Collection"
        subtitle="Log each bucket as you empty it. The weight is the only thing you have to enter."
      />

      <Grid container spacing={2.5}>
        <Grid size={12}>
          <Stack spacing={2}>
            {notice ? (
              <Alert severity={notice.severity} onClose={() => setNotice(null)}>
                {notice.text}
              </Alert>
            ) : null}
            {queued > 0 ? (
              <Alert severity="warning">
                {queued === 1 ? '1 entry is waiting on this phone.' : `${queued} entries are waiting on this phone.`}
              </Alert>
            ) : null}
            {targets.error ? <Alert severity="error">{targets.error}</Alert> : null}
          </Stack>
        </Grid>

        <Grid size={{ xs: 12, md: 5 }}>
          <Card>
            <CardContent>
              <Stack spacing={2}>
                <Stack direction="row" spacing={1} sx={{ alignItems: 'baseline', justifyContent: 'space-between' }}>
                  <Typography variant="h6" component="h2">
                    This round
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {trees.filter((candidate) => done.has(candidate.nodeId)).length} of {trees.length} trees logged
                  </Typography>
                </Stack>
                <TextField
                  label="Round label"
                  value={round.label}
                  onChange={(event) => setRound((prev) => ({ ...prev, label: event.target.value }))}
                  placeholder="Morning round, north line"
                  helperText="Optional. Tags every entry in this round."
                  fullWidth
                />
                <TreeChecklist trees={trees} done={done} selectedId={activeId} onSelect={chooseTree} />
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 7 }}>
          {showSummary ? (
            <RoundSummary round={round} onNewRound={newRound} onKeepGoing={keepGoing} />
          ) : (
            <Card
              component="form"
              noValidate
              onSubmit={(event) => {
                event.preventDefault();
                submit();
              }}
            >
              <CardContent>
                <Stack spacing={2}>
                  <Typography variant="h6" component="h2">
                    {tree ? tree.label : 'Pick a tree'}
                  </Typography>
                  {!tree ? (
                    <Typography color="text.secondary">
                      {trees.length === 0 && !targets.loading
                        ? 'No trees are set up yet. An admin adds them on the Deploy page.'
                        : 'Choose a tree above to log it.'}
                    </Typography>
                  ) : (
                    <>
                      <Typography variant="body2" color="text.secondary">
                        Bucket {tree.barcode ?? 'unassigned'}
                        {tree.tareWeight != null ? ` · empty bucket ${tree.tareWeight} lb` : ''}
                      </Typography>
                      {tree.isOffline ? (
                        <Alert severity="warning">
                          This tree&apos;s device is offline. You can still record the collection.
                        </Alert>
                      ) : null}
                      {save.error ? <Alert severity="error">{save.error}</Alert> : null}

                      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                      <TextField
                        label="Sap weight (lb)"
                        type="number"
                        value={weightValue}
                        onChange={(event) => edit({ weight: event.target.value })}
                        required
                        error={Boolean(errors.Weight)}
                        color={check.warnings.Weight ? 'warning' : 'primary'}
                        helperText={errors.Weight || check.warnings.Weight || weightHelp(sensor, form.weight != null)}
                        fullWidth
                        slotProps={{ htmlInput: { min: 0, step: 0.1, inputMode: 'decimal' } }}
                      />
                      <TextField
                        label="Sugar content (Brix %)"
                        type="number"
                        value={form.sugar}
                        onChange={(event) => edit({ sugar: event.target.value })}
                        error={Boolean(errors.Sugar_Percent)}
                        color={check.warnings.Sugar_Percent ? 'warning' : 'primary'}
                        helperText={
                          errors.Sugar_Percent ||
                          check.warnings.Sugar_Percent ||
                          ['Optional. Only fill this in if you tested the sap with a refractometer.', lastTested]
                            .filter(Boolean)
                            .join(' ')
                        }
                        fullWidth
                        slotProps={{ htmlInput: { min: 0, step: 0.1, inputMode: 'decimal' } }}
                      />

                      </Stack>
                      <FormControlLabel
                        control={<Switch checked={iceValue} onChange={(event) => edit({ ice: event.target.checked })} />}
                        label="Ice in the bucket"
                      />
                      <SyrupEstimate estimate={estimate} />

                      {showNote || form.notes ? (
                        <TextField
                          label="Note"
                          value={form.notes}
                          onChange={(event) => edit({ notes: event.target.value })}
                          multiline
                          minRows={3}
                          placeholder="Lid frozen, ice broken up, tap checked..."
                          helperText="Optional."
                          fullWidth
                        />
                      ) : null}

                      {form.collectedAt ? (
                        <Stack spacing={1}>
                          <DateTimePicker
                            label="Collected at"
                            value={form.collectedAt}
                            onChange={(value) => edit({ collectedAt: value ?? dayjs() })}
                            disableFuture
                            slotProps={{ textField: { fullWidth: true } }}
                          />
                          <Button onClick={() => edit({ collectedAt: null })} sx={{ alignSelf: 'flex-start' }}>
                            Use the time I save
                          </Button>
                        </Stack>
                      ) : null}

                      {!(showNote || form.notes) || !form.collectedAt ? (
                        <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
                          {!(showNote || form.notes) ? <Button onClick={() => setShowNote(true)}>Add a note</Button> : null}
                          {!form.collectedAt ? (
                            <Button onClick={() => edit({ collectedAt: dayjs() })}>Collected earlier? Change the time</Button>
                          ) : null}
                        </Stack>
                      ) : null}

                      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                        <Button
                          type="submit"
                          variant="contained"
                          disabled={save.pending}
                          sx={{ minHeight: 48, flexGrow: 1 }}
                        >
                          {remainingAfter.length ? 'Save & next tree' : 'Save & finish round'}
                        </Button>
                        {remainingAfter.length ? (
                          <Button
                            variant="outlined"
                            disabled={save.pending}
                            onClick={() => submit({ finish: true })}
                            sx={{ minHeight: 48 }}
                          >
                            Save & stop here
                          </Button>
                        ) : null}
                      </Stack>
                    </>
                  )}
                </Stack>
              </CardContent>
            </Card>
          )}
        </Grid>

        <Grid size={12}>
          <CollectionHistory entries={journal.data ?? []} loading={journal.loading} error={journal.error} />
        </Grid>
      </Grid>

      <Snackbar
        open={Boolean(toast)}
        autoHideDuration={4000}
        onClose={() => setToast('')}
        message={toast}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </>
  );
}
