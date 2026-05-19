import { helpDef } from './help.js';
import { statusDef } from './status.js';
import { providerDefs } from './provider.js';
import { canvasDefs } from './canvas.js';
import { assetDefs } from './asset.js';
import { generateDefs } from './generate.js';
import { videoDefs } from './video.js';
import { exportDefs } from './export.js';
import { serveDefs } from './serve.js';

const ALL_COMMANDS = {
  ...helpDef,
  ...statusDef,
  ...providerDefs,
  ...canvasDefs,
  ...assetDefs,
  ...generateDefs,
  ...videoDefs,
  ...exportDefs,
  ...serveDefs,
};

/** Get all command definitions */
export function getCommandDefs() {
  return ALL_COMMANDS;
}

/** Get a single command definition by name */
export function getCommandDef(name) {
  return ALL_COMMANDS[name] || null;
}

/** Get all command names */
export function getCommandNames() {
  return Object.keys(ALL_COMMANDS);
}
