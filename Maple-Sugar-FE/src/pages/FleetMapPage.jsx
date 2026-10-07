import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import useMediaQuery from '@mui/material/useMediaQuery';
import { statusCounts } from '../business/nodeMapStatus';
import { EmptyBlock, ErrorBlock, LoadingBlock } from '../components/common/StateBlock';
import { PageHeader } from '../components/common/PageHeader';
import { FleetMap } from '../components/map/FleetMap';
import { FleetMapLegend } from '../components/map/FleetMapLegend';
import { FleetNodeList } from '../components/map/FleetNodeList';
import { useFleetMap } from '../services/hooks';

const ALL_SITES = 'all';

export function FleetMapPage() {
  const fleet = useFleetMap();
  const [params, setParams] = useSearchParams();
  const [statuses, setStatuses] = useState(() => new Set());
  const [query, setQuery] = useState('');
  const [mobileView, setMobileView] = useState('list');
  const wide = useMediaQuery('(min-width:900px)');

  const site = params.get('site') ?? ALL_SITES;
  const selectedId = params.get('node') ? Number(params.get('node')) : null;

  const sites = useMemo(
    () => [...new Set(fleet.nodes.map((node) => node.Stand).filter(Boolean))].sort(),
    [fleet.nodes],
  );

  const bySite = useMemo(
    () => (site === ALL_SITES ? fleet.nodes : fleet.nodes.filter((node) => node.Stand === site)),
    [fleet.nodes, site],
  );
  const counts = useMemo(() => statusCounts(bySite), [bySite]);
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return bySite.filter(
      (node) =>
        (statuses.size === 0 || statuses.has(node.mapStatus)) &&
        (!needle || node.Node_Name.toLowerCase().includes(needle)),
    );
  }, [bySite, statuses, query]);
  const noLocation = bySite.filter((node) => !node.hasLocation).length;

  const update = (key, value) => {
    const next = new URLSearchParams(params);
    if (value == null || value === ALL_SITES) next.delete(key);
    else next.set(key, String(value));
    setParams(next, { replace: true });
  };
  const toggleStatus = (status) =>
    setStatuses((previous) => {
      const next = new Set(previous);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  const select = (nodeId) => {
    update('node', nodeId);
    setMobileView('map');
  };

  const list = <FleetNodeList nodes={visible} selectedId={selectedId} onSelect={select} />;
  const map = <FleetMap nodes={visible} selectedId={selectedId} height={wide ? 'calc(100vh - 260px)' : '70vh'} />;

  let body;
  if (fleet.error && fleet.nodes.length === 0) {
    body = <ErrorBlock error={fleet.error} onRetry={fleet.refresh} />;
  } else if (fleet.loading) {
    body = <LoadingBlock label="Loading the fleet" height={320} />;
  } else if (fleet.nodes.length === 0) {
    body = <EmptyBlock title="No nodes deployed yet" description="Deployed nodes appear here once they are sited." />;
  } else if (wide) {
    body = (
      <Box sx={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: 2, alignItems: 'start' }}>
        <Paper variant="outlined" sx={{ maxHeight: 'calc(100vh - 260px)', overflowY: 'auto' }}>
          {list}
        </Paper>
        {map}
      </Box>
    );
  } else {
    body = mobileView === 'map' ? map : <Paper variant="outlined">{list}</Paper>;
  }

  return (
    <>
      <PageHeader
        title="Fleet map"
        subtitle="Every node by status. Pick a faulted or stale tree to open it."
        actions={
          <Button onClick={fleet.refresh} sx={{ minHeight: 44 }}>
            Refresh
          </Button>
        }
      />
      <Stack spacing={1.5} sx={{ mb: 2 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
          <TextField
            select
            size="small"
            label="Site"
            value={sites.includes(site) ? site : ALL_SITES}
            onChange={(event) => update('site', event.target.value)}
            sx={{ minWidth: 200 }}
          >
            <MenuItem value={ALL_SITES}>All sites</MenuItem>
            {sites.map((name) => (
              <MenuItem key={name} value={name}>
                {name}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            size="small"
            label="Search nodes"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            sx={{ flex: 1 }}
          />
          {!wide ? (
            <ToggleButtonGroup
              exclusive
              size="small"
              value={mobileView}
              onChange={(event, value) => value && setMobileView(value)}
              aria-label="Map or list view"
            >
              <ToggleButton value="list" sx={{ minHeight: 44, minWidth: 80 }}>List</ToggleButton>
              <ToggleButton value="map" sx={{ minHeight: 44, minWidth: 80 }}>Map</ToggleButton>
            </ToggleButtonGroup>
          ) : null}
        </Stack>
        <FleetMapLegend counts={counts} active={statuses} onToggle={toggleStatus} noLocation={noLocation} />
      </Stack>
      {body}
    </>
  );
}
