import { useId, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import TableChartOutlinedIcon from '@mui/icons-material/TableChartOutlined';
import ShowChartIcon from '@mui/icons-material/ShowChart';

/*
 * Accessible wrapper for any Recharts chart.
 *
 * WCAG 2.2:
 * - 1.1.1 Non-text Content: the chart gets a short text alternative (role="img"
 *   + aria-label) and a visible text summary; the <figure> is named by `title`
 *   and described by that summary.
 * - 1.3.1 / 4.1.2: the full data is available as a real table with a caption
 *   and column headers, toggled by a button with aria-expanded/aria-controls.
 * - Charts inside must set accessibilityLayer={false} so Recharts doesn't add
 *   role="application" + tabindex to the SVG (role="img" makes the SVG's
 *   internals presentational).
 */
export function AccessibilityChartWrapper({ title, summary, columns, rows = [], height = 240, children }) {
  const [showTable, setShowTable] = useState(false);
  const baseId = useId();
  const summaryId = `${baseId}-summary`;
  const tableId = `${baseId}-table`;

  return (
    <Box component="figure" aria-label={title} aria-describedby={summaryId} sx={{ m: 0 }}>
      {!showTable && (
        <Box role="img" aria-label={`${title}. ${summary}`} sx={{ width: '100%', height }}>
          {children}
        </Box>
      )}

      <Box
        id={tableId}
        hidden={!showTable}
        sx={{ display: showTable ? 'block' : 'none' }}
      >
        <TableContainer sx={{ maxHeight: height + 120, overflow: 'auto' }}>
          <Table size="small" stickyHeader>
            <caption style={{ captionSide: 'top', textAlign: 'left', padding: '0 0 8px' }}>
              <Typography component="span" variant="body2" sx={{ fontWeight: 600 }}>
                {title}
              </Typography>
            </caption>
            <TableHead>
              <TableRow>
                {columns.map((col) => (
                  <TableCell key={col.key} scope="col">
                    {col.label}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={columns.length}>No data yet.</TableCell>
                </TableRow>
              ) : (
                rows.map((row, i) => (
                  <TableRow key={row.Date ?? i}>
                    {columns.map((col, c) => {
                      const value = col.format ? col.format(row[col.key], row) : row[col.key];
                      // First column (usually the date) labels the row.
                      return c === 0 ? (
                        <TableCell key={col.key} component="th" scope="row">
                          {value ?? '—'}
                        </TableCell>
                      ) : (
                        <TableCell key={col.key}>{value ?? '—'}</TableCell>
                      );
                    })}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>

      <Box
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 1,
          mt: 1,
        }}
      >
        <Typography id={summaryId} variant="body2" color="text.secondary">
          {summary}
        </Typography>
        <Button
          size="small"
          variant="text"
          onClick={() => setShowTable((v) => !v)}
          aria-expanded={showTable}
          aria-controls={tableId}
          startIcon={showTable ? <ShowChartIcon /> : <TableChartOutlinedIcon />}
        >
          {showTable ? 'View as chart' : 'View as table'}
        </Button>
      </Box>
    </Box>
  );
}