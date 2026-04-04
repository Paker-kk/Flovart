import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { AgentConfig, AgentMessage, AgentBudget, AgentSession, UserApiKey } from '../types';
import {
    PRESET_ROLES,
    getRoleById,
    createDefaultTeam,
    createDefaultBudget,
    createSession,
    AgentOrchestrator,
} from '../services/agentOrchestrator';

interface AgentChatPanelProps {
    theme: 'light' | 'dark';
    compactMode: boolean;
    textModel: string;
    getApiKeyForModel: (model: string) => UserApiKey | undefined;
    onFinalPrompt: (prompt: string) => void;
    onGenerateImage: (prompt: string) => void;
}

export const AgentChatPanel: React.FC<AgentChatPanelProps> = ({
    theme,
    compactMode,
    textModel,
    getApiKeyForModel,
    onFinalPrompt,
    onGenerateImage,
}) => {
    const isDark = theme === 'dark';
    const [agents, setAgents] = useState<AgentConfig[]>(() => {
        const saved = localStorage.getItem('agent_team_config');
        if (saved) try { return JSON.parse(saved); } catch { /* ignore */ }
        return createDefaultTeam();
    });
    const [budget, setBudget] = useState<AgentBudget>(() => {
        const saved = localStorage.getItem('agent_budget_config');
        if (saved) try { return JSON.parse(saved); } catch { /* ignore */ }
        return createDefaultBudget();
    });
    const [messages, setMessages] = useState<AgentMessage[]>([]);
    const [task, setTask] = useState('');
    const [status, setStatus] = useState<AgentSession['status']>('idle');
    const [currentRound, setCurrentRound] = useState(0);
    const [liveBudget, setLiveBudget] = useState<AgentBudget>(budget);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const orchestratorRef = useRef<AgentOrchestrator | null>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Auto-scroll to bottom
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // Save config
    useEffect(() => {
        localStorage.setItem('agent_team_config', JSON.stringify(agents));
    }, [agents]);
    useEffect(() => {
        localStorage.setItem('agent_budget_config', JSON.stringify(budget));
    }, [budget]);

    // Auto-resize textarea
    useEffect(() => {
        const ta = textareaRef.current;
        if (!ta) return;
        ta.style.height = '0px';
        ta.style.height = `${Math.min(120, Math.max(40, ta.scrollHeight))}px`;
    }, [task]);

    const handleMessage = useCallback((msg: AgentMessage) => {
        setMessages(prev => {
            const idx = prev.findIndex(m => m.id === msg.id);
            if (idx >= 0) {
                const next = [...prev];
                next[idx] = msg;
                return next;
            }
            return [...prev, msg];
        });
    }, []);

    const handleSubmit = useCallback(async () => {
        if (!task.trim() || status === 'discussing') return;

        const session = createSession(task.trim(), agents, { ...budget, currentCost: 0 });
        setMessages([{
            id: 'user-task',
            agentId: 'user',
            agentName: '你',
            agentEmoji: '👤',
            agentColor: '#3B82F6',
            role: 'user',
            content: task.trim(),
            timestamp: Date.now(),
        }]);
        setStatus('discussing');
        setCurrentRound(0);
        setLiveBudget({ ...budget, currentCost: 0 });

        const orchestrator = new AgentOrchestrator(session, {
            onMessage: handleMessage,
            onStatusChange: setStatus,
            onRoundChange: setCurrentRound,
            onFinalPrompt: (prompt) => {
                onFinalPrompt(prompt);
                // System message
                handleMessage({
                    id: `system-final-${Date.now()}`,
                    agentId: 'system',
                    agentName: '系统',
                    agentEmoji: '🎯',
                    agentColor: '#6B7280',
                    role: 'system',
                    content: `最终提示词已生成，正在调用图片生成...`,
                    timestamp: Date.now(),
                });
                onGenerateImage(prompt);
            },
            onError: (err) => {
                handleMessage({
                    id: `error-${Date.now()}`,
                    agentId: 'system',
                    agentName: '系统',
                    agentEmoji: '⚠️',
                    agentColor: '#EF4444',
                    role: 'system',
                    content: err,
                    timestamp: Date.now(),
                });
            },
            onBudgetUpdate: setLiveBudget,
            getApiKeyForModel,
        }, textModel);

        orchestratorRef.current = orchestrator;
        await orchestrator.run();
    }, [task, status, agents, budget, textModel, getApiKeyForModel, onFinalPrompt, onGenerateImage, handleMessage]);

    const handleStop = useCallback(() => {
        orchestratorRef.current?.stop();
    }, []);

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
        }
    }, [handleSubmit]);

    const toggleAgent = useCallback((agentId: string) => {
        setAgents(prev => prev.map(a => a.id === agentId ? { ...a, enabled: !a.enabled } : a));
    }, []);

    const enabledCount = agents.filter(a => a.enabled).length;
    const isRunning = status === 'discussing' || status === 'generating';
    const budgetPercent = budget.maxCost > 0 ? Math.min(100, (liveBudget.currentCost / budget.maxCost) * 100) : 0;

    const [showTeam, setShowTeam] = useState(false);

    return (
        <div className={`flex h-full min-h-0 flex-col ${compactMode ? 'gap-2 p-2' : 'gap-3 p-3'}`}>
            {/* Header: collapsed team summary + Budget */}
            <div className={`flex items-center justify-between ${compactMode ? 'gap-1.5' : 'gap-2'}`}>
                <button
                    onClick={() => setShowTeam(!showTeam)}
                    className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 transition-colors ${
                        isDark ? 'hover:bg-[#1B2029]' : 'hover:bg-neutral-100'
                    }`}
                >
                    <span className="text-sm">🤖</span>
                    <span className={`text-xs ${isDark ? 'text-[#D0D5DD]' : 'text-neutral-600'}`}>{enabledCount} 位 Agent</span>
                    <svg className={`h-3 w-3 transition-transform ${showTeam ? 'rotate-180' : ''} ${isDark ? 'text-[#667085]' : 'text-neutral-400'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6" /></svg>
                </button>
                {/* Budget indicator */}
                <div className={`flex items-center gap-1.5 shrink-0 ${compactMode ? 'text-[10px]' : 'text-xs'}`}>
                    <div className={`w-16 h-1.5 rounded-full overflow-hidden ${isDark ? 'bg-[#2A3140]' : 'bg-neutral-200'}`}>
                        <div
                            className="h-full rounded-full transition-all duration-300"
                            style={{
                                width: `${budgetPercent}%`,
                                backgroundColor: budgetPercent > 80 ? '#EF4444' : budgetPercent > 50 ? '#F59E0B' : '#10B981',
                            }}
                        />
                    </div>
                    <span className={isDark ? 'text-[#98A2B3]' : 'text-neutral-500'}>
                        ${liveBudget.currentCost.toFixed(3)}
                    </span>
                </div>
            </div>

            {/* Expandable team panel */}
            {showTeam && (
                <div className={`rounded-2xl border p-3 space-y-2 ${isDark ? 'border-[#2A3140] bg-[#161A22]' : 'border-neutral-200 bg-neutral-50'}`}>
                    {agents.map(agent => {
                        const role = getRoleById(agent.roleId);
                        if (!role) return null;
                        return (
                            <div key={agent.id} className={`flex items-center gap-2 py-1 ${!agent.enabled ? 'opacity-40' : ''}`}>
                                <span className="text-sm">{role.emoji}</span>
                                <span className={`text-xs flex-1 ${isDark ? 'text-[#D0D5DD]' : 'text-neutral-700'}`}>{role.name}</span>
                                <span className={`text-[10px] ${isDark ? 'text-[#667085]' : 'text-neutral-400'}`}>{role.description}</span>
                                <button
                                    onClick={() => !isRunning && toggleAgent(agent.id)}
                                    disabled={isRunning}
                                    className={`w-8 h-4 rounded-full transition-colors relative ${
                                        agent.enabled ? 'bg-blue-500' : isDark ? 'bg-[#2A3140]' : 'bg-neutral-300'
                                    }`}
                                >
                                    <div className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-transform ${
                                        agent.enabled ? 'translate-x-4' : 'translate-x-0.5'
                                    }`} />
                                </button>
                            </div>
                        );
                    })}
                    {/* Skills / 自定义 Agent — Coming Soon */}
                    <div className={`flex items-center gap-2 rounded-xl border border-dashed px-3 py-2 ${
                        isDark ? 'border-[#2A3140] bg-[#1B2029]' : 'border-neutral-300 bg-neutral-50/50'
                    }`}>
                        <span className="text-sm">🧩</span>
                        <div className="flex-1 min-w-0">
                            <span className={`text-xs font-medium ${isDark ? 'text-[#D0D5DD]' : 'text-neutral-600'}`}>自定义 Skills</span>
                            <p className={`text-[10px] ${isDark ? 'text-[#667085]' : 'text-neutral-400'}`}>创建你自己的 Agent / GPTs</p>
                        </div>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                            isDark ? 'bg-[#1e2a4a] text-[#7CB4FF]' : 'bg-indigo-50 text-indigo-500'
                        }`}>Coming Soon</span>
                    </div>

                    <div className={`flex items-center gap-2 pt-2 border-t ${isDark ? 'border-[#2A3140]' : 'border-neutral-200'}`}>
                        <span className={`text-xs ${isDark ? 'text-[#98A2B3]' : 'text-neutral-500'}`}>预算 $</span>
                        <input
                            type="number"
                            min="0.01"
                            max="10"
                            step="0.1"
                            value={budget.maxCost}
                            onChange={e => setBudget(prev => ({ ...prev, maxCost: Math.max(0.01, parseFloat(e.target.value) || 0.5) }))}
                            className={`w-14 text-xs rounded-lg px-2 py-1 border outline-none ${
                                isDark ? 'bg-[#1B2029] border-[#2A3140] text-[#D0D5DD]' : 'bg-white border-neutral-200 text-neutral-800'
                            }`}
                        />
                        <span className={`text-xs ${isDark ? 'text-[#98A2B3]' : 'text-neutral-500'}`}>轮数</span>
                        <input
                            type="number"
                            min="1"
                            max="10"
                            value={budget.maxRounds}
                            onChange={e => setBudget(prev => ({ ...prev, maxRounds: Math.max(1, Math.min(10, parseInt(e.target.value) || 5)) }))}
                            className={`w-12 text-xs rounded-lg px-2 py-1 border outline-none ${
                                isDark ? 'bg-[#1B2029] border-[#2A3140] text-[#D0D5DD]' : 'bg-white border-neutral-200 text-neutral-800'
                            }`}
                        />
                    </div>
                </div>
            )}

            {/* Messages area */}
            <div className={`flex-1 min-h-0 overflow-y-auto space-y-2 ${compactMode ? 'pr-0.5' : 'pr-1'}`}>
                {messages.length === 0 && (
                    <div className={`flex flex-col items-center justify-center h-full ${isDark ? 'text-[#667085]' : 'text-neutral-400'}`}>
                        <div className={`flex h-14 w-14 items-center justify-center rounded-2xl text-2xl ${isDark ? 'bg-[#1B2029]' : 'bg-neutral-100'}`}>🤖</div>
                        <p className={`text-sm font-medium mt-3 ${isDark ? 'text-[#D0D5DD]' : 'text-neutral-700'}`}>Multi-Agent 协作</p>
                        <p className="text-xs mt-1 text-center max-w-[200px]">
                            输入任务，{enabledCount} 位 Agent 将协作讨论并自动生成图片
                        </p>
                        <div className="flex flex-wrap justify-center gap-1 mt-3">
                            {agents.filter(a => a.enabled).map(a => {
                                const role = getRoleById(a.roleId);
                                return role ? (
                                    <span key={a.id} className={`text-[10px] px-2 py-0.5 rounded-full ${isDark ? 'bg-[#1B2029] text-[#98A2B3]' : 'bg-neutral-100 text-neutral-500'}`}>
                                        {role.emoji} {role.name}
                                    </span>
                                ) : null;
                            })}
                        </div>
                    </div>
                )}

                {messages.map(msg => (
                    <div key={msg.id} className={`flex gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                        {/* Avatar */}
                        <div
                            className={`flex items-center justify-center rounded-full shrink-0 ${compactMode ? 'h-6 w-6 text-xs' : 'h-7 w-7 text-sm'}`}
                            style={{ backgroundColor: `${msg.agentColor}20` }}
                        >
                            {msg.agentEmoji}
                        </div>
                        {/* Bubble */}
                        <div className={`flex flex-col max-w-[80%] ${msg.role === 'user' ? 'items-end' : ''}`}>
                            <span className={`text-[10px] mb-0.5 ${isDark ? 'text-[#667085]' : 'text-neutral-400'}`}>
                                {msg.agentName}
                            </span>
                            <div
                                className={`rounded-2xl px-3 py-2 text-xs leading-relaxed ${
                                    msg.role === 'user'
                                        ? 'bg-blue-500 text-white rounded-tr-md'
                                        : msg.role === 'system'
                                            ? isDark ? 'bg-[#161A22] text-[#667085] border border-[#2A3140]' : 'bg-neutral-100 text-neutral-500 border border-neutral-200'
                                            : isDark ? 'bg-[#1B2029] text-[#D0D5DD]' : 'bg-white text-neutral-800 shadow-sm border border-neutral-100'
                                } ${msg.isGenerating ? 'animate-pulse' : ''}`}
                                style={{
                                    borderLeft: msg.role === 'agent' ? `3px solid ${msg.agentColor}` : undefined,
                                }}
                            >
                                {msg.isGenerating ? (
                                    <span className={isDark ? 'text-[#667085]' : 'text-neutral-400'}>思考中...</span>
                                ) : (
                                    msg.content
                                )}
                            </div>
                        </div>
                    </div>
                ))}

                {/* Round indicator */}
                {isRunning && currentRound > 0 && (
                    <div className="flex items-center justify-center gap-2 py-1">
                        <div className={`h-px flex-1 ${isDark ? 'bg-[#2A3140]' : 'bg-neutral-200'}`} />
                        <span className={`text-[10px] ${isDark ? 'text-[#667085]' : 'text-neutral-400'}`}>
                            第 {currentRound}/{budget.maxRounds} 轮
                        </span>
                        <div className={`h-px flex-1 ${isDark ? 'bg-[#2A3140]' : 'bg-neutral-200'}`} />
                    </div>
                )}

                <div ref={messagesEndRef} />
            </div>

            {/* Input area */}
            <div className={`shrink-0 rounded-2xl border ${
                isDark ? 'border-[#2A3140] bg-[#161A22]' : 'border-neutral-200 bg-neutral-50'
            }`}>
                <textarea
                    ref={textareaRef}
                    value={task}
                    onChange={e => setTask(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={isRunning ? 'Agent 正在讨论...' : '描述你要生成的画面，Agent 团队会协作讨论...'}
                    disabled={isRunning}
                    className={`w-full resize-none border-none bg-transparent px-3 py-2.5 text-xs outline-none placeholder:text-[#667085] ${
                        isDark ? 'text-[#D0D5DD]' : 'text-neutral-800'
                    } ${isRunning ? 'opacity-50' : ''}`}
                    style={{ minHeight: '40px' }}
                />
                <div className="flex items-center justify-between px-3 pb-2">
                    <div className={`flex items-center gap-2 text-[10px] ${isDark ? 'text-[#667085]' : 'text-neutral-400'}`}>
                        {isRunning && (
                            <span className="flex items-center gap-1">
                                <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                                {status === 'discussing' ? '讨论中' : '生成中'}
                            </span>
                        )}
                        {status === 'completed' && <span className="text-green-500">✓ 已完成</span>}
                        {status === 'error' && <span className="text-red-500">✕ 出错</span>}
                        {status === 'stopped' && <span className="text-yellow-500">⏹ 已停止</span>}
                    </div>
                    <div className="flex items-center gap-2">
                        {isRunning && (
                            <button
                                onClick={handleStop}
                                className="flex items-center gap-1 rounded-full bg-red-500 px-3 py-1.5 text-[11px] font-medium text-white transition-colors hover:bg-red-600"
                            >
                                <svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
                                停止
                            </button>
                        )}
                        {!isRunning && (
                            <button
                                onClick={handleSubmit}
                                disabled={!task.trim() || enabledCount === 0}
                                className={`flex items-center gap-1 rounded-full px-3 py-1.5 text-[11px] font-medium text-white transition-colors ${
                                    !task.trim() || enabledCount === 0
                                        ? 'bg-neutral-300 cursor-not-allowed'
                                        : 'bg-blue-500 hover:bg-blue-600'
                                }`}
                            >
                                <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M22 2L11 13" /><path d="M22 2L15 22L11 13L2 9L22 2Z" />
                                </svg>
                                开始协作
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
