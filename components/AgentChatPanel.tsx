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
        inputPlaceholder: '例如：做一张电影感红色调海报，人物在雨夜街头',
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
        inputPlaceholder: 'Example: a cinematic red poster, character in a rainy night street',
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
    const isDark = theme === 'dark';
    const language = useWorkspaceStore(state => state.language);
    const copy = language === 'zho' ? panelCopy.zho : panelCopy.en;
    const [typedText, setTypedText] = useState('');
    const [isRunning, setIsRunning] = useState(false);
    const [showSystemPromptEditor, setShowSystemPromptEditor] = useState(false);
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
        pushLog({
            sender: 'system',
            text: `${copy.planTitle}: ${executionPlan.map((step, index) => `${index + 1}. ${step}`).join(' / ')}`,
            role: 'Plan',
            status: 'idle',
        });
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
        <div className={`flv-agent-dock flex h-full min-h-0 flex-col border-l ${
            isDark
                ? 'border-white/8 bg-[radial-gradient(circle_at_18%_0%,rgba(255,255,255,0.08),transparent_34%),linear-gradient(180deg,#11151d_0%,#090c12_100%)]'
                : 'border-neutral-200 bg-[linear-gradient(180deg,#fbfaf7_0%,#f5f3ee_44%,#ffffff_100%)]'
        } ${compactMode ? 'text-[11px]' : 'text-xs'}`}>
            <div className={`border-b px-4 py-4 ${isDark ? 'border-white/8 bg-black/10' : 'border-black/8 bg-white/60 backdrop-blur-xl'}`}>
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <div className={`text-[10px] font-bold uppercase tracking-[0.18em] ${isDark ? 'text-white/36' : 'text-neutral-400'}`}>
                            {copy.eyebrow}
                        </div>
                        <div className={`mt-1 text-[18px] font-semibold tracking-[-0.03em] ${isDark ? 'text-white' : 'text-neutral-950'}`}>
                            {copy.title}
                        </div>
                        <p className={`mt-1 max-w-[280px] text-[12px] leading-relaxed ${isDark ? 'text-white/56' : 'text-neutral-600'}`}>
                            {copy.subtitle}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={() => setShowSystemPromptEditor(prev => !prev)}
                        className={`flv-elastic rounded-full border px-3 py-1.5 text-[11px] font-medium ${
                            showSystemPromptEditor
                                ? isDark
                                    ? 'border-white/18 bg-white/12 text-white'
                                    : 'border-neutral-950 bg-neutral-950 text-white'
                                : isDark
                                    ? 'border-white/10 bg-white/[0.05] text-white/72 hover:bg-white/[0.08] hover:text-white'
                                    : 'border-neutral-200 bg-white text-neutral-700 shadow-sm hover:border-neutral-300 hover:text-neutral-950'
                        }`}
                    >
                        {copy.openSystemPrompt}
                    </button>
                </div>

                {showSystemPromptEditor && (
                    <div className={`flv-message-card mt-3 rounded-3xl border p-3 ${
                        isDark ? 'border-white/10 bg-white/[0.045]' : 'border-neutral-200 bg-white/82 shadow-sm'
                    }`}>
                        <div className="mb-2 flex items-center justify-between gap-3">
                            <div className={`text-[12px] font-semibold ${isDark ? 'text-white/84' : 'text-neutral-900'}`}>
                                {copy.systemPromptTitle}
                            </div>
                            <div className={`text-[10px] ${isDark ? 'text-white/36' : 'text-neutral-400'}`}>
                                {systemPrompt.length}
                            </div>
                        </div>
                        <textarea
                            value={systemPrompt}
                            onChange={(event) => setSystemPrompt(event.target.value)}
                            rows={4}
                            className={`flv-safe-input w-full resize-none rounded-2xl border px-3 py-2 text-[12px] leading-relaxed outline-none transition ${
                                isDark
                                    ? 'border-white/10 bg-[#0d1117] text-white placeholder:text-white/30'
                                    : 'border-neutral-200 bg-white text-neutral-900 placeholder:text-neutral-400'
                            }`}
                            placeholder={copy.systemPromptHint}
                        />
                    </div>
                )}
            </div>

            <div className="flex min-h-0 flex-1 flex-col">
                <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-4 select-text">
                    {logs.map(log => {
                        const isUser = log.sender === 'user';
                        const isError = log.status === 'error';
                        return (
                            <div key={log.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                                <div className="max-w-[92%]">
                                    <div className={`mb-1 flex items-center gap-2 text-[10px] ${isDark ? 'text-white/34' : 'text-neutral-400'}`}>
                                        <span className="font-semibold">{log.role}</span>
                                        <span>{log.time}</span>
                                    </div>
                                    <div className={`flv-message-card rounded-3xl border px-4 py-3 text-[13px] leading-relaxed shadow-sm ${
                                        isUser
                                            ? isDark
                                                ? 'border-white/10 bg-white/[0.08] text-white'
                                                : 'border-neutral-950 bg-neutral-950 text-white'
                                            : isError
                                                ? isDark
                                                    ? 'border-rose-500/30 bg-rose-500/10 text-rose-100'
                                                    : 'border-rose-200 bg-rose-50 text-rose-700'
                                                : isDark
                                                    ? 'border-white/10 bg-white/[0.045] text-white/88'
                                                    : 'border-neutral-200 bg-white text-neutral-800'
                                    }`}>
                                        {log.text}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                    <div ref={endRef} />
                </div>

                <div className={`border-t px-4 py-3 ${isDark ? 'border-white/8 bg-black/10' : 'border-neutral-200 bg-neutral-50/80'}`}>
                    <div className="mb-3">
                        <div className={`mb-2 flex items-center justify-between text-[11px] font-semibold ${isDark ? 'text-white/72' : 'text-neutral-700'}`}>
                            <span>{copy.history}</span>
                            <span className={`rounded-full px-2 py-0.5 text-[10px] tabular-nums ${isDark ? 'bg-white/[0.06] text-white/42' : 'bg-white text-neutral-400 ring-1 ring-neutral-200'}`}>
                                {generationHistory.length}
                            </span>
                        </div>
                        <div className="max-h-[132px] space-y-2 overflow-y-auto pr-0.5">
                            {recentHistory.length === 0 ? (
                                <div className={`rounded-3xl border px-3 py-3 text-[12px] ${
                                    isDark ? 'border-white/10 bg-white/[0.03] text-white/44' : 'border-neutral-200 bg-white text-neutral-500'
                                }`}>
                                    {copy.noHistory}
                                </div>
                            ) : (
                                recentHistory.map(item => (
                                    <div
                                        key={item.id}
                                        className={`flv-elastic flex items-center gap-3 rounded-3xl border px-3 py-2 ${
                                            isDark ? 'border-white/10 bg-white/[0.04]' : 'border-neutral-200 bg-white shadow-sm'
                                        }`}
                                    >
                                        <div className={`h-10 w-10 shrink-0 overflow-hidden rounded-2xl ${isDark ? 'bg-[#0b0f15]' : 'bg-neutral-100'}`}>
                                            <img src={item.dataUrl} alt={item.name || item.prompt} className="h-full w-full object-cover" />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <div className={`truncate text-[12px] font-medium ${isDark ? 'text-white/84' : 'text-neutral-800'}`}>
                                                {item.name || item.prompt}
                                            </div>
                                            <div className={`mt-0.5 text-[10px] ${isDark ? 'text-white/36' : 'text-neutral-500'}`}>
                                                {item.width} x {item.height}
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    {typedText.trim() && (
                        <div className={`flv-message-card mb-3 rounded-3xl border px-3 py-3 ${
                            isDark ? 'border-white/10 bg-white/[0.04] text-white/76' : 'border-neutral-200 bg-white text-neutral-700 shadow-sm'
                        }`}>
                            <div className={`mb-2 text-[10px] font-bold uppercase tracking-[0.14em] ${isDark ? 'text-white/36' : 'text-neutral-400'}`}>
                                {copy.planTitle}
                            </div>
                            <div className="space-y-1.5 text-[11px] leading-relaxed">
                                {executionPlan.map((step, index) => (
                                    <div key={step} className="flex items-center gap-2">
                                        <span className={`inline-flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold ${
                                            isDark ? 'bg-white/[0.08] text-white/68' : 'bg-neutral-100 text-neutral-600'
                                        }`}>
                                            {index + 1}
                                        </span>
                                        <span>{step}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className={`flex items-center gap-2 rounded-3xl border px-2 py-2 shadow-sm ${
                        isDark ? 'border-white/10 bg-[#0d1117]' : 'border-neutral-200 bg-white'
                    }`}>
                        <input
                            type="text"
                            className={`min-w-0 flex-1 border-0 bg-transparent px-2 font-sans text-[13px] outline-none ${
                                isDark ? 'text-[#E5E7EB] placeholder:text-[#667085]' : 'text-neutral-800 placeholder:text-neutral-400'
                            }`}
                            placeholder={copy.inputPlaceholder}
                            value={typedText}
                            disabled={isRunning}
                            onChange={(event) => setTypedText(event.target.value)}
                            onKeyDown={(event) => {
                                if (event.key === 'Enter') {
                                    event.preventDefault();
                                    void handleCommitStream();
                                }
                            }}
                        />
                        <button
                            type="button"
                            onClick={() => void handleCommitStream()}
                            disabled={!typedText.trim() || isRunning}
                            className="flv-elastic flv-primary-action rounded-2xl px-4 py-2 text-[12px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {isRunning ? copy.run : copy.exec}
                        </button>
                    </div>

                    <div className={`mt-2 text-right text-[10px] ${isDark ? 'text-white/30' : 'text-neutral-400'}`}>
                        {copy.online}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AgentChatPanel;
