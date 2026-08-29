import { Check, RefreshCw } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { activateAgentHost, activateBrowserWorkflowWriter, discoverAgentHosts, prepareAgentHostProjection, type AgentHostRecord } from '../../services/agentHostDiscovery';
import { useAgentConnectionStore } from '../../stores/useAgentConnectionStore';

const SELECTED_HOST_KEY = 'flovart.agent.selectedHost';

function readSelectedHost() {
  try { return localStorage.getItem(SELECTED_HOST_KEY) || ''; } catch { return ''; }
}

function saveSelectedHost(id: string) {
  try { localStorage.setItem(SELECTED_HOST_KEY, id); } catch { /* storage is best effort */ }
}

function hostStatusLabel(host: AgentHostRecord) {
  if (host.status === 'planned') return '未来入口';
  return host.available ? '可用' : '未安装';
}

export function AgentHostPicker() {
  const [discovery, setDiscovery] = useState<Awaited<ReturnType<typeof discoverAgentHosts>>>({ ok: false, state: 'offline', agents: [] });
  const [selectedId, setSelectedId] = useState(readSelectedHost);
  const [writerNotice, setWriterNotice] = useState('');
  const [projection, setProjection] = useState<{ hostId: string; state: 'preparing' | 'ready' | 'external' | 'error'; message: string } | null>(null);
  const selectionRequest = useRef(0);
  const connectionStatus = useAgentConnectionStore(state => state.status);
  const writerStatus = useAgentConnectionStore(state => state.writerStatus);
  const activeHostIdentity = useAgentConnectionStore(state => state.activeHostIdentity);

  const scan = () => {
    let active = true;
    void discoverAgentHosts().then(result => {
      if (!active) return;
      setDiscovery(current => current.state === result.state
        && current.agents.length === result.agents.length
        && current.error === result.error
        && current.activeHostWriter?.agentIdentity === result.activeHostWriter?.agentIdentity
        && current.activeHostWriter?.projectId === result.activeHostWriter?.projectId
        ? current
        : result);
    });
    return () => { active = false; };
  };

  useEffect(() => scan(), [connectionStatus]);

  const available = useMemo(() => discovery.agents.filter(host => host.available), [discovery.agents]);
  const selected = available.find(host => host.id === selectedId) || available[0];

  useEffect(() => {
    if (!selected) return;
    if (selected.id !== selectedId) setSelectedId(selected.id);
    saveSelectedHost(selected.id);
  }, [selected, selectedId]);

  const selectHost = (id: string) => {
    const requestId = ++selectionRequest.current;
    setSelectedId(id);
    saveSelectedHost(id);
    const host = available.find(item => item.id === id);
    if (!host) return;
    setProjection({ hostId: id, state: 'preparing', message: '正在准备 Flovart 工作技能…' });
    void prepareAgentHostProjection(id).then(result => {
      if (requestId !== selectionRequest.current) return;
      if (result.projection.status !== 'external' && host.runtimeSurfaces.includes('browser-workflow')) {
        return activateAgentHost(id).then(activation => {
          if (requestId !== selectionRequest.current) return;
          setDiscovery(current => ({ ...current, activeHostWriter: activation.activeHostWriter }));
          setProjection({ hostId: id, state: result.projection.status, message: `${result.projection.message} 当前 Host 写入权已切换。` });
        });
      }
      setProjection({ hostId: id, state: result.projection.status, message: result.projection.message });
    }).catch(error => {
      if (requestId !== selectionRequest.current) return;
      setProjection({ hostId: id, state: 'error', message: error instanceof Error ? error.message : 'Agent Projection 暂时无法准备。' });
    });
  };

  const activateWriter = async () => {
    try {
      await activateBrowserWorkflowWriter();
      setWriterNotice('当前页面已获得画布写入权');
    } catch (error) {
      setWriterNotice(error instanceof Error ? error.message : '当前画布暂不可用');
    }
  };

  const activeHost = (activeHostIdentity || discovery.activeHostWriter?.agentIdentity)
    ? discovery.agents.find(host => host.id === (activeHostIdentity || discovery.activeHostWriter?.agentIdentity))
    : null;

  return (
    <div className="mx-3 mt-3 rounded-xl border px-3 py-2" style={{ borderColor: 'var(--isl-line)', background: 'var(--isl-surface)' }} data-testid="agent-host-picker">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-bold tracking-[0.14em]" style={{ color: 'var(--isl-ink-soft)' }}>AGENT HOST</p>
          <div className="mt-1 flex items-center gap-1.5 text-xs font-semibold" style={{ color: 'var(--isl-ink)' }}>
            {selected ? <><Check size={13} style={{ color: 'var(--isl-mint)' }} />{selected.label}</> : discovery.state === 'offline' ? '等待本机 Agent' : '未发现可用 Host'}
          </div>
        </div>
        <button type="button" onClick={scan} className="grid h-7 w-7 shrink-0 place-items-center rounded-md" style={{ color: 'var(--isl-ink-soft)' }} aria-label="重新扫描 Agent Host" title="重新扫描">
          <RefreshCw size={13} />
        </button>
      </div>
      {discovery.state === 'ready' && (
        <>
          <select aria-label="选择 Agent Host" value={selected?.id || ''} onChange={event => selectHost(event.target.value)} className="isl-well mt-2 h-8 w-full px-2 text-xs outline-none" disabled={!available.length}>
            {!available.length && <option value="">没有可用 Host</option>}
            {discovery.agents.map(host => (
              <option key={host.id} value={host.id} disabled={!host.available}>
                {host.label} · {hostStatusLabel(host)}
              </option>
            ))}
          </select>
          {projection?.hostId === selected?.id && <p className="mt-1 text-[10px]" role="status" data-testid="agent-projection-status" style={{ color: projection.state === 'error' ? 'var(--isl-coral)' : 'var(--isl-ink-soft)' }}>{projection.message}</p>}
          <p className="mt-1 text-[10px]" style={{ color: 'var(--isl-ink-soft)' }}>选择支持 Browser Workflow 的 Host 会准备对应 Skill 并切换 Host 写入权；不会读取登录凭证。</p>
          {activeHost && <p className="mt-1 text-[10px]" role="status" data-testid="agent-host-writer" style={{ color: 'var(--isl-ink-soft)' }}>当前 Host 写入权：{activeHost.label}</p>}
          <div className="mt-2 flex items-center justify-between gap-2 text-[10px]" data-testid="agent-active-writer">
            <span style={{ color: writerStatus === 'revoked' ? 'var(--isl-coral)' : 'var(--isl-ink-soft)' }}>画布写入者：{connectionStatus !== 'ready' ? '未连接' : writerStatus === 'active' ? '当前页面' : writerStatus === 'inactive' ? '其他页面' : writerStatus === 'revoked' ? '已断开' : '待确认'}</span>
            <button type="button" onClick={() => void activateWriter()} disabled={connectionStatus !== 'ready' || writerStatus === 'active'} className="isl-well px-2 py-1" style={{ color: 'var(--isl-ink)' }}>
              {writerStatus === 'active' ? '当前页面已激活' : writerStatus === 'revoked' ? '重新激活当前页面' : '激活当前页面'}
            </button>
          </div>
          {writerNotice && <p className="mt-1 text-[10px]" role="status" style={{ color: 'var(--isl-ink-soft)' }}>{writerNotice}</p>}
        </>
      )}
      {discovery.state === 'error' && <p className="mt-2 text-[10px]" style={{ color: 'var(--isl-coral)' }}>{discovery.error}</p>}
    </div>
  );
}
