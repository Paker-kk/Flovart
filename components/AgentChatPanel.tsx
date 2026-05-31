import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { GenerationHistoryItem } from '../types';
import { getFlovartRuntimeApi, getRuntimeErrorMessage } from '../services/flovartRuntime';
import { useWorkspaceStore } from '../stores/useWorkspaceStore';
import { executeFlovartCommand } from '../tools/flovart/core.js';

interface AgentChatPanelProps {
    theme: 'light' | 'dark';
    compactMode: boolean;
    generationHistory: GenerationHistoryItem[];
    onCreateImage?: (prompt: string, name?: string) => Promise<void>;
    onCreateVideo?: (prompt: string, sourceImageIds?: string[]) => Promise<void>;
    runtimeStage?: string;
    runtimeJobs?: RuntimeJobSnapshot[];
}

interface RuntimeJobSnapshot {
    jobId: string;
    command: string;
    status: 'accepted' | 'running' | 'succeeded' | 'failed' | 'canceled';
    progress: {
        pct: number;
        stage: string;
    };
    updatedAt: number;
}

interface MessageLog {
    id: string;
    sender: 'user' | 'agent' | 'system';
    text: string;
    time: string;
    role: string;
    status?: 'idle' | 'running' | 'error' | 'success';
}

const panelCopy = {
    zho: {
        eyebrow: 'Agent Chat',
        title: 'Agent 对话',
        subtitle: '一句话描述需求，我会创建图层、写入提示词并开始生成。',
        initial: '我准备好了。直接告诉我你想做什么，越具体越好。',
        agentFailed: '任务执行失败。',
        noHistory: '还没有生成历史。',
        inputPlaceholder: '例如：做一张电影感红色调海报，人物在雨夜街头。Shift+Enter 换行',
        online: 'Agent 在线',
        openSystemPrompt: 'System Prompt',
        systemPromptTitle: '自定义 System Prompt',
        systemPromptHint: '控制 Agent 的语气、执行方式和提示词风格。',
        history: '历史记录',
        planTitle: '即将执行',
        exec: '执行',
        run: '执行中',
        imageStarted: '图片任务已开始。完成后会出现在历史记录里。',
        videoStarted: '视频任务已开始。完成后会出现在历史记录里。',
        imageSteps: ['创建图片图层', '写入增强后的提示词', '启动当前图片模型'],
        videoSteps: ['创建视频图层', '写入增强后的提示词', '启动当前视频模型'],
    },
    en: {
        eyebrow: 'Agent Chat',
        title: 'Agent Chat',
        subtitle: 'Describe the outcome once. I will create the layer, write the prompt, and start generation.',
        initial: 'I am ready. Tell me what you want to make. More detail helps.',
        agentFailed: 'Task execution failed.',
        noHistory: 'No generation history yet.',
        inputPlaceholder: 'Example: a cinematic red poster. Shift+Enter for newline',
        online: 'Agent online',
        openSystemPrompt: 'System Prompt',
        systemPromptTitle: 'Custom System Prompt',
        systemPromptHint: 'Control the agent tone, execution behavior, and prompt style.',
        history: 'History',
        planTitle: 'Next action',
        exec: 'Execute',
        run: 'Running',
        imageStarted: 'Image task started. It will appear in history when complete.',
        videoStarted: 'Video task started. It will appear in history when complete.',
        imageSteps: ['Create image layer', 'Write enhanced prompt', 'Start current image model'],
        videoSteps: ['Create video layer', 'Write enhanced prompt', 'Start current video model'],
    },
} as const;

const nowLabel = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

const createAgentElementId = () => `agent_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const inferAction = (text: string): 'image' | 'video' => (
    /视频|短片|镜头|运镜|motion|camera|video|clip/i.test(text) ? 'video' : 'image'
);

export const AgentChatPanel: React.FC<AgentChatPanelProps> = ({
    theme,
    compactMode,
    generationHistory,
    onCreateImage,
    onCreateVideo,
}) => {
    const language = useWorkspaceStore(state => state.language);
    const copy = language === 'zho' ? panelCopy.zho : panelCopy.en;
    const [typedText, setTypedText] = useState('');
    const [isRunning, setIsRunning] = useState(false);
    const [showSystemPromptEditor, setShowSystemPromptEditor] = useState(false);
    const [showHistory, setShowHistory] = useState(false);
    const [systemPrompt, setSystemPrompt] = useState(
        language === 'zho'
            ? '你是 Flovart 的内置创作助手。把用户需求转成简洁、可执行、适合图像或视频生成的提示词。'
            : 'You are Flovart\'s built-in creative assistant. Turn user requests into concise executable image or video prompts.'
    );
    const [logs, setLogs] = useState<MessageLog[]>([
        {
            id: 'init_1',
            sender: 'agent',
            text: copy.initial,
            time: nowLabel(),
            role: 'Agent',
            status: 'idle',
        },
    ]);

    const endRef = useRef<HTMLDivElement>(null);
    const recentHistory = useMemo(() => generationHistory.slice(-5).reverse(), [generationHistory]);
    const pendingAction = inferAction(typedText.trim());
    const executionPlan = pendingAction === 'video' ? copy.videoSteps : copy.imageSteps;

    useEffect(() => {
        endRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [logs]);

    useEffect(() => {
        setLogs(prev => prev.map((log, index) => (
            index === 0 && log.id === 'init_1' ? { ...log, text: copy.initial } : log
        )));
    }, [copy.initial]);

    const pushLog = (entry: Omit<MessageLog, 'id' | 'time'>) => {
        setLogs(prev => [...prev, { ...entry, id: `${entry.sender}_${Date.now()}_${prev.length}`, time: nowLabel() }]);
    };

    const handleCommitStream = async () => {
        const prompt = typedText.trim();
        if (!prompt || isRunning) return;

        const action = inferAction(prompt);
        const finalPrompt = `${systemPrompt}\n\nUser request:\n${prompt}`;
        const layerName = language === 'zho'
            ? `Agent 产物 ${generationHistory.length + 1}`
            : `Agent Output ${generationHistory.length + 1}`;

        setTypedText('');
        pushLog({ sender: 'user', text: prompt, role: 'You' });
        setIsRunning(true);

        try {
            const runtimeApi = getFlovartRuntimeApi();

            if (runtimeApi) {
                const created = await executeFlovartCommand('element.create', {
                    id: createAgentElementId(),
                    type: action,
                    name: layerName,
                    x: 120 + generationHistory.length * 32,
                    y: 140 + generationHistory.length * 28,
                    width: action === 'video' ? 240 : 180,
                    height: action === 'video' ? 140 : 180,
                }, runtimeApi);

                const elementId = typeof created.id === 'string' ? created.id : '';
                if (created.ok === false || !elementId) {
                    throw new Error(getRuntimeErrorMessage(created, 'Agent 创建图层失败。'));
                }

                const updated = await executeFlovartCommand('element.update-prompt', { elementId, textPrompt: finalPrompt }, runtimeApi);
                if (updated.ok === false) {
                    throw new Error(getRuntimeErrorMessage(updated, 'Agent 写入提示词失败。'));
                }

                const ignited = await executeFlovartCommand('element.ignite', { elementId }, runtimeApi);
                if (ignited.ok === false) {
                    throw new Error(getRuntimeErrorMessage(ignited, 'Agent 启动生成失败。'));
                }
            } else if (action === 'video') {
                await onCreateVideo?.(finalPrompt);
            } else {
                await onCreateImage?.(finalPrompt, layerName);
            }

            pushLog({
                sender: 'agent',
                text: action === 'video' ? copy.videoStarted : copy.imageStarted,
                role: 'Agent',
                status: 'success',
            });
        } catch (error) {
            pushLog({
                sender: 'system',
                text: error instanceof Error ? error.message : copy.agentFailed,
                role: 'Runtime',
                status: 'error',
            });
        } finally {
            setIsRunning(false);
        }
    };

    return (
        <div className={`flv-agent-dock flex h-full min-h-0 flex-col ${compactMode ? 'text-[11px]' : 'text-xs'}`} style={{ background: 'var(--isl-surface)', borderLeft: '1.5px solid var(--isl-border)', color: 'var(--isl-ink)', fontFamily: 'var(--isl-font)' }}>
            <div className="flex items-center justify-between gap-3 px-4 py-3" style={{ borderBottom: '1.5px solid var(--isl-border)' }}>
                <div className="flex items-center gap-2.5 min-w-0">
                    <span className="isl-avatar text-[15px]" style={{ background: 'var(--isl-mint)', color: '#fff' }}>🌱</span>
                    <div className="min-w-0">
                        <div className="text-[15px] font-extrabold tracking-[-0.01em]" style={{ color: 'var(--isl-ink)' }}>{copy.title}</div>
                        <div className="flex items-center gap-1.5 text-[10px] font-semibold" style={{ color: 'var(--isl-mint-deep)' }}>
                            <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: 'var(--isl-mint)' }} />
                            {copy.online}
                        </div>
                    </div>
                </div>
                <button
                    type="button"
                    onClick={() => setShowSystemPromptEditor(prev => !prev)}
                    className={`isl-chip h-7 px-3 text-[11px] ${showSystemPromptEditor ? 'isl-chip--active' : ''}`}
                    title={copy.systemPromptTitle}
                >
                    {copy.openSystemPrompt}
                </button>
            </div>

            {showSystemPromptEditor && (
                <div className="px-4 pt-3">
                    <div className="isl-well p-3">
                        <div className="mb-2 flex items-center justify-between gap-3">
                            <div className="text-[12px] font-bold" style={{ color: 'var(--isl-ink)' }}>
                                {copy.systemPromptTitle}
                            </div>
                            <div className="text-[10px]" style={{ color: 'var(--isl-ink-ghost)' }}>
                                {systemPrompt.length}
                            </div>
                        </div>
                        <textarea
                            value={systemPrompt}
                            onChange={(event) => setSystemPrompt(event.target.value)}
                            rows={3}
                            className="w-full resize-none rounded-xl border-none bg-transparent text-[12px] leading-relaxed outline-none"
                            style={{ color: 'var(--isl-ink)' }}
                            placeholder={copy.systemPromptHint}
                        />
                    </div>
                </div>
            )}

            <div className="flex min-h-0 flex-1 flex-col">
                <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-4 select-text">
                    {logs.map(log => {
                        const isUser = log.sender === 'user';
                        const isError = log.status === 'error';
                        const avatar = isUser ? '🧑' : isError ? '⚠️' : '🌱';
                        return (
                            <div key={log.id} className={`flex items-end gap-2 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
                                <span
                                    className="isl-avatar"
                                    style={{
                                        background: isUser ? 'var(--isl-surface-2)' : isError ? 'rgba(232,97,90,0.18)' : 'var(--isl-mint)',
                                    }}
                                >
                                    {avatar}
                                </span>
                                <div className={`min-w-0 max-w-[80%] ${isUser ? 'items-end' : 'items-start'} flex flex-col`}>
                                    <div className="mb-1 px-1 text-[10px] font-semibold" style={{ color: 'var(--isl-ink-ghost)' }}>
                                        {log.time}
                                    </div>
                                    <div className={`isl-bubble px-3.5 py-2.5 text-[13px] ${isUser ? 'isl-bubble--user' : isError ? 'isl-bubble--error' : 'isl-bubble--agent'}`}>
                                        {log.text}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                    <div ref={endRef} />
                </div>

                <div className="px-4 py-3" style={{ borderTop: '1.5px solid var(--isl-border)' }}>
                    <div className="mb-3">
                        <button
                            type="button"
                            onClick={() => setShowHistory(prev => !prev)}
                            className="mb-2 flex w-full items-center justify-between text-[11px] font-bold"
                            style={{ color: 'var(--isl-ink-soft)' }}
                        >
                            <span className="flex items-center gap-1.5">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" className={`transition-transform ${showHistory ? 'rotate-90' : ''}`}>
                                    <path d="m9 18 6-6-6-6" />
                                </svg>
                                {copy.history}
                            </span>
                            <span className="rounded-full px-2 py-0.5 text-[10px] tabular-nums" style={{ background: 'var(--isl-surface-2)', color: 'var(--isl-ink-soft)' }}>
                                {generationHistory.length}
                            </span>
                        </button>
                        {showHistory && (
                            <div className="max-h-[132px] space-y-2 overflow-y-auto pr-0.5">
                                {recentHistory.length === 0 ? (
                                    <div className="rounded-2xl border-[1.5px] px-3 py-3 text-[12px]" style={{ borderColor: 'var(--isl-border)', background: 'var(--isl-card)', color: 'var(--isl-ink-ghost)' }}>
                                        {copy.noHistory}
                                    </div>
                                ) : (
                                    recentHistory.map(item => (
                                        <div
                                            key={item.id}
                                            className="flex items-center gap-3 rounded-2xl border-[1.5px] px-3 py-2"
                                            style={{ borderColor: 'var(--isl-border)', background: 'var(--isl-card)', boxShadow: '0 2px 0 0 var(--isl-edge)' }}
                                        >
                                            <div className="h-10 w-10 shrink-0 overflow-hidden rounded-xl" style={{ background: 'var(--isl-surface-2)' }}>
                                                <img src={item.dataUrl} alt={item.name || item.prompt} className="h-full w-full object-cover" />
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <div className="truncate text-[12px] font-bold" style={{ color: 'var(--isl-ink)' }}>
                                                    {item.name || item.prompt}
                                                </div>
                                                <div className="mt-0.5 text-[10px]" style={{ color: 'var(--isl-ink-soft)' }}>
                                                    {item.width} x {item.height}
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        )}
                    </div>

                    {typedText.trim() && (
                        <div className="isl-bubble isl-bubble--agent mb-3 px-3 py-3">
                            <div className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: 'var(--isl-mint-deep)' }}>
                                <span>{pendingAction === 'video' ? '🎬' : '🖼️'}</span>
                                {copy.planTitle}
                            </div>
                            <div className="space-y-1.5 text-[11px] leading-relaxed">
                                {executionPlan.map((step, index) => (
                                    <div key={step} className="flex items-center gap-2">
                                        <span className="inline-flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold" style={{ background: 'var(--isl-mint-bg)', color: 'var(--isl-mint-deep)' }}>
                                            {index + 1}
                                        </span>
                                        <span style={{ color: 'var(--isl-ink-soft)' }}>{step}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="isl-well flex items-center gap-2 px-2 py-2">
                        <textarea
                            rows={1}
                            className="min-h-9 max-h-32 min-w-0 flex-1 resize-none border-0 bg-transparent px-2 py-2 text-[13px] leading-relaxed outline-none"
                            style={{ color: 'var(--isl-ink)', fontFamily: 'var(--isl-font)' }}
                            placeholder={copy.inputPlaceholder}
                            value={typedText}
                            disabled={isRunning}
                            onChange={(event) => setTypedText(event.target.value)}
                            onKeyDown={(event) => {
                                if (event.key === 'Enter' && !event.shiftKey) {
                                    event.preventDefault();
                                    void handleCommitStream();
                                }
                            }}
                        />
                        <button
                            type="button"
                            onClick={() => void handleCommitStream()}
                            disabled={!typedText.trim() || isRunning}
                            className="isl-go h-9 px-4 text-[12px]"
                        >
                            {isRunning ? copy.run : copy.exec}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AgentChatPanel;
