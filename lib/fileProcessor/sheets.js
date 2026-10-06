import fs from 'fs';
import ExcelJS from 'exceljs';
import { ProcessError, requireInput, outputPath, recordOutput } from '@/lib/fileProcessor/common';

/**
 * Spreadsheets (Phase 8.9): CSV / TSV / Excel → stats, preview, filter, sort, and export.
 * The first row is the header row.
 */

export const SHEET_EXTENSIONS = ['csv', 'tsv', 'xlsx'];
const MAX_ROWS = 200000;
const PREVIEW_ROWS = 10;
const OPERATORS = ['=', '!=', '>', '>=', '<', '<=', 'contains', 'starts_with'];

/**
 * RFC 4180 CSV: quoted fields, doubled quotes, embedded delimiters and newlines.
 */
export function parseDelimited(text, delimiter = ',') {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"' && field === '') quoted = true;
    else if (c === delimiter) {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell !== ''));
}

// Cells starting with these would run as formulas in Excel / LibreOffice when the CSV is opened
const FORMULA_START = /^[=+\-@\t\r]/;

function toCsv(rows) {
  return rows
    .map((row) =>
      row
        .map((value) => {
          let cell = value === null || value === undefined ? '' : String(value);
          if (FORMULA_START.test(cell) && !/^-?\d+(\.\d+)?$/.test(cell)) cell = `'${cell}`;
          return /[",\n\r]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
        })
        .join(',')
    )
    .join('\n');
}

function cellValue(value) {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'object') return value.result ?? value.text ?? value.richText?.map((r) => r.text).join('') ?? value.hyperlink ?? '';
  return value;
}

async function loadTable(target, ext, sheetName) {
  if (ext === 'xlsx') {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(target);
    const sheet = sheetName ? workbook.worksheets.find((ws) => ws.name.toLowerCase() === String(sheetName).toLowerCase()) : workbook.worksheets[0];
    if (!sheet) throw new ProcessError(`No sheet named "${sheetName}" (sheets: ${workbook.worksheets.map((ws) => ws.name).join(', ')}).`);
    const rows = [];
    const maxCols = sheet.columnCount || 0;
    sheet.eachRow({ includeEmpty: false }, (row) => {
      const values = row.values;
      const colCount = Math.max(
        maxCols,
        Array.isArray(values) ? values.length - 1 : 0,
        values && typeof values === 'object' ? Math.max(...Object.keys(values).map(Number).filter((n) => !Number.isNaN(n)), 0) : 0
      );
      rows.push(Array.from({ length: colCount }, (_, i) => cellValue(values ? values[i + 1] : undefined)));
    });
    const maxWidth = rows.reduce((max, r) => Math.max(max, r.length), 0);
    const normalizedRows = rows.map((r) => (r.length < maxWidth ? [...r, ...Array(maxWidth - r.length).fill('')] : r));
    return { rows: normalizedRows, sheet: sheet.name, sheets: workbook.worksheets.map((ws) => ws.name) };
  }
  const text = fs.readFileSync(target, 'utf-8').replace(/^﻿/, '');
  return { rows: parseDelimited(text, ext === 'tsv' ? '\t' : ',') };
}

const asNumber = (value) => {
  if (typeof value === 'number') return value;
  const raw = String(value).trim();
  if (/^\+\d+$/.test(raw) || /^\d{16,}$/.test(raw.replace(/[,\s]/g, ''))) return null;
  const cleaned = raw.replace(/[,\s]/g, '').replace(/^[$€£₹]/, '').replace(/%$/, '');
  return cleaned !== '' && !Number.isNaN(Number(cleaned)) ? Number(cleaned) : null;
};

function findColumn(headers, name) {
  const wanted = String(name || '').toLowerCase().trim();
  if (!wanted) throw new ProcessError('Name the column to use.');
  const index = headers.findIndex((h) => String(h).toLowerCase().trim() === wanted);
  const loose = index >= 0 ? index : headers.findIndex((h) => String(h).toLowerCase().includes(wanted));
  if (loose < 0) throw new ProcessError(`No column named "${name}". Columns: ${headers.join(', ')}.`);
  return loose;
}

function columnStats(header, values) {
  const filled = values.filter((v) => v !== '' && v !== null && v !== undefined);
  const numbers = filled.map(asNumber).filter((n) => n !== null);
  if (filled.length && numbers.length / filled.length >= 0.8) {
    const sorted = [...numbers].sort((a, b) => a - b);
    const sum = numbers.reduce((a, b) => a + b, 0);
    const mid = Math.floor(sorted.length / 2);
    const round = (n) => Math.round(n * 100) / 100;
    return { column: header, type: 'number', filled: filled.length, empty: values.length - filled.length, min: sorted[0], max: sorted.at(-1), mean: round(sum / numbers.length), median: sorted.length % 2 ? sorted[mid] : round((sorted[mid - 1] + sorted[mid]) / 2), sum: round(sum) };
  }
  const counts = new Map();
  for (const v of filled) counts.set(String(v), (counts.get(String(v)) || 0) + 1);
  const top = [...counts].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([value, count]) => `${value} (${count})`);
  return { column: header, type: 'text', filled: filled.length, empty: values.length - filled.length, unique: counts.size, top };
}

function matches(cell, operator, value) {
  const a = asNumber(cell);
  const b = asNumber(value);
  const text = String(cell).toLowerCase();
  const wanted = String(value).toLowerCase();
  switch (operator) {
    case '=': return a !== null && b !== null ? a === b : text === wanted;
    case '!=': return a !== null && b !== null ? a !== b : text !== wanted;
    case '>': return a !== null && b !== null && a > b;
    case '>=': return a !== null && b !== null && a >= b;
    case '<': return a !== null && b !== null && a < b;
    case '<=': return a !== null && b !== null && a <= b;
    case 'contains': return text.includes(wanted);
    case 'starts_with': return text.startsWith(wanted);
    default: throw new ProcessError(`Operator must be one of: ${OPERATORS.join(', ')}.`);
  }
}

async function writeTable(target, rows, suffix, format) {
  const ext = format === 'xlsx' ? 'xlsx' : 'csv';
  const file = outputPath(target, suffix, ext);
  if (ext === 'xlsx') {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Data');
    rows.forEach((row, rowIndex) => {
      if (rowIndex === 0) {
        sheet.addRow(row);
        return;
      }
      sheet.addRow(
        row.map((v) => {
          if (typeof v === 'number') return v;
          if (v === null || v === undefined) return '';
          const s = String(v).trim();
          if (s === '') return '';
          if (/^[+-]?0\d+$/.test(s)) return v; // preserve ZIP codes and leading zeroes
          if (/%$/.test(s)) return v;          // preserve percentages
          return asNumber(v) ?? v;
        })
      );
    });
    sheet.getRow(1).font = { bold: true };
    await workbook.xlsx.writeFile(file);
  } else {
    fs.writeFileSync(file, `${toCsv(rows)}\n`, 'utf-8');
  }
  return file;
}

const previewOf = (headers, rows) => rows.slice(0, PREVIEW_ROWS).map((row) => Object.fromEntries(headers.map((h, i) => [h, row[i] ?? ''])));

export async function processSheet(action, target, options) {
  const { ext } = requireInput(target, SHEET_EXTENSIONS);
  const table = await loadTable(target, ext, options.sheet);
  if (!table.rows.length) throw new ProcessError('The sheet is empty.');
  if (table.rows.length > MAX_ROWS) throw new ProcessError(`The sheet has more than ${MAX_ROWS.toLocaleString()} rows.`);
  const [headers, ...data] = table.rows;
  const width = headers.length;
  const sheetNote = table.sheets?.length > 1 ? ` (sheet "${table.sheet}" of ${table.sheets.join(', ')})` : '';

  let rows = data;
  let description = '';
  if (options.column && options.operator) {
    const col = findColumn(headers, options.column);
    rows = rows.filter((row) => matches(row[col] ?? '', options.operator, options.value ?? ''));
    description = `where ${headers[col]} ${options.operator} ${options.value}`;
  }
  if (options.sort_by) {
    const col = findColumn(headers, options.sort_by);
    const dir = options.order === 'desc' ? -1 : 1;
    rows = [...rows].sort((x, y) => {
      const a = asNumber(x[col]);
      const b = asNumber(y[col]);
      if (a !== null && b !== null) return (a - b) * dir;
      return String(x[col] ?? '').localeCompare(String(y[col] ?? ''), undefined, { numeric: true }) * dir;
    });
    description += `${description ? ', ' : ''}sorted by ${headers[col]} ${options.order === 'desc' ? 'descending' : 'ascending'}`;
  }

  switch (action) {
    case 'stats':
      return {
        message: `${data.length} row(s) × ${width} column(s)${sheetNote}.`,
        columns: headers.map((h, i) => columnStats(h, data.map((row) => row[i] ?? ''))),
      };
    case 'preview':
    case 'filter':
    case 'sort':
      if (action === 'filter' && !(options.column && options.operator)) throw new ProcessError('Filtering needs a column, an operator, and a value.');
      if (action === 'sort' && !options.sort_by) throw new ProcessError('Sorting needs sort_by (a column).');
      return {
        message: `${rows.length} of ${data.length} row(s)${description ? ` ${description}` : ''}${sheetNote}; first ${Math.min(PREVIEW_ROWS, rows.length)} shown.${options.save ? '' : ' Set save to write the result to a new file.'}`,
        rows: previewOf(headers, rows),
        ...(options.save ? { output: await writeTable(target, [headers, ...rows], `-${action}`, options.format || ext).then(recordOutput) } : {}),
      };
    case 'export': {
      const format = String(options.format || (ext === 'xlsx' ? 'csv' : 'xlsx')).toLowerCase();
      if (!['csv', 'xlsx'].includes(format)) throw new ProcessError('Export as csv or xlsx.');
      const file = await writeTable(target, [headers, ...rows], description ? '-filtered' : '', format);
      return { message: `Exported ${rows.length} row(s)${description ? ` ${description}` : ''} to ${recordOutput(file)}.`, output: file };
    }
    default:
      throw new ProcessError('Spreadsheets support: stats, preview, filter, sort, export.');
  }
}
