export const CREW_READ_COMMAND_NAMES = Object.freeze([
  'director.status',
  'crew.intent.get',
  'crew.receipt.get',
  'crew.event.watch',
]);

export const CREW_WRITE_COMMAND_NAMES = Object.freeze([
  'director.bind',
  'director.handoff',
  'director.unbind',
  'crew.intent.submit',
  'crew.intent.cancel',
]);

export const CREW_COMMAND_NAMES = Object.freeze([
  ...CREW_READ_COMMAND_NAMES,
  ...CREW_WRITE_COMMAND_NAMES,
]);

export const CREW_COMMANDS = new Set(CREW_COMMAND_NAMES);
export const CREW_WRITE_COMMANDS = new Set(CREW_WRITE_COMMAND_NAMES);
