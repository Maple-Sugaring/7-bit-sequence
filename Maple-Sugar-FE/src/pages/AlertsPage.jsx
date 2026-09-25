import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Grid from '@mui/material/Grid';
import Stack from '@mui/material/Stack';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import Typography from '@mui/material/Typography';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutlined';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import ReplayIcon from '@mui/icons-material/Replay';
import TaskAltIcon from '@mui/icons-material/TaskAlt';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { schedulePathForAlert } from '../business/alertSchedule';
import { Capability } from '../business/permissions';
import { PageHeader } from '../components/common/PageHeader';
import { AsyncBlock, EmptyBlock, SkeletonRows } from '../components/common/StateBlock';
import { dateTime, relativeMinutes } from '../components/common/format';
import { useAuth } from '../context/auth';
import { ESCALATION_MINUTES, groupByType, reopenAlert, resolveAlert } from '../services/alertService';
import { useAction, useAlerts } from '../services/hooks';

const SEVERITY_ICON = {
  error: ErrorOutlineIcon,
  warning: WarningAmberIcon,
  info: InfoOutlinedIcon,
};

function AlertRow({ alert, canResolve, canSchedule, onResolve, onReopen, onSchedule, pending }) {
  const Icon = SEVERITY_ICON[alert.severity] ?? InfoOutlinedIcon;

  return (
    <Card
      sx={{
        mb: 1.5,
        opacity: alert.Is_Resolved ? 0.72 : 1,
        borderLeftWidth: 4,
        borderLeftStyle: 'solid',
        borderLeftColor: alert.Is_Resolved ? 'divider' : `${alert.severity}.main`,
      }}
    >
      <CardContent sx={{ '&:last-child': { pb: 2 } }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ alignItems: { sm: 'flex-start' } }}>
          <Icon color={alert.Is_Resolved ? 'disabled' : alert.severity} />

          <Box sx={{ flexGrow: 1, minWidth: 0 }}>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5, mb: 0.5 }}>
              <Typography variant="subtitle1" component="h3" fontWeight={700}>
                {alert.Alert_Type}
              </Typography>
              <Chip label={alert.nodeName} size="small" variant="outlined" />
              {alert.isEscalated ? (
                <Chip
                  label={`Escalated after ${ESCALATION_MINUTES} min`}
                  size="small"
                  color="error"
                />
              ) : null}
              {alert.Is_Resolved ? <Chip label="Resolved" size="small" color="success" /> : null}
            </Stack>

            <Typography variant="body2" color="text.secondary">
              {alert.Description}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
              {dateTime(alert.Created_At)} &middot; {relativeMinutes(alert.ageMinutes)}
            </Typography>
          </Box>

          {canSchedule && alert.NodeID != null ? (
            <Button size="small" variant="contained" onClick={() => onSchedule(alert)} sx={{ flexShrink: 0 }}>
              Schedule
            </Button>
          ) : null}
          {canResolve ? (
            <Button
              size="small"
              variant={alert.Is_Resolved ? 'text' : 'outlined'}
              startIcon={alert.Is_Resolved ? <ReplayIcon /> : <TaskAltIcon />}
              onClick={() => (alert.Is_Resolved ? onReopen(alert.AlertID) : onResolve(alert.AlertID))}
              disabled={pending}
              sx={{ flexShrink: 0 }}
            >
              {alert.Is_Resolved ? 'Reopen' : 'Resolve'}
            </Button>
          ) : null}
        </Stack>
      </CardContent>
    </Card>
  );
}

export function AlertsPage() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const canResolve = can(Capability.RESOLVE_ALERTS);
  const canSchedule = can(Capability.MANAGE_SCHEDULE);
  const { data: alerts, loading, error, refresh } = useAlerts();
  const [tab, setTab] = useState('open');

  const resolve = useAction(async (alertId) => {
    await resolveAlert(alertId);
    await refresh();
  });
  const reopen = useAction(async (alertId) => {
    await reopenAlert(alertId);
    await refresh();
  });

  const groups = useMemo(() => groupByType(alerts ?? []), [alerts]);
  const escalated = (alerts ?? []).filter((alert) => alert.isEscalated);

  const visible = (alerts ?? []).filter((alert) => {
    if (tab === 'open') return !alert.Is_Resolved;
    if (tab === 'resolved') return alert.Is_Resolved;
    return true;
  });

  const openCount = (alerts ?? []).filter((alert) => !alert.Is_Resolved).length;

  return (
    <>
      <PageHeader
        title="Notifications"
        actions={
          <Button variant="outlined" onClick={refresh} disabled={loading}>
            Refresh
          </Button>
        }
      />

      {escalated.length > 0 ? (
        <Alert severity="error" sx={{ mb: 3 }}>
          <AlertTitle>
            {escalated.length} {escalated.length === 1 ? 'alert has' : 'alerts have'} gone
            unacknowledged past {ESCALATION_MINUTES} minutes
          </AlertTitle>
          These are escalated to administrators automatically. Resolve them once the issue in the
          field has been handled.
        </Alert>
      ) : null}

      {(resolve.error || reopen.error) ? (
        <Alert severity="error" sx={{ mb: 3 }}>
          {resolve.error ?? reopen.error}
        </Alert>
      ) : null}

      <Grid container spacing={2} sx={{ mb: 3 }}>
        {groups.map((group) => (
          <Grid size={{ xs: 6, sm: 4, md: 2 }} key={group.type}>
            <Card sx={{ height: '100%' }}>
              <CardContent sx={{ '&:last-child': { pb: 2 } }}>
                <Typography variant="caption" color="text.secondary" display="block" noWrap>
                  {group.type}
                </Typography>
                <Typography variant="h4" component="p" color={group.open ? `${group.severity}.main` : 'text.primary'}>
                  {group.open}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {group.resolved} resolved
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Tabs value={tab} onChange={(unused, next) => setTab(next)} sx={{ mb: 2 }}>
        <Tab value="open" label={`Open (${openCount})`} />
        <Tab value="resolved" label={`Resolved (${(alerts?.length ?? 0) - openCount})`} />
        <Tab value="all" label={`All (${alerts?.length ?? 0})`} />
      </Tabs>

      <AsyncBlock
        loading={loading}
        error={error}
        refresh={refresh}
        data={visible}
        skeleton={<SkeletonRows rows={5} height={96} />}
        isEmpty={(rows) => rows.length === 0}
        empty={
          <EmptyBlock
            title={tab === 'open' ? 'No open alerts' : 'Nothing here'}
            description={
              tab === 'open'
                ? 'Every tree is reporting normally and no buckets need attention.'
                : 'No alerts match this filter.'
            }
          />
        }
      >
        <Box>
          {visible.map((alert) => (
            <AlertRow
              key={alert.AlertID}
              alert={alert}
              canResolve={canResolve}
              canSchedule={canSchedule}
              onResolve={resolve.execute}
              onReopen={reopen.execute}
              onSchedule={(item) => navigate(schedulePathForAlert(item))}
              pending={resolve.pending || reopen.pending}
            />
          ))}
        </Box>
      </AsyncBlock>
    </>
  );
}
