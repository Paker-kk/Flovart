import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CANONICAL_COMMAND_REGISTRY } from '../tools/flovart/registry.js';
import { SKILL_COMMAND_NAMES } from '../tools/flovart/skill-commands.js';

const stableAgentSurface = [
  'status',
  'workflow.inspect',
  'workflow.selection.get',
  'workflow.apply',
  'workflow.node.run',
];

const skillProjectionPaths = [
  '.agents/skills/flovart/SKILL.md',
  'tools/flovart/skill/SKILL.md',
  'skills/flovart/SKILL.md',
];

const releaseDocPaths = [
  'README.md',
  'README.en.md',
  'docs/overview/quick-start.md',
  'docs/overview/quick-start.en.md',
  'docs/overview/skill-guide.md',
  'docs/content/docs/overview/features.mdx',
  'docs/content/docs/overview/features.en.mdx',
  'docs/design/agent/README.md',
  '.agents/skills/flovart/SKILL.md',
  'tools/flovart/skill/SKILL.md',
  'skills/flovart/SKILL.md',
  'skills/flovart/scripts/install.md',
];

const compatibilityMarker = /legacy|compatib|diagnos|debug|兼容|诊断|调试|旧路径|迁移|仅用于|only for/i;
const pseudoCliCommands = new Set(['install', 'start', 'update']);
const commandInvocation = /(?:npx\s+flovart-cli|npm\s+run\s+flovart:cli\s+--|flovart-cli)\s+([a-z][a-z0-9]*(?:[.-][a-z0-9]+)*)/gi;
const schemaCommand = /--command\s+([a-z][a-z0-9]*(?:[.-][a-z0-9]+)*)/gi;

function commandDocs(rootDir) {
  const directory = path.join(rootDir, 'skills/flovart/commands');
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory)
    .filter(name => name.endsWith('.md'))
    .sort()
    .map(name => path.join('skills/flovart/commands', name));
}

function readDocs(rootDir, relativePaths, errors) {
  return relativePaths.map(relativePath => {
    const absolutePath = path.join(rootDir, relativePath);
    if (!fs.existsSync(absolutePath)) {
      errors.push(`${relativePath}: documented release surface file is missing`);
      return { relativePath, text: '' };
    }
    return { relativePath, text: fs.readFileSync(absolutePath, 'utf8') };
  });
}

function mentionedCommands(text) {
  const commands = new Set();
  for (const match of text.matchAll(commandInvocation)) commands.add(match[1].toLowerCase());
  for (const match of text.matchAll(schemaCommand)) commands.add(match[1].toLowerCase());
  return [...commands];
}

export function checkDocsContract({ rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..') } = {}) {
  const errors = [];
  const docs = readDocs(rootDir, [...releaseDocPaths, ...commandDocs(rootDir)], errors);

  for (const { relativePath, text } of docs) {
    for (const command of mentionedCommands(text)) {
      if (command.startsWith('<') || pseudoCliCommands.has(command) || command === 'tui' || SKILL_COMMAND_NAMES.has(command)) continue;
      const definition = CANONICAL_COMMAND_REGISTRY[command];
      if (!definition) {
        errors.push(`${relativePath}: command ${command} is not in the canonical registry`);
        continue;
      }
      if (definition.availability === 'legacy-only' && !compatibilityMarker.test(text)) {
        errors.push(`${relativePath}: legacy-only command ${command} needs a compatibility/diagnostic marker`);
      }
    }
  }

  for (const relativePath of releaseDocPaths) {
    const text = docs.find(doc => doc.relativePath === relativePath)?.text || '';
    if (mentionedCommands(text).some(command => command === 'command.list' || command === 'command.schema') && !compatibilityMarker.test(text)) {
      errors.push(`${relativePath}: command.list/schema must be described as bootstrap, compatibility, diagnostic, or debug only`);
    }
    for (const [pattern, label] of [
      [/\binit\s+--host\b/i, 'init --host'],
      [/\bcanvas\.inspect\b/i, 'canvas.inspect'],
      [/\.flovart[\\/]command-queue\.json/i, 'file command queue'],
    ]) {
      if (pattern.test(text)) errors.push(`${relativePath}: removed path ${label} is still documented`);
    }
  }

  for (const relativePath of skillProjectionPaths) {
    const text = docs.find(doc => doc.relativePath === relativePath)?.text || '';
    for (const command of stableAgentSurface) {
      if (!text.includes(`\`${command}\``)) errors.push(`${relativePath}: stable Agent command ${command} is missing`);
    }
  }

  const canonicalSkill = fs.existsSync(path.join(rootDir, skillProjectionPaths[0]))
    ? fs.readFileSync(path.join(rootDir, skillProjectionPaths[0]), 'utf8') : '';
  for (const relativePath of skillProjectionPaths.slice(1)) {
    const projection = fs.existsSync(path.join(rootDir, relativePath))
      ? fs.readFileSync(path.join(rootDir, relativePath), 'utf8') : '';
    if (projection !== canonicalSkill) errors.push(`${relativePath} has drifted from ${skillProjectionPaths[0]}`);
  }

  return { errors, files: docs.map(doc => doc.relativePath) };
}

function main() {
  const result = checkDocsContract();
  if (result.errors.length) {
    console.error(result.errors.map(error => `- ${error}`).join('\n'));
    process.exitCode = 1;
    return;
  }
  console.log(`Docs contract OK: ${result.files.length} files checked.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
