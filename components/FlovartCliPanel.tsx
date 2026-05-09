import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { planFlovartInput, createLine, formatValue, QUICK_COMMANDS, HELP_TEXT, SETUP_TEXT, createFlovartSession } from '../tools/flovart/core.js';

interface FlovartCliPanelProps {
    theme: 'light' | 'dark';
    compactMode: boolean;
}

type CliLineKind = 'banner' | 'input' | 'output' | 'tool' | 'error';

interface CliLine {
    id: string;
    kind: CliLineKind;
    content: string;
    meta?: string;
    timestamp: number;
}

const STARTER_LINES: CliLine[] = [
    {
        id: 'banner-1',
        kind: 'banner',
        content: 'FlovartCli local runtime shell',
        meta: 'Type help to see available commands.',
        timestamp: Date.now(),
    },
];

const getRuntimeApi = () => (window as any).__flovartAPI;

export const FlovartCliPanel: React.FC<FlovartCliPanelProps> = ({ theme, compactMode }) => {
    const isDark = theme === 'dark';
    const [lines, setLines] = useState<CliLine[]>(STARTER_LINES);
    const [input, setInput] = useState('');
    const [isRunning, setIsRunning] = useState(false);
    const [history, setHistory] = useState<string[]>([]);
    const [historyIndex, setHistoryIndex] = useState<number | null>(null);
    const [session, setSession] = useState(() => createFlovartSession({ isDark }));

    const scrollRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const strongText = isDark ? 'text-[#F3F4F6]' : 'text-neutral-900';
    const mutedText = isDark ? 'text-[#667085]' : 'text-neutral-500';
    const borderClass = isDark ? 'border-[#2A3140]' : 'border-neutral-200';
    const terminalClass = isDark ? 'bg-[#080B10] text-[#D0D5DD]' : 'bg-neutral-950 text-neutral-100';
    const panelClass = `flex h-full min-h-0 flex-col ${compactMode ? 'gap-2 p-2' : 'gap-3 p-3'}`;

    const runtimeReady = !!getRuntimeApi();

    useEffect(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }, [lines]);

    const pushLine = useCallback((line: CliLine) => {
        setLines(prev => [...prev, line]);
    }, []);

    const runCommand = useCallback(async (command: string) => {
        const api = getRuntimeApi();
        const plan = planFlovartInput(command, session);
        if (!plan) return;

        if (!api && !/^help|setup$/i.test(command.trim())) {
            pushLine(createLine('error', 'Runtime unavailable. Open Flovart canvas in this page first.'));
            return;
        }

        const ctx = { sessionId: session.id, isDark };
        pushLine(createLine('output', `Plan:\n${plan.steps.map((step, index) => `${index + 1}. ${step}`).join('\n')}`));
        const result = await plan.run({ runtime: api || {}, emit: (kind, content, meta) => pushLine(createLine(kind, content, meta)), ctx });
        if (ctx.sessionId !== session.id || session.isDark !== isDark) {
            setSession({ ...session, id: ctx.sessionId || session.id, isDark });
        }
        pushLine(createLine('output', formatValue(result)));
    }, [isDark, pushLine, session]);

    const submitCommand = useCallback(async (commandOverride?: string) => {
        const command = (commandOverride ?? input).trim();
        if (!command || isRunning) return;
        setInput('');
        setHistory(prev => [...prev, command]);
        setHistoryIndex(null);
            pushLine(createLine('input', command, session.id ? `session ${session.id.slice(0, 8)}` : undefined));
            setIsRunning(true);
            try {
            await runCommand(command);
            } catch (error) {
            pushLine(createLine('error', error instanceof Error ? error.message : String(error)));
            } finally {
                setIsRunning(false);
            }
    }, [input, isRunning, pushLine, runCommand, session]);

    const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            submitCommand();
            return;
        }
        if (event.key === 'ArrowUp') {
            event.preventDefault();
            if (history.length === 0) return;
            const nextIndex = historyIndex === null ? history.length - 1 : Math.max(0, historyIndex - 1);
            setHistoryIndex(nextIndex);
            setInput(history[nextIndex]);
            return;
        }
        if (event.key === 'ArrowDown') {
            event.preventDefault();
            if (historyIndex === null) return;
            const nextIndex = historyIndex + 1;
            if (nextIndex >= history.length) {
                setHistoryIndex(null);
                setInput('');
                return;
            }
            setHistoryIndex(nextIndex);
            setInput(history[nextIndex]);
        }
    }, [history, historyIndex, submitCommand]);

    const clearTranscript = useCallback(() => {
        setLines(STARTER_LINES);
    }, []);

    const copyTranscript = useCallback(async () => {
        const transcript = lines.map(line => `[${line.kind}] ${line.content}`).join('\n\n');
        await navigator.clipboard.writeText(transcript);
    }, [lines]);

    const statusPill = useMemo(() => runtimeReady
        ? 'bg-emerald-500/15 text-emerald-400'
        : 'bg-yellow-500/15 text-yellow-400', [runtimeReady]);

    return (
        <div className={panelClass}>
            <div className={`rounded-2xl border ${borderClass} ${isDark ? 'bg-[#161A22]' : 'bg-neutral-50'} p-3`}>
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <div className={`text-[11px] font-semibold uppercase tracking-[0.18em] ${mutedText}`}>FlovartCli</div>
                        <h3 className={`mt-1 text-sm font-bold ${strongText}`}>Canvas-native agent shell</h3>
                        <p className={`mt-1 text-[11px] leading-relaxed ${mutedText}`}>
                            在右侧直接操作当前画布。这里不是系统 shell，而是 Flovart runtime command surface。
                        </p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold ${statusPill}`}>
                        {runtimeReady ? 'runtime on' : 'runtime off'}
                    </span>
                </div>
            </div>

            <div className="flex flex-wrap gap-1.5">
                {QUICK_COMMANDS.map(command => (
                    <button
                        key={command}
                        type="button"
                        onClick={() => submitCommand(command)}
                        disabled={isRunning}
                        className={`rounded-full border px-2.5 py-1 text-[10px] font-medium transition disabled:opacity-50 ${isDark ? 'border-[#2A3140] bg-[#161A22] text-[#98A2B3] hover:text-[#F3F4F6]' : 'border-neutral-200 bg-white text-neutral-500 hover:text-neutral-900'}`}
                    >
                        {command}
                    </button>
                ))}
            </div>

            <div className={`flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border ${borderClass} ${terminalClass}`}>
                <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
                    <div className="flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
                        <span className="h-2.5 w-2.5 rounded-full bg-yellow-400" />
                        <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                        <span className="ml-2 text-[10px] text-white/45">flovart runtime</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <button type="button" onClick={copyTranscript} className="rounded-md px-2 py-1 text-[10px] text-white/45 transition hover:bg-white/10 hover:text-white/80">copy</button>
                        <button type="button" onClick={clearTranscript} className="rounded-md px-2 py-1 text-[10px] text-white/45 transition hover:bg-white/10 hover:text-white/80">clear</button>
                    </div>
                </div>

                <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-3 py-3 font-mono text-[11px] leading-relaxed">
                    {lines.map(line => (
                        <div key={line.id} className="mb-3 last:mb-0">
                            {line.kind === 'input' ? (
                                <div>
                                    <span className="text-blue-300">flovart</span><span className="text-white/35"> $ </span><span>{line.content}</span>
                                    {line.meta && <span className="ml-2 text-white/25">{line.meta}</span>}
                                </div>
                            ) : (
                                <div className={line.kind === 'error' ? 'text-red-300' : line.kind === 'tool' ? 'text-emerald-300' : line.kind === 'banner' ? 'text-white' : 'text-white/72'}>
                                    {line.meta && <div className="mb-1 text-[10px] uppercase tracking-[0.14em] text-white/30">{line.meta}</div>}
                                    <pre className="whitespace-pre-wrap break-words font-mono">{line.content}</pre>
                                </div>
                            )}
                        </div>
                    ))}
                    {isRunning && <div className="text-white/35">running...</div>}
                </div>

                <div className="border-t border-white/10 px-3 py-2">
                    <div className="flex items-center gap-2 font-mono text-[11px]">
                        <span className="shrink-0 text-blue-300">flovart</span>
                        <span className="shrink-0 text-white/35">$</span>
                        <input
                            ref={inputRef}
                            value={input}
                            onChange={event => setInput(event.target.value)}
                            onKeyDown={handleKeyDown}
                            disabled={isRunning}
                            placeholder="type help, status, canvas.list..."
                            className="min-w-0 flex-1 bg-transparent text-white outline-none placeholder:text-white/25 disabled:opacity-50"
                        />
                        <button
                            type="button"
                            onClick={() => submitCommand()}
                            disabled={!input.trim() || isRunning}
                            className="rounded-lg bg-blue-500 px-2.5 py-1 text-[10px] font-semibold text-white transition hover:bg-blue-600 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/30"
                        >
                            run
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
