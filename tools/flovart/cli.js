#!/usr/bin/env node
/**
 * Flovart CLI — OpenCLI-inspired deterministic CLI for AI agents and humans.
 *
 * Usage:
 *   node tools/flovart/cli.js status
 *   node tools/flovart/cli.js generate.image "a cat" --format table
 *   node tools/flovart/cli.js help
 *   node tools/flovart/cli.js --help
 *
 * Output formats: table (default), json, yaml, csv, md, plain
 */

import { readFile } from 'node:fs/promises';
import { executeFlovartCommand, parseCliArgs, COMMANDS, SETUP_TEXT } from './core.js';
import { FlovartRuntimeClient, createRuntimeFacade } from './runtime-client.js';
import { formatOutput, renderStatus } from './formatter.js';
import { getCommandDefs, getCommandDef, getCommandNames } from './commands/index.js';

// ─── Parse CLI args (enhanced) ─────────────────────────────────────────────

function parseArgs(argv) {
  const result = { _: [], format: 'table', color: true };
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith('--')) { result._.push(token); continue; }

    const raw = token.slice(2);
    const eq = raw.indexOf('=');
    if (eq >= 0) { result[raw.slice(0, eq)] = raw.slice(eq + 1); continue; }

    // Boolean flags
    if (raw === 'help' || raw === 'h') { result.help = true; continue; }
    if (raw === 'json') { result.format = 'json'; continue; }
    if (raw === 'yaml') { result.format = 'yaml'; continue; }
    if (raw === 'csv') { result.format = 'csv'; continue; }
    if (raw === 'md' || raw === 'markdown') { result.format = 'md'; continue; }
    if (raw === 'table') { result.format = 'table'; continue; }
    if (raw === 'plain') { result.format = 'plain'; continue; }
    if (raw === 'no-color' || raw === 'no-color') { result.color = false; continue; }

    // Named args with value
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('--')) {
      result[raw] = next;
      i++;
    } else {
      result[raw] = true;
    }
  }
  return result;
}

// ─── Auto-generated help ───────────────────────────────────────────────────

function generateHelp(commandDefs, color) {
  const lines = [];
  const _ = (s) => s; // placeholder for future i18n

  lines.push('');
  lines.push(color ? '\x1b[1mFlovart CLI v0.2.0\x1b[0m' : 'Flovart CLI v0.2.0');
  lines.push(color ? '\x1b[2mAI image/video design tool — CLI interface\x1b[0m' : 'AI image/video design tool — CLI interface');
  lines.push('');

  // Group by category
  const groups = {};
  for (const [name, def] of Object.entries(commandDefs)) {
    const cat = def.category || 'General';
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push({ name, ...def });
  }

  for (const [cat, cmds] of Object.entries(groups)) {
    lines.push(color ? '\x1b[36m' + cat + '\x1b[0m' : cat);
    for (const cmd of cmds) {
      const argsStr = cmd.args && cmd.args.length > 0
        ? cmd.args.map(a => a.required ? '<' + a.name + '>' : '[' + a.name + ']').join(' ')
        : '';
      const line = '  ' + (color ? '\x1b[32m' : '') + 'flovart ' + cmd.name + (color ? '\x1b[0m' : '') + ' ' + argsStr;
      const padLen = Math.max(1, 36 - stripAnsi(line).length);
      lines.push(line + ' '.repeat(padLen) + (color ? '\x1b[2m' : '') + (cmd.description || '') + (color ? '\x1b[0m' : ''));
    }
    lines.push('');
  }

  lines.push(color ? '\x1b[2mCommon options:\x1b[0m' : 'Common options:');
  lines.push('  --format <fmt>    Output: table, json, yaml, csv, md, plain  (default: table)');
  lines.push('  --json            Shorthand for --format json');
  lines.push('  --yaml            Shorthand for --format yaml');
  lines.push('  --no-color        Disable ANSI colors');
  lines.push('  --help, -h        Show this help');
  lines.push('');

  return lines.join('\n');
}

function stripAnsi(s) { return String(s).replace(/\x1b\[\d+m/g, ''); }

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
  const argv = process.argv.slice(2);
  const args = parseArgs(argv);
  const commandDefs = getCommandDefs();

  // ── Resolve command ────────────────────────────────────────────────────
  const rawCommand = args._.join('.');
  const command = rawCommand;

  const def = getCommandDef(command);

  // ── Command-specific help ──────────────────────────────────────────────
  if (args.help && def) {
    const line = 'Usage: flovart ' + def.name + ' ' +
      (def.args || []).map(a => a.required ? '<' + a.name + '>' : '[' + a.name + ']').join(' ');
    console.log(line);
    console.log('');
    if (def.description) console.log(def.description);
    console.log('');
    if (def.args && def.args.length > 0) {
      console.log('Arguments:');
      for (const a of def.args) {
        const req = a.required ? ' (required)' : '';
        const defVal = a.default !== undefined ? '  default: ' + a.default : '';
        console.log('  --' + a.name + ' <' + (a.type || 'str') + '>' + req);
        if (a.help) console.log('        ' + a.help + defVal);
        if (a.choices) console.log('        choices: ' + a.choices.join(', '));
      }
    }
    if (def.columns) {
      console.log('');
      console.log('Output columns: ' + def.columns.join(', '));
    }
    return;
  }

  // ── Show general help ──────────────────────────────────────────────────
  if (args.help || args._.length === 0 || args._[0] === 'help') {
    console.log(generateHelp(commandDefs, args.color));
    return;
  }

  if (!def) {
    console.error('\x1b[31mUnknown command:\x1b[0m ' + command);
    console.log('Run \x1b[32mnode tools/flovart/cli.js --help\x1b[0m for available commands.');
    process.exit(1);
  }

  // ── Extract command-specific args ──────────────────────────────────────
  const cmdArgs = {};
  if (def.args) {
    for (const a of def.args) {
      const key = a.name.replace(/-/g, '');
      const key2 = a.name;
      let val = args[key] !== undefined ? args[key] :
                args[key2] !== undefined ? args[key2] : a.default;

      // Type coercion
      if (val !== undefined && a.type) {
        if (a.type === 'int') val = parseInt(val, 10);
        else if (a.type === 'bool') val = val === 'true' || val === true;
        else if (a.type === 'float') val = parseFloat(val);
      }

      if (a.required && (val === undefined || val === '')) {
        console.error('\x1b[31mError: Missing required argument --' + a.name + '\x1b[0m');
        process.exit(1);
      }
      if (a.choices && val !== undefined && !a.choices.includes(val)) {
        console.error('\x1b[31mError: --' + a.name + ' must be one of: ' + a.choices.join(', ') + '\x1b[0m');
        process.exit(1);
      }

      cmdArgs[a.name] = val;
    }
  }

  const outputFormat = args.format || 'table';
  const useColor = args.color !== false;

  // ── File-based input ──────────────────────────────────────────────────
  if (args.file) {
    try {
      const payload = JSON.parse(await readFile(args.file, 'utf8'));
      cmdArgs.items = payload.items || payload;
    } catch (error) {
      console.error(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }));
      process.exit(1);
    }
  }

  // ── Execute command ────────────────────────────────────────────────────
  const noRuntimeCommands = ['help', 'setup'];
  const longRunningCommands = ['serve'];

  if (noRuntimeCommands.includes(command)) {
    const result = await executeFlovartCommand(command, cmdArgs, {});
    console.log(formatOutput(result, { format: outputFormat, columns: def.columns }));
    return;
  }

  // Long-running commands (serve, watch, etc.) manage their own lifecycle
  if (longRunningCommands.includes(command) || def.longRunning) {
    try {
      if (typeof def.execute === 'function') {
        await def.execute(cmdArgs, null);
      } else {
        await executeFlovartCommand(command, cmdArgs, null);
      }
    } catch (error) {
      console.error('\x1b[31mError:\x1b[0m', error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
    return;
  }

  // Commands with custom execute function (from commands/ definitions)
  if (typeof def.execute === 'function') {
    const client = new FlovartRuntimeClient();
    try {
      await client.connect();
      const runtime = createRuntimeFacade(client);
      const result = await def.execute(cmdArgs, runtime);
      console.log(formatOutput(result, { format: outputFormat, columns: def.columns }));
    } catch (error) {
      console.log(formatOutput(
        { ok: false, error: error instanceof Error ? error.message : String(error), setup: SETUP_TEXT },
        { format: outputFormat }
      ));
      process.exitCode = 1;
    } finally {
      await client.disconnect();
    }
    return;
  }

  // Legacy commands (from core.js) 
  const client = new FlovartRuntimeClient();
  try {
    await client.connect();
    const runtime = createRuntimeFacade(client);
    const result = await executeFlovartCommand(command, cmdArgs, runtime);
    console.log(formatOutput(result, { format: outputFormat, columns: def.columns }));
  } catch (error) {
    console.log(formatOutput(
      { ok: false, error: error instanceof Error ? error.message : String(error), setup: SETUP_TEXT },
      { format: outputFormat }
    ));
    process.exitCode = 1;
  } finally {
    await client.disconnect();
  }
}

main().catch(error => {
  console.error('\x1b[31mFatal:\x1b[0m', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
