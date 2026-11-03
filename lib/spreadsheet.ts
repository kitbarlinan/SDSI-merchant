/**
 * Reads an Excel (.xlsx) or CSV file in the browser and turns it into rows keyed by column name.
 * Nothing is uploaded: the file is read here, then the typed rows are sent to the rules.
 */

export type Cell = string | number | boolean | Date | null | undefined;

const pad = (n: number) => String(n).padStart(2, '0');
const cellText = (cell: Cell): string => {
  if (cell === null || cell === undefined) return '';
  // The reader gives an Excel date as midnight UTC, so read it in UTC: the same day in every time zone.
  if (cell instanceof Date) return `${cell.getUTCFullYear()}-${pad(cell.getUTCMonth() + 1)}-${pad(cell.getUTCDate())}`;
  return String(cell).trim();
};

/** CSV with quoted fields, doubled quotes and either line ending. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const source = text.replace(/^﻿/, '');
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if (quoted) {
      if (ch === '"' && source[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && source[i + 1] === '\n') i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.map((cells) => cells.map((cell) => cell.trim()));
}

export async function readSheetFile(file: File): Promise<string[][]> {
  const name = file.name.toLowerCase();
  if (file.size > 5_000_000) throw new Error('That file is too big. Upload up to 5 MB.');
  if (name.endsWith('.csv') || name.endsWith('.txt')) return parseCsv(await file.text());
  if (name.endsWith('.xls')) throw new Error('Old .xls files are not supported. In Excel choose Save As → Excel Workbook (.xlsx), then upload that.');
  if (!name.endsWith('.xlsx')) throw new Error('Upload an Excel file (.xlsx) or a .csv file.');
  const { default: readXlsxFile } = await import('read-excel-file');
  const rows = (await readXlsxFile(file)) as Cell[][];
  return rows.map((cells) => cells.map(cellText));
}

export interface Column {
  key: string;
  label: string;
  required?: boolean;
  /** Header spellings that mean this column, already reduced to capital letters and digits. */
  aliases: string[];
}

const reduce = (header: string) => header.toUpperCase().replace(/[^A-Z0-9]/g, '');

export interface SheetRead {
  /** Spreadsheet row number (1 = the header row's own number) and the cell texts by column key. */
  rows: ({ row: number } & Record<string, string>)[];
  problem: string | null;
}

/** Finds the header row (the first of the top 10 rows that names at least two columns), then reads the rows below it. */
export function readColumns(sheet: string[][], columns: Column[]): SheetRead {
  const headerAt = sheet.slice(0, 10).findIndex((cells) => cells.filter((cell) => columns.some((col) => col.aliases.includes(reduce(cell)))).length >= 2);
  const example = columns.map((col) => col.label).join(' / ');
  if (headerAt < 0) return { rows: [], problem: `Could not find the header row. The first row should say: ${example}.` };
  const index = new Map<string, number>();
  sheet[headerAt].forEach((cell, at) => {
    const col = columns.find((candidate) => candidate.aliases.includes(reduce(cell)) && !index.has(candidate.key));
    if (col) index.set(col.key, at);
  });
  const missing = columns.filter((col) => col.required && !index.has(col.key));
  if (missing.length > 0) return { rows: [], problem: `Missing column: ${missing.map((col) => col.label).join(', ')}. The first row should say: ${example}.` };
  const rows: SheetRead['rows'] = [];
  sheet.slice(headerAt + 1).forEach((cells, offset) => {
    if (cells.every((cell) => cell === '')) return;
    const record: { row: number } & Record<string, string> = { row: headerAt + offset + 2 } as never;
    for (const col of columns) record[col.key] = index.has(col.key) ? (cells[index.get(col.key)!] ?? '') : '';
    rows.push(record);
  });
  return { rows, problem: null };
}

export const PRODUCT_COLUMNS: Column[] = [
  { key: 'code', label: 'INV CODE', required: true, aliases: ['INVCODE', 'INVENTORYCODE', 'CODE', 'PRODUCTCODE', 'INV'] },
  { key: 'name', label: 'PRODUCT NAME', required: true, aliases: ['PRODUCTNAME', 'PRODUCT', 'NAME', 'DESCRIPTION', 'ITEM'] },
  { key: 'srp', label: 'SRP', required: true, aliases: ['SRP', 'NETSRP', 'MERCHANTSRP', 'PRICE'] },
  { key: 'expiry', label: 'EXPIRY', aliases: ['EXPIRY', 'EXPIRYDATE', 'EXP', 'EXPIRATION', 'EXPIRATIONDATE'] },
  { key: 'supplier', label: 'SUPPLIER', aliases: ['SUPPLIER', 'VENDOR', 'SUPPLIERNAME'] },
  { key: 'category', label: 'CATEGORY', aliases: ['CATEGORY', 'TYPE', 'CLASS'] },
];

export const SKU_COLUMNS: Column[] = [
  { key: 'sku', label: 'SKU CODE', required: true, aliases: ['SKUCODE', 'SKU'] },
  { key: 'bundleName', label: 'BUNDLE NAME', aliases: ['BUNDLENAME', 'BUNDLE', 'SKUNAME', 'PACKAGENAME'] },
  { key: 'product', label: 'PRODUCT', required: true, aliases: ['PRODUCT', 'PRODUCTNAME', 'ITEM', 'INVCODE', 'INVENTORYCODE'] },
  { key: 'qty', label: 'QTY', required: true, aliases: ['QTY', 'QUANTITY'] },
  { key: 'free', label: 'FREE', aliases: ['FREE', 'FREEQTY', 'FREEPCS'] },
  { key: 'category', label: 'CATEGORY', aliases: ['CATEGORY'] },
];

/** Hands a small CSV to the browser as a download. Excel opens it directly. */
export function downloadCsv(filename: string, rows: string[][]) {
  const text = rows.map((cells) => cells.map((cell) => (/[",\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell)).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['﻿', text], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
