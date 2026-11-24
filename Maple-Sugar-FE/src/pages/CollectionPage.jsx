import { useEffect, useMemo, useRef, useState } from 'react';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import FormControlLabel from '@mui/material/FormControlLabel';
import Grid from '@mui/material/Grid';
import LinearProgress from '@mui/material/LinearProgress';
import Snackbar from '@mui/material/Snackbar';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';
import dayjs from 'dayjs';
import {
  addToRound,
  grossFromNet,
  loggedNodeIds,
  netFromGross,
  nextTreeToLog,
  sapGallonsFor,
  sensorDefaults,
  startRound,
} from '../business/collectionRound';
import {
  REWEIGH_POLL_MS,
  reweighFromReading,
  reweighStatus,
} from '../business/iceReweigh';
import { bushAverageSugar, syrupEstimate } from '../business/sugarContent';
import { validateCollectionEntry } from '../business/validation';
import { CollectionLogHistory } from '../components/CollectionLogHistory';
import { apiMode } from '../data/apiClient';
import { loadDrafts, loadSelectedTree, saveDrafts, saveSelectedTree } from '../data/draftStore';
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
  return {
    weight: null,
    ice: null,
    weightAfterIce: '',
    // When ice was tagged, the node's last reading at that moment, and whether the reweigh was typed.
    iceAt: null,
    iceBaselineAt: null,
    afterIceTyped: false,
    sugar: '',
    notes: '',
    collectedAt: null,
  };
}

function weightHelp(sensor, touched) {
  if (touched) return 'Pounds of sap.';
  if (sensor.usable) return `From the sensor at ${timeOnly(sensor.recordedAt)}. Change it if your scale says different.`;
  if (sensor.reason === 'offline') return "This tree's sensor is offline. Weigh the sap and enter it here.";
  if (sensor.reason === 'stale') {
    return `The last sensor reading was ${dateTime(sensor.recordedAt)}. Weigh the sap and enter it here.`;
  }
  return 'Weigh the sap and enter the pounds.';
}

export function CollectionPage() {
  const journal = useJournal();
  const bush = useBush();
  const targets = useRecordingTargets();
  const save = useRecordCollection();

  const [round, setRound] = useState(() => collectionLocal.loadRound() ?? startRound());
  // Survives a reload, so a student who refreshes because data did not load lands on the same tree.
  const [selectedId, setSelectedId] = useState(() => loadSelectedTree());
  const [finished, setFinished] = useState(false);
  const [drafts, setDrafts] = useState(() => loadDrafts());
  const [attempted, setAttempted] = useState(false);
  const [serverErrors, setServerErrors] = useState({});
  const [notice, setNotice] = useState(null);
  const [toast, setToast] = useState('');
  const [queued, setQueued] = useState(() => collectionLocal.queuedCount());
  // Ticks while an iced bucket waits for the node's reading, so the minute runs out on screen.
  const [now, setNow] = useState(() => Date.now());
  const formRef = useRef(null);
  const weightRef = useRef(null);
  const focusedTree = useRef(null);

  const refreshJournal = journal.refresh;
  const refreshBush = bush.refresh;

  // Keeps the round across a refresh or a walk out of signal.
  useEffect(() => {
    collectionLocal.saveRound(round.entries.length || round.label ? round : null);
  }, [round]);

  // Keeps what has been typed for each tree across a refresh or a walk to another page.
  useEffect(() => {
    saveDrafts(drafts);
  }, [drafts]);

  // Keeps the open tree across a refresh too, typed in or not.
  useEffect(() => {
    saveSelectedTree(selectedId);
  }, [selectedId]);

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
  // Back on the page after a refresh, pick up the tree the student was typing in.
  const resumeId = useMemo(() => {
    const open = trees
      .filter((candidate) => !done.has(candidate.nodeId) && drafts[candidate.nodeId])
      .sort((a, b) => (drafts[b.nodeId].savedAt ?? 0) - (drafts[a.nodeId].savedAt ?? 0));
    return open[0]?.nodeId ?? null;
  }, [trees, done, drafts]);
  // A remembered pick waits while the trees load, and is skipped if that tree is no longer in the list.
  const pickedId = selectedId != null && trees.some((candidate) => candidate.nodeId === selectedId) ? selectedId : null;
  const activeId = pickedId ?? resumeId ?? pending?.nodeId ?? null;
  const tree = trees.find((candidate) => candidate.nodeId === activeId) ?? null;
  const node = (bush.data ?? []).find((row) => row.NodeID === activeId) ?? null;
  const showSummary = round.entries.length > 0 && (finished || activeId == null);

  const draft = activeId == null ? null : drafts[activeId];
  const form = useMemo(() => {
    const collectedAt = draft?.collectedAt ? dayjs(draft.collectedAt) : null;
    return { ...untouchedForm(), ...draft, collectedAt: collectedAt?.isValid() ? collectedAt : null };
  }, [draft]);
  const showNote = Boolean(draft?.showNote);

  const sensor = useMemo(() => sensorDefaults(node), [node]);
  const bushSugar = useMemo(() => bushAverageSugar(bush.data), [bush.data]);

  // The student only ever deals in sap. The empty bucket comes off the sensor
  // reading here and goes back on in the body that is saved, because the API
  // and the sensor both work in gross pounds.
  const tareLb = tree?.tareWeight ?? 0;
  const weightValue = form.weight ?? (sensor.usable ? netFromGross(sensor.weight, tareLb).toFixed(1) : '');
  // The sensor cannot see ice: the person at the tree turns this on, and it starts off.
  const iceValue = form.ice ?? false;

  // Ice: the student removes it, puts the bucket back, and turns the node off
  // and on. The node's first reading after that fills in the weight after ice
  // removed (unless the student typed one); with none inside a minute, the
  // collection saves with the last reading, flagged as not reweighed.
  const fromSensor =
    iceValue && form.weightAfterIce === '' && !form.afterIceTyped
      ? reweighFromReading(node, { baselineAt: form.iceBaselineAt, iceAt: form.iceAt, firstWeight: weightValue, tareLb })
      : null;
  const afterIceValue = form.weightAfterIce !== '' ? form.weightAfterIce : (fromSensor?.weight ?? '');

  const check = validateCollectionEntry(
    {
      NodeID: activeId,
      Weight: weightValue,
      Sugar_Percent: form.sugar,
      Ice_Present: iceValue,
      // With ice, the bucket is reweighed after the ice comes out; that weight is the sap.
      // A collection without one saves with the last reading instead, flagged.
      ...(iceValue ? { Weight_After_Ice: afterIceValue } : {}),
      Recorded_At: form.collectedAt?.toISOString(),
    },
    // Every weight on the form is already sap, so there is no bucket left to subtract.
    { tareWeight: 0 },
  );
  const errors = attempted ? { ...check.errors, ...serverErrors } : serverErrors;

  const reweigh = reweighStatus({ ice: iceValue, weightAfterIce: afterIceValue, iceAt: form.iceAt, now });
  const reweighed = reweigh === 'reweighed';
  const notReweighed = iceValue && !reweighed;
  // Not reweighed: the last reading, which is the weight on the form (filled in from the
  // sensor's last reading unless the student corrected it).
  const lastReading = weightValue;

  const sapWeight = !iceValue ? weightValue : reweighed ? afterIceValue : lastReading;
  const sapWeightError = reweighed ? check.errors.Weight_After_Ice || check.errors.Weight : check.errors.Weight;
  const sapGallons = sapWeight === '' || sapWeightError ? null : sapGallonsFor(grossFromNet(sapWeight, tareLb), tareLb);
  const afterIceError = iceValue && afterIceValue !== '' ? check.errors.Weight_After_Ice : null;
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

  // While an iced bucket waits for the node, look for its reading every few
  // seconds and keep the clock moving so the minute runs out on time.
  const waitingForReading = reweigh === 'waiting';
  useEffect(() => {
    if (!waitingForReading) return undefined;
    const timer = setInterval(() => {
      setNow(Date.now());
      refreshBush();
    }, REWEIGH_POLL_MS);
    return () => clearInterval(timer);
  }, [waitingForReading, refreshBush]);

  const edit = (changes) => {
    if (activeId == null) return;
    setServerErrors({});
    setDrafts((prev) => ({
      ...prev,
      [activeId]: {
        ...prev[activeId],
        ...changes,
        collectedAt:
          'collectedAt' in changes
            ? (changes.collectedAt?.toISOString?.() ?? null)
            : (prev[activeId]?.collectedAt ?? null),
        savedAt: Date.now(),
      },
    }));
  };

  const clearDraft = (nodeId) =>
    setDrafts((prev) => {
      if (!(nodeId in prev)) return prev;
      const rest = { ...prev };
      delete rest[nodeId];
      return rest;
    });

  // Switching trees leaves the one you were on exactly as it was.
  const chooseTree = (nodeId) => {
    setSelectedId(nodeId);
    setFinished(false);
    setAttempted(false);
    setServerErrors({});
    save.clearError();
  };

  // Each tree brings the form into view with the weight ready to type, so a
  // round is: tap or save, type a number, save.
  const treeId = tree?.nodeId ?? null;
  useEffect(() => {
    if (treeId == null || showSummary) return;
    if (focusedTree.current === null) {
      focusedTree.current = treeId;
      return;
    }
    if (focusedTree.current === treeId) return;
    focusedTree.current = treeId;
    formRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
    const input = weightRef.current;
    if (input) {
      input.focus({ preventScroll: true });
      input.select?.();
    }
  }, [treeId, showSummary]);

  const submit = async ({ finish = false } = {}) => {
    setNotice(null);
    setAttempted(true);
    if (!check.isValid || !tree) return;

    const collectedAt = (form.collectedAt ?? dayjs()).toISOString();
    const body = {
      NodeID: tree.nodeId,
      // With ice, the sap is the reweigh after the ice came out and the first weight is kept
      // too. Not reweighed (no reading in time, or saved first): the last reading, flagged.
      Weight: Number(grossFromNet(sapWeight, tareLb)),
      Weight_Before_Ice: reweighed ? Number(grossFromNet(weightValue, tareLb)) : null,
      Ice_Not_Reweighed: notReweighed,
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
      weightBeforeIce: body.Weight_Before_Ice,
      notReweighed: body.Ice_Not_Reweighed,
      sapGallons: estimate?.sapGallons ?? 0,
      syrupGallons: estimate?.syrupGallons ?? 0,
      basis: estimate?.basis ?? null,
      queued: isQueued,
    });

    const finishSave = (isQueued) => {
      const nextRound = addToRound(round, entryOf(isQueued));
      const upNext = nextTreeToLog(trees, nextRound, tree.nodeId);
      setRound(nextRound);
      clearDraft(tree.nodeId);
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
    setDrafts({});
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
              ref={formRef}
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
                      </Typography>
                      {tree.isOffline ? (
                        <Alert severity="warning">
                          This tree&apos;s device is offline. You can still record the collection.
                        </Alert>
                      ) : null}
                      {save.error ? <Alert severity="error">{save.error}</Alert> : null}

                      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                      <TextField
                        label={iceValue ? 'Weight with ice (lb)' : 'Sap weight (lb)'}
                        inputRef={weightRef}
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
                        control={
                          <Switch
                            checked={iceValue}
                            // A fresh toggle starts the reweigh (and its minute) over; turning ice off drops it.
                            onChange={(event) => {
                              const on = event.target.checked;
                              setNow(Date.now());
                              edit({
                                ice: on,
                                weightAfterIce: '',
                                iceAt: on ? Date.now() : null,
                                iceBaselineAt: on ? (node?.Recorded_At ?? null) : null,
                                afterIceTyped: false,
                              });
                            }}
                          />
                        }
                        label="Ice in the bucket"
                      />
                      {iceValue ? (
                        <>
                          <Alert
                            severity={reweigh === 'reweighed' ? 'success' : reweigh === 'timed-out' ? 'warning' : 'info'}
                            aria-live="polite"
                          >
                            <AlertTitle>
                              {reweigh === 'reweighed'
                                ? 'Reweighed without the ice'
                                : reweigh === 'timed-out'
                                  ? 'No new reading from the sensor'
                                  : 'Remove the ice and reweigh'}
                            </AlertTitle>
                            {reweigh === 'reweighed' ? (
                              fromSensor
                                ? `New weight from the sensor at ${timeOnly(fromSensor.recordedAt)}. This collection saves it and is tagged Ice removed.`
                                : 'This collection saves the weight after ice removed and is tagged Ice removed.'
                            ) : (
                              <>
                                <Box component="ol" sx={{ m: 0, pl: 2.5 }}>
                                  <li>Take the bucket off the sensor.</li>
                                  <li>Remove the ice from the bucket.</li>
                                  <li>Put the bucket back on the sensor.</li>
                                  <li>Turn the node off and back on.</li>
                                </Box>
                                {reweigh === 'waiting' ? (
                                  <>
                                    <Typography variant="body2" sx={{ mt: 1 }}>
                                      Waiting for the node's new reading. It fills in the weight after ice removed.
                                    </Typography>
                                    <LinearProgress sx={{ mt: 1 }} aria-label="Waiting for the sensor" />
                                  </>
                                ) : (
                                  <Typography variant="body2" sx={{ mt: 1 }}>
                                    No new reading came in after a minute. This collection saves with the last reading
                                    {lastReading !== '' ? ` (${lastReading} lb)` : ''} and is flagged Not reweighed. A
                                    reading that comes in, or a weight typed below, is used instead.
                                  </Typography>
                                )}
                              </>
                            )}
                          </Alert>
                          <TextField
                            label="Weight after ice removed (lb)"
                            type="number"
                            value={afterIceValue}
                            onChange={(event) => edit({ weightAfterIce: event.target.value, afterIceTyped: true })}
                            error={Boolean(afterIceError)}
                            helperText={
                              afterIceError ||
                              (fromSensor
                                ? 'From the sensor. Change it if your scale says different.'
                                : 'Fills in from the sensor after the power cycle. Pounds of sap with the ice out.')
                            }
                            fullWidth
                            slotProps={{ htmlInput: { min: 0, step: 0.1, inputMode: 'decimal' } }}
                          />
                        </>
                      ) : null}
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
                            onChange={(value) => {
                              // A half-typed date is not a date yet; wait for a whole one.
                              if (value == null) edit({ collectedAt: dayjs() });
                              else if (value.isValid()) edit({ collectedAt: value });
                            }}
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
                          {!(showNote || form.notes) ? <Button onClick={() => edit({ showNote: true })}>Add a note</Button> : null}
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
          {apiMode === 'http' ? <CollectionLogHistory refreshKey={journal.data} /> : (
            <CollectionHistory entries={journal.data ?? []} loading={journal.loading} error={journal.error} />
          )}
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
