/**
 * Sugar Woods weight export. The CSV and the PDF are built from the same rows
 * (`exportRows`), so a report always matches the file the user downloaded.
 */

export const EXPORT_COLUMNS = [
  { key: 'timestamp', csv: 'timestamp_utc', label: 'Recorded (UTC)' },
  { key: 'node', csv: 'node', label: 'Node' },
  { key: 'tree', csv: 'tree', label: 'Tree' },
  { key: 'stand', csv: 'stand', label: 'Stand' },
  { key: 'weight', csv: 'weight_lb', label: 'Weight (lb)' },
  { key: 'sugar', csv: 'sugar_percent', label: 'Sugar (%)' },
];

/** Keep only rows inside [from, to] (YYYY-MM-DD, inclusive), oldest first. */
export function exportRows(readings, from, to) {
  const rows = [];
  for (const row of readings ?? []) {
    const date = String(row.Recorded_At).slice(0, 10);
    if (from && date < from) continue;
    if (to && date > to) continue;
    rows.push({
      timestamp: String(row.Recorded_At).replace('T', ' ').replace(/\.\d+Z?$|Z$/, ''),
      node: row.NodeID ?? '',
      tree: row.nodeName ?? '',
      stand: row.stand ?? '',
      weight: row.Weight ?? '',
      sugar: row.Sugar_Percent ?? '',
    });
  }
  return rows.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

function csvCell(value) {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(rows) {
  const lines = [EXPORT_COLUMNS.map((col) => col.csv).join(',')];
  for (const row of rows) lines.push(EXPORT_COLUMNS.map((col) => csvCell(row[col.key])).join(','));
  return lines.join('\r\n');
}

export function totals(rows) {
  const weights = rows.filter((row) => row.weight !== '').map((row) => Number(row.weight)).filter(Number.isFinite);
  const sum = weights.reduce((a, b) => a + b, 0);
  return {
    count: rows.length,
    nodes: new Set(rows.map((row) => row.node)).size,
    averageWeight: weights.length ? sum / weights.length : null,
  };
}

export function exportFileName(from, to, ext) {
  return `sugar-woods-${from ?? 'start'}-to-${to ?? 'end'}.${ext}`;
}

/** Build the PDF. jsPDF is loaded on demand so it stays out of the main bundle. */
export async function buildPdf(rows, { from, to, user, generatedAt = new Date() }) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' });
  const sum = totals(rows);
  const range = `${from ?? 'start'} to ${to ?? 'end'}`;

  doc.setFontSize(16);
  doc.text('Sugar Woods weight report', 40, 40);
  doc.setFontSize(10);
  const meta = [
    `Period: ${range} (UTC dates)`,
    `Generated: ${generatedAt.toISOString().replace('T', ' ').slice(0, 19)} UTC${user ? ` by ${user}` : ''}`,
    `Source: Sugar Woods CSV export (${exportFileName(from, to, 'csv')}), ${sum.count} record${sum.count === 1 ? '' : 's'}`,
  ];
  meta.forEach((line, i) => doc.text(line, 40, 58 + i * 13));

  const foot = [
    [
      {
        content: `Total: ${sum.count} readings from ${sum.nodes} node${sum.nodes === 1 ? '' : 's'}${
          sum.averageWeight == null ? '' : `; average weight ${sum.averageWeight.toFixed(1)} lb`
        }`,
        colSpan: EXPORT_COLUMNS.length,
      },
    ],
  ];

  autoTable(doc, {
    startY: 106,
    head: [EXPORT_COLUMNS.map((col) => col.label)],
    body: rows.length
      ? rows.map((row) => EXPORT_COLUMNS.map((col) => String(row[col.key])))
      : [[{ content: 'No readings in this period.', colSpan: EXPORT_COLUMNS.length }]],
    foot,
    showFoot: 'lastPage',
    showHead: 'everyPage',
    styles: { fontSize: 9, cellPadding: 3, overflow: 'linebreak' },
    headStyles: { fillColor: [139, 69, 19] },
    footStyles: { fillColor: [240, 230, 220], textColor: 20 },
    rowPageBreak: 'avoid',
    margin: { left: 40, right: 40, bottom: 40 },
    didDrawPage: () => {
      const page = doc.getNumberOfPages();
      doc.setFontSize(8);
      doc.text(`Page ${page}`, doc.internal.pageSize.getWidth() - 40, doc.internal.pageSize.getHeight() - 20, {
        align: 'right',
      });
    },
  });
  return doc;
}
