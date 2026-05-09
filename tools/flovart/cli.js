#!/usr/bin/env node
import { executeFlovartCommand, formatValue, parseCliArgs, SETUP_TEXT } from './core.js';
import { FlovartRuntimeClient, createRuntimeFacade } from './runtime-client.js';
import { readFile } from 'node:fs/promises';

const argv = process.argv.slice(2);
const command = argv[0];
const args = parseCliArgs(argv.slice(1));

if (args.file) {
  try {
    const payload = JSON.parse(await readFile(args.file, 'utf8'));
    args.items = payload.items || payload;
  } catch (error) {
    console.error(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }, null, 2));
    process.exit(1);
  }
}

async function main() {
  if (!command) {
    console.log(JSON.stringify({ ok: true, usage: 'node tools/flovart/cli.js status --json' }, null, 2));
    return;
  }

  if (command === 'help' || command === 'setup') {
    const result = await executeFlovartCommand(command, args, {});
    console.log(args.json ? JSON.stringify(result, null, 2) : formatValue(result.text || result));
    return;
  }

  const client = new FlovartRuntimeClient();
  try {
    await client.connect();
    const runtime = createRuntimeFacade(client);
    const result = await executeFlovartCommand(command, args, runtime);
    console.log(JSON.stringify({ ok: true, command, result }, null, 2));
  } catch (error) {
    console.log(JSON.stringify({
      ok: false,
      command,
      error: error instanceof Error ? error.message : String(error),
      setup: SETUP_TEXT,
    }, null, 2));
    process.exitCode = 1;
  } finally {
    await client.disconnect();
  }
}

main().catch(error => {
  console.error(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }, null, 2));
  process.exit(1);
});
