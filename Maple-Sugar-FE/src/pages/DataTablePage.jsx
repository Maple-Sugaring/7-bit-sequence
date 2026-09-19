import { useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Chip from '@mui/material/Chip';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { DataGrid, GridToolbarContainer, GridToolbarQuickFilter, GridToolbarExport } from '@mui/x-data-grid';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import dayjs from 'dayjs';
import { Capability } from '../business/permissions';
import { SEMESTERS } from '../business/aggregation';
import { SPOILAGE_SEVERITY } from '../business/spoilage';
import { PageHeader } from '../components/common/PageHeader';
import { ErrorBlock } from '../components/common/StateBlock';
import { dateTime, fahrenheit, percent, pounds, ratio } from '../components/common/format';
import { useAuth } from '../context/auth';
import { useReadings, useRecordingTargets } from '../services/hooks';

const SUGAR_CLASS_COLOR = {
  typical: 'success',
  low: 'info',
  high: 'warning',
  implausible: 'error',
  unknown: 'default',
};

function Toolbar({ canExport }) {
  return (
    <GridToolbarContainer sx={{ p: 1.5, gap: 1 }}>
      <GridToolbarQuickFilter
        placeholder="Search trees, stands, weather"
        sx={{ flexGrow: 1, maxWidth: 380 }}
      />
      {canExport ? (
        // DataGrid's CSV export covers FR-028 and the MSS export user story.
        <GridToolbarExport
          csvOptions={{ fileName: `maple-sap-readings-${dayjs().format('YYYY-MM-DD')}` }}
          printOptions={{ hideFooter: true, hideToolbar: true }}
        />
      ) : null}
    </GridToolbarContainer>
  );
}

export function DataTablePage() {
  const { can } = useAuth();
  const canExport = can(Capability.EXPORT_DATA);

  const [filters, setFilters] = useState({ nodeId: '', from: null, to: null, semester: '' });

  const { data: targets } = useRecordingTargets();
  const { data: rows, loading, error, refresh } = useReadings({
    nodeId: filters.nodeId || undefined,
    from: filters.from ? filters.from.startOf('day').toISOString() : undefined,
    to: filters.to ? filters.to.endOf('day').toISOString() : undefined,
  });

  // Semester is derived rather than queried, so it filters client-side.
  const visibleRows = useMemo(() => {
    if (!filters.semester) return rows ?? [];
    return (rows ?? []).filter((row) => row.semester === filters.semester);
  }, [rows, filters.semester]);

  const columns = useMemo(
    () => [
      {
        field: 'Recorded_At',
        headerName: 'Recorded',
        width: 190,
        valueGetter: (value) => new Date(value),
        type: 'dateTime',
        renderCell: (params) => dateTime(params.row.Recorded_At),
      },
      { field: 'nodeName', headerName: 'Tree', width: 170 },
      { field: 'stand', headerName: 'Stand', width: 130 },
      { field: 'barcode', headerName: 'Bucket', width: 110 },
      {
        field: 'netWeight',
        headerName: 'Net weight',
        width: 120,
        type: 'number',
        renderCell: (params) => pounds(params.value),
      },
      {
        field: 'fillPercent',
        headerName: 'Fill',
        width: 110,
        type: 'number',
        renderCell: (params) =>
          params.value == null ? (
            '—'
          ) : (
            <Chip
              size="small"
              label={percent(params.value, 0)}
              color={params.row.isFull ? 'warning' : 'default'}
              variant={params.row.isFull ? 'filled' : 'outlined'}
            />
          ),
      },
      {
        field: 'Sugar_Percent',
        headerName: 'Sugar',
        width: 120,
        type: 'number',
        renderCell: (params) =>
          params.value == null ? (
            <Typography variant="body2" color="text.secondary">
              —
            </Typography>
          ) : (
            <Tooltip title={params.row.sugarClass.label}>
              <Chip
                size="small"
                label={percent(params.value, 2)}
                color={SUGAR_CLASS_COLOR[params.row.sugarClass.level]}
                variant="outlined"
              />
            </Tooltip>
          ),
      },
      {
        field: 'sapToSyrupRatio',
        headerName: 'Sap:Syrup',
        width: 110,
        type: 'number',
        renderCell: (params) => ratio(params.value),
      },
      {
        field: 'Temperature',
        headerName: 'Temp',
        width: 100,
        type: 'number',
        renderCell: (params) => fahrenheit(params.value),
      },
      {
        field: 'spoilageRisk',
        headerName: 'Spoilage',
        width: 120,
        renderCell: (params) => (
          <Chip
            size="small"
            label={params.value}
            color={SPOILAGE_SEVERITY[params.value] ?? 'default'}
            variant="outlined"
            sx={{ textTransform: 'capitalize' }}
          />
        ),
      },
      { field: 'Weather_Conditions', headerName: 'Weather', width: 140 },
      {
        field: 'source',
        headerName: 'Source',
        width: 110,
        renderCell: (params) => (
          <Chip
            size="small"
            label={params.value}
            variant="outlined"
            color={params.value === 'Manual' ? 'primary' : 'default'}
          />
        ),
      },
      { field: 'season', headerName: 'Season', width: 100, type: 'number' },
    ],
    [],
  );

  if (error) {
    return (
      <>
        <PageHeader title="Data Table" />
        <ErrorBlock error={error} onRetry={refresh} />
      </>
    );
  }

  return (
    <>
      <PageHeader title="Data Table" />

      <Card sx={{ p: 2, mb: 2.5 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ flexWrap: 'wrap' }}>
          <TextField
            select
            label="Tree"
            size="small"
            value={filters.nodeId}
            onChange={(event) => setFilters((prev) => ({ ...prev, nodeId: event.target.value }))}
            sx={{ minWidth: 200 }}
          >
            <MenuItem value="">All trees</MenuItem>
            {(targets ?? []).map((target) => (
              <MenuItem key={target.nodeId} value={target.nodeId}>
                {target.label}
              </MenuItem>
            ))}
          </TextField>

          <DatePicker
            label="From"
            value={filters.from}
            onChange={(value) => setFilters((prev) => ({ ...prev, from: value }))}
            slotProps={{ textField: { size: 'small' }, field: { clearable: true } }}
          />
          <DatePicker
            label="To"
            value={filters.to}
            onChange={(value) => setFilters((prev) => ({ ...prev, to: value }))}
            slotProps={{ textField: { size: 'small' }, field: { clearable: true } }}
          />

          <TextField
            select
            label="Semester"
            size="small"
            value={filters.semester}
            onChange={(event) => setFilters((prev) => ({ ...prev, semester: event.target.value }))}
            sx={{ minWidth: 160 }}
          >
            <MenuItem value="">All semesters</MenuItem>
            {SEMESTERS.map((semester) => (
              <MenuItem key={semester.id} value={semester.id}>
                {semester.label}
              </MenuItem>
            ))}
          </TextField>

          <Box sx={{ flexGrow: 1 }} />
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <Chip label={`${visibleRows.length} readings`} size="small" />
          </Stack>
        </Stack>
      </Card>

      <Card sx={{ height: 640 }}>
        <DataGrid
          rows={visibleRows}
          columns={columns}
          loading={loading}
          density="compact"
          disableRowSelectionOnClick
          pageSizeOptions={[25, 50, 100]}
          initialState={{
            pagination: { paginationModel: { pageSize: 50 } },
            sorting: { sortModel: [{ field: 'Recorded_At', sort: 'desc' }] },
          }}
          slots={{ toolbar: Toolbar }}
          slotProps={{ toolbar: { canExport } }}
          showToolbar
          sx={{ border: 0 }}
        />
      </Card>
    </>
  );
}
