const ExcelJS = require('exceljs');

const COLUMNS = [
  { header: 'Customer ID', key: 'customer_id', min: 12 },
  { header: 'Name', key: 'name', min: 14 },
  { header: 'Email', key: 'email', min: 14 },
  { header: 'Phone', key: 'phone', min: 14 },
  { header: 'Created At', key: 'created_at', min: 18 },
];

// Text cells are stored as strings (never formulas), so "=1+1" stays literal text.
const textCell = (v) => (v == null || v === '' ? null : { richText: [{ text: String(v) }] });

async function buildCustomersWorkbook(rows) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Customers', { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = COLUMNS.map((c) => ({ header: c.header, key: c.key, width: c.min }));

  rows.forEach((r) => {
    const row = ws.addRow({
      customer_id: r.customer_id,
      name: textCell(r.name),
      email: textCell(r.email),
      phone: textCell(r.phone),
      created_at: r.created_at,
    });
    ['name', 'email', 'phone'].forEach((k) => { row.getCell(k).numFmt = '@'; });
    row.getCell('created_at').numFmt = 'yyyy-mm-dd hh:mm';
  });

  ws.getRow(1).font = { bold: true };
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: COLUMNS.length } };
  COLUMNS.forEach((c, i) => {
    const longest = rows.reduce((n, r) => Math.max(n, String(r[c.key] ?? '').length), 0);
    ws.getColumn(i + 1).width = Math.min(Math.max(c.min, longest + 2), 40);
  });

  return Buffer.from(await wb.xlsx.writeBuffer());
}

const exportFileName = (date = new Date()) => `customers-${date.toISOString().slice(0, 10)}.xlsx`;

module.exports = { buildCustomersWorkbook, exportFileName };
