import { useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

const PAGE = 20;

function cellValue(column, row) {
  const raw = column.valueGetter ? column.valueGetter(row[column.field], row) : row[column.field];
  const params = { id: row.id, row, field: column.field, value: raw };
  if (column.renderCell) return column.renderCell(params);
  if (column.valueFormatter) return column.valueFormatter(raw, row, column);
  return raw ?? '—';
}

/**
 * Phone-friendly stand-in for a DataGrid: one card per row, built from the same
 * column definitions. The first column is the card title; a column with an
 * empty headerName (row actions) is pinned to the top right.
 */
export function ColumnCards({ rows, columns, getRowId, loading, emptyLabel = 'Nothing to show.' }) {
  const [shown, setShown] = useState(PAGE);
  const [title, ...rest] = columns;
  const actions = rest.find((column) => !column.headerName);
  const details = rest.filter((column) => column.headerName);

  if (loading) {
    return (
      <Stack spacing={1.5} sx={{ p: 1.5 }}>
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} variant="rounded" height={120} />
        ))}
      </Stack>
    );
  }
  if (rows.length === 0) {
    return (
      <Typography color="text.secondary" sx={{ p: 3, textAlign: 'center' }}>
        {emptyLabel}
      </Typography>
    );
  }

  return (
    <Stack spacing={1.5} sx={{ p: 1.5 }}>
      {rows.slice(0, shown).map((row) => (
        <Card key={getRowId(row)} variant="outlined" sx={{ p: 1.5 }}>
          <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
            <Typography component="h3" sx={{ fontWeight: 700 }}>
              {cellValue(title, row)}
            </Typography>
            {actions ? <Box sx={{ flexShrink: 0 }}>{cellValue(actions, row)}</Box> : null}
          </Stack>
          <Stack spacing={0.75}>
            {details.map((column) => (
              <Stack
                key={column.field}
                direction="row"
                sx={{ alignItems: 'center', justifyContent: 'space-between', gap: 2, minHeight: 28 }}
              >
                <Typography variant="caption" color="text.secondary">
                  {column.headerName}
                </Typography>
                <Box sx={{ fontSize: 14, textAlign: 'right', minWidth: 0, overflowWrap: 'anywhere' }}>
                  {cellValue(column, row)}
                </Box>
              </Stack>
            ))}
          </Stack>
        </Card>
      ))}
      {rows.length > shown ? (
        <Button onClick={() => setShown((count) => count + PAGE)}>Show more ({rows.length - shown} left)</Button>
      ) : null}
    </Stack>
  );
}
