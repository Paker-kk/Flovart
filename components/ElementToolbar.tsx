import React from 'react';
import type { Element, ImageElement, ShapeElement, TextElement, ArrowElement, LineElement, ImageFilters } from '../types';
import { ImageFilterPanel } from './ImageFilterPanel';
import type { Rect } from '../utils/canvasHelpers';

export interface ElementToolbarProps {
    selectedElementIds: string[];
    singleSelectedElement: Element | null | undefined;
    elements: Element[];
    zoom: number;
    resolvedTheme: string;
    isLoading: boolean;
    language: 'en' | 'zho';
    filterPanelElementId: string | null;
    outpaintMenuId: string | null;
    maskEditingId: string | null;
    reversePromptLoading: boolean;
    t: (key: string, ...args: any[]) => any;
    getSelectionBounds: (ids: string[]) => Rect;
    getElementBounds: (el: Element, elements: Element[]) => Rect;
    handleAlignSelection: (alignment: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') => void;
    handleCopyElement: (el: Element) => void;
    handleDownloadImage: (el: ImageElement) => void;
    handleDeleteElement: (id: string) => void;
    handlePropertyChange: (id: string, updates: Partial<Element>) => void;
    handleStartCrop: (el: ImageElement) => void;
    handleReversePrompt: (href: string, mimeType: string, w?: number, h?: number) => void;
    cancelReversePrompt: () => void;
    handleSplitImageWithBanana: (el: Element) => void;
    handleUpscaleImageWithBanana: (el: Element) => void;
    handleRemoveBackgroundWithBanana: (el: Element) => void;
    handleOutpaint: (el: Element, dir: 'all' | 'up' | 'down' | 'left' | 'right') => void;
    setFilterPanelElementId: (id: string | null) => void;
    setOutpaintMenuId: (id: string | null) => void;
    setAddAssetModal: (modal: { open: boolean; dataUrl: string; mimeType: string; width: number; height: number }) => void;
    startMaskEditing: (elementId: string) => void;
}

export function ElementToolbar(props: ElementToolbarProps) {
    const {
        selectedElementIds, singleSelectedElement, elements, zoom, resolvedTheme, isLoading, language,
        filterPanelElementId, outpaintMenuId, maskEditingId, reversePromptLoading,
        t, getSelectionBounds, getElementBounds,
        handleAlignSelection, handleCopyElement, handleDownloadImage, handleDeleteElement,
        handlePropertyChange, handleStartCrop, handleReversePrompt, cancelReversePrompt,
        handleSplitImageWithBanana, handleUpscaleImageWithBanana, handleRemoveBackgroundWithBanana,
        handleOutpaint, setFilterPanelElementId, setOutpaintMenuId, setAddAssetModal, startMaskEditing,
    } = props;

    if (selectedElementIds.length > 1) {
        const bounds = getSelectionBounds(selectedElementIds);
        const toolbarScreenWidth = 280;
        const toolbarScreenHeight = 56;

        const toolbarCanvasWidth = toolbarScreenWidth / zoom;
        const toolbarCanvasHeight = toolbarScreenHeight / zoom;

        const x = bounds.x + bounds.width / 2 - (toolbarCanvasWidth / 2);
        const y = bounds.y - toolbarCanvasHeight - (10 / zoom);

        const toolbar = <div
            style={{ transform: `scale(${1 / zoom})`, transformOrigin: 'top left', width: `${toolbarScreenWidth}px`, height: `${toolbarScreenHeight}px` }}
            onMouseDown={(e) => e.stopPropagation()}
        >
            <div className={`p-1.5 rounded-lg shadow-lg flex items-center justify-start space-x-2 border overflow-x-auto ${resolvedTheme === 'dark' ? 'bg-[#1B2029] border-[#2A3140] text-[#F3F4F6]' : 'bg-white border-gray-200 text-gray-800'}`}>
                <button title={t('contextMenu.alignment.alignLeft')} onClick={() => handleAlignSelection('left')} className={`p-2 rounded ${resolvedTheme === 'dark' ? 'hover:bg-[#2A3140]' : 'hover:bg-gray-100'}`}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="4" y1="21" x2="4" y2="3"></line><rect x="8" y="6" width="8" height="4" rx="1"></rect><rect x="8" y="14" width="12" height="4" rx="1"></rect></svg></button>
                <button title={t('contextMenu.alignment.alignCenter')} onClick={() => handleAlignSelection('center')} className={`p-2 rounded ${resolvedTheme === 'dark' ? 'hover:bg-[#2A3140]' : 'hover:bg-gray-100'}`}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="21" x2="12" y2="3" strokeDasharray="2 2"></line><rect x="7" y="6" width="10" height="4" rx="1"></rect><rect x="4" y="14" width="16" height="4" rx="1"></rect></svg></button>
                <button title={t('contextMenu.alignment.alignRight')} onClick={() => handleAlignSelection('right')} className={`p-2 rounded ${resolvedTheme === 'dark' ? 'hover:bg-[#2A3140]' : 'hover:bg-gray-100'}`}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="20" y1="21" x2="20" y2="3"></line><rect x="12" y="6" width="8" height="4" rx="1"></rect><rect x="8" y="14" width="12" height="4" rx="1"></rect></svg></button>
                <div className={`h-6 w-px ${resolvedTheme === 'dark' ? 'bg-[#2A3140]' : 'bg-gray-200'}`}></div>
                <button title={t('contextMenu.alignment.alignTop')} onClick={() => handleAlignSelection('top')} className={`p-2 rounded ${resolvedTheme === 'dark' ? 'hover:bg-[#2A3140]' : 'hover:bg-gray-100'}`}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="4" x2="21" y2="4"></line><rect x="6" y="8" width="4" height="8" rx="1"></rect><rect x="14" y="8" width="4" height="12" rx="1"></rect></svg></button>
                <button title={t('contextMenu.alignment.alignMiddle')} onClick={() => handleAlignSelection('middle')} className={`p-2 rounded ${resolvedTheme === 'dark' ? 'hover:bg-[#2A3140]' : 'hover:bg-gray-100'}`}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="12" x2="21" y2="12" strokeDasharray="2 2"></line><rect x="6" y="7" width="4" height="10" rx="1"></rect><rect x="14" y="4" width="4" height="16" rx="1"></rect></svg></button>
                <button title={t('contextMenu.alignment.alignBottom')} onClick={() => handleAlignSelection('bottom')} className={`p-2 rounded ${resolvedTheme === 'dark' ? 'hover:bg-[#2A3140]' : 'hover:bg-gray-100'}`}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="20" x2="21" y2="20"></line><rect x="6" y="12" width="4" height="8" rx="1"></rect><rect x="14" y="8" width="4" height="12" rx="1"></rect></svg></button>
            </div>
        </div>;
        return (
            <foreignObject x={x} y={y} width={toolbarCanvasWidth} height={toolbarCanvasHeight} style={{ overflow: 'visible' }}>
                {toolbar}
            </foreignObject>
        );
    }

    if (!singleSelectedElement) return null;

    const element = singleSelectedElement;
    const bounds = getElementBounds(element, elements);
    let toolbarScreenWidth = 160;
    if (element.type === 'shape') {
        toolbarScreenWidth = 300;
    }
    if (element.type === 'text') toolbarScreenWidth = 220;
    if (element.type === 'arrow' || element.type === 'line') toolbarScreenWidth = 220;
    if (element.type === 'image') toolbarScreenWidth = 620;
    if (element.type === 'video') toolbarScreenWidth = 160;
    if (element.type === 'group') toolbarScreenWidth = 80;

    const toolbarScreenHeight = 56;

    const toolbarCanvasWidth = toolbarScreenWidth / zoom;
    const toolbarCanvasHeight = toolbarScreenHeight / zoom;

    const x = bounds.x + bounds.width / 2 - (toolbarCanvasWidth / 2);
    const y = bounds.y - toolbarCanvasHeight - (10 / zoom);

    const toolbar = <div
        style={{ transform: `scale(${1 / zoom})`, transformOrigin: 'top left', width: `${toolbarScreenWidth}px`, height: `${toolbarScreenHeight}px` }}
        onMouseDown={(e) => e.stopPropagation()}
    >
        <div className={`p-1.5 rounded-lg shadow-lg flex items-center justify-start space-x-2 border overflow-x-auto ${resolvedTheme === 'dark' ? 'bg-[#1B2029] border-[#2A3140] text-[#F3F4F6]' : 'bg-white border-gray-200 text-gray-800'}`}>
            <button title={t('contextMenu.copy')} onClick={() => handleCopyElement(element)} className={`p-2 rounded flex items-center justify-center ${resolvedTheme === 'dark' ? 'hover:bg-[#2A3140]' : 'hover:bg-gray-100'}`}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg></button>
            {element.type === 'image' && <button title={t('contextMenu.download')} onClick={() => handleDownloadImage(element as ImageElement)} className={`p-2 rounded flex items-center justify-center ${resolvedTheme === 'dark' ? 'hover:bg-[#2A3140]' : 'hover:bg-gray-100'}`}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg></button>}
            {element.type === 'image' && <button title="Add to asset library" onClick={async () => {
                    const { href, mimeType, width, height } = element as ImageElement;
                    setAddAssetModal({ open: true, dataUrl: href, mimeType, width, height });
                }} className={`p-2 rounded flex items-center justify-center ${resolvedTheme === 'dark' ? 'hover:bg-[#2A3140]' : 'hover:bg-gray-100'}`}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M8 12h8"/><path d="M12 8v8"/></svg>
                </button>}
            {element.type === 'image' && <button title="Split into layers with BANANA" onClick={() => handleSplitImageWithBanana(element)} className={`p-2 rounded flex items-center justify-center disabled:opacity-50 ${resolvedTheme === 'dark' ? 'hover:bg-[#2A3140]' : 'hover:bg-gray-100'}`} disabled={isLoading}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="8" height="8" rx="1"></rect><rect x="13" y="3" width="8" height="8" rx="1"></rect><rect x="3" y="13" width="8" height="8" rx="1"></rect><path d="M13 17h8"></path><path d="M17 13v8"></path></svg>
                </button>}
            {element.type === 'image' && <button title="BANANA Agent: upscale x2" onClick={() => handleUpscaleImageWithBanana(element)} className={`p-2 rounded flex items-center justify-center disabled:opacity-50 ${resolvedTheme === 'dark' ? 'hover:bg-[#2A3140]' : 'hover:bg-gray-100'}`} disabled={isLoading}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line><line x1="11" y1="8" x2="11" y2="14"></line><line x1="8" y1="11" x2="14" y2="11"></line></svg>
                </button>}
            {element.type === 'image' && <button title="BANANA Agent: remove background" onClick={() => handleRemoveBackgroundWithBanana(element)} className={`p-2 rounded flex items-center justify-center disabled:opacity-50 ${resolvedTheme === 'dark' ? 'hover:bg-[#2A3140]' : 'hover:bg-gray-100'}`} disabled={isLoading}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3l18 18"></path><path d="M20 12a8 8 0 0 1-11.31 7.31"></path><path d="M4 12a8 8 0 0 1 11.31-7.31"></path></svg>
                </button>}
            {element.type === 'video' && <a title={t('contextMenu.download')} href={(element as any).href} download={`video-${element.id}.mp4`} className={`p-2 rounded flex items-center justify-center ${resolvedTheme === 'dark' ? 'hover:bg-[#2A3140]' : 'hover:bg-gray-100'}`}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg></a>}
            {element.type === 'image' && <button title={t('contextMenu.crop')} onClick={() => handleStartCrop(element as ImageElement)} className={`p-2 rounded flex items-center justify-center ${resolvedTheme === 'dark' ? 'hover:bg-[#2A3140]' : 'hover:bg-gray-100'}`}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6.13 1L6 16a2 2 0 0 0 2 2h15"></path><path d="M1 6.13L16 6a2 2 0 0 1 2 2v15"></path></svg></button>}
            {element.type === 'image' && <button title="调色 / Filters" onClick={() => setFilterPanelElementId(filterPanelElementId === element.id ? null : element.id)} className={`p-2 rounded flex items-center justify-center ${filterPanelElementId === element.id ? 'bg-blue-100 text-blue-600' : resolvedTheme === 'dark' ? 'hover:bg-[#2A3140]' : 'hover:bg-gray-100'}`}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="13.5" cy="6.5" r="2.5"></circle><circle cx="17.5" cy="10.5" r="2.5"></circle><circle cx="8.5" cy="7.5" r="2.5"></circle><circle cx="6.5" cy="12.5" r="2.5"></circle><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"></path></svg>
                </button>}
            {element.type === 'image' && (
                <div style={{ position: 'relative' }}>
                    <button title="AI 扩图 / Outpaint" onClick={() => setOutpaintMenuId(outpaintMenuId === element.id ? null : element.id)} className={`p-2 rounded flex items-center justify-center ${outpaintMenuId === element.id ? 'bg-green-100 text-green-600' : resolvedTheme === 'dark' ? 'hover:bg-[#2A3140]' : 'hover:bg-gray-100'}`} disabled={isLoading}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 3 21 3 21 9"></polyline><polyline points="9 21 3 21 3 15"></polyline><line x1="21" y1="3" x2="14" y2="10"></line><line x1="3" y1="21" x2="10" y2="14"></line></svg>
                    </button>
                    {outpaintMenuId === element.id && (
                        <div style={{
                            position: 'absolute',
                            top: '100%',
                            left: '50%',
                            transform: 'translateX(-50%)',
                            background: resolvedTheme === 'dark' ? '#1B2029' : 'white',
                            borderRadius: 10,
                            boxShadow: resolvedTheme === 'dark' ? '0 8px 24px rgba(0,0,0,0.4)' : '0 8px 24px rgba(0,0,0,0.16)',
                            border: `1px solid ${resolvedTheme === 'dark' ? '#2A3140' : '#e5e7eb'}`,
                            padding: 8,
                            zIndex: 100,
                            whiteSpace: 'nowrap',
                            minWidth: 140,
                            color: resolvedTheme === 'dark' ? '#F3F4F6' : undefined,
                        }}>
                            {([
                                { dir: 'all' as const, label: '↔ 全方向扩展', icon: '🔄' },
                                { dir: 'up' as const, label: '⬆ 向上扩展', icon: '⬆' },
                                { dir: 'down' as const, label: '⬇ 向下扩展', icon: '⬇' },
                                { dir: 'left' as const, label: '⬅ 向左扩展', icon: '⬅' },
                                { dir: 'right' as const, label: '➡ 向右扩展', icon: '➡' },
                            ]).map(opt => (
                                <button
                                    key={opt.dir}
                                    onClick={() => { setOutpaintMenuId(null); handleOutpaint(element, opt.dir); }}
                                    style={{
                                        display: 'block',
                                        width: '100%',
                                        textAlign: 'left',
                                        padding: '6px 12px',
                                        borderRadius: 6,
                                        border: 'none',
                                        background: 'transparent',
                                        cursor: 'pointer',
                                        fontSize: 13,
                                    }}
                                    onMouseEnter={e => (e.currentTarget.style.background = resolvedTheme === 'dark' ? '#2A3140' : '#f3f4f6')}
                                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}
            {element.type === 'image' && (
                <button title="图层蒙版 / Layer Mask" onClick={() => startMaskEditing(element.id)} className={`p-2 rounded flex items-center justify-center ${maskEditingId === element.id ? 'bg-purple-100 text-purple-600' : resolvedTheme === 'dark' ? 'hover:bg-[#2A3140]' : 'hover:bg-gray-100'}`}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"></rect><path d="M12 3v18"></path><path d="M3 12h9"></path></svg>
                </button>
            )}
            {element.type === 'image' && (
                reversePromptLoading ? (
                    <button
                        title={language === 'zho' ? '取消分析' : 'Cancel analysis'}
                        onClick={cancelReversePrompt}
                        className="p-2 rounded flex items-center justify-center text-red-500 hover:bg-red-50 animate-pulse"
                    >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6"/><path d="M9 9l6 6"/></svg>
                    </button>
                ) : (
                    <button
                        title="反推 Prompt / Reverse Prompt"
                        onClick={() => handleReversePrompt((element as ImageElement).href, (element as ImageElement).mimeType, (element as ImageElement).width, (element as ImageElement).height)}
                        className={`p-2 rounded flex items-center justify-center ${resolvedTheme === 'dark' ? 'hover:bg-[#2A3140]' : 'hover:bg-gray-100'}`}
                    >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/><path d="M8 12l-2-2"/><path d="M16 12l2-2"/></svg>
                    </button>
                )
            )}

            {element.type === 'shape' && (
                <>
                    <input type="color" title={t('contextMenu.fillColor')} value={(element as ShapeElement).fillColor} onChange={e => handlePropertyChange(element.id, { fillColor: e.target.value })} className="w-7 h-7 p-0 border-none rounded cursor-pointer" />
                    <div className={`h-6 w-px ${resolvedTheme === 'dark' ? 'bg-[#2A3140]' : 'bg-gray-200'}`}></div>
                    <input type="color" title={t('contextMenu.strokeColor')} value={(element as ShapeElement).strokeColor} onChange={e => handlePropertyChange(element.id, { strokeColor: e.target.value })} className="w-7 h-7 p-0 border-none rounded cursor-pointer" />
                    <div className={`h-6 w-px ${resolvedTheme === 'dark' ? 'bg-[#2A3140]' : 'bg-gray-200'}`}></div>
                    <div title={t('contextMenu.strokeStyle')} className={`flex items-center space-x-1 p-1 rounded-md ${resolvedTheme === 'dark' ? 'bg-[#2A3140]' : 'bg-gray-100'}`}>
                        <button title={t('contextMenu.solid')} onClick={() => handlePropertyChange(element.id, { strokeDashArray: undefined })} className={`p-1 rounded ${!(element as ShapeElement).strokeDashArray ? 'bg-blue-200' : resolvedTheme === 'dark' ? 'hover:bg-[#384050]' : 'hover:bg-gray-200'}`}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                        </button>
                        <button title={t('contextMenu.dashed')} onClick={() => handlePropertyChange(element.id, { strokeDashArray: [10, 10] })} className={`p-1 rounded ${(element as ShapeElement).strokeDashArray?.toString() === '10,10' ? 'bg-blue-200' : resolvedTheme === 'dark' ? 'hover:bg-[#384050]' : 'hover:bg-gray-200'}`}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="5" y1="12" x2="9" y2="12"></line><line x1="15" y1="12" x2="19" y2="12"></line></svg>
                        </button>
                        <button title={t('contextMenu.dotted')} onClick={() => handlePropertyChange(element.id, { strokeDashArray: [2, 6] })} className={`p-1 rounded ${(element as ShapeElement).strokeDashArray?.toString() === '2,6' ? 'bg-blue-200' : resolvedTheme === 'dark' ? 'hover:bg-[#384050]' : 'hover:bg-gray-200'}`}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="5" y1="12" x2="5.01" y2="12"></line><line x1="12" y1="12" x2="12.01" y2="12"></line><line x1="19" y1="12" x2="19.01" y2="12"></line></svg>
                        </button>
                    </div>
                </>
            )}

            {element.type === 'text' && <input type="color" title={t('contextMenu.fontColor')} value={(element as TextElement).fontColor} onChange={e => handlePropertyChange(element.id, { fontColor: e.target.value })} className="w-7 h-7 p-0 border-none rounded cursor-pointer" />}
            {element.type === 'text' && <input type="number" title={t('contextMenu.fontSize')} value={(element as TextElement).fontSize} onChange={e => handlePropertyChange(element.id, { fontSize: parseInt(e.target.value, 10) || 16 })} className={`w-16 p-1 border rounded ${resolvedTheme === 'dark' ? 'bg-[#2A3140] text-[#F3F4F6] border-[#384050]' : 'bg-gray-100 text-gray-800'}`} />}
            {(element.type === 'arrow' || element.type === 'line') && <input type="color" title={t('contextMenu.strokeColor')} value={(element as ArrowElement).strokeColor} onChange={e => handlePropertyChange(element.id, { strokeColor: e.target.value })} className="w-7 h-7 p-0 border-none rounded cursor-pointer" />}
            {(element.type === 'arrow' || element.type === 'line') && <input type="range" title={t('contextMenu.strokeWidth')} min="1" max="50" value={(element as ArrowElement).strokeWidth} onChange={e => handlePropertyChange(element.id, { strokeWidth: parseInt(e.target.value, 10) })} className="w-20" />}
            <div className={`h-6 w-px ${resolvedTheme === 'dark' ? 'bg-[#2A3140]' : 'bg-gray-200'}`}></div>
            <button title={t('contextMenu.delete')} onClick={() => handleDeleteElement(element.id)} className="p-2 rounded hover:bg-red-100 hover:text-red-600 flex items-center justify-center"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>
        </div>
    </div>;

    return (
        <>
            <foreignObject x={x} y={y} width={toolbarCanvasWidth} height={toolbarCanvasHeight} style={{ overflow: 'visible' }}>
                {toolbar}
            </foreignObject>
            {filterPanelElementId === element.id && element.type === 'image' && (() => {
                const filterPanelW = 270 / zoom;
                const filterPanelH = 440 / zoom;
                const fpx = bounds.x + bounds.width + 10 / zoom;
                const fpy = bounds.y;
                return (
                    <foreignObject x={fpx} y={fpy} width={filterPanelW} height={filterPanelH} style={{ overflow: 'visible' }}>
                        <div style={{ transform: `scale(${1 / zoom})`, transformOrigin: 'top left' }}>
                            <ImageFilterPanel
                                filters={(element as ImageElement).filters || {}}
                                onChange={(newFilters) => {
                                    handlePropertyChange(element.id, { filters: Object.keys(newFilters).length > 0 ? newFilters : undefined });
                                }}
                                onReset={() => handlePropertyChange(element.id, { filters: undefined })}
                                onClose={() => setFilterPanelElementId(null)}
                            />
                        </div>
                    </foreignObject>
                );
            })()}
        </>
    );
}
