import { Boxes, CircleDot, ShieldCheck, Sparkles } from 'lucide-react';
import type { WorkflowProject } from '../workflow/types';

export function ProductionCrewPanel({ project }: { project: WorkflowProject }) {
  const running = project.nodes.filter(node => node.metadata.status === 'loading').length;
  const failed = project.nodes.filter(node => node.metadata.status === 'error').length;
  const latestReceipt = [...(project.draftChangeSets || [])].reverse()[0];
  const status = failed > 0 ? '存在异常' : running > 0 ? '制作中' : '等待指令';

  return (
    <section className="h-full overflow-auto p-5" role="region" aria-label="Production Crew 状态">
      <div className="mx-auto grid w-full max-w-3xl gap-4">
        <header className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-lg" style={{ background: 'color-mix(in srgb, var(--isl-mint) 12%, transparent)', color: 'var(--isl-mint)' }}>
            <Sparkles size={18} />
          </div>
          <div>
            <p className="text-[10px] font-bold tracking-[0.16em]" style={{ color: 'var(--isl-ink-soft)' }}>PRODUCTION CREW</p>
            <strong className="text-sm" style={{ color: 'var(--isl-ink)' }}>{status}</strong>
          </div>
        </header>

        <div className="rounded-xl border p-5" style={{ borderColor: 'var(--isl-line)', background: 'var(--isl-surface)' }}>
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 shrink-0" size={20} style={{ color: 'var(--isl-mint)' }} />
            <div>
              <h2 className="text-base font-semibold" style={{ color: 'var(--isl-ink)' }}>外部 Director Host 是指挥入口</h2>
              <p className="mt-1 text-xs leading-6" style={{ color: 'var(--isl-ink-soft)' }}>
                这里不再复制一套 Agent 聊天。Host Projection 下达任务，Production Crew 执行，Workflow Draft、状态、回执和产物在 Flovart 内持续可见。
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <StatusCard icon={<ShieldCheck size={16} />} label="Director Binding" value="由当前 Host Projection 决定" />
          <StatusCard icon={<Boxes size={16} />} label="Workflow Draft" value={`${project.nodes.length} 节点 · ${project.connections.length} 连接`} />
          <StatusCard icon={<CircleDot size={16} />} label="Production State" value={running > 0 ? `${running} 项运行中` : failed > 0 ? `${failed} 项异常` : '等待下一条指令'} />
        </div>

        <div className="rounded-xl border p-4" style={{ borderColor: 'var(--isl-line)', background: 'var(--isl-surface)' }}>
          <p className="text-[10px] font-bold tracking-[0.14em]" style={{ color: 'var(--isl-ink-soft)' }}>LATEST RECEIPT</p>
          {latestReceipt ? (
            <div className="mt-2">
              <strong className="text-sm" style={{ color: 'var(--isl-ink)' }}>最新回执：{latestReceipt.intent}</strong>
              <p className="mt-1 text-xs" style={{ color: 'var(--isl-ink-soft)' }}>Draft v{latestReceipt.resultDraftVersion} · {receiptStatus(latestReceipt.status)}</p>
            </div>
          ) : (
            <p className="mt-2 text-xs leading-5" style={{ color: 'var(--isl-ink-soft)' }}>尚无执行回执。请回到当前 Director Host 描述这次的制作目标。</p>
          )}
        </div>
      </div>
    </section>
  );
}

function StatusCard({ icon, label, value }: { icon: JSX.Element; label: string; value: string }) {
  return (
    <div className="rounded-xl border p-4" style={{ borderColor: 'var(--isl-line)', background: 'var(--isl-surface)' }}>
      <div className="mb-3" style={{ color: 'var(--isl-mint)' }}>{icon}</div>
      <small className="block text-[10px] font-bold tracking-[0.12em]" style={{ color: 'var(--isl-ink-soft)' }}>{label}</small>
      <strong className="mt-1 block text-xs" style={{ color: 'var(--isl-ink)' }}>{value}</strong>
    </div>
  );
}

function receiptStatus(status: NonNullable<WorkflowProject['draftChangeSets']>[number]['status']) {
  return { completed: '已应用', partial: '部分应用', failed: '失败', undone: '已撤销' }[status];
}
