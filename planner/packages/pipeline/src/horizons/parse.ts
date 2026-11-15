// AI-assisted: written with Claude (Anthropic). See docs/AI-USE.md.
import { invariant } from '@lsn/shared';

export interface HorizonsTable {
  /** Header cells, trimmed. Index 0 is the date column. */
  readonly columns: readonly string[];
  /** Data rows, cells trimmed, same length as `columns`. */
  readonly rows: readonly (readonly string[])[];
  /** `{source: ...}` tag of the first body line, e.g. "DE441". "unknown" if absent. */
  readonly source: string;
  readonly apiVersion: string;
  /** Horizons' own timestamp of the response, e.g. "Sat Nov 14 07:11:30 2026". Empty if absent. */
  readonly responseStamp: string;
}

export class HorizonsParseError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'HorizonsParseError';
  }
}

function splitCsvLine(line: string): string[] {
  const cells = line.split(',').map((c) => c.trim());
  // Horizons ends every CSV line with a comma, which yields one empty trailing cell.
  if (cells.length > 0 && cells[cells.length - 1] === '') {
    cells.pop();
  }
  return cells;
}

function isRule(line: string): boolean {
  return /^\*+$/.test(line.trim());
}

function findHeaderLine(lines: readonly string[], soeIndex: number): string {
  // Layout: rule, header, rule, $$SOE. Walk up over rules and blank lines.
  for (let i = soeIndex - 1; i >= 0 && soeIndex - i <= 4; i--) {
    const line = lines[i] ?? '';
    if (line.trim() !== '' && !isRule(line)) {
      return line;
    }
  }
  throw new HorizonsParseError('no header line before $$SOE');
}

/** Parse a Horizons observer table in CSV format. Throws HorizonsParseError on anything unexpected. */
export function parseHorizonsCsv(text: string): HorizonsTable {
  const lines = text.split(/\r?\n/);
  const soe = lines.findIndex((l) => l.startsWith('$$SOE'));
  const eoe = lines.findIndex((l) => l.startsWith('$$EOE'));
  if (soe < 0 || eoe < 0 || eoe <= soe) {
    const head = text.slice(0, 300).replace(/\s+/g, ' ');
    throw new HorizonsParseError(`no $$SOE/$$EOE block. Response began: ${head}`);
  }
  const columns = splitCsvLine(findHeaderLine(lines, soe));
  const rows: string[][] = [];
  for (let i = soe + 1; i < eoe; i++) {
    const cells = splitCsvLine(lines[i] ?? '');
    if (cells.length !== columns.length) {
      throw new HorizonsParseError(`row ${String(i - soe)} has ${String(cells.length)} cells, header has ${String(columns.length)}`);
    }
    rows.push(cells);
  }
  const sourceMatch = /\{source:\s*([^}]+?)\s*\}/.exec(text);
  const versionMatch = /API VERSION:\s*(\S+)/.exec(text);
  const stampMatch = /Ephemeris \/ API_USER\s+(.+?)\s+Pasadena/.exec(text);
  return {
    columns,
    rows,
    source: sourceMatch?.[1] ?? 'unknown',
    apiVersion: versionMatch?.[1] ?? 'unknown',
    responseStamp: stampMatch?.[1] ?? '',
  };
}

/** Index of the column whose trimmed header equals `name`. Throws if missing. */
export function columnIndex(table: HorizonsTable, name: string): number {
  const idx = table.columns.indexOf(name);
  invariant(idx >= 0, `Horizons column "${name}" not found. Columns: ${table.columns.join(' | ')}`);
  return idx;
}

/** Index of the first column whose header starts with `prefix`. Throws if missing. */
export function columnIndexByPrefix(table: HorizonsTable, prefix: string): number {
  const idx = table.columns.findIndex((c) => c.startsWith(prefix));
  invariant(idx >= 0, `Horizons column starting "${prefix}" not found. Columns: ${table.columns.join(' | ')}`);
  return idx;
}

/** Parse a numeric cell, failing loudly instead of producing NaN. */
export function numberCell(row: readonly string[], index: number, what: string): number {
  const raw = row[index];
  const value = raw === undefined ? Number.NaN : Number(raw);
  if (!Number.isFinite(value)) {
    throw new HorizonsParseError(`${what}: "${String(raw)}" is not a number`);
  }
  return value;
}
