import { importFlovartModule } from '../flovart-modules.js';

const contractsModule = () => importFlovartModule('contracts');
const registryModule = () => importFlovartModule('registry');
const { validateRuntimeContract } = await contractsModule();
const { getCanonicalRegistry } = await registryModule();
import { isFinalIntentStatus, isPendingIntentStatus } from './store.js';
import { normalizeCrewIntent, parseCrewIntentJson, runWorkspaceOperator } from './operator.js';

// Internal Runtime binding values are deliberately separate from public Agent Identity
// and Distribution Target values. The adapter maps identities before this service runs.
const DIRECTOR_RUNTIME_HOST_KINDS = new Set(['codex', 'deepseek', 'claude', 'opencode', 'pi']);
const ACTIVE_BINDING_GUARD = '同一 ProductionSession 已绑定其他外部 Session；请先显式 Director Handoff。';

export class CrewServiceError extends Error {
  constructor(code, message, options = {}) {
    super(message);
    this.name = 'CrewServiceError';
    this.code = code;
    this.retryable = options.retryable ?? false;
    this.details = options.details ?? null;
  }

  toJSON() {
    return {
      code: this.code,
      message: this.message,
      retryable: this.retryable,
      details: this.details,
      actionUrl: null,
    };
  }
}

function crewError(code, message, options) {
  return new CrewServiceError(code, message, options);
}

/** 把 Intent 提交流校验成结构契约；缺字段直接拒绝，不靠模型猜测。 */
function validateSubmittedIntent(payload, projectId) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw crewError('INVALID_ARGUMENT', 'Intent 必须是对象。', { retryable: false });
  }
  const scope = payload.scope && typeof payload.scope === 'object' ? payload.scope : {};
  const constraints = payload.constraints && typeof payload.constraints === 'object' ? payload.constraints : {};
  if (!String(payload.goal || '').trim()) throw crewError('INVALID_ARGUMENT', 'Intent 缺少可验证目标 goal。', { retryable: false });
  if (!String(projectId || scope.projectId || '').trim()) throw crewError('INVALID_ARGUMENT', 'Intent 缺少 projectId。', { retryable: false });
  if (scope.workspace && scope.workspace !== 'workflow') throw crewError('INVALID_ARGUMENT', `不支持的意图工作区：${scope.workspace}`, { retryable: false });
  if (!constraints.maxSideEffect) throw crewError('INVALID_ARGUMENT', 'Intent 缺少最大副作用等级 constraints.maxSideEffect。', { retryable: false });
  return { ...payload, scope: { workspace: 'workflow', ...scope, projectId: scope.projectId || projectId }, constraints };
}

/** payload 规范化哈希：同一 idempotencyKey + 不同 payload 返回冲突。 */
function payloadFingerprint(payload) {
  return JSON.stringify({
    goal: payload.goal,
    scope: payload.scope,
    constraints: payload.constraints,
    completion: payload.completion || null,
  });
}

/** 持久化 Intent 的提交原文（旧记录没有 submission 时回退到顶层字段）。 */
function submissionOf(intent) {
  return intent?.submission || {
    goal: intent?.goal,
    scope: intent?.scope,
    constraints: intent?.constraints,
    completion: intent?.completion || null,
  };
}

export class CrewService {
  constructor({ store, callCommand, now = () => new Date(), registry = getCanonicalRegistry() }) {
    this.store = store;
    this.callCommand = callCommand;
    this.now = now;
    this.registry = registry;
    this.running = new Map();
  }

  protocol() {
    return {
      protocolVersion: this.registry.protocolVersion,
      registryHash: this.registry.registryHash,
      capabilities: ['command', 'events', 'crew-intent'],
      limits: { maxPayloadBytes: 1024 * 1024, eventRetention: 10000, activeIntents: 32 },
    };
  }

  /** 启动时：把未完成的持久 Intent 明确标记 interrupted，不假装仍在推理。 */
  recoverAfterRestart() {
    return this.store.recoverAfterRestart();
  }

  // ---- director binding ----

  bindDirector({ hostKind, sessionId, hostInstanceId, projectId }) {
    if (!DIRECTOR_RUNTIME_HOST_KINDS.has(String(hostKind || ''))) {
      throw crewError('INVALID_ARGUMENT', `不支持的 Director Runtime Binding：${hostKind}`, { retryable: false });
    }
    if (!String(sessionId || '').trim()) throw crewError('INVALID_ARGUMENT', '缺少外部 Session ID。', { retryable: false });
    const resolvedProject = String(projectId || 'default').trim() || 'default';
    const existing = this.store.getActiveBinding({ projectId: resolvedProject });
    if (existing && existing.externalSessionId !== sessionId) {
      const conflict = crewError('BINDING_CONFLICT', ACTIVE_BINDING_GUARD, { retryable: false });
      conflict.details = { activeBindingId: existing.bindingId, activeSessionId: existing.externalSessionId };
      throw conflict;
    }
    const sessionBinding = this.store.getActiveBinding({ externalSessionId: String(sessionId), hostKind: String(hostKind) });
    if (sessionBinding && sessionBinding.productionSessionId !== resolvedProject) {
      const conflict = crewError('BINDING_CONFLICT', ACTIVE_BINDING_GUARD, { retryable: false });
      conflict.details = {
        activeBindingId: sessionBinding.bindingId,
        activeSessionId: sessionBinding.externalSessionId,
        activeProjectId: sessionBinding.productionSessionId,
      };
      throw conflict;
    }
    if (existing) {
      this.store.saveBinding({ ...existing, lastSeenAt: this.now().toISOString() });
      const binding = this.store.getBinding(existing.bindingId);
      this.store.appendEvent('director.binding.changed', { bindingId: binding.bindingId, state: binding.state, hostKind: binding.hostKind }, { type: 'binding', id: binding.bindingId });
      return binding;
    }
    const binding = {
      bindingId: this.store.newId('binding'),
      productionSessionId: resolvedProject,
      hostKind: String(hostKind),
      externalSessionId: String(sessionId).slice(0, 500),
      ...(hostInstanceId ? { hostInstanceId: String(hostInstanceId).slice(0, 200) } : {}),
      capabilities: ['command', 'events', 'crew-intent'],
      state: 'active',
      createdAt: this.now().toISOString(),
      lastSeenAt: this.now().toISOString(),
    };
    this.store.saveBinding(binding);
    this.store.appendEvent('director.binding.changed', { bindingId: binding.bindingId, state: 'active', hostKind: binding.hostKind }, { type: 'binding', id: binding.bindingId });
    return binding;
  }

  directorStatus({ projectId, sessionId, hostKind } = {}) {
    const bindings = this.store.listBindings().filter(binding => binding.state === 'active');
    const active = bindings.find(binding =>
      (!projectId || binding.productionSessionId === projectId)
      && (!sessionId || binding.externalSessionId === sessionId)
      && (!hostKind || binding.hostKind === hostKind)) || null;
    return {
      binding: active,
      archivedCount: this.store.listBindings().filter(binding => binding.state === 'archived').length,
      projectId: active?.productionSessionId || null,
    };
  }

  handoffDirector({ hostKind, sessionId, hostInstanceId, projectId, expectedBindingId } = {}) {
    if (!DIRECTOR_RUNTIME_HOST_KINDS.has(String(hostKind || ''))) {
      throw crewError('INVALID_ARGUMENT', `不支持的 Director Runtime Binding：${hostKind}`, { retryable: false });
    }
    if (!String(sessionId || '').trim()) throw crewError('INVALID_ARGUMENT', '缺少外部 Session ID。', { retryable: false });
    if (!String(projectId || '').trim()) throw crewError('INVALID_ARGUMENT', 'Director Handoff 缺少 projectId。', { retryable: false });
    const at = this.now().toISOString();
    const binding = {
      bindingId: this.store.newId('binding'),
      productionSessionId: String(projectId).trim(),
      hostKind: String(hostKind),
      externalSessionId: String(sessionId).slice(0, 500),
      ...(hostInstanceId ? { hostInstanceId: String(hostInstanceId).slice(0, 200) } : {}),
      capabilities: ['command', 'events', 'crew-intent'],
      state: 'active',
      createdAt: at,
      lastSeenAt: at,
    };
    let result;
    try {
      result = this.store.handoffBinding({ expectedBindingId, binding, at });
    } catch (error) {
      if (error?.code === 'BINDING_CHANGED') {
        throw crewError('BINDING_CONFLICT', error.message, {
          retryable: false,
          details: { expectedBindingId: expectedBindingId || null },
        });
      }
      throw error;
    }
    for (const archived of result.archived) {
      this.store.appendEvent('director.binding.changed', { bindingId: archived.bindingId, state: 'archived', hostKind: archived.hostKind }, { type: 'binding', id: archived.bindingId });
    }
    this.store.appendEvent('director.binding.changed', { bindingId: result.binding.bindingId, state: 'active', hostKind: result.binding.hostKind }, { type: 'binding', id: result.binding.bindingId });
    return result.binding;
  }

  unbindDirector({ bindingId } = {}) {
    const active = bindingId
      ? (this.store.getBinding(bindingId) || null)
      : this.store.getActiveBinding();
    if (!active) throw crewError('NOT_FOUND', '当前没有可归档的 Director Binding。', { retryable: false });
    const binding = this.store.archiveBinding(active.bindingId);
    this.store.appendEvent('director.binding.changed', { bindingId: binding.bindingId, state: 'archived', hostKind: binding.hostKind }, { type: 'binding', id: binding.bindingId });
    return { binding, ok: true };
  }

  // ---- crew intent ----

  submitIntent({ intentText, projectId, idempotencyKey, director = null } = {}) {
    if (!String(idempotencyKey || '').trim()) throw crewError('INVALID_ARGUMENT', 'Crew Intent 提交要求稳定 idempotencyKey。', { retryable: false });
    const payload = parseCrewIntentJson(intentText);
    const submitted = validateSubmittedIntent(payload, projectId);
    const resolvedProject = String(submitted.scope.projectId || projectId || '').trim();

    const existing = this.store.findIntentByKey(String(idempotencyKey));
    if (existing) {
      const existingSubmission = submissionOf(existing);
      if (payloadFingerprint(existingSubmission) !== payloadFingerprint(submitted)) {
        throw crewError('IDEMPOTENCY_CONFLICT', '相同 idempotencyKey 携带了不同 Intent payload。', { retryable: false });
      }
      const receipt = this.store.getReceipt(existing.intentId);
      return {
        intent: existing,
        receipt,
        replayed: true,
      };
    }

    const activeBinding = this.store.getActiveBinding({ projectId: resolvedProject });
    if (director && activeBinding && activeBinding.externalSessionId !== director.sessionId) {
      throw crewError('BINDING_CONFLICT', ACTIVE_BINDING_GUARD, { retryable: false });
    }

    const intent = normalizeCrewIntent(submitted, {
      intentId: this.store.newId('intent'),
      projectId: resolvedProject,
    });
    intent.idempotencyKey = String(idempotencyKey).slice(0, 200);
    intent.submission = {
      goal: submitted.goal,
      scope: submitted.scope,
      constraints: submitted.constraints,
      completion: submitted.completion || null,
    };
    intent.status = 'accepted';
    intent.createdAt = this.now().toISOString();
    intent.updatedAt = intent.createdAt;
    if (director?.bindingId) {
      intent.director = {
        bindingId: director.bindingId,
        hostKind: director.hostKind,
        sessionId: director.sessionId,
      };
    }
    this.store.saveIntent(intent);
    const acceptedEvent = this.store.appendEvent('crew.intent.accepted', {
      intentId: intent.intentId,
      projectId: intent.projectId,
      goal: intent.goal,
    }, { type: 'intent', id: intent.intentId });
    void this.runIntent(intent.intentId);
    return {
      intent: this.store.getIntent(intent.intentId),
      receipt: null,
      replayed: false,
      eventCursor: acceptedEvent.eventId,
    };
  }

  async runIntent(intentId) {
    if (this.running.has(intentId)) return this.running.get(intentId);
    const promise = this.executeIntent(intentId).finally(() => this.running.delete(intentId));
    this.running.set(intentId, promise);
    return promise;
  }

  async executeIntent(intentId) {
    const intent = this.store.getIntent(intentId);
    if (!intent) throw crewError('NOT_FOUND', `Intent 不存在：${intentId}`, { retryable: false });
    if (isFinalIntentStatus(intent.status)) return this.store.getReceipt(intentId);
    if (this.cancelRequests?.has(intentId)) {
      this.finishIntent(intentId, 'cancelled', { reason: 'CANCELLED_BEFORE_START' });
      return this.store.getReceipt(intentId);
    }
    const signal = {
      aborted: false,
      cancelled: false,
    };
    const emit = (type, data) => {
      this.store.appendEvent(type, { ...data, intentId }, { type: 'intent', id: intentId });
    };
    const callCommand = async (command, args, step) => {
      return this.callCommand(command, args, 'operator', step?.id || `step_${Date.now()}`);
    };
    const receipt = await runWorkspaceOperator(intent, { callCommand, emit, signal });
    const stored = this.store.getIntent(intentId);
    if (stored && !isFinalIntentStatus(stored.status)) {
      this.store.saveIntent({ ...stored, status: receipt.status, updatedAt: this.now().toISOString(), changeSetId: receipt.changeSetId });
    }
    const finalReceipt = {
      ...receipt,
      intentId,
      eventCursor: this.store.listEvents().nextEventId,
      completedAt: this.now().toISOString(),
    };
    this.store.saveReceipt(finalReceipt);
    emit('crew.receipt.completed', { intentId, status: finalReceipt.status, changeSetId: finalReceipt.changeSetId || null });
    return finalReceipt;
  }

  getIntent(intentId) {
    const intent = this.store.getIntent(intentId);
    if (!intent) throw crewError('NOT_FOUND', `Intent 不存在：${intentId}`, { retryable: false });
    if (this.cancelRequests?.has(intentId) && isPendingIntentStatus(intent.status)) {
      this.finishIntent(intentId, 'cancelled', { reason: 'CANCELLED_REQUESTED' });
      return this.store.getIntent(intentId);
    }
    return intent;
  }

  cancelIntent(intentId, reason) {
    const intent = this.store.getIntent(intentId);
    if (!intent) throw crewError('NOT_FOUND', `Intent 不存在：${intentId}`, { retryable: false });
    if (isFinalIntentStatus(intent.status)) {
      return { intent, receipt: this.store.getReceipt(intentId), alreadyFinal: true };
    }
    this.cancelRequests ||= new Set();
    this.cancelRequests.add(intentId);
    this.store.appendEvent('crew.intent.status_changed', { intentId, status: 'cancelled', reason: String(reason || 'director-cancel') }, { type: 'intent', id: intentId });
    const receipt = this.finishIntent(intentId, 'cancelled', { reason: String(reason || 'director-cancel') });
    return { intent: this.store.getIntent(intentId), receipt, alreadyFinal: false };
  }

  finishIntent(intentId, status, extra = {}) {
    const intent = this.store.getIntent(intentId);
    const receipt = {
      intentId,
      status,
      commands: this.store.getReceipt(intentId)?.commands || [],
      usage: this.store.getReceipt(intentId)?.usage || { steps: 0, reads: 0 },
      eventCursor: this.store.listEvents().nextEventId,
      completedAt: this.now().toISOString(),
      ...extra,
      ...(status === 'cancelled' ? { waiting: { reason: extra.reason === 'CANCELLED_BEFORE_START' ? 'CANCELLED' : 'CANCELLED' } } : {}),
    };
    this.store.saveReceipt(receipt);
    this.store.saveIntent({ ...intent, status, updatedAt: this.now().toISOString() });
    return receipt;
  }

  getReceipt(intentId) {
    const intent = this.store.getIntent(intentId);
    if (!intent) throw crewError('NOT_FOUND', `Intent 不存在：${intentId}`, { retryable: false });
    if (isPendingIntentStatus(intent.status)) {
      const receipt = this.store.getReceipt(intentId);
      if (receipt) return receipt;
      throw crewError('RECEIPT_PENDING', 'Intent 仍在执行，Receipt 尚未完成。', { retryable: true });
    }
    const receipt = this.store.getReceipt(intentId);
    if (!receipt) throw crewError('RECEIPT_MISSING', 'Intent 已结束但没有 Receipt。', { retryable: false });
    return receipt;
  }

  listEvents({ afterEventId, limit } = {}) {
    const page = this.store.listEvents({ afterEventId, limit });
    const validated = [];
    for (const event of page.events) {
      if (validateRuntimeContract('runtime-event', event).ok) validated.push(event);
    }
    return { ...page, events: validated };
  }
}
