#!/usr/bin/env node
/**
 * add-workflow-template.js — Add a node workflow template to Flovart
 *
 * Usage:
 *   node skills/flovart/scripts/add-workflow-template.js \
 *     --name "myTemplate" \
 *     --label "My Workflow" \
 *     --json '{"nodes":[...],"edges":[...]}'
 *
 * Or pipe JSON from stdin:
 *   cat template.json | node skills/flovart/scripts/add-workflow-template.js --name "myTemplate" --label "My Workflow"
 */

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
function getArg(flag) {
  const i = args.indexOf(flag);
  return i !== -1 && i + 1 < args.length ? args[i + 1] : null;
}

const name = getArg('--name');
const label = getArg('--label') || name;
let jsonStr = getArg('--json');

if (!name) {
  console.error('Usage: node add-workflow-template.js --name <exportName> [--label "Display Name"] [--json \'{"nodes":[],"edges":[]}\']');
  process.exit(1);
}

if (!/^[a-zA-Z][a-zA-Z0-9]*$/.test(name)) {
  console.error('Error: --name must be a valid JS identifier (e.g. "myTemplate")');
  process.exit(1);
}

// Read from stdin if no --json
if (!jsonStr) {
  try {
    jsonStr = fs.readFileSync(0, 'utf8');
  } catch {
    console.error('Error: provide --json or pipe JSON via stdin');
    process.exit(1);
  }
}

let template;
try {
  template = JSON.parse(jsonStr);
} catch (e) {
  console.error('Error: invalid JSON —', e.message);
  process.exit(1);
}

if (!Array.isArray(template.nodes) || !Array.isArray(template.edges)) {
  console.error('Error: JSON must have "nodes" and "edges" arrays');
  process.exit(1);
}

const ROOT = path.resolve(__dirname, '..', '..', '..');
const file = path.join(ROOT, 'components', 'nodeflow', 'templates.ts');
let src = fs.readFileSync(file, 'utf8');

if (src.includes(`export const ${name}`)) {
  console.log(`⏭️  Template '${name}' already exists`);
  process.exit(0);
}

// Generate TypeScript code
const nodesCode = template.nodes.map(n => {
  const config = n.config ? `, config: ${JSON.stringify(n.config)}` : '';
  return `    { id: '${n.id}', kind: '${n.kind}' as const, x: ${n.x || 0}, y: ${n.y || 0}${config} }`;
}).join(',\n');

const edgesCode = template.edges.map(e => {
  return `    { id: '${e.id}', fromNode: '${e.fromNode}', fromPort: '${e.fromPort}', toNode: '${e.toNode}', toPort: '${e.toPort}' }`;
}).join(',\n');

const block = `
// ${label}
export const ${name} = {
  nodes: [
${nodesCode},
  ],
  edges: [
${edgesCode},
  ],
};
`;

src += block;
fs.writeFileSync(file, src, 'utf8');

console.log(`✅ templates.ts: added '${name}' (${template.nodes.length} nodes, ${template.edges.length} edges)`);
console.log('\n🎉 Done! Run `npm run build` to verify.');
