import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import type { CanvasElement, Element, ElementGenerationState } from '../../types';
import RichPromptEditor, { type RichPromptEditorHandle } from '../RichPromptEditor';
import type { MentionItem } from '../MentionList';
import { compilePromptReferences } from '../../utils/semanticCompiler';
import { getDynamicParamSchema } from '../../services/aiGateway';

interface InlinePromptBarProps {
    element: CanvasElement;
    allElements: Element[];
    canvasZoom: number;
    canvasPan: { x: number; y: number };
    modelId: string;
    status?: ElementGenerationState['status'];
    progress?: number;
    isLoading?: boolean;
    onPromptChange: (elementId: string, generationState: ElementGenerationState) => void;
    onGenerate: (elementId: string, prompt: string) => void;
    animateViewport: (targetX: number, targetY: number, targetZoom: number) => void;
}

const TYPE_LABELS: Record<Element['type'], string> = {
    image: '图片',
    video: '视频',
    shape: '形状',
    text: '文字',
    path: '画笔',
    group: '组合',
    arrow: '箭头',
    line: '线条',
};

function getElementLabel(element: Element): string {
    return element.name?.trim() || `${TYPE_LABELS[element.type]} ${element.id.slice(-4)}`;
}

function getFallbackGenerationState(element: CanvasElement, modelId: string, status: ElementGenerationState['status']): ElementGenerationState {
    return {
        promptPayload: element.generationState?.promptPayload || { rawText: '', resolvedReferences: [] },
        provider: element.generationState?.provider || 'openrouter',
        modelId: element.generationState?.modelId || modelId,
        status: element.generationState?.status || status,
        error: element.generationState?.error,
        progress: element.generationState?.progress,
    };
}

export const InlinePromptBar = memo(({
    element,
    allElements,
    canvasZoom,
    canvasPan,
    modelId,
    status = 'idle',
    progress,
    isLoading = false,
    onPromptChange,
    onGenerate,
    animateViewport,
}: InlinePromptBarProps) => {
    const editorRef = useRef<RichPromptEditorHandle>(null);
    const [isFocused, setIsFocused] = useState(false);

    const generationState = getFallbackGenerationState(element, modelId, isLoading ? 'running' : status);
    const effectiveModelId = generationState.modelId || modelId;
    const isVideo = element.type === 'video';
    const paramSchema = getDynamicParamSchema(effectiveModelId);

    const canvasItems = useMemo<MentionItem[]>(() => allElements
        .filter((item) => item.id !== element.id && item.isVisible !== false)
        .map((item) => ({
            id: item.id,
            label: getElementLabel(item),
            thumbnail: item.type === 'image' ? item.href : '',
            elementType: item.type,
        })), [allElements, element.id]);

    useEffect(() => {
        if (!isFocused || canvasZoom >= 0.4) return;
        animateViewport(element.x + element.width / 2, element.y + element.height / 2, 1);
    }, [animateViewport, canvasZoom, element.height, element.width, element.x, element.y, isFocused]);

    useEffect(() => {
        const editorText = editorRef.current?.getText();
        const rawText = generationState.promptPayload.rawText;
        if (editorText !== undefined && editorText !== rawText) {
            editorRef.current?.setText(rawText);
        }
    }, [generationState.promptPayload.rawText]);

    const inverseScale = canvasZoom >= 0.4 ? 1 / canvasZoom : 1;
    const panelWidth = Math.max(360, Math.min(520, element.width));
    const leftPosition = element.x;
    const topPosition = element.y + element.height + 12;

    const handleTextChange = (plainText: string) => {
        const canvasElements = allElements.filter((item): item is CanvasElement =>
            item.type === 'image' || item.type === 'video' || item.type === 'text' || item.type === 'shape',
        );
        const nextPayload = compilePromptReferences(plainText, canvasElements);
        onPromptChange(element.id, {
            ...generationState,
            modelId: effectiveModelId,
            promptPayload: nextPayload,
        });
    };

    return (
        <foreignObject
            x={leftPosition}
            y={topPosition}
            width={panelWidth * inverseScale}
            height={240 * inverseScale}
            style={{ overflow: 'visible' }}
            onMouseDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            data-testid="inline-prompt-bar"
        >
            <div
                className="inline-prompt-bar"
                style={{
                    transform: `scale(${inverseScale})`,
                    transformOrigin: 'top left',
                    width: panelWidth,
                    fontSize: 14,
                    ['--inline-prompt-accent' as string]: isVideo ? '#d6a84f' : '#00ff88',
                }}
                onFocus={() => setIsFocused(true)}
                onBlur={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                        setIsFocused(false);
                    }
                }}
            >
                <style>{inlinePromptStyles}</style>
                <div className="inline-prompt-bar__header">
                    <div className="inline-prompt-bar__title">
                        <span className="inline-prompt-bar__eyebrow">{isVideo ? 'VIDEO MATRIX' : 'IMAGE MODEL'}</span>
                        <span className="inline-prompt-bar__model">{effectiveModelId}</span>
                    </div>
                    <div className="inline-prompt-bar__status">
                        <span className={`inline-prompt-bar__status-dot inline-prompt-bar__status-dot--${generationState.status}`} />
                        <span>{generationState.status}</span>
                    </div>
                </div>

                <div
                    className="inline-prompt-bar__editor"
                    style={{
                        ['--prompt-editor-color' as string]: '#f8fafc',
                        ['--prompt-editor-placeholder' as string]: '#64748b',
                        ['--prompt-editor-caret' as string]: 'var(--inline-prompt-accent)',
                        ['--prompt-editor-scrollbar' as string]: '#263241',
                        ['--prompt-editor-min-height' as string]: '54px',
                        ['--prompt-editor-max-height' as string]: '96px',
                        ['--prompt-editor-font-size' as string]: '14px',
                        ['--prompt-editor-line-height' as string]: '1.5',
                    } as React.CSSProperties}
                >
                    <RichPromptEditor
                        ref={editorRef}
                        canvasItems={canvasItems}
                        initialText={generationState.promptPayload.rawText}
                        placeholder={isVideo ? 'Describe camera motion, or type @ to bind image context...' : 'Describe image changes, or type @ to bind canvas context...'}
                        disabled={isLoading}
                        onTextChange={handleTextChange}
                        onSubmit={() => onGenerate(element.id, generationState.promptPayload.rawText)}
                    />
                </div>

                {generationState.promptPayload.resolvedReferences.length > 0 && (
                    <div className="inline-prompt-bar__refs">
                        <span className="inline-prompt-bar__refs-label">Context</span>
                        {generationState.promptPayload.resolvedReferences.map((reference) => (
                            <span key={reference.targetElementId} className="inline-prompt-bar__ref-chip">
                                {reference.token}
                            </span>
                        ))}
                    </div>
                )}

                <div className="inline-prompt-bar__footer">
                    <div className="inline-prompt-bar__schema">
                        {paramSchema.hasSeed && <span>Seed</span>}
                        {paramSchema.hasCfgScale && <span>CFG</span>}
                        {paramSchema.hasAspectRatio && <span>{paramSchema.defaultAspectRatio || 'Ratio'}</span>}
                        {progress !== undefined && <span>{progress}%</span>}
                    </div>
                    <button
                        type="button"
                        className="inline-prompt-bar__ignite"
                        disabled={isLoading || generationState.status === 'running'}
                        onClick={() => onGenerate(element.id, generationState.promptPayload.rawText)}
                    >
                        {isLoading || generationState.status === 'running' ? 'GENERATING' : 'IGNITE'}
                    </button>
                </div>
            </div>
        </foreignObject>
    );
});

InlinePromptBar.displayName = 'InlinePromptBar';

const inlinePromptStyles = `
.inline-prompt-bar {
    color: #f8fafc;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 14px;
    background: linear-gradient(135deg, rgba(12, 18, 28, 0.88), rgba(8, 12, 18, 0.78));
    box-shadow: 0 24px 60px rgba(0, 0, 0, 0.45), 0 0 0 1px rgba(255, 255, 255, 0.04) inset;
    backdrop-filter: blur(14px);
    padding: 12px;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
.inline-prompt-bar__header,
.inline-prompt-bar__footer,
.inline-prompt-bar__title,
.inline-prompt-bar__status,
.inline-prompt-bar__schema,
.inline-prompt-bar__refs {
    display: flex;
    align-items: center;
}
.inline-prompt-bar__header,
.inline-prompt-bar__footer {
    justify-content: space-between;
    gap: 10px;
}
.inline-prompt-bar__header {
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    padding-bottom: 9px;
}
.inline-prompt-bar__title {
    min-width: 0;
    gap: 8px;
}
.inline-prompt-bar__eyebrow,
.inline-prompt-bar__status,
.inline-prompt-bar__schema,
.inline-prompt-bar__refs-label {
    color: #94a3b8;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
}
.inline-prompt-bar__eyebrow {
    color: var(--inline-prompt-accent);
}
.inline-prompt-bar__model {
    min-width: 0;
    max-width: 180px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 6px;
    background: rgba(15, 23, 42, 0.72);
    color: #cbd5e1;
    padding: 3px 7px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
    font-size: 10px;
}
.inline-prompt-bar__status {
    gap: 6px;
}
.inline-prompt-bar__status-dot {
    width: 7px;
    height: 7px;
    border-radius: 999px;
    background: #64748b;
}
.inline-prompt-bar__status-dot--running {
    background: #60a5fa;
    box-shadow: 0 0 16px #60a5fa;
}
.inline-prompt-bar__status-dot--success {
    background: #00ff88;
    box-shadow: 0 0 16px #00ff88;
}
.inline-prompt-bar__status-dot--error {
    background: #fb7185;
    box-shadow: 0 0 16px #fb7185;
}
.inline-prompt-bar__editor {
    margin-top: 10px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 10px;
    background: rgba(2, 6, 12, 0.58);
    padding: 9px 10px;
}
.inline-prompt-bar__refs {
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 9px;
}
.inline-prompt-bar__ref-chip {
    border: 1px solid rgba(59, 130, 246, 0.36);
    border-radius: 7px;
    background: rgba(37, 99, 235, 0.16);
    color: #93c5fd;
    padding: 3px 7px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
    font-size: 10px;
}
.inline-prompt-bar__footer {
    border-top: 1px solid rgba(255, 255, 255, 0.06);
    margin-top: 10px;
    padding-top: 10px;
}
.inline-prompt-bar__schema {
    flex-wrap: wrap;
    gap: 6px;
}
.inline-prompt-bar__schema span {
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 999px;
    background: rgba(15, 23, 42, 0.72);
    padding: 3px 8px;
}
.inline-prompt-bar__ignite {
    min-width: 88px;
    border: 0;
    border-radius: 8px;
    background: var(--inline-prompt-accent);
    color: #06110b;
    cursor: pointer;
    font-size: 11px;
    font-weight: 900;
    letter-spacing: 0.08em;
    padding: 8px 12px;
    transition: transform 160ms ease, opacity 160ms ease;
}
.inline-prompt-bar__ignite:hover:not(:disabled) {
    transform: translateY(-1px);
}
.inline-prompt-bar__ignite:disabled {
    cursor: not-allowed;
    opacity: 0.45;
}
`;
