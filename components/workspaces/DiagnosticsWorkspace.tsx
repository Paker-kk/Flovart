import React from 'react';
import type { ModelPreference, UserApiKey } from '../../types';
import { getKeySyncStatus, getRuntimeBridgeStatus } from '../../services/runtimeBridgeState';
import {
  getRuntimeTraceSnapshot,
  subscribeRuntimeTrace,
} from '../../services/runtimeTraceStore';
import type { RuntimeTraceSnapshot } from '../../types/runtimeTrace';

interface DiagnosticsWorkspaceProps {
  userApiKeys: UserApiKey[];
  modelPreference: ModelPreference;
}

function formatTime(timestamp?: number): string {
  if (!timestamp) return '--:--:--';
  return new Date(timestamp).toLocaleTimeString();
}

export const DiagnosticsWorkspace: React.FC<DiagnosticsWorkspaceProps> = ({
  userApiKeys,
  modelPreference,
}) => {
  const [snapshot, setSnapshot] = React.useState<RuntimeTraceSnapshot>(() => getRuntimeTraceSnapshot());
  const [tick, setTick] = React.useState(0);

  React.useEffect(() => subscribeRuntimeTrace(setSnapshot), []);
  React.useEffect(() => {
    const timer = window.setInterval(() => setTick((value) => value + 1), 2500);
    return () => window.clearInterval(timer);
  }, []);

  const bridgeStatus = React.useMemo(() => getRuntimeBridgeStatus(), [tick]);
  const keyStatus = React.useMemo(
    () => getKeySyncStatus({ userApiKeys, modelPreference }),
    [modelPreference, tick, userApiKeys],
  );
  const selectedJob = snapshot.jobs[0] ?? null;
  const visibleEvents = selectedJob
    ? snapshot.events.filter((event) => event.jobId === selectedJob.jobId).slice(-18).reverse()
    : snapshot.events.slice(-18).reverse();

  return (
    <div className="workspace-view h-full overflow-auto bg-[#0b101d] px-5 py-4 text-white">
      <div className="mx-auto grid max-w-[1500px] gap-4 xl:grid-cols-[320px_1fr_420px]">
        <section className="workspace-shell rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="text-xs uppercase tracking-[0.18em] text-white/45">Bridge</div>
          <div className="mt-3 space-y-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-white/55">Environment</span>
              <span className="text-white/90">{bridgeStatus.environment}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-white/55">Runtime API</span>
              <span className={bridgeStatus.runtimeApiAvailable ? 'text-emerald-300' : 'text-rose-300'}>
                {bridgeStatus.runtimeApiAvailable ? 'online' : 'offline'}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-white/55">Chrome storage</span>
              <span className={bridgeStatus.chromeStorageAvailable ? 'text-emerald-300' : 'text-white/45'}>
                {bridgeStatus.chromeStorageAvailable ? 'available' : 'unavailable'}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-white/55">Last check</span>
              <span className="text-white/70">{formatTime(bridgeStatus.lastCheckedAt)}</span>
            </div>
          </div>

          <div className="mt-6 text-xs uppercase tracking-[0.18em] text-white/45">Key Sync</div>
          <div className="mt-3 space-y-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-white/55">Source</span>
              <span className="text-white/90">{keyStatus.source}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-white/55">Shared</span>
              <span className={keyStatus.sharedWithExtension ? 'text-emerald-300' : 'text-white/45'}>
                {keyStatus.sharedWithExtension ? 'enabled' : 'local only'}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-white/55">Keys</span>
              <span className="text-white/90">{keyStatus.keyCount}</span>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/20 p-3 text-xs text-white/65">
              <div>{keyStatus.activeProvider || 'unknown provider'}</div>
              <div className="mt-1 break-all text-white/45">{keyStatus.activeModel || 'no active model'}</div>
            </div>
          </div>
        </section>

        <section className="workspace-shell min-h-[520px] rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs uppercase tracking-[0.18em] text-white/45">Runtime Jobs</div>
            <div className="text-xs text-white/40">{snapshot.jobs.length} jobs</div>
          </div>
          <div className="mt-4 space-y-2">
            {snapshot.jobs.length === 0 && (
              <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-6 text-center text-sm text-white/45">
                No runtime jobs yet
              </div>
            )}
            {snapshot.jobs.slice(0, 18).map((job) => (
              <div key={job.jobId} className="rounded-lg border border-white/10 bg-black/20 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm text-white/90">{job.command}</div>
                    <div className="mt-1 text-xs text-white/45">{job.source} · {job.jobId.slice(-8)}</div>
                  </div>
                  <span className={`rounded-full px-2 py-1 text-[10px] ${
                    job.status === 'success'
                      ? 'bg-emerald-400/15 text-emerald-200'
                      : job.status === 'error'
                        ? 'bg-rose-400/15 text-rose-200'
                        : 'bg-sky-400/15 text-sky-200'
                  }`}>
                    {job.status}
                  </span>
                </div>
                {job.error && <div className="mt-2 text-xs text-rose-200">{job.error}</div>}
                <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-white/45">
                  <div>Created {formatTime(job.createdAt)}</div>
                  <div>Updated {formatTime(job.updatedAt)}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="workspace-shell rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs uppercase tracking-[0.18em] text-white/45">Trace Timeline</div>
            <div className="text-xs text-white/40">{snapshot.events.length} events</div>
          </div>
          <div className="mt-4 space-y-2">
            {visibleEvents.length === 0 && (
              <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-6 text-center text-sm text-white/45">
                No trace events yet
              </div>
            )}
            {visibleEvents.map((event) => (
              <div key={event.id} className="rounded-lg border border-white/10 bg-black/20 p-3">
                <div className="flex items-center justify-between gap-3">
                  <span className={`text-xs ${
                    event.level === 'error'
                      ? 'text-rose-200'
                      : event.level === 'warn'
                        ? 'text-amber-200'
                        : 'text-sky-200'
                  }`}>
                    {event.stage}
                  </span>
                  <span className="text-[11px] text-white/40">{formatTime(event.timestamp)}</span>
                </div>
                <div className="mt-1 text-sm text-white/80">{event.message}</div>
                {(event.nodeId || event.jobId) && (
                  <div className="mt-2 text-[11px] text-white/40">
                    {event.nodeId ? `node ${event.nodeId}` : `job ${event.jobId?.slice(-8)}`}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};
