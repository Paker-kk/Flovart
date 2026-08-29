import crypto from 'node:crypto';

/**
 * Workspace Operator：唯一内置执行 Agent。
 * 单个 Crew Intent 生命周期内的确定性微规划器：读取当前工作区现场，把
 * 有界意图展开为少量 draft-only 类型化步骤；每步观察 Draft/Object Version，
 * 冲突时重读最小子图。Intent 终态后不保留任何长期模型上下文。
 *
 * 当前实现覆盖 S1 tracer bullet 意图：把当前所选三张图片创建为并行分支
 * （每张图建立一个图生视频 Operation）。目标、范围或副作用超出可封闭展开
 * 的规则时返回明确失败，不猜测、不绕过 Gate。
 */

// draft-only 能力白名单（S1：只注册 inspect/create/connect/layout）
const DRAFT_ONLY_CAPABILITIES = new Set([
  'workflow.project.list',
  'workflow.project.use',
  'workflow.inspect',
  'workflow.node.create',
  'workflow.node.create-connected',
  'workflow.node.update',
  'workflow.node.move',
  'workflow.node.resize',
  'workflow.connect',
  'workflow.disconnect',
  'workflow.select',
  'workflow.viewport.set',
]);

const MAX_STEPS_DEFAULT = 12;
const MAX_READS_DEFAULT = 6;
const IMAGE_TYPES = new Set(['image']);

export class WorkspaceOperatorError extends Error {
  constructor(code, message, options = {}) {
    super(message);
    this.name = 'WorkspaceOperatorError';
    this.code = code;
    this.retryable = options.retryable ?? false;
    this.waiting = options.waiting || null;
  }
}

function operatorError(code, message, options) {
  return new WorkspaceOperatorError(code, message, options);
}

function assertRecord(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw operatorError('INVALID_ARGUMENT', `${label} 必须是对象。`, { retryable: false });
  }
  return value;
}

function requiredString(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    throw operatorError('INVALID_ARGUMENT', `${label} 不能为空。`, { retryable: false });
  }
  return value.trim();
}

function optionalStringArray(value, label) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) {
    throw operatorError('INVALID_ARGUMENT', `${label} 必须是字符串数组。`, { retryable: false });
  }
  return value;
}

function parseIntent(input) {
  const record = assertRecord(input, 'intent');
  const scope = record.scope && typeof record.scope === 'object' ? record.scope : {};
  const constraints = record.constraints && typeof record.constraints === 'object' ? record.constraints : {};
  return {
    intentId: record.intentId ? requiredString(record.intentId, 'intentId') : '',
    projectId: record.projectId ? requiredString(record.projectId, 'projectId') : '',
    goal: requiredString(record.goal, 'goal'),
    selectedObjectIds: optionalStringArray(record.selectedObjectIds ?? scope.selectedObjectIds, 'scope.selectedObjectIds'),
    maxSteps: Number.isInteger(constraints.maxSteps) && constraints.maxSteps > 0 ? constraints.maxSteps : MAX_STEPS_DEFAULT,
    maxSideEffect: constraints.maxSideEffect || record.maxSideEffect || 'draft-only',
    budget: assertRecord(constraints.budget || {}, 'intent.constraints.budget'),
    allowedCapabilities: optionalStringArray(constraints.allowedCapabilities ?? record.allowedCapabilities, 'intent.constraints.allowedCapabilities'),
    maxReads: Number.isInteger(constraints.budget?.maxReads) && constraints.budget.maxReads > 0 ? constraints.budget.maxReads : MAX_READS_DEFAULT,
  };
}

export function parseCrewIntentJson(text) {
  let value;
  try {
    value = JSON.parse(String(text || ''));
  } catch (error) {
    throw operatorError('INVALID_ARGUMENT', `intentJson 不是有效 JSON：${error instanceof Error ? error.message : String(error)}`, { retryable: false });
  }
  const normalized = parseIntent({ ...value, projectId: value.projectId || value.scope?.projectId });
  return {
    ...normalized,
    goal: value.goal,
    scope: value.scope,
    constraints: value.constraints,
    completion: value.completion || null,
  };
}

export function normalizeCrewIntent(rawIntent, { intentId, projectId } = {}) {
  const parsed = parseIntent(rawIntent);
  return {
    ...parsed,
    intentId: intentId || parsed.intentId || '',
    projectId: projectId || parsed.projectId || '',
    idempotencyKey: String(rawIntent.idempotencyKey || ''),
    scope: rawIntent.scope,
    constraints: rawIntent.constraints,
    completion: rawIntent.completion || null,
  };
}

function supportsIntent(parsed) {
  if (parsed.maxSideEffect !== 'draft-only' && parsed.maxSideEffect !== 'read-only') return false;
  // 本实现只封闭展开“把所选图片创建为并行分支”这一种有界意图。
  const goal = parsed.goal.toLowerCase();
  const parallelBranch = /并行分支|并行|branch|parallel/i.test(goal);
  const imageToVideo = /图生视频|动态化|img2video|image-to-video/i.test(goal);
  const anyImageGoal = parallelBranch || imageToVideo;
  if (!anyImageGoal || parsed.selectedObjectIds.length === 0) return false;
  const capabilityNames = [...DRAFT_ONLY_CAPABILITIES];
  const allowed = parsed.allowedCapabilities;
  // 请求了 Operator 不掌握的能力 → 拒绝；空数组 = 不限制（仍受白名单约束）。
  return allowed.length === 0 || allowed.every(name => capabilityNames.includes(name));
}

function toolStep(id, command, args, summary) {
  return { id, command, args, summary };
}

/** 把选中图片展开为并行图生视频分支：每张图一个 create-connected video 节点 + 布局。 */
function planParallelBranches(parsed, inspectResult) {
  const project = inspectResult?.result || inspectResult;
  const nodes = Array.isArray(project?.nodes) ? project.nodes : [];
  const selected = nodes.filter(node => parsed.selectedObjectIds.includes(node.id));
  const images = selected.filter(node => IMAGE_TYPES.has(node.type));
  if (images.length === 0) {
    throw operatorError(
      'PRECONDITION_FAILED',
      '当前选择中没有图片节点；并行分支意图要求选择图片。',
      { retryable: true, waiting: { reason: 'PRECONDITION_FAILED', objectIds: parsed.selectedObjectIds } },
    );
  }
  if (images.length > parsed.maxSteps) {
    throw operatorError('BUDGET_EXHAUSTED', `选择 ${images.length} 张图片超过 maxSteps=${parsed.maxSteps}。`, { retryable: false });
  }
  const steps = [];
  const spacingX = 420;
  const spacingY = 220;
  for (let index = 0; index < images.length; index += 1) {
    const image = images[index];
    const sourceX = typeof image.x === 'number' ? image.x : 0;
    const sourceY = typeof image.y === 'number' ? image.y : index * spacingY;
    const startY = Math.max(0, sourceY - Math.floor(images.length / 2) * spacingY);
    const title = `${image.title || image.id} 动态化`;
    steps.push(toolStep(
      `step-${index + 1}`,
      'workflow.node.create-connected',
      {
        fromNodeId: image.id,
        type: 'video',
        title,
        x: sourceX + spacingX,
        y: startY + index * spacingY,
        idempotencyKey: `intent-step:${crypto.randomUUID()}`,
      },
      `为 ${image.id} 建立图生视频分支`,
    ));
  }
  return {
    steps,
    drafts: images.map(image => ({ id: image.id, objectVersion: image.objectVersion })),
  };
}

/**
 * 运行一个 Crew Intent。callCommand(command, args) 由宿主注入：
 * 生产路径经 WorkflowAgentSession 浏览器桥执行真实 Draft 变更，
 * 测试注入内存执行器。返回最终 Receipt。
 */
export async function runWorkspaceOperator(intentInput, { callCommand, emit, signal } = {}) {
  let parsed;
  try {
    parsed = parseIntent(intentInput);
  } catch (error) {
    const failure = error instanceof WorkspaceOperatorError ? error : operatorError('INVALID_ARGUMENT', String(error));
    return receiptFromError(intentInput?.intentId || 'unknown', failure, []);
  }

  const receipt = {
    intentId: parsed.intentId,
    status: 'failed',
    commands: [],
    usage: { steps: 0, reads: 0 },
    eventCursor: 0,
  };
  const cancelled = () => Boolean(signal?.aborted || signal?.cancelled);

  try {
    emit?.('crew.intent.status_changed', { intentId: parsed.intentId, status: 'inspecting' });
    if (cancelled()) throw operatorError('CANCELLED', 'Intent 已在检查阶段被取消。', { retryable: false });

    // 1. 读取最小现场：项目选择与节点
    const inspectStep = toolStep('inspect', 'workflow.inspect', { projectId: parsed.projectId }, '读取当前 Workflow 选择');
    const inspectResult = await callCommand('workflow.inspect', { projectId: parsed.projectId }, inspectStep);
    if (!inspectResult?.ok) {
      throw operatorError(
        inspectResult?.error?.code || 'INSPECT_FAILED',
        inspectResult?.error?.message || '无法读取当前 Workflow。',
        { retryable: true },
      );
    }
    receipt.usage.reads += 1;

    // 2. 校验意图可被封闭规则展开
    if (!supportsIntent(parsed)) {
      throw operatorError(
        'OPERATOR_ROUTE_UNAVAILABLE',
        '当前 Workspace Operator 只支持 draft-only 的“选中图片建立并行分支”意图；该意图超出可展开规则，请改用精确原子命令。',
        { retryable: false },
      );
    }

    // 3. 制定当前 Intent 内步骤
    emit?.('crew.intent.status_changed', { intentId: parsed.intentId, status: 'planning' });
    if (cancelled()) throw operatorError('CANCELLED', 'Intent 已在规划阶段被取消。', { retryable: false });
    const plan = planParallelBranches(parsed, inspectResult);

    // 4. 逐步执行并观察版本
    emit?.('crew.intent.status_changed', { intentId: parsed.intentId, status: 'executing' });
    let executed = 0;
    for (const step of plan.steps) {
      if (cancelled()) {
        receipt.status = 'cancelled';
        receipt.completedAt = new Date().toISOString();
        break;
      }
      if (executed >= parsed.maxSteps) {
        receipt.status = 'partial';
        receipt.waiting = { reason: 'BUDGET_EXHAUSTED', objectIds: plan.drafts.map(item => item.id) };
        break;
      }
      emit?.('crew.tool.started', { intentId: parsed.intentId, command: step.command, stepId: step.id });
      let result;
      try {
        result = await callCommand(step.command, step.args, step);
      } catch (runError) {
        emit?.('crew.tool.finished', {
          intentId: parsed.intentId,
          command: step.command,
          stepId: step.id,
          ok: false,
          error: { code: 'TOOL_EXCEPTION', message: runError instanceof Error ? runError.message : String(runError) },
        });
        throw operatorError('TOOL_EXCEPTION', runError instanceof Error ? runError.message : String(runError), { retryable: true });
      }
      receipt.commands.push(commandEntry(step, result));
      receipt.usage.steps += 1;
      emit?.('crew.tool.finished', { intentId: parsed.intentId, command: step.command, stepId: step.id, ok: Boolean(result?.ok) });
      if (!result?.ok) {
        const code = result?.error?.code || 'TOOL_FAILED';
        const retryable = result?.error?.retryable !== false;
        if (retryable && /PRECONDITION_FAILED|CONFLICT/i.test(code)) {
          // 版本冲突：重读最小子图，若新现场不再满足意图则 waiting
          const refreshed = await callCommand('workflow.inspect', { projectId: parsed.projectId }, toolStep('re-inspect', 'workflow.inspect', { projectId: parsed.projectId }, '冲突后重读当前选择的版本'));
          receipt.usage.reads += 1;
          receipt.commands.push(commandEntry({ id: 're-inspect', command: 'workflow.inspect', args: { projectId: parsed.projectId }, summary: '冲突后重读当前选择' }, refreshed));
          const conflictObjectIds = Array.isArray(result?.error?.details?.objectIds)
            ? result.error.details.objectIds
            : plan.drafts.filter(draft => refreshed?.result?.nodes?.some(node => node.id === draft.id && node.objectVersion !== draft.objectVersion)).map(draft => draft.id);
          if (conflictObjectIds.length === 0) continue;
          receipt.status = 'waiting';
          receipt.waiting = { reason: 'PRECONDITION_CONFLICT', objectIds: conflictObjectIds };
          break;
        }
        if (code === 'BUDGET_EXHAUSTED' || !retryable) {
          receipt.status = 'partial';
          receipt.waiting = { reason: code, objectIds: plan.drafts.map(item => item.id) };
          break;
        }
        continue;
      }
      executed += 1;
      // 记录受影响对象与版本，供最终回执
      const resultPayload = result.result || result;
      if (Array.isArray(resultPayload?.affectedNodeIds)) {
        receipt.affectedObjectIds = [...new Set([...(receipt.affectedObjectIds || []), ...resultPayload.affectedNodeIds])];
      }
      if (resultPayload?.changeSetId) receipt.changeSetId = resultPayload.changeSetId;
      if (Number.isInteger(resultPayload?.draftVersion)) receipt.draftVersion = resultPayload.draftVersion;
      emit?.('crew.tool.finished', { intentId: parsed.intentId, command: step.command, stepId: step.id, ok: true });
    }

    if (receipt.status === 'failed' && plan.steps.length > 0) receipt.status = 'completed';
    if (receipt.status === 'partial' && !receipt.waiting) receipt.waiting = { reason: 'PARTIAL_STEPS', objectIds: plan.drafts.map(item => item.id) };
  } catch (error) {
    const failure = error instanceof WorkspaceOperatorError
      ? error
      : operatorError('OPERATOR_FAILED', error instanceof Error ? error.message : String(error), { retryable: true });
    Object.assign(receipt, receiptFromError(parsed.intentId, failure, receipt.commands));
    if (failure.waiting) receipt.waiting = failure.waiting;
    if (failure.code === 'CANCELLED') receipt.status = 'cancelled';
  }
  if (parsed.intentId !== 'unknown') receipt.completedAt = receipt.completedAt || new Date().toISOString();
  return receipt;
}

function commandEntry(step, result) {
  return {
    command: step.command,
    summary: step.summary,
    ok: Boolean(result?.ok),
    changeSetId: result?.result?.changeSetId,
    affectedNodeIds: result?.result?.affectedNodeIds,
    affectedConnectionIds: result?.result?.affectedConnectionIds,
    draftVersion: result?.result?.draftVersion,
    ...(result?.ok ? {} : { error: { code: result?.error?.code || 'TOOL_FAILED', message: result?.error?.message || '工具调用失败' } }),
  };
}

function receiptFromError(intentId, error, commands) {
  return {
    intentId,
    status: error.code === 'CANCELLED' ? 'cancelled' : 'failed',
    commands,
    usage: { steps: commands.length, reads: 0 },
    error: { code: error.code, message: error.message, retryable: error.retryable },
    ...(error.waiting ? { waiting: error.waiting } : {}),
    completedAt: new Date().toISOString(),
    eventCursor: 0,
  };
}

export const OPERATOR_DRAFT_ONLY_CAPABILITIES = [...DRAFT_ONLY_CAPABILITIES];