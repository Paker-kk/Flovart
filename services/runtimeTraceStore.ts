import type {
  RuntimeJobRecord,
  RuntimeSessionRecord,
  RuntimeTraceSnapshot,
  TraceEventRecord,
} from '../types/runtimeTrace';

const MAX_TRACE_SESSIONS = 24;
const MAX_TRACE_JOBS = 64;
const MAX_TRACE_EVENTS = 400;

type RuntimeTraceListener = (snapshot: RuntimeTraceSnapshot) => void;

let state: RuntimeTraceSnapshot = {
  sessions: [],
  jobs: [],
  events: [],
};

let traceCounter = 0;
const listeners = new Set<RuntimeTraceListener>();

function nextTraceId(prefix: string): string {
  traceCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${traceCounter.toString(36)}`;
}

function cloneSnapshot(): RuntimeTraceSnapshot {
  return {
    sessions: [...state.sessions],
    jobs: [...state.jobs],
    events: [...state.events],
  };
}

function emitChange() {
  const snapshot = cloneSnapshot();
  for (const listener of listeners) {
    listener(snapshot);
  }
}

function upsertSession(nextSession: RuntimeSessionRecord) {
  state = {
    ...state,
    sessions: [
      nextSession,
      ...state.sessions.filter((session) => session.sessionId !== nextSession.sessionId),
    ].slice(0, MAX_TRACE_SESSIONS),
  };
}

function upsertJob(nextJob: RuntimeJobRecord) {
  state = {
    ...state,
    jobs: [
      nextJob,
      ...state.jobs.filter((job) => job.jobId !== nextJob.jobId),
    ].slice(0, MAX_TRACE_JOBS),
  };
}

export function resetRuntimeTraceStore() {
  state = {
    sessions: [],
    jobs: [],
    events: [],
  };
  traceCounter = 0;
  emitChange();
}

export function getRuntimeTraceSnapshot(): RuntimeTraceSnapshot {
  return cloneSnapshot();
}

export function subscribeRuntimeTrace(listener: RuntimeTraceListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function createRuntimeSession(
  input: Omit<RuntimeSessionRecord, 'sessionId' | 'createdAt' | 'lastActiveAt'> & {
    sessionId?: string;
  },
): RuntimeSessionRecord {
  const now = Date.now();
  const session: RuntimeSessionRecord = {
    sessionId: input.sessionId || nextTraceId('session'),
    name: input.name,
    source: input.source,
    createdAt: now,
    lastActiveAt: now,
    linkedBridge: input.linkedBridge,
    keyContext: input.keyContext,
  };
  upsertSession(session);
  emitChange();
  return session;
}

export function touchRuntimeSession(
  sessionId: string,
  patch: Partial<Omit<RuntimeSessionRecord, 'sessionId' | 'createdAt'>> = {},
): RuntimeSessionRecord | null {
  const existing = state.sessions.find((session) => session.sessionId === sessionId);
  if (!existing) return null;

  const nextSession: RuntimeSessionRecord = {
    ...existing,
    ...patch,
    lastActiveAt: patch.lastActiveAt ?? Date.now(),
  };
  upsertSession(nextSession);
  emitChange();
  return nextSession;
}

export function createRuntimeJob(
  input: Omit<RuntimeJobRecord, 'jobId' | 'createdAt' | 'updatedAt'> & {
    jobId?: string;
  },
): RuntimeJobRecord {
  const now = Date.now();
  const job: RuntimeJobRecord = {
    jobId: input.jobId || nextTraceId('job'),
    sessionId: input.sessionId,
    source: input.source,
    command: input.command,
    status: input.status,
    createdAt: now,
    updatedAt: now,
    inputSummary: input.inputSummary,
    outputRef: input.outputRef,
    error: input.error ?? null,
  };
  upsertJob(job);
  touchRuntimeSession(job.sessionId, { lastActiveAt: now });
  return job;
}

export function updateRuntimeJob(
  jobId: string,
  patch: Partial<Omit<RuntimeJobRecord, 'jobId' | 'sessionId' | 'source' | 'command' | 'createdAt'>>,
): RuntimeJobRecord | null {
  const existing = state.jobs.find((job) => job.jobId === jobId);
  if (!existing) return null;

  const now = Date.now();
  const nextJob: RuntimeJobRecord = {
    ...existing,
    ...patch,
    updatedAt: patch.updatedAt ?? now,
  };
  upsertJob(nextJob);
  touchRuntimeSession(nextJob.sessionId, { lastActiveAt: nextJob.updatedAt });
  emitChange();
  return nextJob;
}

export function appendTraceEvent(
  input: Omit<TraceEventRecord, 'id' | 'timestamp'> & { id?: string; timestamp?: number },
): TraceEventRecord {
  const event: TraceEventRecord = {
    id: input.id || nextTraceId('event'),
    sessionId: input.sessionId,
    jobId: input.jobId,
    nodeId: input.nodeId,
    level: input.level,
    stage: input.stage,
    message: input.message,
    timestamp: input.timestamp ?? Date.now(),
    meta: input.meta,
  };

  state = {
    ...state,
    events: [...state.events, event].slice(-MAX_TRACE_EVENTS),
  };

  touchRuntimeSession(event.sessionId, { lastActiveAt: event.timestamp });
  if (event.jobId) {
    updateRuntimeJob(event.jobId, { updatedAt: event.timestamp });
  } else {
    emitChange();
  }

  return event;
}

export function listRuntimeJobsForSession(sessionId: string): RuntimeJobRecord[] {
  return state.jobs.filter((job) => job.sessionId === sessionId);
}

export function listTraceEventsForJob(jobId: string): TraceEventRecord[] {
  return state.events.filter((event) => event.jobId === jobId);
}
