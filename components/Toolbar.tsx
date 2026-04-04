import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Tool } from '../types';

interface ToolbarProps {
    t: (key: string) => string;
    theme: 'light' | 'dark';
    compactScale: number;
    topOffset: number;
    leftClosed: number;
    leftOpen: number;
    activeTool: Tool;
    setActiveTool: (tool: Tool) => void;
    drawingOptions: { strokeColor: string; strokeWidth: number };
    setDrawingOptions: (options: { strokeColor: string; strokeWidth: number }) => void;
    onUpload: (file: File) => void;
    isCropping: boolean;
    onConfirmCrop: () => void;
    onCancelCrop: () => void;
    onSettingsClick: () => void;
    onLayersClick: () => void;
    onBoardsClick: () => void;
    onAssetsClick?: () => void;
    onUndo: () => void;
    onRedo: () => void;
    canUndo: boolean;
    canRedo: boolean;
    isLayerPanelExpanded?: boolean;
    onLeftChange?: (leftPx: number) => void;
    onHeightChange?: (heightPx: number) => void;
}

const baseButtonClass =
    'flex h-10 w-10 items-center justify-center rounded-[18px] border border-transparent text-neutral-500 transition hover:bg-white hover:text-neutral-900';

const activeButtonClass = 'border-neutral-200 bg-white text-neutral-900 shadow-[0_10px_20px_rgba(15,23,42,0.10)]';

const panelPosition = {
    leftClosed: 16,
    leftOpen: 288,
};

const ToolButton: React.FC<{
    label: string;
    icon: React.ReactNode;
    onClick: () => void;
    active?: boolean;
    disabled?: boolean;
    theme: 'light' | 'dark';
}> = ({ label, icon, onClick, active = false, disabled = false, theme }) => (
    <button
        type="button"
        aria-label={label}
        title={label}
        onClick={onClick}
        disabled={disabled}
        className={`${baseButtonClass} ${active ? activeButtonClass : ''} ${
            theme === 'dark' ? 'text-[#D0D5DD] hover:bg-[#1F2430] hover:text-white' : 'text-[#475467] hover:bg-white hover:text-[#111827]'
        } disabled:cursor-not-allowed disabled:opacity-40`}
    >
        {icon}
    </button>
);

const ToolGroupButton: React.FC<{
    label: string;
    activeTool: Tool;
    setActiveTool: (tool: Tool) => void;
    items: Array<{ id: Tool; label: string; icon: React.ReactNode }>;
    fallbackIcon: React.ReactNode;
    theme: 'light' | 'dark';
}> = ({ label, activeTool, setActiveTool, items, fallbackIcon, theme }) => {
    const [open, setOpen] = useState(false);
    const wrapperRef = useRef<HTMLDivElement>(null);
    const activeItem = items.find(item => item.id === activeTool);

    useEffect(() => {
        const handleOutsideClick = (event: MouseEvent) => {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', handleOutsideClick);
        return () => document.removeEventListener('mousedown', handleOutsideClick);
    }, []);

    return (
        <div className="relative" ref={wrapperRef}>
            <ToolButton
                label={label}
                icon={activeItem?.icon ?? fallbackIcon}
                active={!!activeItem}
                onClick={() => setOpen(prev => !prev)}
                theme={theme}
            />
            {open && (
                <div className={`absolute left-full top-0 ml-2.5 flex flex-col gap-1.5 rounded-[22px] border p-1.5 shadow-[0_20px_44px_rgba(15,23,42,0.16)] ${
                    theme === 'dark' ? 'border-[#2A3140] bg-[#12151B]' : 'border-neutral-200 bg-white'
                }`}>
                    {items.map(item => (
                        <ToolButton
                            key={item.id}
                            label={item.label}
                            icon={item.icon}
                            active={activeTool === item.id}
                            onClick={() => {
                                setActiveTool(item.id);
                                setOpen(false);
                            }}
                            theme={theme}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

export const Toolbar: React.FC<ToolbarProps> = ({
    t,
    theme,
    compactScale,
    topOffset,
    leftClosed,
    leftOpen,
    activeTool,
    setActiveTool,
    drawingOptions,
    setDrawingOptions,
    onUpload,
    isCropping,
    onConfirmCrop,
    onCancelCrop,
    onSettingsClick,
    onLayersClick,
    onAssetsClick,
    onUndo,
    onRedo,
    canUndo,
    canRedo,
    isLayerPanelExpanded = false,
    onLeftChange,
    onHeightChange,
}) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const leftPosition = isLayerPanelExpanded ? leftOpen : leftClosed;
    const isDark = theme === 'dark';

    useEffect(() => {
        onLeftChange?.(leftPosition);
    }, [leftPosition, onLeftChange]);

    useEffect(() => {
        onHeightChange?.(452 * compactScale);
    }, [compactScale, onHeightChange]);

    const shapeTools = useMemo<Array<{ id: Tool; label: string; icon: React.ReactNode }>>(
        () => [
            {
                id: 'rectangle',
                label: t('toolbar.rectangle'),
                icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="4" y="4" width="16" height="16" rx="2" /></svg>,
            },
            {
                id: 'circle',
                label: t('toolbar.circle'),
                icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="8" /></svg>,
            },
            {
                id: 'triangle',
                label: t('toolbar.triangle'),
                icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m12 5 8 14H4L12 5Z" /></svg>,
            },
            {
                id: 'line',
                label: t('toolbar.line'),
                icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 19 19 5" /></svg>,
            },
            {
                id: 'arrow',
                label: t('toolbar.arrow'),
                icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>,
            },
        ],
        [t]
    );

    const drawingTools = useMemo<Array<{ id: Tool; label: string; icon: React.ReactNode }>>(
        () => [
            {
                id: 'draw',
                label: t('toolbar.draw'),
                icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3Z" /></svg>,
            },
            {
                id: 'highlighter',
                label: t('toolbar.highlighter'),
                icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 5 4 4" /><path d="M12 8 4 16l-1 5 5-1 8-8" /></svg>,
            },
            {
                id: 'lasso',
                label: t('toolbar.lasso'),
                icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><ellipse cx="12" cy="11" rx="7.5" ry="5" strokeDasharray="3 3" /><path d="M15 16c0 2-1 3-2.5 3S10 18 10 17.2" /></svg>,
            },
            {
                id: 'erase',
                label: t('toolbar.erase'),
                icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m7 21-4-4 10-10 4 4-10 10Z" /><path d="M14 7 9 2" /><path d="M17 21H7" /></svg>,
            },
        ],
        [t]
    );

    if (isCropping) {
        return (
            <div
                className="absolute top-3 z-[50] flex w-52 flex-col gap-3 rounded-[24px] border border-neutral-200 bg-white p-4 shadow-[0_24px_60px_rgba(15,23,42,0.16)]"
                style={{ left: `${leftPosition}px`, top: `${topOffset}px`, transform: `scale(${compactScale})`, transformOrigin: 'top left', transition: 'left 0.35s cubic-bezier(0.4, 0, 0.2, 1)' }}
            >
                <div className="text-sm font-semibold text-neutral-900">{t('toolbar.crop.title')}</div>
                <div className="grid grid-cols-2 gap-2">
                    <button
                        type="button"
                        onClick={onCancelCrop}
                        className="rounded-2xl border border-neutral-200 px-3 py-2 text-sm text-neutral-700 transition hover:bg-neutral-100"
                    >
                        {t('toolbar.crop.cancel')}
                    </button>
                    <button
                        type="button"
                        onClick={onConfirmCrop}
                        className="rounded-2xl bg-neutral-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-neutral-800"
                    >
                        {t('toolbar.crop.confirm')}
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div
            className={`absolute z-[40] flex flex-col items-center gap-1.5 rounded-[24px] border px-1.5 py-2.5 shadow-[0_20px_48px_rgba(15,23,42,0.24)] ${
                isDark ? 'border-[#2A3140] bg-[#12151B] text-white' : 'border-neutral-200 bg-white text-[#111827]'
            }`}
            style={{
                top: `${topOffset}px`,
                left: `${leftPosition}px`,
                transform: `scale(${compactScale})`,
                transformOrigin: 'top left',
                transition: 'left 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
            }}
        >
            <ToolButton
                label="Boards & Layers"
                onClick={onLayersClick}
                icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="4" y="5" width="7" height="14" rx="2" /><rect x="13" y="5" width="7" height="14" rx="2" /></svg>}
                active={isLayerPanelExpanded}
                theme={theme}
            />

            <div className={`h-px w-7 ${isDark ? 'bg-white/10' : 'bg-neutral-200'}`} />

            <ToolButton
                label={t('toolbar.select')}
                icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m4 3 7 17 2.5-7.5L21 10 4 3Z" /><path d="m13 13 6 6" /></svg>}
                active={activeTool === 'select'}
                onClick={() => setActiveTool('select')}
                theme={theme}
            />
            <ToolButton
                label={t('toolbar.pan')}
                icon={
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M6 12V6a2 2 0 1 1 4 0v6" />
                        <path d="M10 12V5a2 2 0 1 1 4 0v7" />
                        <path d="M14 12V7a2 2 0 1 1 4 0v7" />
                        <path d="M18 12v-1a2 2 0 1 1 4 0v3a7 7 0 0 1-7 7h-2a7 7 0 0 1-7-7v-2a2 2 0 1 1 4 0" />
                    </svg>
                }
                active={activeTool === 'pan'}
                onClick={() => setActiveTool('pan')}
                theme={theme}
            />
            <ToolGroupButton
                label={t('toolbar.shapes')}
                activeTool={activeTool}
                setActiveTool={setActiveTool}
                items={shapeTools}
                fallbackIcon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="5" y="5" width="14" height="14" rx="2" /></svg>}
                theme={theme}
            />
            <ToolGroupButton
                label={t('toolbar.drawingTools')}
                activeTool={activeTool}
                setActiveTool={setActiveTool}
                items={drawingTools}
                fallbackIcon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3Z" /></svg>}
                theme={theme}
            />
            <ToolButton
                label={t('toolbar.text')}
                icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 7V4h16v3" /><path d="M12 4v16" /><path d="M9 20h6" /></svg>}
                active={activeTool === 'text'}
                onClick={() => setActiveTool('text')}
                theme={theme}
            />

            <div className={`my-0.5 h-px w-7 ${isDark ? 'bg-white/10' : 'bg-neutral-200'}`} />

            <input
                type="color"
                aria-label={t('toolbar.strokeColor')}
                title={t('toolbar.strokeColor')}
                value={drawingOptions.strokeColor}
                onChange={(event) => setDrawingOptions({ ...drawingOptions, strokeColor: event.target.value })}
                className={`h-9 w-9 cursor-pointer rounded-[16px] border bg-transparent p-0 ${isDark ? 'border-white/10' : 'border-neutral-200'}`}
            />
            <input
                type="range"
                min="1"
                max="50"
                aria-label={t('toolbar.strokeWidth')}
                title={t('toolbar.strokeWidth')}
                value={drawingOptions.strokeWidth}
                onChange={(event) => setDrawingOptions({ ...drawingOptions, strokeWidth: Number(event.target.value) })}
                className="toolbar-range h-20 w-9 cursor-pointer [writing-mode:vertical-lr]"
            />
            <span className={`text-[10px] font-medium tabular-nums ${isDark ? 'text-[#98A2B3]' : 'text-neutral-500'}`}>{drawingOptions.strokeWidth}</span>

            <div className={`my-0.5 h-px w-7 ${isDark ? 'bg-white/10' : 'bg-neutral-200'}`} />

            <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                title={t('toolbar.upload')}
                aria-label={t('toolbar.upload')}
                onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) {
                        onUpload(file);
                    }
                    event.target.value = '';
                }}
            />
            <ToolButton
                label={t('toolbar.upload')}
                onClick={() => fileInputRef.current?.click()}
                icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 16V4" /><path d="m7 9 5-5 5 5" /><path d="M20 16v3a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-3" /></svg>}
                theme={theme}
            />
            {onAssetsClick && (
                <ToolButton
                    label="Assets"
                    onClick={onAssetsClick}
                    icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M4 10h16" /><path d="M10 4v16" /></svg>}
                    theme={theme}
                />
            )}
            <ToolButton
                label={t('toolbar.settings')}
                onClick={onSettingsClick}
                icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 0 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 0 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 0 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 0 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9c0 .7.4 1.3 1.1 1.6.2.1.5.1.7.1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" /></svg>}
                theme={theme}
            />

            <div className={`my-0.5 h-px w-7 ${isDark ? 'bg-white/10' : 'bg-neutral-200'}`} />

            <ToolButton
                label={t('toolbar.undo')}
                onClick={onUndo}
                disabled={!canUndo}
                icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 14-5-5 5-5" /><path d="M4 9h10.5A5.5 5.5 0 0 1 20 14.5 5.5 5.5 0 0 1 14.5 20H11" /></svg>}
                theme={theme}
            />
            <ToolButton
                label={t('toolbar.redo')}
                onClick={onRedo}
                disabled={!canRedo}
                icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 14 5-5-5-5" /><path d="M20 9H9.5A5.5 5.5 0 0 0 4 14.5 5.5 5.5 0 0 0 9.5 20H13" /></svg>}
                theme={theme}
            />
        </div>
    );
};
