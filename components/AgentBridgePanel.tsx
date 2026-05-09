import React, { useEffect, useMemo, useState } from 'react';
import { QUICK_COMMANDS, SETUP_TEXT } from '../tools/flovart/core.js';

interface AgentBridgePanelProps {
    theme: 'light' | 'dark';
    compactMode: boolean;
}

const getRuntimeApi = () => (window as any).__flovartAPI;

export const AgentBridgePanel: React.FC<AgentBridgePanelProps> = ({ theme, compactMode }) => {
    const isDark = theme === 'dark';
    const [runtimeReady, setRuntimeReady] = useState(() => !!getRuntimeApi());
    const [status, setStatus] = useState<any>(null);
    const [copied, setCopied] = useState(false);

    const borderClass = isDark ? 'border-[#2A3140]' : 'border-neutral-200';
    const strongText = isDark ? 'text-[#F3F4F6]' : 'text-neutral-900';
    const mutedText = isDark ? 'text-[#98A2B3]' : 'text-neutral-500';
    const panelClass = `flex h-full min-h-0 flex-col overflow-y-auto ${compactMode ? 'gap-3 p-3' : 'gap-4 p-4'}`;

    useEffect(() => {
        const refresh = () => {
            const api = getRuntimeApi();
            setRuntimeReady(!!api);
            try {
                setStatus(api?.status?.() || null);
            } catch {
                setStatus(null);
            }
        };
        refresh();
        window.addEventListener('flovart:api-ready', refresh);
        const timer = window.setInterval(refresh, 3000);
        return () => {
            window.removeEventListener('flovart:api-ready', refresh);
            window.clearInterval(timer);
        };
    }, []);

    const provider = status?.provider;
    const statusPill = useMemo(() => runtimeReady
        ? 'bg-emerald-500/15 text-emerald-400'
        : 'bg-yellow-500/15 text-yellow-500', [runtimeReady]);

    const copySetup = async () => {
        await navigator.clipboard.writeText(SETUP_TEXT);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1200);
    };

    return (
        <div className={panelClass}>
            <div className={`rounded-2xl border ${borderClass} ${isDark ? 'bg-[#161A22]' : 'bg-neutral-50'} p-3`}>
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <div className={`text-[11px] font-semibold uppercase tracking-[0.18em] ${mutedText}`}>Agent Bridge</div>
                        <h3 className={`mt-1 text-sm font-bold ${strongText}`}>External agent control surface</h3>
                        <p className={`mt-1 text-[11px] leading-relaxed ${mutedText}`}>
                            Flovart only exposes deterministic media tools. Claude Code handles scripts, storyboards, prompts, and planning.
                        </p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold ${statusPill}`}>
                        {runtimeReady ? 'runtime on' : 'runtime off'}
                    </span>
                </div>
            </div>

            <div className={`rounded-2xl border ${borderClass} ${isDark ? 'bg-[#161A22]' : 'bg-white'} p-3`}>
                <h4 className={`text-xs font-bold ${strongText}`}>Provider readiness</h4>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[11px]">
                    {(['image', 'video', 'text'] as const).map(kind => (
                        <div key={kind} className={`rounded-xl border ${borderClass} ${isDark ? 'bg-[#12151B]' : 'bg-neutral-50'} px-2 py-2`}>
                            <div className={mutedText}>{kind}</div>
                            <div className={`mt-1 font-semibold ${provider?.configured?.[kind] ? 'text-emerald-400' : 'text-yellow-500'}`}>
                                {provider?.configured?.[kind] ? 'configured' : 'missing'}
                            </div>
                        </div>
                    ))}
                </div>
                <div className={`mt-3 space-y-1 text-[11px] ${mutedText}`}>
                    <div>Image model: <span className={strongText}>{provider?.selectedModels?.image || 'none'}</span></div>
                    <div>Video model: <span className={strongText}>{provider?.selectedModels?.video || 'none'}</span></div>
                </div>
            </div>

            <div className={`rounded-2xl border ${borderClass} ${isDark ? 'bg-[#161A22]' : 'bg-white'} p-3`}>
                <h4 className={`text-xs font-bold ${strongText}`}>Media runtime</h4>
                <div className={`mt-2 space-y-1 text-[11px] ${mutedText}`}>
                    <div>Canvas media elements: <span className={strongText}>{status?.mediaElements ?? 0}</span></div>
                    <div>Runtime jobs: <span className={strongText}>{status?.jobs ?? 0}</span></div>
                    <div>Canvas contract: <span className={strongText}>images/videos only</span></div>
                </div>
            </div>

            <div className={`rounded-2xl border ${borderClass} ${isDark ? 'bg-[#161A22]' : 'bg-white'} p-3`}>
                <h4 className={`text-xs font-bold ${strongText}`}>Agent protocol</h4>
                <ol className={`mt-2 list-decimal space-y-1 pl-4 text-[11px] leading-relaxed ${mutedText}`}>
                    <li>Claude Code calls `flovart.status` and `flovart.provider_status`.</li>
                    <li>If needed, it calls `flovart.provider_begin_setup`; API keys stay in Flovart UI.</li>
                    <li>Claude Code creates storyboard prompts in its own interface.</li>
                    <li>Flovart generates images/videos and places only media on canvas.</li>
                </ol>
            </div>

            <div className={`rounded-2xl border ${borderClass} ${isDark ? 'bg-[#080B10]' : 'bg-neutral-950'} p-3 text-neutral-100`}>
                <div className="flex items-center justify-between gap-2">
                    <h4 className="text-xs font-bold">MCP / CLI setup</h4>
                    <button type="button" onClick={copySetup} className="rounded-lg bg-white/10 px-2 py-1 text-[10px] font-semibold text-white/70 hover:bg-white/15 hover:text-white">
                        {copied ? 'copied' : 'copy'}
                    </button>
                </div>
                <pre className="mt-2 whitespace-pre-wrap break-words font-mono text-[10px] leading-relaxed text-white/70">{SETUP_TEXT}</pre>
            </div>

            <div className={`rounded-2xl border ${borderClass} ${isDark ? 'bg-[#161A22]' : 'bg-white'} p-3`}>
                <h4 className={`text-xs font-bold ${strongText}`}>Available tool families</h4>
                <div className="mt-2 flex flex-wrap gap-1.5">
                    {QUICK_COMMANDS.map(command => (
                        <span key={command} className={`rounded-full border px-2 py-1 text-[10px] ${isDark ? 'border-[#2A3140] text-[#98A2B3]' : 'border-neutral-200 text-neutral-500'}`}>
                            {command}
                        </span>
                    ))}
                </div>
            </div>
        </div>
    );
};
