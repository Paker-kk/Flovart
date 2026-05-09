#!/usr/bin/env node
import { planFlovartInput, createLine, formatValue } from './core.js';
import { FlovartRuntimeClient, createRuntimeFacade } from './runtime-client.js';

const args = process.argv.slice(2);
const input = args.join(' ');

async function main() {
  if (!input) {
    console.log(formatValue({ ok: true, usage: 'node tools/flovart/cli.js "帮我画一个猫咪吃汉堡的"' }));
    process.exit(0);
  }

  const plan = planFlovartInput(input);
  if (!plan) {
    console.log(formatValue({ ok: false, error: 'empty input' }));
    process.exit(1);
  }

  const transcript = [];
  const emit = (kind, content, meta) => {
    transcript.push(createLine(kind, content, meta));
  };

  const trimmed = input.trim();
  const useExternal = !/^help|setup$/i.test(trimmed);
  let runtime = {};
  const ctx = { sessionId: null, isDark: false };

  emit('input', input);
  emit('output', `Plan:\n${plan.steps.map((step, index) => `${index + 1}. ${step}`).join('\n')}`);

  if (useExternal) {
    const client = new FlovartRuntimeClient();
    try {
      await client.connect();
      runtime = createRuntimeFacade(client);
      const result = await plan.run({ runtime, emit, ctx });
      emit('output', formatValue(result));
      console.log(JSON.stringify({ ok: true, transcript, result }, null, 2));
    } catch (error) {
      emit('error', error instanceof Error ? error.message : String(error));
      console.log(JSON.stringify({ ok: false, transcript }, null, 2));
      process.exitCode = 1;
    } finally {
      await client.disconnect();
    }
    return;
  }

  const result = await plan.run({ runtime, emit, ctx });
  emit('output', formatValue(result));
  console.log(JSON.stringify({ ok: true, transcript, result }, null, 2));
}

main().catch(error => {
  console.error(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }, null, 2));
  process.exit(1);
});
