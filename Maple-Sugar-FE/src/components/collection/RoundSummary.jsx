import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Grid from '@mui/material/Grid';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { summarizeRound } from '../../business/collectionRound';
import { timeOnly } from '../common/format';

function Stat({ label, value, detail }) {
  return (
    <>
      <Typography variant="overline" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="h5" component="p">
        {value}
      </Typography>
      {detail ? (
        <Typography variant="body2" color="text.secondary">
          {detail}
        </Typography>
      ) : null}
    </>
  );
}

/** The trip in numbers, shown when the last tree is done or the student finishes early. */
export function RoundSummary({ round, onNewRound, onKeepGoing }) {
  const totals = summarizeRound(round);

  return (
    <Card>
      <CardContent>
        <Stack spacing={2}>
          <Typography variant="h5" component="h2">
            {round.label ? `${round.label} done` : 'Round done'}
          </Typography>

          {totals.waiting > 0 ? (
            <Alert severity="warning">
              {totals.waiting === 1 ? '1 entry is' : `${totals.waiting} entries are`} still saved on this phone and will
              upload when the connection returns.
            </Alert>
          ) : null}

          <Grid container spacing={2}>
            <Grid size={{ xs: 6, sm: 3 }}>
              <Stat label="Trees" value={totals.trees} />
            </Grid>
            <Grid size={{ xs: 6, sm: 3 }}>
              <Stat label="Sap" value={`${totals.sapGallons.toFixed(1)} gal`} />
            </Grid>
            <Grid size={{ xs: 6, sm: 3 }}>
              <Stat
                label="Syrup"
                value={`About ${totals.syrupGallons.toFixed(2)} gal`}
                detail="Rule of 86 where tested, 43:1 elsewhere"
              />
            </Grid>
            <Grid size={{ xs: 6, sm: 3 }}>
              <Stat
                label="Sugar"
                value={totals.averageSugar == null ? 'Not tested' : `${totals.averageSugar.toFixed(1)}%`}
                detail={
                  totals.tested === 0
                    ? 'No tree was tested this round'
                    : `Tested at ${totals.tested} of ${totals.trees} ${totals.trees === 1 ? 'tree' : 'trees'}`
                }
              />
            </Grid>
          </Grid>

          <Stack spacing={0.75}>
            {round.entries.map((entry) => (
              <Stack
                key={entry.ref}
                direction="row"
                spacing={1}
                useFlexGap
                sx={{ alignItems: 'center', flexWrap: 'wrap' }}
              >
                <Typography sx={{ flexGrow: 1 }}>{entry.treeLabel}</Typography>
                <Chip size="small" variant="outlined" label={`${entry.sapGallons.toFixed(1)} gal`} />
                {entry.sugar != null ? <Chip size="small" variant="outlined" label={`${entry.sugar}% sugar`} /> : null}
                {entry.ice ? <Chip size="small" color="info" label="Ice" /> : null}
                {entry.queued ? <Chip size="small" color="warning" label="Waiting to upload" /> : null}
                <Typography variant="caption" color="text.secondary">
                  {timeOnly(entry.collectedAt)}
                </Typography>
              </Stack>
            ))}
          </Stack>

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            <Button variant="contained" onClick={onNewRound} sx={{ minHeight: 44 }}>
              Start a new round
            </Button>
            <Button variant="outlined" onClick={onKeepGoing} sx={{ minHeight: 44 }}>
              Log another tree
            </Button>
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );
}
