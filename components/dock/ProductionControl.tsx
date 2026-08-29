import { Boxes, Bot, CircleAlert, CircleDashed, Copy, LoaderCircle, Send, ShieldCheck, Sparkles, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { WorkflowNode, WorkflowProject } from '../workflow/types';
import { DockCrewClient, DockClientError, loadDockAgentUrl, type DockConnection, type DockDirectorStatus, type DockIntent, type DockReceipt } from '../../services/dockCrewClient';
import type { DockBadges } from './protocol';

export type ProductionControlMode = 'binding' | 'intents' | 'receipts' | 'events';

interface ProductionControlProps {
  project: WorkflowProject | null;
  client: DockCrewClient | null;
  connection: DockConnection | null;
  connectionReady: boolean;
  connectionError: DockClientError | null;
  onConnection: (url: string, token: string) => void;
  onOpenWorkflow: () => void;
  onOpenTable: (nodeId?: string) => void;
  onBadges: (badges: DockBadges) => void;
}

const STATUS_LABEL: Record<string, string> = {
  accepted: '已受理',
  inspecting: '检查现场',
  planning: '制定步骤',
  executing: '执行中',
  waiting: '待确认',
  partial: '部分完成',
  completed: '已完成',
  failed: '失败',
  cancelled: '已取消',
  interrupted: '已中断',
};

function statusClass(status: string) {
  if (['completed'].includes(status)) return 'is-ok';
  if (['waiting', 'partial'].includes(status)) return 'is-waiting';
  if (['failed', 'interrupted'].includes(status)) return 'is-error';
  if (['cancelled'].includes(status)) return 'is-muted';
  return 'is-running';
}

export function ProductionControl({ project, client, connection, connectionReady, connectionError, onConnection, onOpenWorkflow, onOpenTable, onBadges }: ProductionControlProps) {
  const [mode, setMode] = useState<ProductionControlMode>('intents');
  const [director, setDirector] = useState<DockDirectorStatus | null>(null);
  const [intents, setIntents] = useState<DockIntent[]>([]);
  const [receipt, setReceipt] = useState<DockReceipt | null>(null);
  const [events, setEvents] = useState<{ eventId: number; eventType: string; data: Record<string, unknown> }[]>([]);
  const [url, setUrl] = useState(() => connection?.url || loadDockAgentUrl());
  const [token, setToken] = useState(() => connection?.token || '');
  const [goal, setGoal] = useState('');
  const [selectedIds, setSelectedIds] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const eventCursor = useRef(0);

  const refreshDirector = useCallback(async () => {
    if (!client) return;
    try {
      const status = await client.directorStatus();
      setDirector(status);
      setError(null);
    } catch (cause) {
      setError(cause instanceof DockClientError ? cause.message : String(cause));
    }
  }, [client]);

  const refreshIntents = useCallback(async () => {
    if (!client) return;
    const pages: DockIntent[] = [];
    try {
      const events = await client.listEvents(0, 200);
      const intentIds = [...new Set(
        events.events
          .filter(event => event.eventType === 'crew.intent.accepted' || event.eventType === 'crew.intent.status_changed')
          .map(event => String(event.data.intentId || ''))
          .filter(Boolean),
      )];
      for (const intentId of intentIds.slice(-20)) {
        const { intent } = await client.getIntent(intentId);
        pages.push(intent);
      }
    } catch (cause) {
      if (cause instanceof DockClientError && cause.code === 'PROTOCOL_ERROR') setError(cause.message);
    }
    pages.sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)));
    setIntents(pages.slice(0, 20));
  }, [client]);

  const refreshEvents = useCallback(async () => {
    if (!client) return;
    try {
      const page = await client.listEvents(eventCursor.current, 100);
      eventCursor.current = page.nextEventId;
      setEvents(previous => [...page.events.slice(-30).reverse(), ...previous].slice(0, 60));
    } catch {
      // 事件流失败不阻断面板；下一次轮询自动恢复
    }
  }, [client]);

  useEffect(() => {
    if (!client) return;
    void refreshDirector();
    void refreshIntents();
    void refreshEvents();
    const timer = setInterval(() => {
      void refreshDirector();
      void refreshEvents();
    }, 6000);
    return () => clearInterval(timer);
  }, [client, refreshDirector, refreshIntents, refreshEvents]);

  useEffect(() => {
    onBadges({
      waiting: intents.filter(intent => ['waiting', 'partial', 'accepted', 'inspecting', 'planning', 'executing'].includes(intent.status)).length,
      error: intents.filter(intent => ['failed', 'interrupted'].includes(intent.status)).length,
      artifacts: project?.nodes.filter(node => node.metadata.status === 'success').length || 0,
    });
  }, [intents, project, onBadges]);

  const openReceipt = useCallback(async (intentId: string) => {
    if (!client) return;
    setBusy(true);
    try {
      const { receipt } = await client.getReceipt(intentId);
      setReceipt(receipt);
      setMode('receipts');
    } catch (cause) {
      setError(cause instanceof DockClientError ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }, [client]);

  const cancelIntent = useCallback(async (intentId: string) => {
    if (!client) return;
    setBusy(true);
    try {
      await client.cancelIntent(intentId, 'dock-user-cancel');
      await refreshIntents();
    } catch (cause) {
      setError(cause instanceof DockClientError ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }, [client, refreshIntents]);

  const submitIntent = useCallback(async () => {
    if (!client || !project) return;
    if (!goal.trim()) { setError('请填写可验证的制作目标。'); return; }
    setBusy(true);
    setError(null);
    try {
      const ids = selectedIds.split(',').map(id => id.trim()).filter(Boolean);
      const submission = {
        goal: goal.trim(),
        scope: { workspace: 'workflow' as const, selectedObjectIds: ids },
        constraints: { maxSideEffect: 'draft-only', maxSteps: 12 },
        completion: { requiredOutputs: ['changeset', 'receipt'] },
      };
      await client.submitIntent({
        ...submission,
        idempotencyKey: `dock_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        projectId: project.id,
      });
      setGoal('');
      setSelectedIds('');
      await refreshIntents();
    } catch (cause) {
      setError(cause instanceof DockClientError ? `${cause.code}：${cause.message}` : String(cause));
    } finally {
      setBusy(false);
    }
  }, [client, project, goal, selectedIds, refreshIntents]);

  const connect = useCallback(() => {
    if (!url.trim() || !token.trim()) { setError('请输入本机 Agent 地址与 Token。'); return; }
    onConnection(url.trim(), token.trim());
  }, [url, token, onConnection]);

  const copyCommand = useCallback(() => {
    const text = director?.binding
      ? `flovart director.status --json`
      : `flovart director.bind --agent-identity deepseek-harness --session-id <your-session> --project-id ${project?.id || '<project>'} --json`;
    void navigator.clipboard?.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    });
  }, [director, project]);

  const mediaNodes = useMemo(() => project?.nodes.filter(node => node.type === 'image' || node.type === 'video') || [], [project]);

  // 配对遵循本机 Agent 的显式连接流程：地址可从上次配对恢复，Token 只由用户或受信宿主提供。

  if (!client || !connectionReady) {
    const pairingTitle = connectionError?.code === 'INVALID_TOKEN'
      ? 'Token 无效，请重新配对'
      : !url.trim()
        ? '连接本机 Flovart Agent'
        : !token.trim()
          ? '还差一个配对 Token'
          : '验证本机 Flovart Agent…';
    return (
      <main className="agent-studio dock-surface" data-testid="production-control">
        <section className="agent-studio__context">
          <header className="agent-context__header">
            <div><span>Local Agent</span><strong>开发者连接面</strong></div>
          </header>
          <div className="agent-context__body">
            <div className="agent-dock-connect">
              <Bot size={26} />
              <h2>{pairingTitle}</h2>
              <p>这是给本地 CLI / 外部 Agent 使用的开发者配对面，不是普通创作页面。Agent 地址是服务地址，不能直接点击打开网页。</p>
              <p>先启动 <code>npm run flovart:agent</code>，再填入本机配对记录中的 Token。Token 不要放进 URL，也不要发送到聊天。</p>
              <label>Agent 地址<input value={url} placeholder="http://127.0.0.1:17372" onChange={event => setUrl(event.target.value)} /></label>
              <label>Token<input value={token} type="password" placeholder="短期 Token" onChange={event => setToken(event.target.value)} /></label>
              {connectionError && <div className="agent-dock-error">{connectionError.message}</div>}
              <button type="button" onClick={connect}><ShieldCheck size={14} />连接 Agent</button>
            </div>
          </div>
        </section>
        <section className="agent-studio__conversation">
          <div className="agent-dock-connect-info">
            <header><ShieldCheck size={16} /><strong>配对顺序</strong></header>
            <ol>
              <li>启动本机 Flovart Agent。</li>
              <li>使用同一次启动的 URL 与 Token。</li>
              <li>认证成功后，当前浏览器才会绑定为 Workflow client。</li>
            </ol>
            <p>普通 Workflow 不依赖这个页面；连接只决定 CLI / Agent 是否能操作当前可见 Workflow。</p>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="agent-studio dock-surface" data-testid="production-control">
      <aside className="agent-studio__context">
        <header className="agent-context__header">
          <div><span>Production Control</span><strong>{project?.title || 'Flovart 制作台'}</strong></div>
        </header>
        <nav className="agent-context__tabs" aria-label="制作控制">
          <button type="button" aria-pressed={mode === 'intents'} onClick={() => setMode('intents')}><Sparkles size={14} />Intent</button>
          <button type="button" aria-pressed={mode === 'binding'} onClick={() => setMode('binding')}><ShieldCheck size={14} />绑定</button>
          <button type="button" aria-pressed={mode === 'events'} onClick={() => setMode('events')}><CircleDashed size={14} />事件</button>
        </nav>
        <section className="agent-context__body">
          {mode === 'intents' && (
            <div className="agent-dock-intents">
              <div className="agent-dock-submit">
                <textarea value={goal} placeholder="一句话可验证目标，例如：把当前选中的三张图片建立为并行图生视频分支" onChange={event => setGoal(event.target.value)} />
                <input value={selectedIds} placeholder="限定对象 ID（逗号分隔，可留空）" onChange={event => setSelectedIds(event.target.value)} />
                <div>
                  <button type="button" disabled={busy} onClick={submitIntent}><Send size={13} />提交有界 Intent</button>
                  <span>draft-only · 可撤销 ChangeSet</span>
                </div>
              </div>
              {error && <div className="agent-dock-error">{error}</div>}
              <div className="agent-dock-intent-list">
                {intents.length === 0 && <div className="agent-context-empty"><Sparkles size={22} /><span>还没有 Intent。提交一个后，执行状态会实时显示在这里。</span></div>}
                {intents.map(intent => (
                  <div key={intent.intentId} className={`agent-dock-intent ${statusClass(intent.status)}`}>
                    <div><strong>{intent.goal}</strong><span>{STATUS_LABEL[intent.status] || intent.status} · {new Date(intent.createdAt).toLocaleTimeString()}</span></div>
                    <div className="agent-dock-intent-actions">
                      <button type="button" onClick={() => void openReceipt(intent.intentId)}>Receipt</button>
                      {['accepted', 'inspecting', 'planning', 'executing', 'waiting'].includes(intent.status) && (
                        <button type="button" onClick={() => void cancelIntent(intent.intentId)}>取消</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {mode === 'binding' && <DirectorSummary director={director} project={project} onCopy={copyCommand} copied={copied} onUnbind={client ? () => void client.unbindDirector().then(refreshDirector) : undefined} />}
          {mode === 'events' && (
            <div className="agent-dock-events">
              {events.length === 0 && <div className="agent-context-empty"><CircleDashed size={22} /><span>事件流为空；断开重连后按游标恢复。</span></div>}
              {events.map(event => (
                <div key={event.eventId} className="agent-dock-event"><span>#{event.eventId}</span><strong>{event.eventType}</strong><small>{JSON.stringify(event.data).slice(0, 120)}</small></div>
              ))}
            </div>
          )}
        </section>
        <footer className="agent-context__footer">
          <span className={`agent-status ${director?.binding ? 'is-ok' : 'is-running'}`}><i />{director?.binding ? `已绑定 ${director.binding.hostKind}` : '未绑定导演'}</span>
          <button type="button" onClick={onOpenWorkflow}><Boxes size={13} />打开 Workflow</button>
        </footer>
      </aside>

      <section className="agent-studio__conversation" aria-label="制作现场">
        {mode === 'receipts' && receipt ? (
          <ReceiptView receipt={receipt} onClose={() => setMode('intents')} onOpenWorkflow={onOpenWorkflow} onOpenTable={onOpenTable} />
        ) : mode === 'receipts' ? (
          <div className="agent-context-empty"><LoaderCircle size={24} /><span>读取 Receipt…</span></div>
        ) : (
          <div className="agent-dock-live">
            <header><span>Crew 现场</span><strong>{intents.find(intent => ['accepted', 'inspecting', 'planning', 'executing', 'waiting'].includes(intent.status))?.goal || '当前无进行中 Intent'}</strong></header>
            <div className="agent-dock-live__grid">
              <section><strong>{intents.length}</strong><small>Intent 总数</small></section>
              <section><strong>{mediaNodes.filter(node => node.metadata.status === 'success').length}</strong><small>成功产物</small></section>
              <section><strong>{mediaNodes.length}</strong><small>媒体节点</small></section>
              <section><strong>{project?.draftVersion || 1}</strong><small>Draft v</small></section>
            </div>
            <ArtifactStrip nodes={mediaNodes} onOpenTable={onOpenTable} />
          </div>
        )}
      </section>
    </main>
  );
}

function DirectorSummary({ director, project, onCopy, copied, onUnbind }: {
  director: DockDirectorStatus | null;
  project: WorkflowProject | null;
  onCopy: () => void;
  copied: boolean;
  onUnbind?: () => void;
}) {
  return (
    <div className="agent-dock-director">
      <header><ShieldCheck size={16} /><strong>Director Session Binding</strong></header>
      {director?.binding ? (
        <>
          <dl>
            <div><dt>宿主</dt><dd>{director.binding.hostKind}</dd></div>
            <div><dt>Session</dt><dd>{director.binding.externalSessionId}</dd></div>
            <div><dt>Project</dt><dd>{director.binding.productionSessionId}</dd></div>
            <div><dt>最后同步</dt><dd>{new Date(director.binding.lastSeenAt).toLocaleString()}</dd></div>
          </dl>
          <p>完整对话仍在外部 Harness；此处只保存非秘密绑定、Intent、Receipt 与执行事实。</p>
          <div className="agent-dock-director-actions">
            <button type="button" onClick={onCopy}>{copied ? <CircleAlert size={13} /> : <Copy size={13} />}{copied ? '已复制' : '复制连接命令'}</button>
            {onUnbind && <button type="button" onClick={onUnbind}><X size={13} />归档绑定</button>}
          </div>
        </>
      ) : (
        <>
           <p className="agent-dock-director-empty">未绑定 Director。当前 Host Projection 必须显式建立或接管项目绑定。
           <code>flovart director.bind --agent-identity deepseek-harness --session-id &lt;session&gt;{project ? ` --project-id ${project.id}` : ''} --json</code></p>
           <button type="button" onClick={onCopy}><Copy size={13} />{copied ? '已复制' : '复制绑定命令'}</button>
        </>
      )}
    </div>
  );
}

function ReceiptView({ receipt, onClose, onOpenWorkflow, onOpenTable }: {
  receipt: DockReceipt;
  onClose: () => void;
  onOpenWorkflow: () => void;
  onOpenTable: (nodeId?: string) => void;
}) {
  return (
    <div className="agent-dock-receipt" data-testid="dock-receipt">
      <header>
        <span className={`dock-status ${statusClass(receipt.status)}`}>{STATUS_LABEL[receipt.status] || receipt.status}</span>
        <code>{receipt.intentId}</code>
        <button type="button" onClick={onClose}><X size={14} /></button>
      </header>
      <dl>
        {receipt.changeSetId && <div><dt>ChangeSet</dt><dd>{receipt.changeSetId}</dd></div>}
        {receipt.affectedObjectIds && receipt.affectedObjectIds.length > 0 && <div><dt>受影响对象</dt><dd>{receipt.affectedObjectIds.join(', ')}</dd></div>}
        {receipt.waiting && <div><dt>等待</dt><dd>{receipt.waiting.reason}{receipt.waiting.objectIds?.length ? `：${receipt.waiting.objectIds.join(', ')}` : ''}</dd></div>}
        {receipt.error && <div><dt>错误</dt><dd>{receipt.error.code}：{receipt.error.message}</dd></div>}
      </dl>
      <div className="agent-activity">
        {receipt.commands.map((command, index) => (
          <div key={`${command.command}-${index}`}>
            <strong>{command.command}{command.summary ? `：${command.summary}` : ''}</strong>
            <small>{command.ok ? '已执行' : `失败：${command.error?.message || '未知错误'}`}{command.changeSetId ? ` · ${command.changeSetId}` : ''}</small>
          </div>
        ))}
      </div>
      <footer>
        <button type="button" onClick={onOpenWorkflow}><Boxes size={13} />定位到 Workflow</button>
        <button type="button" onClick={() => onOpenTable(receipt.affectedObjectIds?.[0])}>送往 Table</button>
      </footer>
    </div>
  );
}

function ArtifactStrip({ nodes, onOpenTable }: { nodes: WorkflowNode[]; onOpenTable: (nodeId?: string) => void }) {
  const artifacts = nodes.filter(node => node.metadata.status === 'success').slice(0, 12);
  if (!artifacts.length) return <div className="agent-context-empty"><Boxes size={22} /><span>产物会自动汇集在这里。</span></div>;
  return <div className="agent-artifacts">{artifacts.map(node => <ArtifactTile key={node.id} node={node} onClick={() => onOpenTable(node.id)} />)}</div>;
}

function ArtifactTile({ node, onClick }: { node: WorkflowNode; onClick: () => void }) {
  return (
    <button type="button" className="agent-artifact-card" onClick={onClick}>
      <span><strong>{node.title}</strong><small>{node.metadata.status}</small></span>
    </button>
  );
}
