#!/usr/bin/env node
/**
 * Flovart CLI Output Formatter
 * Inspired by OpenCLI's output system.
 * Supports: table, json, yaml, csv, md (markdown), plain
 */

const ANSI = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  cyan: '\x1b[36m', green: '\x1b[32m', yellow: '\x1b[33m',
  red: '\x1b[31m', gray: '\x1b[90m',
};

function stripAnsi(s) { return String(s).replace(/\x1b\[\d+m/g, ''); }

function toRows(data, columns) {
  if (!data) return [];
  const arr = Array.isArray(data) ? data : [data];
  let cols = columns;
  if (!cols || cols.length === 0) {
    if (arr.length === 0) return [];
    const first = typeof arr[0] === 'object' ? arr[0] : { value: arr[0] };
    cols = Object.keys(first);
  }
  return arr.map(item => {
    const row = {};
    for (const col of cols) {
      const val = item[col] !== undefined ? item[col] : item;
      row[col] = typeof val === 'object' ? JSON.stringify(val) : String(val ?? '');
    }
    return row;
  });
}

function renderTable(data, columns) {
  if (!data) return '(no data)';
  const arr = Array.isArray(data) ? data : [data];
  if (arr.length === 0) return '(no data)';
  const headers = columns || Object.keys(arr[0]);
  const rows = toRows(data, headers);
  const widths = headers.map(h => Math.max(stripAnsi(h).length, ...rows.map(r => stripAnsi(String(r[h] ?? '')).length)));
  const sep = (l, m, r) => l + widths.map(w => '\u2500'.repeat(w + 2)).join(m) + r;
  const out = [];
  out.push(sep('\u250c', '\u252c', '\u2510'));
  out.push('\u2502 ' + headers.map((h, i) => h.padEnd(widths[i])).join(' \u2502 ') + ' \u2502');
  out.push(sep('\u251c', '\u253c', '\u2524'));
  for (const row of rows) {
    out.push('\u2502 ' + headers.map((h, i) => String(row[h] ?? '').padEnd(widths[i])).join(' \u2502 ') + ' \u2502');
  }
  out.push(sep('\u2514', '\u2534', '\u2518'));
  return out.join('\n');
}

function renderMdTable(data, columns) {
  if (!data) return '(no data)';
  const arr = Array.isArray(data) ? data : [data];
  if (arr.length === 0) return '(no data)';
  const headers = columns || Object.keys(data[0]);
  const rows = toRows(data, headers);
  const widths = headers.map(h => Math.max(h.length, ...rows.map(r => String(r[h] ?? '').length)));
  const out = [];
  out.push('| ' + headers.map((h, i) => h.padEnd(widths[i])).join(' | ') + ' |');
  out.push('| ' + widths.map(w => '-'.repeat(w + 2)).join('|') + '|');
  for (const row of rows) {
    out.push('| ' + headers.map((h, i) => String(row[h] ?? '').padEnd(widths[i])).join(' | ') + ' |');
  }
  return out.join('\n');
}

function renderCsv(data, columns) {
  if (!data) return '(no data)';
  const arr = Array.isArray(data) ? data : [data];
  if (arr.length === 0) return '(no data)';
  const headers = columns || Object.keys(data[0]);
  const rows = toRows(data, headers);
  const esc = v => '"' + String(v).replace(/"/g, '""') + '"';
  const out = [headers.map(esc).join(',')];
  for (const row of rows) out.push(headers.map(h => esc(row[h] ?? '')).join(','));
  return out.join('\n');
}

function renderPlain(data, columns) {
  if (!data) return '(no data)';
  if (typeof data === 'string') return data;
  if (typeof data === 'number' || typeof data === 'boolean') return String(data);
  if (Array.isArray(data)) {
    if (columns && columns.length > 0) {
      return data.map((item, i) => `[${i+1}] ` + columns.map(c => `${c}: ${item[c]??''}`).join(', ')).join('\n');
    }
    return data.map((item, i) => `[${i+1}] ${JSON.stringify(item)}`).join('\n');
  }
  return JSON.stringify(data, null, 2);
}

function simpleYaml(data, indent) {
  indent = indent || 0;
  const pad = '  '.repeat(indent);
  if (data === null || data === undefined) return 'null';
  if (typeof data === 'string') { return /[\n]/.test(data) || data.length > 60 ? '|-\n' + pad + '  ' + data.split('\n').join('\n' + pad + '  ') : data; }
  if (typeof data === 'number' || typeof data === 'boolean') return String(data);
  if (Array.isArray(data)) {
    if (data.length === 0) return '[]';
    return data.map(item => {
      if (typeof item === 'object' && item !== null) {
        const lines = simpleYaml(item, indent + 1).split('\n');
        return '- ' + lines[0] + '\n' + lines.slice(1).map(l => pad + '  ' + l).join('\n');
      }
      return '- ' + simpleYaml(item, indent);
    }).join('\n');
  }
  if (typeof data === 'object') {
    const keys = Object.keys(data);
    if (keys.length === 0) return '{}';
    return keys.map(key => {
      const val = data[key];
      if (typeof val === 'object' && val !== null) {
        return key + ':\n' + pad + '  ' + simpleYaml(val, indent + 1).split('\n').join('\n' + pad + '  ');
      }
      return key + ': ' + simpleYaml(val, indent);
    }).join('\n');
  }
  return String(data);
}

function renderError(error) { return '\x1b[31mError: ' + String(error) + '\x1b[0m'; }

/**
 * Format data for CLI output.
 * @param {any} data
 * @param {object} opts
 * @param {string} [opts.format='table'] - table/json/yaml/csv/md/plain
 * @param {string[]} [opts.columns]
 * @param {number} [opts.jsonIndent=2]
 */
export function formatOutput(data, opts) {
  opts = opts || {};
  const fmt = opts.format || 'table';
  const cols = opts.columns;
  const indent = opts.jsonIndent || 2;

  if (data && typeof data === 'object' && data.ok === false) {
    return renderError(data.error || data.message || 'Unknown error');
  }

  let display = data;
  if (data && typeof data === 'object' && data.ok === true && 'result' in data) display = data.result;

  if (fmt === 'json') return JSON.stringify(display, null, indent);
  if (fmt === 'yaml') return simpleYaml(display);
  if (fmt === 'csv') return renderCsv(display, cols);
  if (fmt === 'md') return renderMdTable(display, cols);
  if (fmt === 'plain') return renderPlain(display, cols);
  return renderTable(display, cols);
}

/** Show status symbol ✓/✗ */
export function renderStatus(ok) { return ok ? '\x1b[32m\u2713\x1b[0m' : '\x1b[31m\u2717\x1b[0m'; }

export default { formatOutput, renderStatus, renderError, simpleYaml };
