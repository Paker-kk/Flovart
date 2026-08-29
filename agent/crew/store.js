import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { AGENT_DIR } from '../config.js';

const CREW_DIR = process.env.FLOVART_CREW_DIR
  ? path.resolve(process.env.FLOVART_CREW_DIR)
  : path.join(AGENT_DIR, 'crew');
const INTENTS_FILE = path.join(CREW_DIR, 'intents.json');
const RECEIPTS_FILE = path.join(CREW_DIR, 'receipts.json');
const BINDINGS_FILE = path.join(CREW_DIR, 'bindings.json');
const EVENTS_FILE = path.join(CREW_DIR, 'events.jsonl');
const META_FILE = path.join(CREW_DIR, 'meta.json');

const PENDING_STATUSES = new Set(['accepted', 'inspecting', 'planning', 'executing']);
const FINAL_STATUSES = new Set(['completed', 'partial', 'failed', 'waiting', 'cancelled']);
const EVENT_TYPES = new Set([
  'director.binding.changed',
  'crew.intent.accepted',
  'crew.intent.status_changed',
  'crew.tool.started',
  'crew.tool.finished',
  'workspace.changeset.updated',
  'crew.receipt.completed',
]);

function parseJsonFile(file, fallback) {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function atomicWrite(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp-${process.pid}-${crypto.randomUUID().slice(0, 8)}`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(temporary, file);
}

export class CrewStoreError extends Error {
  constructor(code, message, options = {}) {
    super(message);
    this.name = 'CrewStoreError';
    this.code = code;
    this.retryable = options.retryable ?? false;
  }
}

function crewError(code, message, options) {
  return new CrewStoreError(code, message, options);
}

export class CrewStore {
  constructor({ dir = CREW_DIR } = {}) {
    this.dir = dir;
    this.intentsFile = path.join(dir, 'intents.json');
    this.receiptsFile = path.join(dir, 'receipts.json');
    this.bindingsFile = path.join(dir, 'bindings.json');
    this.eventsFile = path.join(dir, 'events.jsonl');
    this.metaFile = path.join(dir, 'meta.json');
  }

  newId(prefix) {
    return `${prefix}_${crypto.randomUUID()}`;
  }

  // ---- intents ----

  saveIntent(intent) {
    const intents = parseJsonFile(this.intentsFile, {});
    intents[intent.intentId] = { ...intents[intent.intentId], ...intent, updatedAt: new Date().toISOString() };
    atomicWrite(this.intentsFile, intents);
  }

  getIntent(intentId) {
    return parseJsonFile(this.intentsFile, {})[intentId] || null;
  }

  findIntentByKey(idempotencyKey) {
    return Object.values(parseJsonFile(this.intentsFile, {})).find(intent => intent.idempotencyKey === idempotencyKey) || null;
  }

  listIntents({ status } = {}) {
    return Object.values(parseJsonFile(this.intentsFile, {})).filter(intent => !status || intent.status === status);
  }

  // ---- receipts ----

  saveReceipt(receipt) {
    const receipts = parseJsonFile(this.receiptsFile, {});
    receipts[receipt.intentId] = { ...receipt, updatedAt: new Date().toISOString() };
    atomicWrite(this.receiptsFile, receipts);
  }

  getReceipt(intentId) {
    return parseJsonFile(this.receiptsFile, {})[intentId] || null;
  }

  // ---- director bindings ----

  saveBinding(binding) {
    const bindings = parseJsonFile(this.bindingsFile, {});
    bindings[binding.bindingId] = {
      ...bindings[binding.bindingId],
      ...binding,
      updatedAt: new Date().toISOString(),
    };
    atomicWrite(this.bindingsFile, bindings);
  }

  archiveBinding(bindingId, reason = 'director-unbind') {
    const bindings = parseJsonFile(this.bindingsFile, {});
    const binding = bindings[bindingId];
    if (!binding) throw crewError('NOT_FOUND', `Director Binding 不存在：${bindingId}`);
    if (reason === 'director-unbind') binding.state = 'archived';
    else binding.state = 'archived';
    binding.archivedReason = reason;
    binding.archivedAt = new Date().toISOString();
    binding.updatedAt = new Date().toISOString();
    atomicWrite(this.bindingsFile, bindings);
    return binding;
  }

  handoffBinding({ expectedBindingId, binding, at = new Date().toISOString() }) {
    const bindings = parseJsonFile(this.bindingsFile, {});
    const activeForProject = Object.values(bindings).find(item =>
      item.state === 'active' && item.productionSessionId === binding.productionSessionId) || null;
    if ((activeForProject?.bindingId || null) !== (expectedBindingId || null)) {
      throw crewError('BINDING_CHANGED', 'Director 绑定状态已变化，请刷新后重新确认。', { retryable: false });
    }
    const archived = Object.values(bindings).filter(item => item.state === 'active' && (
      item.productionSessionId === binding.productionSessionId
      || (item.hostKind === binding.hostKind && item.externalSessionId === binding.externalSessionId)
    ));
    for (const previous of archived) {
      bindings[previous.bindingId] = {
        ...previous,
        state: 'archived',
        archivedReason: 'director-handoff',
        archivedAt: at,
        updatedAt: at,
      };
    }
    bindings[binding.bindingId] = { ...binding, updatedAt: at };
    atomicWrite(this.bindingsFile, bindings);
    return { binding: bindings[binding.bindingId], archived: archived.map(item => bindings[item.bindingId]) };
  }

  getBinding(bindingId) {
    return parseJsonFile(this.bindingsFile, {})[bindingId] || null;
  }

  getActiveBinding({ projectId, externalSessionId, hostKind } = {}) {
    return Object.values(parseJsonFile(this.bindingsFile, {}))
      .find(binding =>
        binding.state === 'active'
        && (!projectId || binding.productionSessionId === projectId)
        && (!externalSessionId || binding.externalSessionId === externalSessionId)
        && (!hostKind || binding.hostKind === hostKind))
      || null;
  }

  listBindings() {
    return Object.values(parseJsonFile(this.bindingsFile, {})).sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  }

  // ---- events ----

  appendEvent(type, data, entity = null) {
    if (!EVENT_TYPES.has(type)) throw crewError('INVALID_ARGUMENT', `未知 Crew 事件类型：${type}`);
    const meta = parseJsonFile(this.metaFile, { nextEventId: 0 });
    const event = {
      eventId: meta.nextEventId + 1,
      eventVersion: '1',
      eventType: type,
      occurredAt: Date.now(),
      entity,
      data,
    };
    fs.mkdirSync(this.dir, { recursive: true });
    fs.appendFileSync(this.eventsFile, `${JSON.stringify(event)}\n`, 'utf8');
    atomicWrite(this.metaFile, { ...meta, nextEventId: event.eventId });
    return event;
  }

  listEvents({ afterEventId = 0, limit = 100 } = {}) {
    const after = Number.isInteger(afterEventId) ? afterEventId : 0;
    const capped = Math.max(1, Math.min(Number(limit) || 100, 1000));
    let nextEventId = after;
    const events = [];
    try {
      const lines = fs.readFileSync(this.eventsFile, 'utf8').split(/\r?\n/).filter(Boolean);
      for (const line of lines) {
        const event = JSON.parse(line);
        nextEventId = Math.max(nextEventId, event.eventId);
        if (event.eventId > after && events.length < capped) events.push(event);
      }
    } catch {
      return { events: [], nextEventId: after };
    }
    return {
      events,
      nextEventId,
      hasMore: nextEventId > after && events.length === capped,
    };
  }

  // ---- restart recovery ----

  recoverAfterRestart() {
    const intents = parseJsonFile(this.intentsFile, {});
    const receipts = parseJsonFile(this.receiptsFile, {});
    const interrupted = [];
    for (const intent of Object.values(intents)) {
      if (!PENDING_STATUSES.has(intent.status)) continue;
      const previous = intent.status;
      intent.status = 'interrupted';
      intent.updatedAt = new Date().toISOString();
      intents[intent.intentId] = intent;
      const receipt = {
        intentId: intent.intentId,
        status: 'interrupted',
        commands: receipts[intent.intentId]?.commands || [],
        usage: receipts[intent.intentId]?.usage || { steps: 0, reads: 0 },
        eventCursor: receipts[intent.intentId]?.eventCursor || 0,
        waiting: {
          reason: 'RESTART_INTERRUPTED',
          objectIds: [],
        },
        completedAt: new Date().toISOString(),
      };
      receipts[intent.intentId] = receipt;
      interrupted.push({ intentId: intent.intentId, fromStatus: previous });
    }
    if (interrupted.length) {
      atomicWrite(this.intentsFile, intents);
      atomicWrite(this.receiptsFile, receipts);
    }
    return interrupted;
  }
}

export function isPendingIntentStatus(status) {
  return PENDING_STATUSES.has(status);
}

export function isFinalIntentStatus(status) {
  return FINAL_STATUSES.has(status);
}
