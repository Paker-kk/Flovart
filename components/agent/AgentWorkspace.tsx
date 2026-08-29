import { Bot, Boxes, CircleDot, Grid2X2, Sparkles } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useWorkflowMediaUrl } from '../workflow/media';
import type { WorkflowNode, WorkflowProject } from '../workflow/types';
import { ProductionCrewPanel } from './ProductionCrewPanel';
import { AgentHostPicker } from './AgentHostPicker';
import { useAgentWorkspaceStore, type AgentPanelStatus } from './agentWorkspaceStore';

interface AgentWorkspaceProps {
  project: WorkflowProject | null;
  onCreateProject: () => void;
  onOpenWorkflow: () => void;
  onOpenTable: (nodeId?: string) => void;
}

const STATUS_LABEL: Record<AgentPanelStatus, string> = { idle: '待命', running: '运行中', waiting: '待确认', done: '已完成', error: '异常' };

export function AgentWorkspace({ project, onCreateProject, onOpenWorkflow, onOpenTable }: AgentWorkspaceProps) {
  const ensureLayout = useAgentWorkspaceStore(state => state.ensureLayout);
  const layouts = useAgentWorkspaceStore(state => state.layouts);
  const [activeContext, setActiveContext] = useState<'brief' | 'activity' | 'artifacts'>('artifacts');
  // 左右弹性比例（百分比）：默认左栏 36%，可拖拽分隔条调节（25%-50%），持久化到本地
  const [contextRatio, setContextRatio] = useState(() => {
    const saved = Number(localStorage.getItem('agentWorkspaceContextRatio'));
    return Number.isFinite(saved) && saved >= 0.25 && saved <= 0.5 ? saved : 0.36;
  });

  const startResize = useCallback((event: React.PointerEvent) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const studio = event.currentTarget.parentElement as HTMLElement | null;
    if (!studio) return;
    const move = (moveEvent: PointerEvent) => {
      const rect = studio.getBoundingClientRect();
      if (rect.width <= 0) return;
      const ratio = Math.min(0.5, Math.max(0.25, (moveEvent.clientX - rect.left) / rect.width));
      setContextRatio(ratio);
      localStorage.setItem('agentWorkspaceContextRatio', String(ratio));
    };
    const stop = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
  }, []);
  const layout = project ? layouts[project.id] : undefined;
  const mediaNodes = useMemo(() => project?.nodes.filter(node => node.type === 'image' || node.type === 'video') || [], [project]);
  useEffect(() => { if (project) ensureLayout(project.id); }, [ensureLayout, project]);

  if (!project) return <main className="grid h-full place-content-center text-center" style={{ color: 'var(--isl-ink)' }}><Bot className="mx-auto mb-3" size={30} style={{ color: 'var(--isl-mint)' }} /><strong>制作台需要一个 Workflow 项目</strong><p className="mt-1 text-xs" style={{ color: 'var(--isl-ink-soft)' }}>创建后，Brief、任务状态、回执与产物会在这里汇合。</p><button type="button" className="mx-auto mt-3 rounded-lg px-3 py-2 text-xs font-bold text-white" style={{ background: 'var(--isl-mint)' }} onClick={onCreateProject}>创建项目</button></main>;

  const status = layout?.panels.find(panel => panel.kind === 'crew')?.status || 'idle';

  return (
    <main className="agent-studio" data-testid="agent-main-workspace" style={{ gridTemplateColumns: `minmax(220px, ${contextRatio * 100}%) minmax(400px, ${(1 - contextRatio) * 100}%)` }}>
      <aside className="agent-studio__context">
        <header className="agent-context__header">
          <div><span>Production Crew</span><strong>{project.title}</strong></div>
        </header>
        <AgentHostPicker />
        <nav className="agent-context__tabs" aria-label="Agent 上下文">
          <button type="button" aria-pressed={activeContext === 'brief'} onClick={() => setActiveContext('brief')}><Sparkles size={14} />Brief</button>
          <button type="button" aria-pressed={activeContext === 'artifacts'} onClick={() => setActiveContext('artifacts')}><Boxes size={14} />产物</button>
          <button type="button" aria-pressed={activeContext === 'activity'} onClick={() => setActiveContext('activity')}><CircleDot size={14} />时间线</button>
        </nav>
        <section className="agent-context__body">
          {activeContext === 'brief' && <BriefPanel project={project} onOpenWorkflow={onOpenWorkflow} />}
          {activeContext === 'activity' && <ActivityPanel project={project} />}
          {activeContext === 'artifacts' && <ArtifactsPanel nodes={mediaNodes} onOpenTable={onOpenTable} />}
        </section>
        <footer className="agent-context__footer">
          <span className={`agent-status is-${status}`}><i />{STATUS_LABEL[status]}</span>
          <button type="button" onClick={onOpenWorkflow}><Grid2X2 size={13} />打开 Workflow</button>
        </footer>
      </aside>

      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="调整左右栏宽度"
        onPointerDown={startResize}
        style={{ position: 'absolute', top: 0, bottom: 0, left: `calc(${contextRatio * 100}% - 3px)`, width: 6, zIndex: 30, cursor: 'col-resize' }}
      />

      <section className="agent-studio__conversation">
        <ProductionCrewPanel project={project} />
      </section>
    </main>
  );
}

function BriefPanel({ project }: { project: WorkflowProject; onOpenWorkflow: () => void }) {
  const running = project.nodes.filter(node => node.metadata.status === 'loading').length;
  return <div className="agent-brief"><p>PRODUCTION CONTEXT</p><h2>{project.title}</h2><span>外部 Director Host 与 Production Crew 共享同一份 Workflow Draft；可逆操作直接进入 Workflow，付费执行和删除仍由你确认。</span><div>{[[project.nodes.length, '节点'], [project.connections.length, '连接'], [running, '运行中']].map(([value, label]) => <section key={label}><strong>{value}</strong><small>{label}</small></section>)}</div></div>;
}

function ActivityPanel({ project }: { project: WorkflowProject }) {
  const changes = [...(project.draftChangeSets || [])].reverse().slice(0, 10);
  if (changes.length) return <div className="agent-activity">{changes.map(change => <div key={change.id}><strong>{change.intent}</strong><small>{change.actor === 'agent' ? 'Agent' : '你'} · {{ completed: '已应用', partial: '部分应用', failed: '失败', undone: '已撤销' }[change.status]} · v{change.resultDraftVersion}</small></div>)}</div>;
  return <div className="agent-context-empty"><CircleDot size={24} /><span>任务运行后，状态会留在这里。<br />不必翻聊天记录。</span></div>;
}

function ArtifactsPanel({ nodes, onOpenTable }: { nodes: WorkflowNode[]; onOpenTable: (nodeId?: string) => void }) {
  return <div className="agent-artifacts">{nodes.map(node => <ArtifactCard key={node.id} node={node} onClick={() => onOpenTable(node.id)} />)}{!nodes.length && <div className="agent-context-empty"><Boxes size={25} /><span>生成结果会自动汇集在这里。<br />你可以随时送往 Table 继续处理。</span></div>}</div>;
}

function ArtifactCard({ node, onClick }: { node: WorkflowNode; onClick: () => void }) {
  const media = useWorkflowMediaUrl(node.metadata.storageKey, node.metadata.href);
  return <button type="button" className="agent-artifact-card" onClick={onClick}>{node.type === 'video' ? <video src={media.url || undefined} muted playsInline /> : <img src={media.url || undefined} alt="" />}<span><strong>{node.title}</strong><small>{node.metadata.status || 'ready'}</small></span></button>;
}
