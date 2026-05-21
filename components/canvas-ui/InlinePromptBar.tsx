import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import type { AssetSlotRole, CanvasElement, Element, ElementGenerationState } from '../../types';
import { compilePromptReferences } from '../../utils/semanticCompiler';
import RichPromptEditor, { type RichPromptEditorHandle } from '../RichPromptEditor';
import type { MentionItem } from '../MentionList';

interface InlinePromptBarProps {
    element: CanvasElement;
    allElements: Element[];
    canvasZoom: number;
    canvasPan: { x: number; y: number };
    modelId: string;
    status: ElementGenerationState['status'];
    progress?: number;
    isLoading: boolean;
    onPromptChange: (elementId: string, generationState: ElementGenerationState) => void;
    onGenerate: (elementId: string, prompt: string) => void;
    animateViewport: (targetX: number, targetY: number, targetZoom: number) => void;
}

function createGenerationState(
    element: CanvasElement,
    modelId: string,
    status: ElementGenerationState['status'],
    progress?: number,
): ElementGenerationState {
    return {
        promptPayload: element.generationState?.promptPayload || { rawText: '', resolvedReferences: [] },
        provider: element.generationState?.provider || 'openrouter',
        modelId: element.generationState?.modelId || modelId,
        status,
        error: element.generationState?.error,
        progress: element.generationState?.progress ?? progress,
    };
}

export const InlinePromptBar = memo(({
    element,
    allElements,
    canvasZoom,
    canvasPan,
    modelId,
    status,
    progress,
    isLoading,
    onPromptChange,
    onGenerate,
    animateViewport,
}: InlinePromptBarProps) => {
    const editorRef = useRef<RichPromptEditorHandle>(null);
    const [isFocused, setIsFocused] = useState(false);
    const [visibleError, setVisibleError] = useState<string | null>(null);
    const generationState = createGenerationState(element, modelId, isLoading ? 'running' : status, progress);
    const isVideo = element.type === 'video';

    const canvasItems = useMemo<MentionItem[]>(() => allElements
        .filter((item) => item.id !== element.id && item.isVisible !== false)
        .map((item) => ({
            id: item.id,
            label: item.name?.trim() || `${item.type.toUpperCase()} ${item.id.slice(-4)}`,
            thumbnail: item.type === 'image' ? item.href : '',
            elementType: item.type,
        })), [allElements, element.id]);

    useEffect(() => {
        if (!isFocused || canvasZoom >= 0.4) return;
        animateViewport(element.x + element.width / 2, element.y + element.height / 2, 1);
    }, [animateViewport, canvasZoom, element.height, element.width, element.x, element.y, isFocused]);

    const handleTextChange = (rawText: string) => {
        const canvasElements = allElements.filter((item): item is CanvasElement =>
            item.type === 'image' || item.type === 'video' || item.type === 'text' || item.type === 'shape',
        );

        onPromptChange(element.id, {
            ...generationState,
            promptPayload: compilePromptReferences(rawText, canvasElements),
        });
    };

    useEffect(() => {
        const editorText = editorRef.current?.getText();
        if (editorText !== undefined && editorText !== generationState.promptPayload.rawText) {
            editorRef.current?.setText(generationState.promptPayload.rawText);
        }
    }, [generationState.promptPayload.rawText]);

    useEffect(() => {
        const error = generationState.error;
        if (!error) return;
        setVisibleError(error);
        const timer = window.setTimeout(() => {
            setVisibleError(null);
            onPromptChange(element.id, { ...generationState, error: undefined });
        }, 3000);
        return () => window.clearTimeout(timer);
    }, [element.id, generationState.error, onPromptChange]);

    const handleToggleRole = (targetElementId: string, currentRole: AssetSlotRole = 'unassigned') => {
        const roles: AssetSlotRole[] = ['first_frame', 'style_ref', 'control_net', 'unassigned'];
        const nextRole = roles[(roles.indexOf(currentRole) + 1) % roles.length];
        onPromptChange(element.id, {
            ...generationState,
            promptPayload: {
                ...generationState.promptPayload,
                resolvedReferences: generationState.promptPayload.resolvedReferences.map((reference) => (
                    reference.targetElementId === targetElementId
                        ? { ...reference, slotRole: nextRole }
                        : reference
                )),
            },
        });
    };

    const getRoleBadge = (role: AssetSlotRole = 'unassigned') => {
        switch (role) {
            case 'first_frame': return { text: '首帧', cls: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' };
            case 'style_ref': return { text: '风格', cls: 'bg-amber-500/10 border-amber-500/30 text-amber-400' };
            case 'control_net': return { text: '控网', cls: 'bg-blue-500/10 border-blue-500/30 text-blue-400' };
            default: return { text: '参考', cls: 'bg-zinc-800 border-zinc-700 text-zinc-400' };
        }
    };

    const inverseScale = canvasZoom >= 0.4 ? 1 / canvasZoom : 1;

    return (
        <foreignObject
            x={element.x}
            y={element.y + element.height + 6}
            width={380 * inverseScale}
            height={170 * inverseScale}
            style={{ overflow: 'visible' }}
            onMouseDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            data-testid="inline-prompt-bar"
        >
            <div
                className="flex flex-col rounded-[6px] border border-zinc-800/80 bg-[#12141a]/90 p-2 text-zinc-400 shadow-[0_8px_24px_rgba(0,0,0,0.7)] backdrop-blur-md transition-all duration-150"
                style={{
                    width: 380,
                    transform: `scale(${inverseScale})`,
                    transformOrigin: 'top left',
                }}
            >
                <div className="flex items-center justify-between border-b border-zinc-800/40 pb-1.5 font-mono text-[10px] select-none">
                    <div className="flex min-w-0 items-center gap-1.5">
                        <span className="font-bold tracking-tight text-zinc-400">{isVideo ? 'FILM_PROMPT' : 'IMG_PROMPT'}</span>
                        <span className="text-zinc-600">|</span>
                        <span className="truncate text-[9px] font-semibold uppercase text-zinc-500">{generationState.modelId.slice(0, 15)}</span>
                    </div>
                    <div className="flex items-center gap-1">
                        <span className={`h-1 w-1 rounded-full ${generationState.status === 'running' ? 'bg-[#00ff88] shadow-[0_0_6px_#00ff88]' : 'bg-zinc-600'}`} />
                        <span className="text-[9px] uppercase tracking-tighter text-zinc-500">{generationState.status}</span>
                    </div>
                </div>

                <div
                    className="border border-zinc-800/40 bg-black/20 px-1.5 py-1"
                    style={{
                        ['--prompt-editor-color' as string]: '#e4e4e7',
                        ['--prompt-editor-placeholder' as string]: '#3f3f46',
                        ['--prompt-editor-caret' as string]: '#00ff88',
                        ['--prompt-editor-min-height' as string]: '36px',
                        ['--prompt-editor-max-height' as string]: '80px',
                        ['--prompt-editor-font-size' as string]: '12px',
                        ['--prompt-editor-line-height' as string]: '1.5',
                        ['--prompt-editor-padding' as string]: '0',
                    } as React.CSSProperties}
                    onFocus={() => setIsFocused(true)}
                    onBlur={(event) => {
                        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                            setTimeout(() => setIsFocused(false), 200);
                        }
                    }}
                >
                    <RichPromptEditor
                        ref={editorRef}
                        canvasItems={canvasItems}
                        initialText={generationState.promptPayload.rawText}
                        placeholder={isVideo ? '键入提示词，或输入 @ 选用图层元素...' : '输入生图要求...'}
                        disabled={isLoading || generationState.status === 'running'}
                        onTextChange={handleTextChange}
                        onSubmit={() => onGenerate(element.id, generationState.promptPayload.rawText)}
                    />
                </div>

                {generationState.promptPayload.resolvedReferences.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1 border-t border-zinc-800/20 py-1 font-mono text-[10px] select-none">
                        {generationState.promptPayload.resolvedReferences.map((reference) => {
                            const badge = getRoleBadge(reference.slotRole);
                            return (
                                <div key={reference.targetElementId} className="flex items-center gap-1 rounded-[4px] border border-zinc-800 bg-zinc-900/60 py-0.5 pl-1 pr-0.5 text-zinc-400">
                                    <span className="max-w-[80px] truncate opacity-80">{reference.token}</span>
                                    {reference.targetType === 'image' && (
                                        <button
                                            type="button"
                                            onClick={() => handleToggleRole(reference.targetElementId, reference.slotRole)}
                                            className={`cursor-pointer rounded-[3px] border px-1 py-px font-sans text-[9px] font-bold transition-transform active:scale-95 ${badge.cls}`}
                                            title="点击循环切换卡槽职能"
                                        >
                                            {badge.text}
                                        </button>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}

                <div className="flex items-center justify-between border-t border-zinc-800/40 pt-1 font-mono text-[9px] select-none">
                    <span className="uppercase tracking-tight text-zinc-600">{generationState.progress ? `RUNNING: ${generationState.progress}%` : 'DOCK CORE ONLINE'}</span>
                    <button
                        type="button"
                        disabled={isLoading || generationState.status === 'running'}
                        onClick={() => onGenerate(element.id, generationState.promptPayload.rawText)}
                        className="rounded-[3px] border px-2.5 py-0.5 text-[10px] font-bold text-[#00ff88] transition duration-150 ease-in-out active:scale-95 disabled:pointer-events-none disabled:opacity-30"
                        style={{
                            backgroundColor: generationState.status === 'running' ? 'transparent' : 'rgba(0, 255, 136, 0.05)',
                            borderColor: generationState.status === 'running' ? '#27272a' : '#00ff88',
                            color: generationState.status === 'running' ? '#52525b' : '#00ff88',
                        }}
                    >
                        {isLoading || generationState.status === 'running' ? 'COMPUTING' : 'IGNITE'}
                    </button>
                </div>

                {visibleError && (
                    <div className="mt-1 animate-[inlinePromptShake_0.3s_cubic-bezier(.36,.07,.19,.97)_both]">
                        <style>{'@keyframes inlinePromptShake{0%,100%{transform:translateX(0)}20%,60%{transform:translateX(-2px)}40%,80%{transform:translateX(2px)}}'}</style>
                        <div className="h-px w-full bg-rose-500 shadow-[0_0_4px_#f43f5e]" />
                        <div className="mt-0.5 truncate font-mono text-[9px] uppercase tracking-tight text-rose-500">
                            {visibleError.slice(0, 45)}
                        </div>
                    </div>
                )}
            </div>
        </foreignObject>
    );
});

InlinePromptBar.displayName = 'InlinePromptBar';
