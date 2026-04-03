





import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { Toolbar } from './components/Toolbar';
import { PromptBar } from './components/PromptBar';
import { DiagnosticBar } from './components/DiagnosticBar';
import { Loader } from './components/Loader';
import { CanvasSettings } from './components/CanvasSettings';
import { OnboardingWizard } from './components/OnboardingWizard';
import { WorkspaceSidebar } from './components/WorkspaceSidebar';
import type { Tool, Point, Element, ImageElement, PathElement, ShapeElement, TextElement, ArrowElement, UserEffect, LineElement, WheelAction, GroupElement, Board, VideoElement, AssetLibrary, AssetCategory, AssetItem, UserApiKey, ModelPreference, AIProvider, AICapability, PromptEnhanceMode, CharacterLockProfile, GenerationHistoryItem, ThemeMode, ChatAttachment, ImageFilters } from './types';
import { DEFAULT_IMAGE_FILTERS } from './types';
import { AssetLibraryPanel } from './components/AssetLibraryPanel';
import { InspirationPanel } from './components/InspirationPanel';
import { RightPanel } from './components/RightPanel';
import { AssetAddModal } from './components/AssetAddModal';
import { ImageFilterPanel, buildCssFilter, temperatureMatrix, sharpenKernel } from './components/ImageFilterPanel';
import { ABCompareOverlay } from './components/ABCompareOverlay';
import { loadAssetLibrary, addAsset, removeAsset, renameAsset } from './utils/assetStorage';
import { loadGenerationHistory, addGenerationHistoryItem } from './utils/generationHistory';
import { editImage, generateImageFromText, generateVideo, setGeminiRuntimeConfig, enhancePromptWithGemini } from './services/geminiService';
import { splitImageByBanana, runBananaImageAgent, setBananaRuntimeConfig } from './services/bananaService';
import { DEFAULT_PROVIDER_MODELS, enhancePromptWithProvider, generateImageWithProvider, inferCapabilityFromModel, inferProviderFromModel, isGoogleImageEditModel, isGoogleTextToImageModel, inferCapabilitiesByProvider, PROVIDER_LABELS } from './services/aiGateway';
import { fileToDataUrl } from './utils/fileUtils';
import { translations } from './translations';
import { saveKeysEncrypted, loadKeysDecrypted, clearAllKeyData, migrateLegacyKeys } from './utils/keyVault';
import { recordApiUsage, getUsageSummary, formatCost, type KeyUsageSummary } from './utils/usageMonitor';
import { getCompactChromeMetrics } from './utils/uiScale';
import termsRaw from './TERMS_OF_SERVICE.md?raw';
import privacyRaw from './PRIVACY_POLICY.md?raw';

const generateId = () => `id_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

const getElementBounds = (element: Element, allElements: Element[] = []): { x: number; y: number; width: number; height: number } => {
    if (element.type === 'group') {
        const children = allElements.filter(el => el.parentId === element.id);
        if (children.length === 0) {
            return { x: element.x, y: element.y, width: element.width, height: element.height };
        }
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        children.forEach(child => {
            const bounds = getElementBounds(child, allElements);
            minX = Math.min(minX, bounds.x);
            minY = Math.min(minY, bounds.y);
            maxX = Math.max(maxX, bounds.x + bounds.width);
            maxY = Math.max(maxY, bounds.y + bounds.height);
        });
        return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
    }
    if (element.type === 'image' || element.type === 'shape' || element.type === 'text' || element.type === 'video') {
        return { x: element.x, y: element.y, width: element.width, height: element.height };
    }
    if (element.type === 'arrow' || element.type === 'line') {
        const { points } = element;
        const minX = Math.min(points[0].x, points[1].x);
        const maxX = Math.max(points[0].x, points[1].x);
        const minY = Math.min(points[0].y, points[1].y);
        const maxY = Math.max(points[0].y, points[1].y);
        return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
    }
    const { points } = element;
    if (points.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
    let minX = points[0].x, maxX = points[0].x;
    let minY = points[0].y, maxY = points[0].y;
    for (const p of points) {
        minX = Math.min(minX, p.x);
        maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y);
        maxY = Math.max(maxY, p.y);
    }
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

type Rect = { x: number; y: number; width: number; height: number };
type Guide = { type: 'v' | 'h'; position: number; start: number; end: number };
const SNAP_THRESHOLD = 5; // pixels in screen space

// Ray-casting algorithm to check if a point is inside a polygon
const isPointInPolygon = (point: Point, polygon: Point[]): boolean => {
    let isInside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i].x, yi = polygon[i].y;
        const xj = polygon[j].x, yj = polygon[j].y;
        const intersect = ((yi > point.y) !== (yj > point.y)) &&
            (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi);
        if (intersect) isInside = !isInside;
    }
    return isInside;
};

const rasterizeElement = (element: Exclude<Element, ImageElement | VideoElement>): Promise<{ href: string; mimeType: 'image/png' }> => {
    return new Promise((resolve, reject) => {
        const bounds = getElementBounds(element);
        if (bounds.width <= 0 || bounds.height <= 0) {
            return reject(new Error('Cannot rasterize an element with zero or negative dimensions.'));
        }

        const padding = 10;
        const svgWidth = bounds.width + padding * 2;
        const svgHeight = bounds.height + padding * 2;
        
        const offsetX = -bounds.x + padding;
        const offsetY = -bounds.y + padding;

        let elementSvgString = '';
        
        switch (element.type) {
            case 'path': {
                const pointsWithOffset = element.points.map(p => ({ x: p.x + offsetX, y: p.y + offsetY }));
                const pathData = pointsWithOffset.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
                elementSvgString = `<path d="${pathData}" stroke="${element.strokeColor}" stroke-width="${element.strokeWidth}" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-opacity="${element.strokeOpacity || 1}" />`;
                break;
            }
            case 'shape': {
                const shapeProps = `transform="translate(${element.x + offsetX}, ${element.y + offsetY})" fill="${element.fillColor}" stroke="${element.strokeColor}" stroke-width="${element.strokeWidth}"`;
                if (element.shapeType === 'rectangle') elementSvgString = `<rect width="${element.width}" height="${element.height}" rx="${element.borderRadius || 0}" ry="${element.borderRadius || 0}" ${shapeProps} />`;
                else if (element.shapeType === 'circle') elementSvgString = `<ellipse cx="${element.width/2}" cy="${element.height/2}" rx="${element.width/2}" ry="${element.height/2}" ${shapeProps} />`;
                else if (element.shapeType === 'triangle') elementSvgString = `<polygon points="${element.width/2},0 0,${element.height} ${element.width},${element.height}" ${shapeProps} />`;
                break;
            }
            case 'arrow': {
                 const [start, end] = element.points;
                 const angle = Math.atan2(end.y - start.y, end.x - start.x);
                 const headLength = element.strokeWidth * 4;

                 const arrowHeadHeight = headLength * Math.cos(Math.PI / 6);
                 const lineEnd = {
                     x: end.x - arrowHeadHeight * Math.cos(angle),
                     y: end.y - arrowHeadHeight * Math.sin(angle),
                 };

                 const headPoint1 = { x: end.x - headLength * Math.cos(angle - Math.PI / 6), y: end.y - headLength * Math.sin(angle - Math.PI / 6) };
                 const headPoint2 = { x: end.x - headLength * Math.cos(angle + Math.PI / 6), y: end.y - headLength * Math.sin(angle + Math.PI / 6) };
                 elementSvgString = `
                    <line x1="${start.x + offsetX}" y1="${start.y + offsetY}" x2="${lineEnd.x + offsetX}" y2="${lineEnd.y + offsetY}" stroke="${element.strokeColor}" stroke-width="${element.strokeWidth}" stroke-linecap="round" />
                    <polygon points="${end.x + offsetX},${end.y + offsetY} ${headPoint1.x + offsetX},${headPoint1.y + offsetY} ${headPoint2.x + offsetX},${headPoint2.y + offsetY}" fill="${element.strokeColor}" />
                 `;
                break;
            }
            case 'line': {
                 const [start, end] = element.points;
                 elementSvgString = `<line x1="${start.x + offsetX}" y1="${start.y + offsetY}" x2="${end.x + offsetX}" y2="${end.y + offsetY}" stroke="${element.strokeColor}" stroke-width="${element.strokeWidth}" stroke-linecap="round" />`;
                break;
            }
            case 'text': {
                 elementSvgString = `
                    <foreignObject x="${offsetX}" y="${offsetY}" width="${element.width}" height="${element.height}">
                        <div xmlns="http://www.w3.org/1999/xhtml" style="font-size: ${element.fontSize}px; color: ${element.fontColor}; width: 100%; height: 100%; word-break: break-word; font-family: sans-serif; padding:0; margin:0; line-height: 1.2;">
                            ${element.text.replace(/\n/g, '<br />')}
                        </div>
                    </foreignObject>
                 `;
                 // Note: Text is rasterized from its top-left corner (x,y), not the bounds' corner
                 elementSvgString = elementSvgString.replace(`x="${offsetX}"`, `x="${element.x + offsetX}"`).replace(`y="${offsetY}"`, `y="${element.y + offsetY}"`);
                break;
            }
            case 'group': {
                elementSvgString = '';
                break;
            }
        }

        const fullSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${svgWidth}" height="${svgHeight}">${elementSvgString}</svg>`;
        
        const img = new Image();
        img.crossOrigin = "anonymous";
        const svgDataUrl = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(fullSvg)))}`;

        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = svgWidth;
            canvas.height = svgHeight;
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.drawImage(img, 0, 0);
                resolve({ href: canvas.toDataURL('image/png'), mimeType: 'image/png' });
            } else {
                reject(new Error('Could not get canvas context.'));
            }
        };
        img.onerror = (err) => {
            reject(new Error(`Failed to load SVG into image: ${err}`));
        };
        img.src = svgDataUrl;
    });
};

const rasterizeElements = (elementsToRasterize: Exclude<Element, ImageElement | VideoElement>[]): Promise<{ href: string; mimeType: 'image/png', width: number, height: number }> => {
    return new Promise((resolve, reject) => {
        if (elementsToRasterize.length === 0) {
            return reject(new Error("No elements to rasterize."));
        }

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        elementsToRasterize.forEach(element => {
            const bounds = getElementBounds(element);
            minX = Math.min(minX, bounds.x);
            minY = Math.min(minY, bounds.y);
            maxX = Math.max(maxX, bounds.x + bounds.width);
            maxY = Math.max(maxY, bounds.y + bounds.height);
        });

        const combinedWidth = maxX - minX;
        const combinedHeight = maxY - minY;

        if (combinedWidth <= 0 || combinedHeight <= 0) {
            return reject(new Error('Cannot rasterize elements with zero or negative dimensions.'));
        }

        const padding = 10;
        const svgWidth = combinedWidth + padding * 2;
        const svgHeight = combinedHeight + padding * 2;
        
        const elementSvgStrings = elementsToRasterize.map(element => {
            const offsetX = -minX + padding;
            const offsetY = -minY + padding;

            let elementSvgString = '';
            switch (element.type) {
                 case 'path': {
                    const pointsWithOffset = element.points.map(p => ({ x: p.x + offsetX, y: p.y + offsetY }));
                    const pathData = pointsWithOffset.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
                    elementSvgString = `<path d="${pathData}" stroke="${element.strokeColor}" stroke-width="${element.strokeWidth}" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-opacity="${element.strokeOpacity || 1}" />`;
                    break;
                 }
                case 'shape': {
                    const shapeProps = `transform="translate(${element.x + offsetX}, ${element.y + offsetY})" fill="${element.fillColor}" stroke="${element.strokeColor}" stroke-width="${element.strokeWidth}"`;
                    if (element.shapeType === 'rectangle') elementSvgString = `<rect width="${element.width}" height="${element.height}" rx="${element.borderRadius || 0}" ry="${element.borderRadius || 0}" ${shapeProps} />`;
                    else if (element.shapeType === 'circle') elementSvgString = `<ellipse cx="${element.width/2}" cy="${element.height/2}" rx="${element.width/2}" ry="${element.height/2}" ${shapeProps} />`;
                    else if (element.shapeType === 'triangle') elementSvgString = `<polygon points="${element.width/2},0 0,${element.height} ${element.width},${element.height}" ${shapeProps} />`;
                    break;
                }
                case 'arrow': {
                     const [start, end] = element.points;
                     const angle = Math.atan2(end.y - start.y, end.x - start.x);
                     const headLength = element.strokeWidth * 4;

                     const arrowHeadHeight = headLength * Math.cos(Math.PI / 6);
                     const lineEnd = {
                        x: end.x - arrowHeadHeight * Math.cos(angle),
                        y: end.y - arrowHeadHeight * Math.sin(angle),
                     };

                     const headPoint1 = { x: end.x - headLength * Math.cos(angle - Math.PI / 6), y: end.y - headLength * Math.sin(angle - Math.PI / 6) };
                     const headPoint2 = { x: end.x - headLength * Math.cos(angle + Math.PI / 6), y: end.y - headLength * Math.sin(angle + Math.PI / 6) };
                     elementSvgString = `
                        <line x1="${start.x + offsetX}" y1="${start.y + offsetY}" x2="${lineEnd.x + offsetX}" y2="${lineEnd.y + offsetY}" stroke="${element.strokeColor}" stroke-width="${element.strokeWidth}" stroke-linecap="round" />
                        <polygon points="${end.x + offsetX},${end.y + offsetY} ${headPoint1.x + offsetX},${headPoint1.y + offsetY} ${headPoint2.x + offsetX},${headPoint2.y + offsetY}" fill="${element.strokeColor}" />
                     `;
                    break;
                }
                 case 'line': {
                     const [start, end] = element.points;
                     elementSvgString = `<line x1="${start.x + offsetX}" y1="${start.y + offsetY}" x2="${end.x + offsetX}" y2="${end.y + offsetY}" stroke="${element.strokeColor}" stroke-width="${element.strokeWidth}" stroke-linecap="round" />`;
                    break;
                 }
                case 'text': {
                     elementSvgString = `
                        <foreignObject x="${element.x + offsetX}" y="${element.y + offsetY}" width="${element.width}" height="${element.height}">
                            <div xmlns="http://www.w3.org/1999/xhtml" style="font-size: ${element.fontSize}px; color: ${element.fontColor}; width: 100%; height: 100%; word-break: break-word; font-family: sans-serif; padding:0; margin:0; line-height: 1.2;">
                                ${element.text.replace(/\n/g, '<br />')}
                            </div>
                        </foreignObject>
                     `;
                    break;
                }
                case 'group': {
                    elementSvgString = '';
                    break;
                }
            }
            return elementSvgString;
        }).join('');

        const fullSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${svgWidth}" height="${svgHeight}">${elementSvgStrings}</svg>`;
        
        const img = new Image();
        img.crossOrigin = "anonymous";
        const svgDataUrl = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(fullSvg)))}`;

        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = svgWidth;
            canvas.height = svgHeight;
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.drawImage(img, 0, 0);
                resolve({ 
                    href: canvas.toDataURL('image/png'), 
                    mimeType: 'image/png',
                    width: svgWidth,
                    height: svgHeight
                });
            } else {
                reject(new Error('Could not get canvas context.'));
            }
        };
        img.onerror = (err) => {
            reject(new Error(`Failed to load SVG into image: ${err}`));
        };
        img.src = svgDataUrl;
    });
};

const rasterizeMask = (
    maskPaths: PathElement[],
    baseImage: ImageElement
): Promise<{ href: string; mimeType: 'image/png' }> => {
    return new Promise((resolve, reject) => {
        const { width, height, x: imageX, y: imageY } = baseImage;
        if (width <= 0 || height <= 0) {
            return reject(new Error('Base image has invalid dimensions.'));
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            return reject(new Error('Could not get canvas context for mask.'));
        }

        // Black background for areas to be kept
        ctx.fillStyle = 'black';
        ctx.fillRect(0, 0, width, height);

        // White for areas to be inpainted
        ctx.strokeStyle = 'white';
        ctx.fillStyle = 'white';
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        maskPaths.forEach(path => {
            ctx.lineWidth = path.strokeWidth;
            ctx.beginPath();
            
            if (path.points.length === 1) {
                const point = path.points[0];
                ctx.arc(point.x - imageX, point.y - imageY, path.strokeWidth / 2, 0, 2 * Math.PI);
                ctx.fill();
            } else if (path.points.length > 1) {
                const startPoint = path.points[0];
                ctx.moveTo(startPoint.x - imageX, startPoint.y - imageY);
                for (let i = 1; i < path.points.length; i++) {
                    const point = path.points[i];
                    ctx.lineTo(point.x - imageX, point.y - imageY);
                }
                ctx.stroke();
            }
        });

        resolve({ href: canvas.toDataURL('image/png'), mimeType: 'image/png' });
    });
};

const createNewBoard = (name: string): Board => {
    const id = generateId();
    return {
        id,
        name,
        elements: [],
        history: [[]],
        historyIndex: 0,
        panOffset: { x: 0, y: 0 },
        zoom: 1,
        canvasBackgroundColor: '#FFFFFF',
    };
};

const DEFAULT_MODEL_PREFS: ModelPreference = {
    textModel: 'gemini-3-flash-preview',
    imageModel: 'gemini-3.1-flash-image-preview',
    videoModel: 'veo-3.1-generate-preview',
    agentModel: 'banana-vision-v1',
};

// 根据 provider 映射出可选模型列表
const PROVIDER_MODELS = DEFAULT_PROVIDER_MODELS;

const ensureModelOption = (options: string[], model?: string) => {
    const trimmed = model?.trim();
    if (!trimmed) return options;
    return options.includes(trimmed) ? options : [trimmed, ...options];
};

const addUniqueModel = (set: Set<string>, model?: string) => {
    const trimmed = model?.trim();
    if (trimmed) set.add(trimmed);
};
// 兜底：当用户没有任何 API Key 时的默认选项（不可用，仅占位）
const FALLBACK_TEXT_OPTIONS = ensureModelOption([...(PROVIDER_MODELS.google?.text || [])], DEFAULT_MODEL_PREFS.textModel);
const FALLBACK_IMAGE_OPTIONS = ensureModelOption([...(PROVIDER_MODELS.google?.image || [])], DEFAULT_MODEL_PREFS.imageModel);
const FALLBACK_VIDEO_OPTIONS = ensureModelOption([...(PROVIDER_MODELS.google?.video || [])], DEFAULT_MODEL_PREFS.videoModel);
const BOARDS_STORAGE_KEY = 'boards.v1';
const ACTIVE_BOARD_STORAGE_KEY = 'boards.activeId.v1';

const THEME_PALETTES = {
    light: {
        appBackground: '#f3f5f9',
        canvasBackground: '#f7f8fb',
        uiBgColor: 'rgba(255, 255, 255, 0.92)',
        buttonBgColor: '#111827',
    },
    dark: {
        appBackground: '#0c0f14',
        canvasBackground: '#11151c',
        uiBgColor: 'rgba(18, 21, 27, 0.94)',
        buttonBgColor: '#f3f4f6',
    },
} as const;

const normalizeApiKeyEntry = (item: Partial<UserApiKey>): UserApiKey | null => {
    if (!item || !item.id || !item.provider || !item.key) return null;
    return {
        id: item.id,
        provider: item.provider,
        capabilities:
            Array.isArray(item.capabilities) && item.capabilities.length > 0
                ? item.capabilities
                : inferCapabilitiesByProvider(item.provider),
        key: item.key,
        baseUrl: item.baseUrl,
        name: item.name,
        isDefault: item.isDefault,
        status: item.status,
        createdAt: item.createdAt || Date.now(),
        updatedAt: item.updatedAt || Date.now(),
    };
};

const hasCapabilityOverlap = (left: AICapability[], right: AICapability[]) =>
    left.some(capability => right.includes(capability));

const loadBoardsFromStorage = (): Board[] => {
    try {
        const raw = localStorage.getItem(BOARDS_STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : null;
        if (!Array.isArray(parsed) || parsed.length === 0) {
            return [createNewBoard('Board 1')];
        }

        const boards = parsed.filter((board): board is Board => {
            return !!board && typeof board.id === 'string' && typeof board.name === 'string' && Array.isArray(board.elements);
        });

        return boards.length > 0 ? boards : [createNewBoard('Board 1')];
    } catch {
        return [createNewBoard('Board 1')];
    }
};

const App: React.FC = () => {
    const [boards, setBoards] = useState<Board[]>(() => loadBoardsFromStorage());
    const [activeBoardId, setActiveBoardId] = useState<string>(() => {
        try {
            const saved = localStorage.getItem(ACTIVE_BOARD_STORAGE_KEY);
            return saved || '';
        } catch {
            return '';
        }
    });

    const activeBoard = useMemo(() => {
        return boards.find(b => b.id === activeBoardId) ?? boards[0];
    }, [boards, activeBoardId]);

    const { elements, history, historyIndex, panOffset, zoom } = activeBoard;

    const [activeTool, setActiveTool] = useState<Tool>('select');
    const [drawingOptions, setDrawingOptions] = useState({ strokeColor: '#111827', strokeWidth: 5 });
    const [selectedElementIds, setSelectedElementIds] = useState<string[]>([]);
    const [selectionBox, setSelectionBox] = useState<Rect | null>(null);
    const [prompt, setPrompt] = useState('');
    const [promptAttachments, setPromptAttachments] = useState<ChatAttachment[]>([]);
    const [chatAttachments, setChatAttachments] = useState<ChatAttachment[]>([]);
    // @ 瀵洜鏁ら崗鍐 id 閸掓銆冮敍鍫㈡暠 PromptBar 閸︺劎鏁ら幋椋庡仯閸戣崵鏁撻幋鎰閸氬本顒炴潻鍥ㄦ降閿?
    const [mentionedElementIds, setMentionedElementIds] = useState<string[]>([]);
    const [isEnhancingPrompt, setIsEnhancingPrompt] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isSettingsPanelOpen, setIsSettingsPanelOpen] = useState(false);
    const [legalModal, setLegalModal] = useState<'terms' | 'privacy' | null>(null);
    const [legalContent, setLegalContent] = useState('');
    const [isLayerMinimized, setIsLayerMinimized] = useState(() => {
        const saved = localStorage.getItem('layerPanelMinimized');
        return saved === 'true';
    });
    const [isInspirationMinimized, setIsInspirationMinimized] = useState(() => {
        const saved = localStorage.getItem('inspirationPanelMinimized');
        return saved === 'true';
    });
    const [toolbarLeft, setToolbarLeft] = useState(68); // 瀹搞儱鍙块弽蹇曟畱 left 娴ｅ秶鐤?
    const [rightPanelWidth, setRightPanelWidth] = useState(2); // 閸欏厖鏅堕棃銏℃緲鐎圭偤妾€硅棄瀹抽敍鍫㈡暏閿?PromptBar 閸氬本顒為敓?
    const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth);
    const [wheelAction, setWheelAction] = useState<WheelAction>('zoom');
    const [croppingState, setCroppingState] = useState<{ elementId: string; originalElement: ImageElement; cropBox: Rect } | null>(null);
    const [filterPanelElementId, setFilterPanelElementId] = useState<string | null>(null);
    const [outpaintMenuId, setOutpaintMenuId] = useState<string | null>(null);
    const [alignmentGuides, setAlignmentGuides] = useState<Guide[]>([]);
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; elementId: string | null } | null>(null);
    const [assetLibrary, setAssetLibrary] = useState<AssetLibrary>(() => loadAssetLibrary());
    const [generationHistory, setGenerationHistory] = useState<GenerationHistoryItem[]>(() => loadGenerationHistory());
    const [isAssetPanelOpen, setIsAssetPanelOpen] = useState(false);
    const [addAssetModal, setAddAssetModal] = useState<{ open: boolean; dataUrl: string; mimeType: string; width: number; height: number } | null>(null);
    
    // Persist minimize state
    useEffect(() => {
        localStorage.setItem('layerPanelMinimized', isLayerMinimized.toString());
    }, [isLayerMinimized]);
    
    useEffect(() => {
        localStorage.setItem('inspirationPanelMinimized', isInspirationMinimized.toString());
    }, [isInspirationMinimized]);

    useEffect(() => {
        const handleResize = () => setViewportWidth(window.innerWidth);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const chromeMetrics = useMemo(() => getCompactChromeMetrics(viewportWidth), [viewportWidth]);

    useEffect(() => {
        localStorage.setItem(BOARDS_STORAGE_KEY, JSON.stringify(boards));
    }, [boards]);

    useEffect(() => {
        if (!activeBoardId) return;
        localStorage.setItem(ACTIVE_BOARD_STORAGE_KEY, activeBoardId);
    }, [activeBoardId]);
    
    useEffect(() => {
        if (typeof window === 'undefined') return;
        const media = window.matchMedia('(prefers-color-scheme: dark)');
        const updateTheme = (event?: MediaQueryListEvent) => {
            setSystemTheme((event ? event.matches : media.matches) ? 'dark' : 'light');
        };

        updateTheme();
        if (typeof media.addEventListener === 'function') {
            media.addEventListener('change', updateTheme);
            return () => media.removeEventListener('change', updateTheme);
        }

        media.addListener(updateTheme);
        return () => media.removeListener(updateTheme);
    }, []);

    const [editingElement, setEditingElement] = useState<{ id: string; text: string; } | null>(null);
    const [lassoPath, setLassoPath] = useState<Point[] | null>(null);

    // Inpaint (局部重绘) state
    const [inpaintState, setInpaintState] = useState<{
        targetImageId: string;
        maskPoints: Point[];  // lasso polygon in canvas coords
        promptVisible: boolean;
    } | null>(null);
    const [inpaintPrompt, setInpaintPrompt] = useState('');

    const [language, setLanguage] = useState<'en' | 'zho'>('en');
    const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
        try {
            const saved = localStorage.getItem('themeMode.v1');
            return saved === 'light' || saved === 'dark' || saved === 'system' ? saved : 'system';
        } catch {
            return 'system';
        }
    });
    const [systemTheme, setSystemTheme] = useState<'light' | 'dark'>(() => {
        if (typeof window === 'undefined') return 'light';
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    });
    useEffect(() => {
        localStorage.setItem('themeMode.v1', themeMode);
    }, [themeMode]);
    const [userApiKeys, setUserApiKeys] = useState<UserApiKey[]>([]);
    const [apiKeysLoaded, setApiKeysLoaded] = useState(false);
    // 新用户引导弹窗：API Key 加载完成且无任何 Key 时自动显示
    const [showOnboarding, setShowOnboarding] = useState(false);
    const [clearKeysOnExit, setClearKeysOnExit] = useState<boolean>(() => {
        try { return localStorage.getItem('security.clearKeysOnExit') === 'true'; } catch { return false; }
    });
    const [modelPreference, setModelPreference] = useState<ModelPreference>(() => {
        try {
            const raw = localStorage.getItem('modelPreference.v1');
            return raw ? { ...DEFAULT_MODEL_PREFS, ...JSON.parse(raw) } : DEFAULT_MODEL_PREFS;
        } catch {
            return DEFAULT_MODEL_PREFS;
        }
    });
    
    const [userEffects, setUserEffects] = useState<UserEffect[]>(() => {
        try {
            const saved = localStorage.getItem('userEffects');
            return saved ? JSON.parse(saved) : [];
        } catch (error) {
            console.error("Failed to parse user effects from localStorage", error);
            return [];
        }
    });
    const [characterLocks, setCharacterLocks] = useState<CharacterLockProfile[]>(() => {
        try {
            const raw = localStorage.getItem('characterLocks.v1');
            return raw ? JSON.parse(raw) : [];
        } catch {
            return [];
        }
    });
    const [activeCharacterLockId, setActiveCharacterLockId] = useState<string | null>(() => {
        return localStorage.getItem('characterLocks.activeId') || null;
    });
    
    const [generationMode, setGenerationMode] = useState<'image' | 'video' | 'keyframe'>('image');
    const [videoAspectRatio, setVideoAspectRatio] = useState<'16:9' | '9:16'>('16:9');
    const [progressMessage, setProgressMessage] = useState<string>('');
    const [isAutoEnhanceEnabled, setIsAutoEnhanceEnabled] = useState<boolean>(() => {
        try { return localStorage.getItem('autoEnhance.v1') === 'true'; } catch { return false; }
    });
    const [batchCount, setBatchCount] = useState<number>(1); // 1 = normal, 2/4 = batch mode
    const [batchResults, setBatchResults] = useState<{
        prompt: string;
        images: { href: string; mimeType: string; width: number; height: number }[];
    } | null>(null);

    // ── Layer Mask 编辑状态 ──────
    const [maskEditingId, setMaskEditingId] = useState<string | null>(null); // 正在编辑蒙版的 image element id
    const [maskBrushSize, setMaskBrushSize] = useState(30);
    const [maskBrushMode, setMaskBrushMode] = useState<'erase' | 'reveal'>('erase'); // erase = paint black (hide), reveal = paint white (show)
    const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);

    // ── A/B 对比状态 ──────
    const [abCompare, setAbCompare] = useState<{
        imageA: { src: string; label: string };
        imageB: { src: string; label: string };
    } | null>(null);

    // ── 统一 API Key 选择器状态（替代旧的 apiConfigStore） ──────
    const [activeUserKeyId, setActiveUserKeyId] = React.useState<string | null>(null);
    const [activeUserModelId, setActiveUserModelId] = React.useState<string | null>(null);

    const handleUserKeyChange = React.useCallback((id: string) => {
        setActiveUserKeyId(id);
        const key = userApiKeys.find(k => k.id === id);
        if (key) {
            setActiveUserModelId(key.defaultModel || key.customModels?.[0] || null);
        }
    }, [userApiKeys]);

    // 根据用户已配置的 API Key 动态计算可选模型列表
    const dynamicModelOptions = useMemo(() => {
        const textSet = new Set<string>();
        const imageSet = new Set<string>();
        const videoSet = new Set<string>();
        for (const key of userApiKeys) {
            const providerModels = PROVIDER_MODELS[key.provider];
            if (!providerModels) continue;
            const caps = key.capabilities?.length ? key.capabilities : inferCapabilitiesByProvider(key.provider);
            if (caps.includes('text'))  providerModels.text.forEach(m => textSet.add(m));
            if (caps.includes('image')) providerModels.image.forEach(m => imageSet.add(m));
            if (caps.includes('video')) providerModels.video.forEach(m => videoSet.add(m));

            const userDefinedModels = [...(key.customModels || []), key.defaultModel].filter((model): model is string => !!model);
            for (const model of userDefinedModels) {
                const capability = inferCapabilityFromModel(model);
                if (capability === 'text' && caps.includes('text')) addUniqueModel(textSet, model);
                if (capability === 'image' && caps.includes('image')) addUniqueModel(imageSet, model);
                if (capability === 'video' && caps.includes('video')) addUniqueModel(videoSet, model);
            }
        }
        return {
            text: ensureModelOption(textSet.size > 0 ? Array.from(textSet) : [...FALLBACK_TEXT_OPTIONS], modelPreference.textModel),
            image: ensureModelOption(imageSet.size > 0 ? Array.from(imageSet) : [...FALLBACK_IMAGE_OPTIONS], modelPreference.imageModel),
            video: ensureModelOption(videoSet.size > 0 ? Array.from(videoSet) : [...FALLBACK_VIDEO_OPTIONS], modelPreference.videoModel),
        };
    }, [modelPreference.imageModel, modelPreference.textModel, modelPreference.videoModel, userApiKeys]);

    // Usage monitoring summary (recomputed when settings panel opens or keys change)
    const usageSummaryMap = useMemo(() => {
        if (!isSettingsPanelOpen || userApiKeys.length === 0) return undefined;
        return getUsageSummary(userApiKeys.map(k => k.id));
    }, [isSettingsPanelOpen, userApiKeys]);

    // 持久化 autoEnhance 开关
    useEffect(() => {
        localStorage.setItem('autoEnhance.v1', isAutoEnhanceEnabled.toString());
    }, [isAutoEnhanceEnabled]);

    const resolvedTheme = themeMode === 'system' ? systemTheme : themeMode;
    const themePalette = THEME_PALETTES[resolvedTheme];
    const canvasBackgroundColor = themePalette.canvasBackground;

    const interactionMode = useRef<string | null>(null);
    const startPoint = useRef<Point>({ x: 0, y: 0 });
    const currentDrawingElementId = useRef<string | null>(null);
    const resizeStartInfo = useRef<{ originalElement: ImageElement | ShapeElement | TextElement | VideoElement; startCanvasPoint: Point; handle: string; shiftKey: boolean } | null>(null);
    const cropStartInfo = useRef<{ originalCropBox: Rect, startCanvasPoint: Point } | null>(null);
    const dragStartElementPositions = useRef<Map<string, {x: number, y: number} | Point[]>>(new Map());
    const elementsRef = useRef(elements);
    const svgRef = useRef<SVGSVGElement>(null);
    const editingTextareaRef = useRef<HTMLTextAreaElement>(null);
    const previousToolRef = useRef<Tool>('select');
    const spacebarDownTime = useRef<number | null>(null);
    elementsRef.current = elements;

    useEffect(() => {
        setSelectedElementIds([]);
        setEditingElement(null);
        setCroppingState(null);
        setSelectionBox(null);
        setPrompt('');
    }, [activeBoardId]);

    useEffect(() => {
        if (!boards.length) return;
        if (!boards.some(board => board.id === activeBoardId)) {
            setActiveBoardId(boards[0].id);
        }
    }, [boards, activeBoardId]);
    
    useEffect(() => {
        try {
            localStorage.setItem('userEffects', JSON.stringify(userEffects));
        } catch (error) {
            console.error("Failed to save user effects to localStorage", error);
        }
    }, [userEffects]);

    // 从加密存储异步加载 API Key（首次挂载 + 兼容迁移旧明文）
    useEffect(() => {
        let cancelled = false;
        (async () => {
            await migrateLegacyKeys();
            const keys = await loadKeysDecrypted<Partial<UserApiKey>[]>();
            if (cancelled) return;
            const normalized = (keys || [])
                .map(normalizeApiKeyEntry)
                .filter((item): item is UserApiKey => !!item);
            setUserApiKeys(normalized);
            setApiKeysLoaded(true);
        })();
        return () => { cancelled = true; };
    }, []);

    // 持久化 API Key（加密写入）
    useEffect(() => {
        if (!apiKeysLoaded) return; // 防止初始空数组覆盖加密数据
        saveKeysEncrypted(userApiKeys);
    }, [userApiKeys, apiKeysLoaded]);

    // 新用户引导：API Key 异步加载完成后，如果没有任何 Key 且用户未主动跳过，自动弹出引导
    useEffect(() => {
        if (!apiKeysLoaded) return;
        const hasSkipped = localStorage.getItem('onboarding.skipped') === 'true';
        if (userApiKeys.length === 0 && !hasSkipped) {
            setShowOnboarding(true);
        } else if (userApiKeys.length > 0) {
            // 用户在设置面板中添加了 Key → 自动关闭引导弹窗
            setShowOnboarding(false);
        }
    }, [apiKeysLoaded, userApiKeys.length]);

    // 持久化 clearKeysOnExit 设置
    useEffect(() => {
        localStorage.setItem('security.clearKeysOnExit', clearKeysOnExit.toString());
    }, [clearKeysOnExit]);

    // 退出时清除 API Key
    useEffect(() => {
        if (!clearKeysOnExit) return;
        const handleBeforeUnload = () => { clearAllKeyData(); };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [clearKeysOnExit]);

    // Chrome Extension bridge: sync API keys to chrome.storage for content script access
    useEffect(() => {
        if (!apiKeysLoaded || typeof chrome === 'undefined' || !chrome?.storage?.local) return;
        const safeKeys = userApiKeys.map(k => ({ provider: k.provider, key: k.key, baseUrl: k.baseUrl, models: k.models, capabilities: k.capabilities }));
        chrome.storage.local.set({ flovart_user_api_keys: safeKeys });
    }, [userApiKeys, apiKeysLoaded]);

    // Chrome Extension bridge: listen for keys added from extension popup → merge into app
    useEffect(() => {
        if (typeof chrome === 'undefined' || !chrome?.storage?.onChanged) return;
        const handleStorageChange = (changes: Record<string, { oldValue?: unknown; newValue?: unknown }>, areaName: string) => {
            if (areaName !== 'local' || !changes.flovart_user_api_keys) return;
            const extKeys = changes.flovart_user_api_keys.newValue as Array<{ provider: AIProvider; key: string; baseUrl?: string; models?: unknown[]; capabilities?: AICapability[] }> | undefined;
            if (!Array.isArray(extKeys)) return;
            setUserApiKeys(prev => {
                // Merge: add any keys from extension that don't already exist in app
                const existingFingerprints = new Set(prev.map(k => `${k.provider}::${k.key}`));
                const newKeys: UserApiKey[] = [];
                for (const ek of extKeys) {
                    if (!ek.provider || !ek.key) continue;
                    const fp = `${ek.provider}::${ek.key}`;
                    if (existingFingerprints.has(fp)) continue;
                    newKeys.push(normalizeApiKeyEntry({
                        id: crypto.randomUUID(),
                        provider: ek.provider,
                        key: ek.key,
                        baseUrl: ek.baseUrl,
                        capabilities: ek.capabilities,
                        createdAt: Date.now(),
                        updatedAt: Date.now(),
                    }) as UserApiKey);
                }
                return newKeys.length > 0 ? [...prev, ...newKeys.filter(Boolean)] : prev;
            });
        };
        chrome.storage.onChanged.addListener(handleStorageChange);
        return () => chrome.storage.onChanged.removeListener(handleStorageChange);
    }, []);

    useEffect(() => {
        localStorage.setItem('modelPreference.v1', JSON.stringify(modelPreference));
    }, [modelPreference]);

    useEffect(() => {
        localStorage.setItem('characterLocks.v1', JSON.stringify(characterLocks));
    }, [characterLocks]);

    useEffect(() => {
        if (activeCharacterLockId) {
            localStorage.setItem('characterLocks.activeId', activeCharacterLockId);
        } else {
            localStorage.removeItem('characterLocks.activeId');
        }
    }, [activeCharacterLockId]);

    useEffect(() => {
        if (activeCharacterLockId && !characterLocks.some(lock => lock.id === activeCharacterLockId)) {
            setActiveCharacterLockId(null);
        }
    }, [characterLocks, activeCharacterLockId]);

    // Close filter panel when selection changes
    useEffect(() => {
        if (filterPanelElementId && !selectedElementIds.includes(filterPanelElementId)) {
            setFilterPanelElementId(null);
        }
    }, [selectedElementIds, filterPanelElementId]);

    const getPreferredApiKey = useCallback((capability: AICapability, provider?: AIProvider) => {
        const matches = userApiKeys.filter(key => {
            const capabilities = key.capabilities?.length ? key.capabilities : inferCapabilitiesByProvider(key.provider);
            return capabilities.includes(capability) && (!provider || key.provider === provider);
        });
        return matches.find(key => key.isDefault) || matches[0];
    }, [userApiKeys]);

    useEffect(() => {
        const textProvider = inferProviderFromModel(modelPreference.textModel);
        const imageProvider = inferProviderFromModel(modelPreference.imageModel);
        const videoProvider = inferProviderFromModel(modelPreference.videoModel);

        const googleTextKey = getPreferredApiKey('text', 'google');
        const googleImageKey = getPreferredApiKey('image', 'google');
        const googleVideoKey = getPreferredApiKey('video', 'google');
        const bananaKey = getPreferredApiKey('agent', 'banana');

        setGeminiRuntimeConfig({
            textApiKey: googleTextKey?.key,
            imageApiKey: googleImageKey?.key || googleTextKey?.key,
            videoApiKey: googleVideoKey?.key || googleImageKey?.key || googleTextKey?.key,
            textModel: textProvider === 'google' ? modelPreference.textModel : undefined,
            imageModel:
                imageProvider === 'google' && isGoogleImageEditModel(modelPreference.imageModel)
                    ? modelPreference.imageModel
                    : undefined,
            textToImageModel:
                imageProvider === 'google' && isGoogleTextToImageModel(modelPreference.imageModel)
                    ? modelPreference.imageModel
                    : undefined,
            videoModel: videoProvider === 'google' ? modelPreference.videoModel : undefined,
        });
        setBananaRuntimeConfig({
            apiKey: bananaKey?.key,
            splitUrl: bananaKey?.baseUrl ? `${bananaKey.baseUrl.replace(/\/$/, '')}/split-layers` : undefined,
            agentUrl: bananaKey?.baseUrl ? `${bananaKey.baseUrl.replace(/\/$/, '')}/agent` : undefined,
        });
    }, [getPreferredApiKey, modelPreference]);

    const handleAddUserEffect = useCallback((effect: UserEffect) => {
        setUserEffects(prev => [...prev, effect]);
    }, []);

    const handleDeleteUserEffect = useCallback((id: string) => {
        setUserEffects(prev => prev.filter(effect => effect.id !== id));
    }, []);

    const handleAddApiKey = useCallback((payload: Omit<UserApiKey, 'id' | 'createdAt' | 'updatedAt'>) => {
        const now = Date.now();
        const capabilities = payload.capabilities?.length ? payload.capabilities : inferCapabilitiesByProvider(payload.provider);
        const nextKey: UserApiKey = {
            ...payload,
            capabilities,
            id: generateId(),
            createdAt: now,
            updatedAt: now,
        };
        setUserApiKeys(prev => {
            const isFirstOfCapabilities = !prev.some(k =>
                hasCapabilityOverlap(
                    k.capabilities?.length ? k.capabilities : inferCapabilitiesByProvider(k.provider),
                    capabilities
                )
            );
            const shouldSetDefault = payload.isDefault || isFirstOfCapabilities;
            const withDefault = shouldSetDefault
                ? prev.map(k => {
                    const existingCaps = k.capabilities?.length ? k.capabilities : inferCapabilitiesByProvider(k.provider);
                    return hasCapabilityOverlap(existingCaps, capabilities)
                        ? { ...k, isDefault: false }
                        : k;
                })
                : prev;
            return [{ ...nextKey, isDefault: shouldSetDefault }, ...withDefault];
        });
    }, []);

    const handleDeleteApiKey = useCallback((id: string) => {
        setUserApiKeys(prev => prev.filter(k => k.id !== id));
    }, []);

    const handleUpdateApiKey = useCallback((id: string, patch: Partial<Omit<UserApiKey, 'id' | 'createdAt'>>) => {
        setUserApiKeys(prev => prev.map(k =>
            k.id === id ? { ...k, ...patch, updatedAt: Date.now() } : k
        ));
    }, []);

    const handleSetDefaultApiKey = useCallback((id: string) => {
        setUserApiKeys(prev => {
            const target = prev.find(k => k.id === id);
            if (!target) return prev;
            const targetCaps = target.capabilities?.length ? target.capabilities : inferCapabilitiesByProvider(target.provider);
            return prev.map(k => {
                const existingCaps = k.capabilities?.length ? k.capabilities : inferCapabilitiesByProvider(k.provider);
                return hasCapabilityOverlap(existingCaps, targetCaps)
                    ? { ...k, isDefault: k.id === id }
                    : k;
            });
        });
    }, []);

    const selectedSingleImage = useMemo<ImageElement | null>(() => {
        if (selectedElementIds.length !== 1) return null;
        const selected = elements.find(el => el.id === selectedElementIds[0]);
        return selected && selected.type === 'image' ? selected : null;
    }, [elements, selectedElementIds]);

    const activeCharacterLock = useMemo(() => {
        if (!activeCharacterLockId) return null;
        return characterLocks.find(lock => lock.id === activeCharacterLockId) || null;
    }, [activeCharacterLockId, characterLocks]);

    const handleLockCharacterFromSelection = useCallback((name?: string) => {
        if (!selectedSingleImage) {
            setError('Please select an image before locking a character.');
            return;
        }
        const lockName = name?.trim() || selectedSingleImage.name || `Character ${characterLocks.length + 1}`;
        const descriptor = [
            `Character lock: ${lockName}.`,
            'Keep face, hairstyle, costume, body shape, and age consistent across all shots.',
            'Do not alter identity unless explicitly requested.',
        ].join(' ');

        const next: CharacterLockProfile = {
            id: generateId(),
            name: lockName,
            anchorElementId: selectedSingleImage.id,
            referenceImage: selectedSingleImage.href,
            descriptor,
            createdAt: Date.now(),
            isActive: true,
        };

        setCharacterLocks(prev => [...prev.map(lock => ({ ...lock, isActive: false })), next]);
        setActiveCharacterLockId(next.id);
        setError(null);
    }, [selectedSingleImage, characterLocks.length]);

    const openLegalModal = useCallback((type: 'terms' | 'privacy') => {
        setLegalModal(type);
        setLegalContent(type === 'terms' ? termsRaw : privacyRaw);
    }, []);

    const handleEnhancePrompt = useCallback(async (payload: {
        prompt: string;
        mode: PromptEnhanceMode;
        stylePreset?: string;
    }) => {
        setIsEnhancingPrompt(true);
        try {
            const provider = inferProviderFromModel(modelPreference.textModel);
            const key = getPreferredApiKey('text', provider);
            return await enhancePromptWithProvider(payload, modelPreference.textModel, key);
        } finally {
            setIsEnhancingPrompt(false);
        }
    }, [getPreferredApiKey, modelPreference.textModel]);

    const handleSetActiveCharacterLock = useCallback((id: string | null) => {
        setActiveCharacterLockId(id);
        setCharacterLocks(prev =>
            prev.map(lock => ({ ...lock, isActive: id ? lock.id === id : false }))
        );
    }, []);

    const saveGenerationToHistory = useCallback((payload: {
        name?: string;
        dataUrl: string;
        mimeType: string;
        width: number;
        height: number;
        prompt: string;
        mediaType?: 'image' | 'video';
    }) => {
        const item: GenerationHistoryItem = {
            id: generateId(),
            name: payload.name,
            dataUrl: payload.dataUrl,
            mimeType: payload.mimeType,
            width: payload.width,
            height: payload.height,
            prompt: payload.prompt,
            createdAt: Date.now(),
            mediaType: payload.mediaType,
        };

        setGenerationHistory(prev => addGenerationHistoryItem(prev, item));

        // Record successful API usage
        const genType = payload.mediaType ?? 'image';
        const activeModel = genType === 'video' ? modelPreference.videoModel : modelPreference.imageModel;
        const provider = inferProviderFromModel(activeModel);
        const usageKey = userApiKeys.find(k => k.provider === provider);
        if (usageKey) {
            recordApiUsage({
                keyId: usageKey.id,
                provider: usageKey.provider,
                model: activeModel,
                type: genType,
                success: true,
            });
        }
    }, [modelPreference, userApiKeys]);

    const addChatAttachment = useCallback((payload: Omit<ChatAttachment, 'id'>) => {
        setChatAttachments(prev => {
            const exists = prev.some(item => item.href === payload.href);
            if (exists) return prev;
            return [...prev, { ...payload, id: generateId() }];
        });
    }, []);

    const addPromptAttachment = useCallback((payload: Omit<ChatAttachment, 'id'>) => {
        setPromptAttachments(prev => {
            const exists = prev.some(item => item.href === payload.href);
            if (exists) return prev;
            return [...prev, { ...payload, id: generateId() }];
        });
    }, []);

    const handleAddAttachmentFromCanvas = useCallback((payload: { id: string; name?: string; href: string; mimeType: string }) => {
        addChatAttachment({
            name: payload.name || `Canvas ${payload.id.slice(-4)}`,
            href: payload.href,
            mimeType: payload.mimeType,
            source: 'canvas',
        });
    }, [addChatAttachment]);

    const handleAddAttachmentFiles = useCallback(async (files: FileList | File[]) => {
        const list = Array.from(files).filter(file => file.type.startsWith('image/'));
        if (list.length === 0) return;
        try {
            const dataList = await Promise.all(list.map(fileToDataUrl));
            dataList.forEach((item, index) => {
                addChatAttachment({
                    name: list[index].name || `Upload ${index + 1}`,
                    href: item.dataUrl,
                    mimeType: item.mimeType,
                    source: 'upload',
                });
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Attachment upload failed.';
            setError(message);
        }
    }, [addChatAttachment]);

    const handleAddPromptAttachmentFiles = useCallback(async (files: FileList | File[]) => {
        const list = Array.from(files).filter(file => file.type.startsWith('image/'));
        if (list.length === 0) return;
        try {
            const dataList = await Promise.all(list.map(fileToDataUrl));
            dataList.forEach((item, index) => {
                addPromptAttachment({
                    name: list[index].name || `Upload ${index + 1}`,
                    href: item.dataUrl,
                    mimeType: item.mimeType,
                    source: 'upload',
                });
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Attachment upload failed.';
            setError(message);
        }
    }, [addPromptAttachment]);

    const handleRemoveChatAttachment = useCallback((id: string) => {
        setChatAttachments(prev => prev.filter(item => item.id !== id));
    }, []);

    const handleRemovePromptAttachment = useCallback((id: string) => {
        setPromptAttachments(prev => prev.filter(item => item.id !== id));
    }, []);

    const t = useCallback((key: string, ...args: any[]): any => {
        const keys = key.split('.');
        let result: any = translations[language];
        for (const k of keys) {
            result = result?.[k];
        }
        if (typeof result === 'function') {
            return result(...args);
        }
        return result || key;
    }, [language]);

    useEffect(() => {
        const root = document.documentElement;
        root.dataset.theme = resolvedTheme;
        root.style.setProperty('--ui-bg-color', themePalette.uiBgColor);
        root.style.setProperty('--button-bg-color', themePalette.buttonBgColor);
        document.body.style.backgroundColor = themePalette.appBackground;
    }, [resolvedTheme, themePalette]);

    // (moved below commitAction)

    const updateActiveBoard = (updater: (board: Board) => Board) => {
        setBoards(prevBoards => prevBoards.map(board =>
            board.id === activeBoardId ? updater(board) : board
        ));
    };

    const setElements = (updater: (prev: Element[]) => Element[], commit: boolean = true) => {
        updateActiveBoard(board => {
            const newElements = updater(board.elements);
            if (commit) {
                const newHistory = [...board.history.slice(0, board.historyIndex + 1), newElements];
                return {
                    ...board,
                    elements: newElements,
                    history: newHistory,
                    historyIndex: newHistory.length - 1,
                };
            } else {
                 const tempHistory = [...board.history];
                 tempHistory[board.historyIndex] = newElements;
                 return { ...board, elements: newElements, history: tempHistory };
            }
        });
    };
    
    const commitAction = useCallback((updater: (prev: Element[]) => Element[]) => {
        updateActiveBoard(board => {
            const newElements = updater(board.elements);
            const newHistory = [...board.history.slice(0, board.historyIndex + 1), newElements];
            return {
                ...board,
                elements: newElements,
                history: newHistory,
                historyIndex: newHistory.length - 1,
            };
        });
    }, [activeBoardId]);

    const handleUndo = useCallback(() => {
        updateActiveBoard(board => {
            if (board.historyIndex > 0) {
                return { ...board, historyIndex: board.historyIndex - 1, elements: board.history[board.historyIndex - 1] };
            }
            return board;
        });
    }, [activeBoardId]);

    const handleRedo = useCallback(() => {
        updateActiveBoard(board => {
            if (board.historyIndex < board.history.length - 1) {
                return { ...board, historyIndex: board.historyIndex + 1, elements: board.history[board.historyIndex + 1] };
            }
            return board;
        });
    }, [activeBoardId]);

    // Handle drop from AssetLibraryPanel (after commitAction and getCanvasPoint are defined)
    const handleAssetDropRef = useRef<(e: React.DragEvent) => void>();
    handleAssetDropRef.current = (e: React.DragEvent) => {
        const payload = e.dataTransfer.getData('text/plain');
        try {
            const parsed = JSON.parse(payload);
            if (parsed?.__makingAsset && parsed.item) {
                const item: AssetItem = parsed.item as AssetItem;
                const canvasPoint = getCanvasPoint(e.clientX, e.clientY);
                const img = new Image();
                img.onload = () => {
                    const newImage: ImageElement = {
                        id: generateId(),
                        type: 'image',
                        name: item.name || 'Asset',
                        x: canvasPoint.x - img.width / 2,
                        y: canvasPoint.y - img.height / 2,
                        width: img.width,
                        height: img.height,
                        href: item.dataUrl,
                        mimeType: item.mimeType,
                    };
                    commitAction(prev => [...prev, newImage]);
                    setSelectedElementIds([newImage.id]);
                    setActiveTool('select');
                };
                img.src = item.dataUrl;
            }
        } catch {}
    };

    const getDescendants = useCallback((elementId: string, allElements: Element[]): Element[] => {
        const descendants: Element[] = [];
        const children = allElements.filter(el => el.parentId === elementId);
        for (const child of children) {
            descendants.push(child);
            if (child.type === 'group') {
                descendants.push(...getDescendants(child.id, allElements));
            }
        }
        return descendants;
    }, []);

    const handleDeleteSelection = useCallback(() => {
        if (selectedElementIds.length === 0) return;
        commitAction(prev => {
            const idsToDelete = new Set<string>(selectedElementIds);
            selectedElementIds.forEach(id => {
                getDescendants(id, prev).forEach(desc => idsToDelete.add(desc.id));
            });
            return prev.filter(el => !idsToDelete.has(el.id));
        });
        setSelectedElementIds([]);
    }, [selectedElementIds, commitAction, getDescendants]);

    const handleStopEditing = useCallback(() => {
        if (!editingElement) return;
        commitAction(prev => prev.map(el =>
            el.id === editingElement.id && el.type === 'text'
                ? { ...el, text: editingElement.text }
                // Persist auto-height change on blur
                : el.id === editingElement.id && el.type === 'text' && editingTextareaRef.current ? { ...el, text: editingElement.text, height: editingTextareaRef.current.scrollHeight }
                : el
        ));
        setEditingElement(null);
    }, [commitAction, editingElement]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (editingElement) {
                if(e.key === 'Escape') handleStopEditing();
                return;
            }

            const target = e.target as HTMLElement;
            const isTyping = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

            if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); handleUndo(); return; }
            if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) { e.preventDefault(); handleRedo(); return; }
            
            if (!isTyping && (e.key === 'Delete' || e.key === 'Backspace') && selectedElementIds.length > 0) {
                e.preventDefault();
                commitAction(prev => {
                    const idsToDelete = new Set(selectedElementIds);
                    selectedElementIds.forEach(id => {
                        getDescendants(id, prev).forEach(desc => idsToDelete.add(desc.id));
                    });
                    return prev.filter(el => !idsToDelete.has(el.id));
                });
                setSelectedElementIds([]);
                return;
            }

            if (e.key === ' ' && !isTyping) {
                e.preventDefault();
                if (spacebarDownTime.current === null) {
                    spacebarDownTime.current = Date.now();
                    previousToolRef.current = activeTool;
                    setActiveTool('pan');
                }
            }
        };

        const handleKeyUp = (e: KeyboardEvent) => {
            if (e.key === ' ' && !editingElement) {
                const target = e.target as HTMLElement;
                const isTyping = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';
                if (isTyping || spacebarDownTime.current === null) return;
                
                e.preventDefault();

                const duration = Date.now() - spacebarDownTime.current;
                spacebarDownTime.current = null;
                
                const toolBeforePan = previousToolRef.current;

                if (duration < 200) { // Tap
                    if (toolBeforePan === 'pan') {
                        setActiveTool('select');
                    } else if (toolBeforePan === 'select') {
                        setActiveTool('pan');
                    } else {
                        setActiveTool('select');
                    }
                } else { // Hold
                    setActiveTool(toolBeforePan);
                }
            }
        };


        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, [handleUndo, handleRedo, selectedElementIds, editingElement, activeTool, commitAction, getDescendants, handleStopEditing]);
    
    const getCanvasPoint = useCallback((screenX: number, screenY: number): Point => {
        if (!svgRef.current) return { x: 0, y: 0 };
        const svgBounds = svgRef.current.getBoundingClientRect();
        const xOnSvg = screenX - svgBounds.left;
        const yOnSvg = screenY - svgBounds.top;
        
        return {
            x: (xOnSvg - panOffset.x) / zoom,
            y: (yOnSvg - panOffset.y) / zoom,
        };
    }, [panOffset, zoom]);

    const handleAddImageElement = useCallback(async (file: File) => {
        if (!file.type.startsWith('image/')) {
            setError('Only image files are supported.');
            return;
        }
        setError(null);
        try {
            const { dataUrl, mimeType } = await fileToDataUrl(file);
            const img = new Image();
            img.onload = () => {
                if (!svgRef.current) return;
                const svgBounds = svgRef.current.getBoundingClientRect();
                const screenCenter = { x: svgBounds.left + svgBounds.width / 2, y: svgBounds.top + svgBounds.height / 2 };
                const canvasPoint = getCanvasPoint(screenCenter.x, screenCenter.y);

                const newImage: ImageElement = {
                    id: generateId(),
                    type: 'image',
                    name: file.name,
                    x: canvasPoint.x - (img.width / 2),
                    y: canvasPoint.y - (img.height / 2),
                    width: img.width,
                    height: img.height,
                    href: dataUrl,
                    mimeType: mimeType,
                };
                setElements(prev => [...prev, newImage]);
                setSelectedElementIds([newImage.id]);
                setActiveTool('select');
            };
            img.src = dataUrl;
        } catch (err) {
            setError('Failed to load image.');
            console.error(err);
        }
    }, [getCanvasPoint, activeBoardId, setElements]);

    // Chrome Extension bridge: pick up pending images/prompts sent from context menu or popup
    useEffect(() => {
        if (typeof chrome === 'undefined' || !chrome?.storage?.local) return;
        chrome.storage.local.get(['flovart_pending_image', 'flovart_pending_prompt', 'flovart_collected_images'], (result) => {
            // Pending single image → add to canvas
            if (result.flovart_pending_image) {
                const { dataUrl, name } = result.flovart_pending_image;
                if (dataUrl) {
                    const img = new Image();
                    img.onload = () => {
                        const newImage: ImageElement = {
                            id: generateId(),
                            type: 'image',
                            name: name || 'Extension Image',
                            x: 100,
                            y: 100,
                            width: Math.min(img.width, 800),
                            height: Math.min(img.height, 600),
                            href: dataUrl,
                            mimeType: 'image/png',
                        };
                        setElements(prev => [...prev, newImage]);
                        setSelectedElementIds([newImage.id]);
                    };
                    img.src = dataUrl;
                }
                chrome.storage.local.remove('flovart_pending_image');
            }
            // Pending prompt → fill prompt bar
            if (result.flovart_pending_prompt) {
                const { prompt: pendingPrompt } = result.flovart_pending_prompt;
                if (pendingPrompt) setPrompt(pendingPrompt);
                chrome.storage.local.remove('flovart_pending_prompt');
            }
            // Collected images are available for the inspiration panel — stored for future use
            if (result.flovart_collected_images) {
                chrome.storage.local.remove('flovart_collected_images');
            }
        });
    }, []);

     const getSelectableElement = (elementId: string, allElements: Element[]): Element | null => {
        const element = allElements.find(el => el.id === elementId);
        if (!element) return null;
        if (element.isLocked) return null;

        let current = element;
        while (current.parentId) {
            const parent = allElements.find(el => el.id === current.parentId);
            if (!parent) return current; // Orphaned, treat as top-level
            if (parent.isLocked) return null; // Parent is locked, nothing inside is selectable
            current = parent;
        }
        return current;
    };
    
    const handleMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
        // Layer mask painting intercept
        if (maskEditingId && e.button === 0) {
            const pt = getCanvasPoint(e.clientX, e.clientY);
            paintMask(pt.x, pt.y);
            interactionMode.current = 'mask-paint' as any;
            e.preventDefault();
            return;
        }
        if (editingElement) return;
        if (contextMenu) setContextMenu(null);

        if (e.button === 1) { // Middle mouse button for panning
            interactionMode.current = 'pan';
            startPoint.current = { x: e.clientX, y: e.clientY };
            e.preventDefault();
            return;
        }

        startPoint.current = { x: e.clientX, y: e.clientY };
        const canvasStartPoint = getCanvasPoint(e.clientX, e.clientY);

        const target = e.target as SVGElement;
        const handleName = target.getAttribute('data-handle');

        if (croppingState) {
             if (handleName) {
                 interactionMode.current = `crop-${handleName}`;
                 cropStartInfo.current = { originalCropBox: { ...croppingState.cropBox }, startCanvasPoint: canvasStartPoint };
             }
             return;
        }
         if (activeTool === 'text') {
            const newText: TextElement = {
                id: generateId(), type: 'text', name: 'Text',
                x: canvasStartPoint.x, y: canvasStartPoint.y,
                width: 150, height: 40,
                text: "Text", fontSize: 24, fontColor: drawingOptions.strokeColor
            };
            setElements(prev => [...prev, newText]);
            setSelectedElementIds([newText.id]);
            setEditingElement({ id: newText.id, text: newText.text });
            setActiveTool('select');
            return;
        }

        if (activeTool === 'pan') {
            interactionMode.current = 'pan';
            return;
        }
        
        if (handleName && activeTool === 'select' && selectedElementIds.length === 1) {
            interactionMode.current = `resize-${handleName}`;
            const element = elements.find(el => el.id === selectedElementIds[0]) as ImageElement | ShapeElement | TextElement | VideoElement;
            resizeStartInfo.current = {
                originalElement: { ...element },
                startCanvasPoint: canvasStartPoint,
                handle: handleName,
                shiftKey: e.shiftKey,
            };
            return;
        }

        if (activeTool === 'draw' || activeTool === 'highlighter') {
            interactionMode.current = 'draw';
            const newPath: PathElement = {
                id: generateId(),
                type: 'path', name: 'Path',
                points: [canvasStartPoint],
                strokeColor: drawingOptions.strokeColor,
                strokeWidth: drawingOptions.strokeWidth,
                strokeOpacity: activeTool === 'highlighter' ? 0.5 : 1,
                x: 0, y: 0 
            };
            currentDrawingElementId.current = newPath.id;
            setElements(prev => [...prev, newPath], false);
        } else if (activeTool === 'rectangle' || activeTool === 'circle' || activeTool === 'triangle') {
            interactionMode.current = 'drawShape';
            const newShape: ShapeElement = {
                id: generateId(),
                type: 'shape', name: activeTool.charAt(0).toUpperCase() + activeTool.slice(1),
                shapeType: activeTool,
                x: canvasStartPoint.x,
                y: canvasStartPoint.y,
                width: 0,
                height: 0,
                strokeColor: drawingOptions.strokeColor,
                strokeWidth: drawingOptions.strokeWidth,
                fillColor: 'transparent',
            }
            currentDrawingElementId.current = newShape.id;
            setElements(prev => [...prev, newShape], false);
        } else if (activeTool === 'arrow') {
            interactionMode.current = 'drawArrow';
            const newArrow: ArrowElement = {
                id: generateId(), type: 'arrow', name: 'Arrow',
                x: canvasStartPoint.x, y: canvasStartPoint.y,
                points: [canvasStartPoint, canvasStartPoint],
                strokeColor: drawingOptions.strokeColor, strokeWidth: drawingOptions.strokeWidth
            };
            currentDrawingElementId.current = newArrow.id;
            setElements(prev => [...prev, newArrow], false);
        } else if (activeTool === 'line') {
            interactionMode.current = 'drawLine';
            const newLine: LineElement = {
                id: generateId(), type: 'line', name: 'Line',
                x: canvasStartPoint.x, y: canvasStartPoint.y,
                points: [canvasStartPoint, canvasStartPoint],
                strokeColor: drawingOptions.strokeColor, strokeWidth: drawingOptions.strokeWidth
            };
            currentDrawingElementId.current = newLine.id;
            setElements(prev => [...prev, newLine], false);
        } else if (activeTool === 'erase') {
            interactionMode.current = 'erase';
        } else if (activeTool === 'lasso') {
            interactionMode.current = 'lasso';
            setLassoPath([canvasStartPoint]);
        } else if (activeTool === 'select') {
            const clickedElementId = target.closest('[data-id]')?.getAttribute('data-id');
            const selectableElement = clickedElementId ? getSelectableElement(clickedElementId, elementsRef.current) : null;
            const selectableElementId = selectableElement?.id;

            if (selectableElementId) {
                if (e.detail === 2 && elements.find(el => el.id === selectableElementId)?.type === 'text') {
                     const textEl = elements.find(el => el.id === selectableElementId) as TextElement;
                     setEditingElement({ id: textEl.id, text: textEl.text });
                     return;
                }
                if (!e.shiftKey && !selectedElementIds.includes(selectableElementId)) {
                     setSelectedElementIds([selectableElementId]);
                } else if (e.shiftKey) {
                    setSelectedElementIds(prev => 
                        prev.includes(selectableElementId) ? prev.filter(id => id !== selectableElementId) : [...prev, selectableElementId]
                    );
                }
                interactionMode.current = 'dragElements';
                const idsToDrag = new Set<string>();
                 if (selectableElement.type === 'group') {
                    idsToDrag.add(selectableElement.id);
                    getDescendants(selectableElement.id, elementsRef.current).forEach(desc => idsToDrag.add(desc.id));
                } else {
                    idsToDrag.add(selectableElement.id);
                }

                 const initialPositions = new Map<string, {x: number, y: number} | Point[]>();
                elementsRef.current.forEach(el => {
                    if (idsToDrag.has(el.id)) {
                         if (el.type !== 'path' && el.type !== 'arrow' && el.type !== 'line') {
                            initialPositions.set(el.id, { x: el.x, y: el.y });
                        } else {
                            initialPositions.set(el.id, el.points);
                        }
                    }
                });
                dragStartElementPositions.current = initialPositions;

            } else {
                setSelectedElementIds([]);
                interactionMode.current = 'selectBox';
                setSelectionBox({ x: canvasStartPoint.x, y: canvasStartPoint.y, width: 0, height: 0 });
            }
        }
    };

    const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
        // Layer mask painting intercept
        if (interactionMode.current === ('mask-paint' as any)) {
            const pt = getCanvasPoint(e.clientX, e.clientY);
            paintMask(pt.x, pt.y);
            return;
        }
        if (!interactionMode.current) return;
        const point = getCanvasPoint(e.clientX, e.clientY);
        const startCanvasPoint = getCanvasPoint(startPoint.current.x, startPoint.current.y);

        if (interactionMode.current === 'erase') {
            const eraseRadius = drawingOptions.strokeWidth / zoom;
            const idsToDelete = new Set<string>();

            elements.forEach(el => {
                if (el.type === 'path') {
                    for (let i = 0; i < el.points.length - 1; i++) {
                        const distance = Math.hypot(point.x - el.points[i].x, point.y - el.points[i].y);
                        if (distance < eraseRadius) {
                            idsToDelete.add(el.id);
                            return;
                        }
                    }
                }
            });

            if (idsToDelete.size > 0) {
                setElements(prev => prev.filter(el => !idsToDelete.has(el.id)), false);
            }
            return;
        }

        if (interactionMode.current.startsWith('resize-')) {
            if (!resizeStartInfo.current) return;
            const { originalElement, handle, startCanvasPoint: resizeStartPoint, shiftKey } = resizeStartInfo.current;
            let { x, y, width, height } = originalElement;
            const aspectRatio = originalElement.width / originalElement.height;
            const dx = point.x - resizeStartPoint.x;
            const dy = point.y - resizeStartPoint.y;

            if (handle.includes('r')) { width = originalElement.width + dx; }
            if (handle.includes('l')) { width = originalElement.width - dx; x = originalElement.x + dx; }
            if (handle.includes('b')) { height = originalElement.height + dy; }
            if (handle.includes('t')) { height = originalElement.height - dy; y = originalElement.y + dy; }

            if (originalElement.type !== 'text' && !shiftKey) {
                if (handle.includes('r') || handle.includes('l')) {
                    height = width / aspectRatio;
                    if (handle.includes('t')) y = (originalElement.y + originalElement.height) - height;
                } else {
                    width = height * aspectRatio;
                    if (handle.includes('l')) x = (originalElement.x + originalElement.width) - width;
                }
            }

            if (width < 1) { width = 1; x = originalElement.x + originalElement.width - 1; }
            if (height < 1) { height = 1; y = originalElement.y + originalElement.height - 1; }

            setElements(prev => prev.map(el =>
                el.id === originalElement.id ? { ...el, x, y, width, height } : el
            ), false);
            return;
        }

        if (interactionMode.current.startsWith('crop-')) {
            if (!croppingState || !cropStartInfo.current) return;
            const handle = interactionMode.current.split('-')[1];
            const { originalCropBox, startCanvasPoint: cropStartPoint } = cropStartInfo.current;
            let { x, y, width, height } = { ...originalCropBox };
            const { originalElement } = croppingState;
            const dx = point.x - cropStartPoint.x;
            const dy = point.y - cropStartPoint.y;

            if (handle.includes('r')) { width = originalCropBox.width + dx; }
            if (handle.includes('l')) { width = originalCropBox.width - dx; x = originalCropBox.x + dx; }
            if (handle.includes('b')) { height = originalCropBox.height + dy; }
            if (handle.includes('t')) { height = originalCropBox.height - dy; y = originalCropBox.y + dy; }
            
            if (x < originalElement.x) {
                width += x - originalElement.x;
                x = originalElement.x;
            }
            if (y < originalElement.y) {
                height += y - originalElement.y;
                y = originalElement.y;
            }
            if (x + width > originalElement.x + originalElement.width) {
                width = originalElement.x + originalElement.width - x;
            }
            if (y + height > originalElement.y + originalElement.height) {
                height = originalElement.y + originalElement.height - y;
            }

            if (width < 1) {
                width = 1;
                if (handle.includes('l')) { x = originalCropBox.x + originalCropBox.width - 1; }
            }
            if (height < 1) {
                height = 1;
                if (handle.includes('t')) { y = originalCropBox.y + originalCropBox.height - 1; }
            }

            setCroppingState(prev => prev ? { ...prev, cropBox: { x, y, width, height } } : null);
            return;
        }


        switch(interactionMode.current) {
            case 'pan': {
                const dx = e.clientX - startPoint.current.x;
                const dy = e.clientY - startPoint.current.y;
                updateActiveBoard(b => ({ ...b, panOffset: { x: b.panOffset.x + dx, y: b.panOffset.y + dy } }));
                startPoint.current = { x: e.clientX, y: e.clientY };
                break;
            }
            case 'draw': {
                if (currentDrawingElementId.current) {
                    setElements(prev => prev.map(el => {
                        if (el.id === currentDrawingElementId.current && el.type === 'path') {
                            return { ...el, points: [...el.points, point] };
                        }
                        return el;
                    }), false);
                }
                break;
            }
            case 'lasso': {
                setLassoPath(prev => (prev ? [...prev, point] : [point]));
                break;
            }
            case 'drawShape': {
                 if (currentDrawingElementId.current) {
                    setElements(prev => prev.map(el => {
                        if (el.id === currentDrawingElementId.current && el.type === 'shape') {
                            let newWidth = Math.abs(point.x - startCanvasPoint.x);
                            let newHeight = Math.abs(point.y - startCanvasPoint.y);
                            let newX = Math.min(point.x, startCanvasPoint.x);
                            let newY = Math.min(point.y, startCanvasPoint.y);
                            
                            if (e.shiftKey) {
                                if (el.shapeType === 'rectangle' || el.shapeType === 'circle') {
                                    const side = Math.max(newWidth, newHeight);
                                    newWidth = side;
                                    newHeight = side;
                                } else if (el.shapeType === 'triangle') {
                                    newHeight = newWidth * (Math.sqrt(3) / 2);
                                }
                                
                                if (point.x < startCanvasPoint.x) newX = startCanvasPoint.x - newWidth;
                                if (point.y < startCanvasPoint.y) newY = startCanvasPoint.y - newHeight;
                            }

                            return {...el, x: newX, y: newY, width: newWidth, height: newHeight};
                        }
                        return el;
                    }), false);
                }
                break;
            }
            case 'drawArrow': {
                if (currentDrawingElementId.current) {
                    setElements(prev => prev.map(el => {
                        if (el.id === currentDrawingElementId.current && el.type === 'arrow') {
                            return { ...el, points: [el.points[0], point] };
                        }
                        return el;
                    }), false);
                }
                break;
            }
            case 'drawLine': {
                if (currentDrawingElementId.current) {
                    setElements(prev => prev.map(el => {
                        if (el.id === currentDrawingElementId.current && el.type === 'line') {
                            return { ...el, points: [el.points[0], point] };
                        }
                        return el;
                    }), false);
                }
                break;
            }
            case 'dragElements': {
                const dx = point.x - startCanvasPoint.x;
                const dy = point.y - startCanvasPoint.y;
                
                const movingElementIds = Array.from(dragStartElementPositions.current.keys());
                const movingElements = elements.filter(el => movingElementIds.includes(el.id));
                const otherElements = elements.filter(el => !movingElementIds.includes(el.id));
                const snapThresholdCanvas = SNAP_THRESHOLD / zoom;

                let finalDx = dx;
                let finalDy = dy;
                let activeGuides: Guide[] = [];

                // Alignment Snapping
                const getSnapPoints = (bounds: Rect) => ({
                    v: [bounds.x, bounds.x + bounds.width / 2, bounds.x + bounds.width],
                    h: [bounds.y, bounds.y + bounds.height / 2, bounds.y + bounds.height],
                });

                const staticSnapPoints = { v: new Set<number>(), h: new Set<number>() };
                otherElements.forEach(el => {
                    const bounds = getElementBounds(el);
                    getSnapPoints(bounds).v.forEach(p => staticSnapPoints.v.add(p));
                    getSnapPoints(bounds).h.forEach(p => staticSnapPoints.h.add(p));
                });
                
                let bestSnapX = { dist: Infinity, val: finalDx, guide: null as Guide | null };
                let bestSnapY = { dist: Infinity, val: finalDy, guide: null as Guide | null };
                
                movingElements.forEach(movingEl => {
                    const startPos = dragStartElementPositions.current.get(movingEl.id);
                    if (!startPos) return;

                    let movingBounds: Rect;
                     if (movingEl.type !== 'path' && movingEl.type !== 'arrow' && movingEl.type !== 'line') {
                        movingBounds = getElementBounds({...movingEl, x: (startPos as Point).x, y: (startPos as Point).y });
                    } else { // path or arrow or line
                        if (movingEl.type === 'arrow' || movingEl.type === 'line') {
                            movingBounds = getElementBounds({...movingEl, points: startPos as [Point, Point]});
                        } else {
                            movingBounds = getElementBounds({...movingEl, points: startPos as Point[]});
                        }
                    }

                    const movingSnapPoints = getSnapPoints(movingBounds);

                    movingSnapPoints.v.forEach(p => {
                        staticSnapPoints.v.forEach(staticP => {
                            const dist = Math.abs((p + finalDx) - staticP);
                            if (dist < snapThresholdCanvas && dist < bestSnapX.dist) {
                                bestSnapX = { dist, val: staticP - p, guide: { type: 'v', position: staticP, start: movingBounds.y, end: movingBounds.y + movingBounds.height }};
                            }
                        });
                    });
                    movingSnapPoints.h.forEach(p => {
                        staticSnapPoints.h.forEach(staticP => {
                            const dist = Math.abs((p + finalDy) - staticP);
                            if (dist < snapThresholdCanvas && dist < bestSnapY.dist) {
                                bestSnapY = { dist, val: staticP - p, guide: { type: 'h', position: staticP, start: movingBounds.x, end: movingBounds.x + movingBounds.width }};
                            }
                        });
                    });
                });
                
                if (bestSnapX.guide) { finalDx = bestSnapX.val; activeGuides.push(bestSnapX.guide); }
                if (bestSnapY.guide) { finalDy = bestSnapY.val; activeGuides.push(bestSnapY.guide); }
                
                setAlignmentGuides(activeGuides);

                setElements(prev => prev.map(el => {
                    if (movingElementIds.includes(el.id)) {
                        const startPos = dragStartElementPositions.current.get(el.id);
                        if (!startPos) return el;
                        
                        if (el.type !== 'path' && el.type !== 'arrow' && el.type !== 'line') {
                            return { ...el, x: (startPos as Point).x + finalDx, y: (startPos as Point).y + finalDy };
                        }
                        
                        if (el.type === 'path') {
                            const startPoints = startPos as Point[];
                            const newPoints = startPoints.map(p => ({ x: p.x + finalDx, y: p.y + finalDy }));
                            const updatedEl: PathElement = { ...el, points: newPoints };
                            return updatedEl;
                        } else if (el.type === 'arrow' || el.type === 'line') {
                            const startPoints = startPos as [Point, Point];
                            const newPoints: [Point, Point] = [
                                { x: startPoints[0].x + finalDx, y: startPoints[0].y + finalDy },
                                { x: startPoints[1].x + finalDx, y: startPoints[1].y + finalDy },
                            ];
                            const updatedEl = { ...el, points: newPoints };
                            return updatedEl;
                        }
                    }
                    return el;
                }), false);
                break;
            }
             case 'selectBox': {
                const newX = Math.min(point.x, startCanvasPoint.x);
                const newY = Math.min(point.y, startCanvasPoint.y);
                const newWidth = Math.abs(point.x - startCanvasPoint.x);
                const newHeight = Math.abs(point.y - startCanvasPoint.y);
                setSelectionBox({ x: newX, y: newY, width: newWidth, height: newHeight });
                break;
            }
        }
    };
    
    const handleMouseUp = () => {
        // Layer mask painting intercept
        if (interactionMode.current === ('mask-paint' as any)) {
            interactionMode.current = null;
            return;
        }
        if (interactionMode.current) {
            if (interactionMode.current === 'selectBox' && selectionBox) {
                const selectedIds: string[] = [];
                const { x: sx, y: sy, width: sw, height: sh } = selectionBox;
                
                elements.forEach(element => {
                    const bounds = getElementBounds(element, elements);
                    const { x: ex, y: ey, width: ew, height: eh } = bounds;
                    
                    if (sx < ex + ew && sx + sw > ex && sy < ey + eh && sy + sh > ey) {
                        const selectable = getSelectableElement(element.id, elements);
                        if(selectable) selectedIds.push(selectable.id);
                    }
                });
                setSelectedElementIds([...new Set(selectedIds)]);
            } else if (interactionMode.current === 'lasso' && lassoPath && lassoPath.length > 2) {
                // Check if lasso is drawn ON TOP of a single selected image → trigger inpaint mode
                const singleImg = selectedElementIds.length === 1
                    ? elements.find(el => el.id === selectedElementIds[0] && el.type === 'image') as ImageElement | undefined
                    : undefined;
                if (singleImg) {
                    const imgBounds = getElementBounds(singleImg, elements);
                    const lassoCenter: Point = {
                        x: lassoPath.reduce((s, p) => s + p.x, 0) / lassoPath.length,
                        y: lassoPath.reduce((s, p) => s + p.y, 0) / lassoPath.length,
                    };
                    const isOnImage = lassoCenter.x >= imgBounds.x && lassoCenter.x <= imgBounds.x + imgBounds.width
                        && lassoCenter.y >= imgBounds.y && lassoCenter.y <= imgBounds.y + imgBounds.height;
                    if (isOnImage) {
                        // Enter inpaint mode
                        setInpaintState({ targetImageId: singleImg.id, maskPoints: [...lassoPath], promptVisible: true });
                        setInpaintPrompt('');
                        setLassoPath(null);
                        interactionMode.current = null;
                        currentDrawingElementId.current = null;
                        setSelectionBox(null);
                        resizeStartInfo.current = null;
                        cropStartInfo.current = null;
                        setAlignmentGuides([]);
                        dragStartElementPositions.current.clear();
                        return; // early exit — don't clear selection
                    }
                }
                // Normal lasso selection
                const selectedIds = elements.filter(el => {
                    const bounds = getElementBounds(el, elements);
                    const center: Point = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
                    return isPointInPolygon(center, lassoPath);
                }).map(el => getSelectableElement(el.id, elements)?.id).filter((id): id is string => !!id);
                setSelectedElementIds(prev => [...new Set([...prev, ...selectedIds])]);
                setLassoPath(null);
            } else if (['draw', 'drawShape', 'drawArrow', 'drawLine', 'dragElements', 'erase'].some(prefix => interactionMode.current?.startsWith(prefix)) || interactionMode.current.startsWith('resize-')) {
                 commitAction(els => els); // This effectively commits the current state to history
            }
        }
        
        interactionMode.current = null;
        currentDrawingElementId.current = null;
        setSelectionBox(null);
        setLassoPath(null);
        resizeStartInfo.current = null;
        cropStartInfo.current = null;
        setAlignmentGuides([]);
        dragStartElementPositions.current.clear();
    };

    const handleWheel = (e: React.WheelEvent<SVGSVGElement>) => {
        if (croppingState || editingElement) { e.preventDefault(); return; }
        e.preventDefault();
        const { clientX, clientY, deltaX, deltaY, ctrlKey } = e;

        if (ctrlKey || wheelAction === 'zoom') {
            const zoomFactor = 1.05;
            const oldZoom = zoom;
            const newZoom = deltaY < 0 ? oldZoom * zoomFactor : oldZoom / zoomFactor;
            const clampedZoom = Math.max(0.1, Math.min(newZoom, 10));

            const mousePoint = { x: clientX, y: clientY };
            const newPanX = mousePoint.x - (mousePoint.x - panOffset.x) * (clampedZoom / oldZoom);
            const newPanY = mousePoint.y - (mousePoint.y - panOffset.y) * (clampedZoom / oldZoom);

            updateActiveBoard(b => ({ ...b, zoom: clampedZoom, panOffset: { x: newPanX, y: newPanY }}));

        } else { // Panning (wheelAction === 'pan' and no ctrlKey)
            updateActiveBoard(b => ({ ...b, panOffset: { x: b.panOffset.x - deltaX, y: b.panOffset.y - deltaY }}));
        }
    };

    const handleDeleteElement = (id: string) => {
        commitAction(prev => {
            const idsToDelete = new Set([id]);
            getDescendants(id, prev).forEach(desc => idsToDelete.add(desc.id));
            return prev.filter(el => !idsToDelete.has(el.id));
        });
        setSelectedElementIds(prev => prev.filter(selId => selId !== id));
    };

    const handleCopyElement = (elementToCopy: Element) => {
        commitAction(prev => {
            const elementsToCopy = [elementToCopy, ...getDescendants(elementToCopy.id, prev)];
            const idMap = new Map<string, string>();
            
// FIX: Refactored element creation to use explicit switch cases for each element type.
// This helps TypeScript correctly infer the return type of the map function as Element[],
// preventing type errors caused by spreading a discriminated union.
            const newElements: Element[] = elementsToCopy.map((el): Element => {
                const newId = generateId();
                idMap.set(el.id, newId);
                const dx = 20 / zoom;
                const dy = 20 / zoom;

                switch (el.type) {
                    case 'path':
                        return { ...el, id: newId, points: el.points.map(p => ({ x: p.x + dx, y: p.y + dy })) };
                    case 'arrow':
                        return { ...el, id: newId, points: [{ x: el.points[0].x + dx, y: el.points[0].y + dy }, { x: el.points[1].x + dx, y: el.points[1].y + dy }] as [Point, Point] };
                    case 'line':
                         return { ...el, id: newId, points: [{ x: el.points[0].x + dx, y: el.points[0].y + dy }, { x: el.points[1].x + dx, y: el.points[1].y + dy }] as [Point, Point] };
                    case 'image':
                        return { ...el, id: newId, x: el.x + dx, y: el.y + dy };
                    case 'shape':
                         return { ...el, id: newId, x: el.x + dx, y: el.y + dy };
                    case 'text':
                         return { ...el, id: newId, x: el.x + dx, y: el.y + dy };
                    case 'group':
                         return { ...el, id: newId, x: el.x + dx, y: el.y + dy };
                    case 'video':
                        return { ...el, id: newId, x: el.x + dx, y: el.y + dy };
                }
            });
            
// FIX: Refactored parentId assignment to use an explicit switch statement.
// This ensures TypeScript can correctly track the types within the Element union
// and avoids errors when returning the new array of elements.
            const finalNewElements: Element[] = newElements.map((el): Element => {
                const parentId = el.parentId ? idMap.get(el.parentId) : undefined;
                switch (el.type) {
                    case 'image': return { ...el, parentId };
                    case 'path': return { ...el, parentId };
                    case 'shape': return { ...el, parentId };
                    case 'text': return { ...el, parentId };
                    case 'arrow': return { ...el, parentId };
                    case 'line': return { ...el, parentId };
                    case 'group': return { ...el, parentId };
                    case 'video': return { ...el, parentId };
                }
            });
            
            setSelectedElementIds([idMap.get(elementToCopy.id)!]);
            return [...prev, ...finalNewElements];
        });
    };
    
     const handleDownloadImage = (element: ImageElement) => {
        const link = document.createElement('a');
        link.href = element.href;
        link.download = `canvas-image-${element.id}.${element.mimeType.split('/')[1] || 'png'}`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const resolveImageSize = (dataUrl: string, fallback: { width: number; height: number }): Promise<{ width: number; height: number }> =>
        new Promise((resolve) => {
            const img = new Image();
            img.onload = () => resolve({ width: img.width, height: img.height });
            img.onerror = () => resolve(fallback);
            img.src = dataUrl;
        });

    const insertImageAgentResult = async (
        source: ImageElement,
        dataUrl: string,
        nameSuffix: string,
        resizeByScale?: number,
        outputMimeType?: string
    ) => {
        const rawSize = await resolveImageSize(dataUrl, { width: source.width, height: source.height });
        const scale = resizeByScale && resizeByScale > 0 ? resizeByScale : 1;
        const width = Math.max(1, rawSize.width / scale);
        const height = Math.max(1, rawSize.height / scale);

        const newImage: ImageElement = {
            id: generateId(),
            type: 'image',
            name: `${source.name || 'Image'} / ${nameSuffix}`,
            x: source.x + 24,
            y: source.y + 24,
            width,
            height,
            href: dataUrl,
            mimeType: outputMimeType || source.mimeType,
        };

        commitAction(prev => [...prev, newImage]);
        setSelectedElementIds([newImage.id]);
    };

    const handleSplitImageWithBanana = async (element: ImageElement) => {
        try {
            setIsLoading(true);
            setError(null);
            setProgressMessage('BANANA is splitting the image into layers...');

            const layers = await splitImageByBanana({
                href: element.href,
                mimeType: element.mimeType,
            });

            const normalizedLayers = await Promise.all(
                layers.map(async (layer) => {
                    if (layer.width > 0 && layer.height > 0) return layer;
                    const size = await resolveImageSize(layer.dataUrl, { width: element.width, height: element.height });
                    return { ...layer, width: size.width, height: size.height };
                })
            );

            const insertedIds: string[] = [];
            const hideOriginalAfterSplit = true;
            commitAction((prev) => {
                const sourceIndex = prev.findIndex((el) => el.id === element.id);
                const groupId = generateId();

                const newLayerElements: ImageElement[] = normalizedLayers.map((layer, idx) => {
                    const id = generateId();
                    insertedIds.push(id);
                    return {
                        id,
                        type: 'image',
                        name: `${element.name || 'Image'} / ${layer.name || `Layer ${idx + 1}`}`,
                        x: element.x + layer.offsetX,
                        y: element.y + layer.offsetY,
                        width: layer.width || element.width,
                        height: layer.height || element.height,
                        href: layer.dataUrl,
                        mimeType: 'image/png',
                        parentId: groupId,
                    };
                });

                const minX = Math.min(...newLayerElements.map(layer => layer.x));
                const minY = Math.min(...newLayerElements.map(layer => layer.y));
                const maxX = Math.max(...newLayerElements.map(layer => layer.x + layer.width));
                const maxY = Math.max(...newLayerElements.map(layer => layer.y + layer.height));
                const groupElement: GroupElement = {
                    id: groupId,
                    type: 'group',
                    name: `${element.name || 'Image'} / Banana Group`,
                    x: minX,
                    y: minY,
                    width: Math.max(1, maxX - minX),
                    height: Math.max(1, maxY - minY),
                };

                const next = [...prev];
                if (sourceIndex >= 0) {
                    next.splice(sourceIndex + 1, 0, ...newLayerElements, groupElement);
                } else {
                    next.push(...newLayerElements, groupElement);
                }
                if (hideOriginalAfterSplit) {
                    const idx = next.findIndex(el => el.id === element.id);
                    if (idx >= 0) {
                        next[idx] = { ...next[idx], isVisible: false };
                    }
                }
                return next;
            });

            if (insertedIds.length > 0) {
                setSelectedElementIds(insertedIds);
                setProgressMessage(`BANANA created ${insertedIds.length} layers.`);
            } else {
                setProgressMessage('');
            }
        } catch (err) {
            const error = err as Error;
            setError(`BANANA split failed: ${error.message}`);
        } finally {
            setIsLoading(false);
            setTimeout(() => setProgressMessage(''), 1200);
        }
    };

    const handleUpscaleImageWithBanana = async (element: ImageElement) => {
        try {
            setIsLoading(true);
            setError(null);
            setProgressMessage('BANANA Agent 濮濓絽婀潻娑滎攽妤傛ɑ绔婚弨鎯с亣...');
            const result = await runBananaImageAgent(
                { href: element.href, mimeType: element.mimeType },
                'upscale',
                { scale: 2 }
            );
            await insertImageAgentResult(element, result.dataUrl, 'Upscaled x2', 2, result.mimeType);
            setProgressMessage('Upscale completed.');
        } catch (err) {
            const error = err as Error;
            setError(`BANANA upscale failed: ${error.message}`);
        } finally {
            setIsLoading(false);
            setTimeout(() => setProgressMessage(''), 1200);
        }
    };

    const handleRemoveBackgroundWithBanana = async (element: ImageElement) => {
        try {
            setIsLoading(true);
            setError(null);
            setProgressMessage('BANANA Agent 濮濓絽婀崢濠氭珟閼冲本娅?..');
            const result = await runBananaImageAgent(
                { href: element.href, mimeType: element.mimeType },
                'remove-background'
            );
            await insertImageAgentResult(element, result.dataUrl, 'Background Removed', undefined, result.mimeType);
            setProgressMessage('Background removal completed.');
        } catch (err) {
            const error = err as Error;
            setError(`BANANA background removal failed: ${error.message}`);
        } finally {
            setIsLoading(false);
            setTimeout(() => setProgressMessage(''), 1200);
        }
    };

    /**
     * ======== AI 扩图 (Outpainting) ========
     *
     * 在原始图片周围扩展画布，用 AI 填充新增区域。
     * @param element - 目标图片
     * @param direction - 扩展方向
     * @param expandRatio - 扩展比例（0.25 = 各方向扩展原尺寸的 25%）
     */
    const handleOutpaint = async (element: ImageElement, direction: 'all' | 'left' | 'right' | 'up' | 'down', expandRatio = 0.3) => {
        setIsLoading(true);
        setError(null);
        setProgressMessage(`正在 AI 扩图 (${direction})...`);

        try {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            await new Promise<void>((resolve, reject) => {
                img.onload = () => resolve();
                img.onerror = reject;
                img.src = element.href;
            });

            const ow = img.naturalWidth;
            const oh = img.naturalHeight;
            const padL = (direction === 'all' || direction === 'left') ? Math.round(ow * expandRatio) : 0;
            const padR = (direction === 'all' || direction === 'right') ? Math.round(ow * expandRatio) : 0;
            const padT = (direction === 'all' || direction === 'up') ? Math.round(oh * expandRatio) : 0;
            const padB = (direction === 'all' || direction === 'down') ? Math.round(oh * expandRatio) : 0;
            const nw = ow + padL + padR;
            const nh = oh + padT + padB;

            // Build expanded canvas with original image in the center
            const expandCanvas = document.createElement('canvas');
            expandCanvas.width = nw;
            expandCanvas.height = nh;
            const ectx = expandCanvas.getContext('2d')!;
            ectx.fillStyle = '#808080'; // neutral gray for expanded area
            ectx.fillRect(0, 0, nw, nh);
            ectx.drawImage(img, padL, padT, ow, oh);
            const expandedDataUrl = expandCanvas.toDataURL('image/png');

            // Build mask: white = areas to fill, black = keep (original image area)
            const maskCanvas = document.createElement('canvas');
            maskCanvas.width = nw;
            maskCanvas.height = nh;
            const mctx = maskCanvas.getContext('2d')!;
            mctx.fillStyle = 'white';
            mctx.fillRect(0, 0, nw, nh);
            mctx.fillStyle = 'black';
            mctx.fillRect(padL, padT, ow, oh);
            const maskDataUrl = maskCanvas.toDataURL('image/png');

            setProgressMessage('AI 正在补全画面...');

            const result = await editImage(
                [{ href: expandedDataUrl, mimeType: 'image/png' }],
                `Seamlessly extend the image content outward. Continue the existing scene, lighting, and style naturally into the new areas. Do not change or alter the original central area.`,
                { href: maskDataUrl, mimeType: 'image/png' },
            );

            if (result && result.newImageBase64) {
                const newMime = result.newImageMimeType || 'image/png';
                const newHref = `data:${newMime};base64,${result.newImageBase64}`;
                // Update element: adjust position (shift by padding) and size
                commitAction(prev => prev.map(el =>
                    el.id === element.id
                        ? {
                            ...el,
                            href: newHref,
                            mimeType: newMime,
                            x: element.x - padL * (element.width / ow),
                            y: element.y - padT * (element.height / oh),
                            width: element.width * (nw / ow),
                            height: element.height * (nh / oh),
                        }
                        : el
                ));

                saveGenerationToHistory({
                    name: `Outpaint (${direction})`,
                    dataUrl: newHref,
                    mimeType: newMime,
                    width: nw,
                    height: nh,
                    prompt: `Outpaint ${direction}`,
                });

                setProgressMessage('扩图完成！');
            } else {
                setError('AI 扩图未返回结果，请重试。');
            }
        } catch (err) {
            const error = err as Error;
            setError(`AI 扩图失败: ${error.message}`);
        } finally {
            setIsLoading(false);
            setTimeout(() => setProgressMessage(''), 1500);
        }
    };

    const handleStartCrop = (element: ImageElement) => {
        setActiveTool('select');
        setCroppingState({
            elementId: element.id,
            originalElement: { ...element },
            cropBox: { x: element.x, y: element.y, width: element.width, height: element.height },
        });
    };

    const handleCancelCrop = () => setCroppingState(null);

    const handleConfirmCrop = () => {
        if (!croppingState) return;
        const { elementId, cropBox } = croppingState;
        const elementToCrop = elementsRef.current.find(el => el.id === elementId) as ImageElement;

        if (!elementToCrop) { handleCancelCrop(); return; }
        
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = cropBox.width;
            canvas.height = cropBox.height;
            const ctx = canvas.getContext('2d');
            if (!ctx) { setError("Failed to create canvas context for cropping."); handleCancelCrop(); return; }
            const sx = cropBox.x - elementToCrop.x;
            const sy = cropBox.y - elementToCrop.y;
            ctx.drawImage(img, sx, sy, cropBox.width, cropBox.height, 0, 0, cropBox.width, cropBox.height);
            const newHref = canvas.toDataURL(elementToCrop.mimeType);

            commitAction(prev => prev.map(el => {
                if (el.id === elementId && el.type === 'image') {
                    const updatedEl: ImageElement = {
                        ...el,
                        href: newHref,
                        x: cropBox.x,
                        y: cropBox.y,
                        width: cropBox.width,
                        height: cropBox.height
                    };
                    return updatedEl;
                }
                return el;
            }));
            handleCancelCrop();
        };
        img.onerror = () => { setError("Failed to load image for cropping."); handleCancelCrop(); }
        img.src = elementToCrop.href;
    };
    
    useEffect(() => {
        if (editingElement && editingTextareaRef.current) {
            setTimeout(() => {
                if (editingTextareaRef.current) {
                    editingTextareaRef.current.focus();
                    editingTextareaRef.current.select();
                }
            }, 0);
        }
    }, [editingElement]);
    
    useEffect(() => {
        if (editingElement && editingTextareaRef.current) {
            const textarea = editingTextareaRef.current;
            textarea.style.height = 'auto';
            const newHeight = textarea.scrollHeight;
            textarea.style.height = ''; 

            const currentElement = elementsRef.current.find(el => el.id === editingElement.id);
            if (currentElement && currentElement.type === 'text' && currentElement.height !== newHeight) {
                setElements(prev => prev.map(el => 
                    el.id === editingElement.id && el.type === 'text' 
                    ? { ...el, height: newHeight } 
                    : el
                ), false);
            }
        }
    }, [editingElement?.text, setElements]);

    /**
     * 构建带有图片引用标注的提示词
     *
     * 将 prompt 中的 @Label 标记（如 @Image_1、@图片_2）替换为有序的
     * 「[参考图N]」标记，并按出现顺序返回对应的图片数据数组。
     * 这样 Gemini API 收到的 parts 就能通过位置正确匹配引用关系。
     *
     * 例：
     *   输入 prompt: "把@Image_1的人物替换为@Image_2的兔子"
     *   输出 prompt: "把[参考图1]的人物替换为[参考图2]的兔子"
     *   输出 orderedImages: [Image_1的数据, Image_2的数据]
     */
    const buildMentionAwarePrompt = useCallback((
        rawPrompt: string,
        mentionedImages: ImageElement[],
    ): { prompt: string; orderedMentionImages: { href: string; mimeType: string }[] } => {
        if (mentionedImages.length === 0) {
            return { prompt: rawPrompt, orderedMentionImages: [] };
        }

        // 按照 prompt 中 @label 出现的位置排序
        const mentionOrder: { element: ImageElement; index: number }[] = [];
        for (const el of mentionedImages) {
            // 尝试匹配 @name 或 @label（CanvasMentionExtension 输出的格式）
            const escapedName = (el.name || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(`@${escapedName}\\b`, 'i');
            const match = rawPrompt.match(regex);
            mentionOrder.push({ element: el, index: match ? match.index! : Infinity });
        }
        mentionOrder.sort((a, b) => a.index - b.index);

        // 替换 prompt 中的 @label → [参考图N]
        let processedPrompt = rawPrompt;
        const orderedImages: { href: string; mimeType: string }[] = [];
        mentionOrder.forEach(({ element }, idx) => {
            const escapedName = (element.name || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(`@${escapedName}\\b`, 'gi');
            processedPrompt = processedPrompt.replace(regex, `[参考图${idx + 1}]`);
            orderedImages.push({ href: element.href, mimeType: element.mimeType });
        });

        // 如果有多张参考图，在 prompt 前添加说明
        if (orderedImages.length > 1) {
            const mapping = orderedImages.map((_, i) => `[参考图${i + 1}]`).join('、');
            processedPrompt = `以下提示词中包含 ${mapping} 分别对应按顺序传入的参考图片。\n${processedPrompt}`;
        }

        return { prompt: processedPrompt, orderedMentionImages: orderedImages };
    }, []);

    /**
     * ======== 局部选区 AI 重绘 (Inpaint) ========
     *
     * 用户在已选中的图片上用 Lasso 画出选区后，输入提示词进行 AI 局部重绘。
     * 选区会被转为黑白 mask，白色=重绘区域，黑色=保留区域。
     * 通过 Gemini editImage 接口（支持 inpainting）完成重绘。
     */
    const handleInpaint = async () => {
        if (!inpaintState || !inpaintPrompt.trim()) return;
        const targetImage = elements.find(el => el.id === inpaintState.targetImageId) as ImageElement | undefined;
        if (!targetImage) { setInpaintState(null); return; }

        // Check API key availability
        const imageProvider = inferProviderFromModel(modelPreference.imageModel);
        const hasKey = userApiKeys.some(k => {
            const caps = k.capabilities?.length ? k.capabilities : inferCapabilitiesByProvider(k.provider);
            return caps.includes('image') && k.provider === imageProvider;
        });
        if (!hasKey) {
            setError('未找到可用于图片编辑的 API Key，请先在设置中配置。');
            setIsSettingsPanelOpen(true);
            return;
        }

        setIsLoading(true);
        setError(null);
        setProgressMessage('正在生成 AI 局部重绘 mask...');

        try {
            // Convert lasso polygon to a rasterized mask (white = inpaint area)
            const { width, height, x: imgX, y: imgY } = targetImage;
            const maskCanvas = document.createElement('canvas');
            maskCanvas.width = width;
            maskCanvas.height = height;
            const maskCtx = maskCanvas.getContext('2d')!;

            // Black background = keep area
            maskCtx.fillStyle = 'black';
            maskCtx.fillRect(0, 0, width, height);

            // White fill inside lasso polygon = inpaint area
            maskCtx.fillStyle = 'white';
            maskCtx.beginPath();
            const pts = inpaintState.maskPoints;
            maskCtx.moveTo(pts[0].x - imgX, pts[0].y - imgY);
            for (let i = 1; i < pts.length; i++) {
                maskCtx.lineTo(pts[i].x - imgX, pts[i].y - imgY);
            }
            maskCtx.closePath();
            maskCtx.fill();

            const maskDataUrl = maskCanvas.toDataURL('image/png');

            setProgressMessage('正在 AI 局部重绘...');

            // Use Gemini editImage with mask
            const result = await editImage(
                [{ href: targetImage.href, mimeType: targetImage.mimeType }],
                inpaintPrompt.trim(),
                { href: maskDataUrl, mimeType: 'image/png' },
            );

            if (result && result.newImageBase64) {
                // Replace the target image content (non-destructive: keep position/size)
                const newMime = result.newImageMimeType || 'image/png';
                commitAction(prev => prev.map(el =>
                    el.id === targetImage.id
                        ? { ...el, href: `data:${newMime};base64,${result.newImageBase64}`, mimeType: newMime }
                        : el
                ));

                // Save to history
                saveGenerationToHistory({
                    name: `Inpaint: ${inpaintPrompt.trim().slice(0, 30)}`,
                    dataUrl: `data:${newMime};base64,${result.newImageBase64}`,
                    mimeType: newMime,
                    width: targetImage.width,
                    height: targetImage.height,
                    prompt: inpaintPrompt.trim(),
                });

                setProgressMessage('局部重绘完成！');
            } else {
                setError('AI 局部重绘未返回结果，请重试。');
            }
        } catch (err) {
            const error = err as Error;
            setError(`局部重绘失败: ${error.message}`);
        } finally {
            setIsLoading(false);
            setInpaintState(null);
            setInpaintPrompt('');
            setTimeout(() => setProgressMessage(''), 1500);
        }
    };

    const handleGenerate = async (promptOverride?: string, source: 'prompt' | 'right' | 'agent' = 'prompt') => {
        let rawPrompt = (promptOverride ?? prompt).trim();
        if (!rawPrompt) {
            setError('请输入提示词。');
            return;
        }

        // 自动润色：如果开关开启且有文本 LLM 能力的 Key，则先润色
        if (isAutoEnhanceEnabled && !promptOverride) {
            try {
                setProgressMessage('正在 LLM 润色提示词...');
                const enhanced = await handleEnhancePrompt({ prompt: rawPrompt, mode: 'smart' });
                if (enhanced?.enhancedPrompt?.trim()) {
                    rawPrompt = enhanced.enhancedPrompt.trim();
                }
            } catch (e) {
                console.warn('[Auto-Enhance] 润色失败，使用原始提示词:', e);
            }
        }

        // 预检：是否配置了对应能力的 API Key
        const neededCapability: 'image' | 'video' = generationMode === 'video' ? 'video' : 'image';
        const neededProvider = neededCapability === 'video'
            ? inferProviderFromModel(modelPreference.videoModel)
            : inferProviderFromModel(modelPreference.imageModel);
        const hasKey = userApiKeys.some(k => {
            const caps = k.capabilities?.length ? k.capabilities : inferCapabilitiesByProvider(k.provider);
            return caps.includes(neededCapability) && k.provider === neededProvider;
        });
        if (!hasKey) {
            const providerLabel = PROVIDER_LABELS[neededProvider] || neededProvider;
            const capLabel = neededCapability === 'video' ? '视频' : '图片';
            setError(`未配置 ${providerLabel} 的 API Key（${capLabel}生成需要）。点击右上角 ⚙️ 设置添加，或切换到已配置 Key 的模型。`);
            setIsSettingsPanelOpen(true);
            return;
        }

        setIsLoading(true);
        setError(null);
        setProgressMessage('正在准备生成...');

        const getMimeFromDataUrl = (href: string) => {
            const match = href.match(/^data:([^;]+);base64,/i);
            return match?.[1] || 'image/png';
        };
        const effectivePrompt = activeCharacterLock
            ? `${activeCharacterLock.descriptor}\n\n${rawPrompt}`
            : rawPrompt;
        const characterReferenceImages = activeCharacterLock
            ? [{ href: activeCharacterLock.referenceImage, mimeType: getMimeFromDataUrl(activeCharacterLock.referenceImage) }]
            : [];
        const activeAttachments = source === 'right' ? chatAttachments : promptAttachments;
        const attachmentReferenceImages = activeAttachments.map(item => ({ href: item.href, mimeType: item.mimeType }));
        const imageProvider = inferProviderFromModel(modelPreference.imageModel);
        const videoProvider = inferProviderFromModel(modelPreference.videoModel);
        const supportsReferenceEditing = imageProvider === 'google' && isGoogleImageEditModel(modelPreference.imageModel);
        const imageOutputName = generationMode === 'keyframe' ? 'Keyframe' : 'Generated Image';

        /**
         * ======== 首尾帧动画模式 (Keyframe Mode) ========
         *
         * 【功能】用户选中或 @引用一张起始帧图片，Veo 2.0 会基于该图片
         *        生成一段平滑的过渡动画视频并放置到画布上。
         *
         * 【参考图优先级】选中图片 > @引用图片
         * 【输出】VideoElement（blob URL），放置在画布中心
         *
         * 【限制】Veo API 当前仅支持单张参考图作为起始帧，
         *        如有两张以上参考图会在提示词中描述过渡意图。
         */
        if (generationMode === 'keyframe') {
            try {
                // 前置检查：首尾帧动画仅支持 Google Veo 模型
                if (videoProvider !== 'google') {
                    throw new Error('首尾帧动画目前仅支持 Google Veo 模型，请先配置 Google 视频 API Key。');
                }

                // 收集参考帧图片：优先选中的 → 然后 @引用的
                const mentionedImages = mentionedElementIds
                    .map(id => elements.find(el => el.id === id))
                    .filter((el): el is ImageElement => !!el && el.type === 'image');
                const selectedImages = elements
                    .filter(el => selectedElementIds.includes(el.id) && el.type === 'image') as ImageElement[];
                const allFrameRefs = [...selectedImages, ...mentionedImages];

                // 至少需要 1 张参考图作为起始帧
                if (allFrameRefs.length < 1) {
                    setError('首尾帧模式至少需要 1 张参考图（选中或 @引用画布图片）作为起始帧。');
                    setIsLoading(false);
                    return;
                }

                // 取第一张图片作为 Veo 的 image 参数（API 只接受单张）
                const startFrame = allFrameRefs[0];
                // 如有 ≥2 张参考图，在提示词中描述"从首帧过渡到尾帧"
                const keyframePrompt = allFrameRefs.length >= 2
                    ? `Animate a smooth cinematic transition from the first frame to the second frame. ${effectivePrompt}`
                    : `Animate this image with smooth motion. ${effectivePrompt}`;

                setProgressMessage('正在生成首尾帧过渡动画...');
                const { videoBlob, mimeType } = await generateVideo(
                    keyframePrompt,
                    videoAspectRatio,
                    (message) => setProgressMessage(message),
                    { href: startFrame.href, mimeType: startFrame.mimeType }
                );

                // 将视频 Blob 转为 URL 并获取尺寸元数据
                setProgressMessage('处理视频中...');
                const videoUrl = URL.createObjectURL(videoBlob);
                const video = document.createElement('video');

                video.onloadedmetadata = () => {
                    if (!svgRef.current) return;

                    // 限制最大尺寸 800px 以免画布元素过大
                    let newWidth = video.videoWidth;
                    let newHeight = video.videoHeight;
                    const MAX_DIM = 800;
                    if (newWidth > MAX_DIM || newHeight > MAX_DIM) {
                        const ratio = newWidth / newHeight;
                        if (ratio > 1) { newWidth = MAX_DIM; newHeight = MAX_DIM / ratio; }
                        else { newHeight = MAX_DIM; newWidth = MAX_DIM * ratio; }
                    }

                    // 放置到画布可视区域中心
                    const svgBounds = svgRef.current!.getBoundingClientRect();
                    const screenCenter = { x: svgBounds.left + svgBounds.width / 2, y: svgBounds.top + svgBounds.height / 2 };
                    const canvasPoint = getCanvasPoint(screenCenter.x, screenCenter.y);

                    const newVideoElement: VideoElement = {
                        id: generateId(), type: 'video', name: 'Keyframe Animation',
                        x: canvasPoint.x - (newWidth / 2), y: canvasPoint.y - (newHeight / 2),
                        width: newWidth, height: newHeight,
                        href: videoUrl, mimeType,
                    };
                    commitAction(prev => [...prev, newVideoElement]);
                    setSelectedElementIds([newVideoElement.id]);

                    // 截取视频第一帧作为缩略图保存到历史记录
                    try {
                        const canvas = document.createElement('canvas');
                        canvas.width = video.videoWidth;
                        canvas.height = video.videoHeight;
                        const ctx = canvas.getContext('2d');
                        if (ctx) {
                            ctx.drawImage(video, 0, 0);
                            const thumbnailUrl = canvas.toDataURL('image/png');
                            saveGenerationToHistory({
                                name: 'Keyframe Animation',
                                dataUrl: thumbnailUrl,
                                mimeType: 'image/png',
                                width: video.videoWidth,
                                height: video.videoHeight,
                                prompt: effectivePrompt,
                                mediaType: 'video',
                            });
                        }
                    } catch { /* 缩略图失败不影响主流程 */ }

                    setIsLoading(false);
                };
                video.onerror = () => { setError('无法加载生成的关键帧视频。'); setIsLoading(false); };
                video.src = videoUrl;
            } catch (err) {
                const error = err as Error;
                setError(`首尾帧动画生成失败: ${error.message}`);
                console.error('Keyframe generation failed:', error);
                setIsLoading(false);
            }
            return;
        }

        if (generationMode === 'video') {
            try {
                if (videoProvider !== 'google') {
                    throw new Error('Current video generation only supports Google Veo models. Please configure a Google video API key in settings.');
                }
                const selectedElements = elements.filter(el => selectedElementIds.includes(el.id));
                const imageElement = selectedElements.find(el => el.type === 'image') as ImageElement | undefined;
                const attachmentImage = activeAttachments[0];

                // Collect @mentioned images as additional reference sources
                const mentionedImages = mentionedElementIds
                    .map(id => elements.find(el => el.id === id))
                    .filter((el): el is ImageElement => !!el && el.type === 'image');

                // Priority: selected element > first @mentioned image > first attachment
                const baseVideoReference = imageElement
                    ? { href: imageElement.href, mimeType: imageElement.mimeType }
                    : mentionedImages.length > 0
                        ? { href: mentionedImages[0].href, mimeType: mentionedImages[0].mimeType }
                        : attachmentImage
                            ? { href: attachmentImage.href, mimeType: attachmentImage.mimeType }
                            : undefined;
                
                if (selectedElementIds.length > 1 || (selectedElementIds.length === 1 && !imageElement)) {
                    setError('For video generation, please select a single image or no elements.');
                    setIsLoading(false);
                    return;
                }
                
                const { videoBlob, mimeType } = await generateVideo(
                    effectivePrompt, 
                    videoAspectRatio, 
                    (message) => setProgressMessage(message), 
                    baseVideoReference
                );

                setProgressMessage('Processing video...');
                const videoUrl = URL.createObjectURL(videoBlob);
                const video = document.createElement('video');
                
                video.onloadedmetadata = () => {
                    if (!svgRef.current) return;
                    
                    let newWidth = video.videoWidth;
                    let newHeight = video.videoHeight;
                    const MAX_DIM = 800;
                    if (newWidth > MAX_DIM || newHeight > MAX_DIM) {
                        const ratio = newWidth / newHeight;
                        if (ratio > 1) { // landscape
                            newWidth = MAX_DIM;
                            newHeight = MAX_DIM / ratio;
                        } else { // portrait or square
                            newHeight = MAX_DIM;
                            newWidth = MAX_DIM * ratio;
                        }
                    }

                    const svgBounds = svgRef.current.getBoundingClientRect();
                    const screenCenter = { x: svgBounds.left + svgBounds.width / 2, y: svgBounds.top + svgBounds.height / 2 };
                    const canvasPoint = getCanvasPoint(screenCenter.x, screenCenter.y);
                    const x = canvasPoint.x - (newWidth / 2);
                    const y = canvasPoint.y - (newHeight / 2);

                    const newVideoElement: VideoElement = {
                        id: generateId(), type: 'video', name: 'Generated Video',
                        x, y,
                        width: newWidth,
                        height: newHeight,
                        href: videoUrl,
                        mimeType,
                    };

                    commitAction(prev => [...prev, newVideoElement]);
                    setSelectedElementIds([newVideoElement.id]);

                    // 截取视频第一帧作为缩略图保存到历史记录
                    try {
                        const canvas = document.createElement('canvas');
                        canvas.width = video.videoWidth;
                        canvas.height = video.videoHeight;
                        const ctx = canvas.getContext('2d');
                        if (ctx) {
                            ctx.drawImage(video, 0, 0);
                            const thumbnailUrl = canvas.toDataURL('image/png');
                            saveGenerationToHistory({
                                name: 'Generated Video',
                                dataUrl: thumbnailUrl,
                                mimeType: 'image/png',
                                width: video.videoWidth,
                                height: video.videoHeight,
                                prompt: effectivePrompt,
                                mediaType: 'video',
                            });
                        }
                    } catch { /* 缩略图失败不影响主流程 */ }

                    setIsLoading(false);
                };

                video.onerror = () => {
                    setError('Could not load generated video metadata.');
                    setIsLoading(false);
                };
                
                video.src = videoUrl;

            } catch (err) {
                 const error = err as Error; 
                 setError(`Video generation failed: ${error.message}`); 
                 console.error("Video generation failed:", error);
                 setIsLoading(false);
            }
            return;
        }


        // IMAGE GENERATION LOGIC
        try {
            const isEditing = selectedElementIds.length > 0;

            // Collect @mention reference images (閸欘亜褰囬崶鍓у缁鍘撶槐鐙呯礉閹烘帡娅庡鎻掓躬 selection 娑擃厾娈?
            const mentionedImageElements = mentionedElementIds
                .map(id => elements.find(el => el.id === id))
                .filter((el): el is ImageElement => !!el && el.type === 'image' && !selectedElementIds.includes(el.id));

            if (isEditing) {
                if (!supportsReferenceEditing) {
                    setError('The current image model does not support whiteboard-based editing or compositing. Please switch to a Gemini or Imagen image model.');
                    return;
                }
                const selectedElements = elements.filter(el => selectedElementIds.includes(el.id));
                const imageElements = selectedElements.filter(el => el.type === 'image') as ImageElement[];
                const maskPaths = selectedElements.filter(el => el.type === 'path' && el.strokeOpacity && el.strokeOpacity < 1) as PathElement[];

                // Inpainting logic: selection is ONLY one image and one or more mask paths
                if (imageElements.length === 1 && maskPaths.length > 0 && selectedElements.length === (1 + maskPaths.length)) {
                    const baseImage = imageElements[0];
                    const maskData = await rasterizeMask(maskPaths, baseImage);
                    const result = await editImage(
                        [{ href: baseImage.href, mimeType: baseImage.mimeType }],
                        effectivePrompt,
                        { href: maskData.href, mimeType: maskData.mimeType }
                    );
                    
                    if (result.newImageBase64 && result.newImageMimeType) {
                        const { newImageBase64, newImageMimeType } = result;

                        const img = new Image();
                        img.onload = () => {
                            const maskPathIds = new Set(maskPaths.map(p => p.id));
                            const nextDataUrl = `data:${newImageMimeType};base64,${newImageBase64}`;
                            commitAction(prev => 
                                prev.map(el => {
                                    if (el.id === baseImage.id && el.type === 'image') {
                                        return {
                                            ...el,
                                            href: nextDataUrl,
                                            width: img.width,
                                            height: img.height,
                                        };
                                    }
                                    return el;
                                }).filter(el => !maskPathIds.has(el.id))
                            );
                            setSelectedElementIds([baseImage.id]);
                            saveGenerationToHistory({
                                name: baseImage.name || 'Edited image',
                                dataUrl: nextDataUrl,
                                mimeType: newImageMimeType,
                                width: img.width,
                                height: img.height,
                                prompt: effectivePrompt,
                            });
                        };
                        img.onerror = () => setError('Failed to load the generated image.');
                        img.src = `data:${newImageMimeType};base64,${newImageBase64}`;

                    } else {
                        setError(result.textResponse || 'Inpainting failed to produce an image.');
                    }
                    return; // End execution for inpainting path
                }
                
                // Regular edit/combine logic (append @mention refs at the end)
                const imagePromises = selectedElements.map(el => {
                    if (el.type === 'image') return Promise.resolve({ href: el.href, mimeType: el.mimeType });
                    if (el.type === 'video') return Promise.reject(new Error("Cannot use video elements in image generation."));
                    return rasterizeElement(el as Exclude<Element, ImageElement | VideoElement>);
                });
                const imagesToProcess = await Promise.all(imagePromises);

                // Append @mentioned reference images — 按 prompt 中出现顺序排列
                const { prompt: mentionPrompt, orderedMentionImages } = buildMentionAwarePrompt(effectivePrompt, mentionedImageElements);
                const result = await editImage(
                    [...imagesToProcess, ...orderedMentionImages, ...attachmentReferenceImages, ...characterReferenceImages],
                    mentionPrompt
                );

                if (result.newImageBase64 && result.newImageMimeType) {
                    const { newImageBase64, newImageMimeType } = result;
                    
                    const img = new Image();
                    img.onload = () => {
                        let minX = Infinity, minY = Infinity, maxX = -Infinity;
                        selectedElements.forEach(el => {
                            const bounds = getElementBounds(el);
                            minX = Math.min(minX, bounds.x);
                            minY = Math.min(minY, bounds.y);
                            maxX = Math.max(maxX, bounds.x + bounds.width);
                        });
                        const x = maxX + 20;
                        const y = minY;
                        
                        const newImage: ImageElement = {
                            id: generateId(), type: 'image', x, y, name: imageOutputName,
                            width: img.width, height: img.height,
                            href: `data:${newImageMimeType};base64,${newImageBase64}`, mimeType: newImageMimeType,
                        };
                        commitAction(prev => [...prev, newImage]);
                        setSelectedElementIds([newImage.id]);
                        saveGenerationToHistory({
                            name: newImage.name,
                            dataUrl: newImage.href,
                            mimeType: newImage.mimeType,
                            width: newImage.width,
                            height: newImage.height,
                            prompt: effectivePrompt,
                        });
                    };
                    img.onerror = () => setError('Failed to load the generated image.');
                    img.src = `data:${newImageMimeType};base64,${newImageBase64}`;
                } else {
                    setError(result.textResponse || 'Generation failed to produce an image.');
                }

            } else if (mentionedImageElements.length > 0) {
                if (!supportsReferenceEditing) {
                    setError('The current image model does not support @ reference image generation. Please switch to a Gemini or Imagen image model.');
                    return;
                }
                // No canvas selection, but user @mentioned image elements — 按 prompt 引用顺序排列
                setProgressMessage('Generating with reference images...');
                const { prompt: mentionPrompt2, orderedMentionImages: orderedRefs } = buildMentionAwarePrompt(effectivePrompt, mentionedImageElements);
                const result = await editImage([...orderedRefs, ...attachmentReferenceImages, ...characterReferenceImages], mentionPrompt2);

                if (result.newImageBase64 && result.newImageMimeType) {
                    const { newImageBase64, newImageMimeType } = result;
                    const img = new Image();
                    img.onload = () => {
                        if (!svgRef.current) return;
                        const svgBounds = svgRef.current.getBoundingClientRect();
                        const screenCenter = { x: svgBounds.left + svgBounds.width / 2, y: svgBounds.top + svgBounds.height / 2 };
                        const canvasPoint = getCanvasPoint(screenCenter.x, screenCenter.y);
                        const x = canvasPoint.x - (img.width / 2);
                        const y = canvasPoint.y - (img.height / 2);
                        const newImage: ImageElement = {
                            id: generateId(), type: 'image', x, y, name: imageOutputName,
                            width: img.width, height: img.height,
                            href: `data:${newImageMimeType};base64,${newImageBase64}`, mimeType: newImageMimeType,
                        };
                        commitAction(prev => [...prev, newImage]);
                        setSelectedElementIds([newImage.id]);
                        saveGenerationToHistory({
                            name: newImage.name,
                            dataUrl: newImage.href,
                            mimeType: newImage.mimeType,
                            width: newImage.width,
                            height: newImage.height,
                            prompt: effectivePrompt,
                        });
                    };
                    img.onerror = () => setError('Failed to load the generated image.');
                    img.src = `data:${newImageMimeType};base64,${newImageBase64}`;
                } else {
                    setError(result.textResponse || 'Generation failed to produce an image.');
                }

            } else {
                // Generate from scratch
                const baseRefs = [...attachmentReferenceImages, ...characterReferenceImages];
                if (baseRefs.length > 0 && !supportsReferenceEditing) {
                    setError('The current image model does not support reference image generation. Please switch to a Gemini or Imagen image model.');
                    return;
                }
                const result = baseRefs.length > 0
                    ? await editImage(baseRefs, effectivePrompt)
                    : await generateImageWithProvider(
                        effectivePrompt,
                        modelPreference.imageModel,
                        getPreferredApiKey('image', imageProvider)
                    );

                if (result.newImageBase64 && result.newImageMimeType) {
                    const { newImageBase64, newImageMimeType } = result;
                    
                    const img = new Image();
                    img.onload = () => {
                        if (!svgRef.current) return;
                        const svgBounds = svgRef.current.getBoundingClientRect();
                        const screenCenter = { x: svgBounds.left + svgBounds.width / 2, y: svgBounds.top + svgBounds.height / 2 };
                        const canvasPoint = getCanvasPoint(screenCenter.x, screenCenter.y);
                        const x = canvasPoint.x - (img.width / 2);
                        const y = canvasPoint.y - (img.height / 2);
                        
                        const newImage: ImageElement = {
                            id: generateId(), type: 'image', x, y, name: imageOutputName,
                            width: img.width, height: img.height,
                            href: `data:${newImageMimeType};base64,${newImageBase64}`, mimeType: newImageMimeType,
                        };
                        commitAction(prev => [...prev, newImage]);
                        setSelectedElementIds([newImage.id]);
                        saveGenerationToHistory({
                            name: newImage.name,
                            dataUrl: newImage.href,
                            mimeType: newImage.mimeType,
                            width: newImage.width,
                            height: newImage.height,
                            prompt: effectivePrompt,
                        });
                    };
                    img.onerror = () => setError('Failed to load the generated image.');
                    img.src = `data:${newImageMimeType};base64,${newImageBase64}`;
                } else { 
                    setError(result.textResponse || 'Generation failed to produce an image.'); 
                }
            }
        } catch (err) {
            const error = err as Error; 
            let friendlyMessage = `生成出错: ${error.message}`;

            if (error.message && (error.message.includes('API_KEY_INVALID') || error.message.includes('API key not valid'))) {
                friendlyMessage = 'API Key 无效。请打开设置，检查或重新添加你的 API Key。';
            } else if (error.message && (error.message.includes('429') || error.message.toUpperCase().includes('RESOURCE_EXHAUSTED'))) {
                friendlyMessage = 'API 调用配额已用完。请检查你的 Google AI Studio 计划，或稍后重试。';
            } else if (error.message && (error.message.includes('not configured') || error.message.includes('not set'))) {
                friendlyMessage = '未配置 API Key。请先打开设置 → API 配置，添加你的 API Key。';
            }

            setError(friendlyMessage); 
            console.error("Generation failed:", error);

            // Record failed API usage
            const usageKey = userApiKeys.find(k => k.provider === (generationMode === 'video' ? videoProvider : imageProvider));
            if (usageKey) {
                recordApiUsage({
                    keyId: usageKey.id,
                    provider: usageKey.provider,
                    model: generationMode === 'video' ? modelPreference.videoModel : modelPreference.imageModel,
                    type: generationMode === 'video' ? 'video' : 'image',
                    success: false,
                    error: error.message,
                });
            }
        } finally { 
            setIsLoading(false); 
        }
    };

    /**
     * ======== 批量生成对比 (Batch Generation) ========
     *
     * 并行调用 N 次图片生成 API，在弹窗中对比结果，用户选择最佳方案放到画布。
     */
    const handleBatchGenerate = async () => {
        const rawPrompt = prompt.trim();
        if (!rawPrompt || batchCount <= 1) return;

        const imageProvider = inferProviderFromModel(modelPreference.imageModel);
        const hasKey = userApiKeys.some(k => {
            const caps = k.capabilities?.length ? k.capabilities : inferCapabilitiesByProvider(k.provider);
            return caps.includes('image') && k.provider === imageProvider;
        });
        if (!hasKey) {
            setError('未找到可用于图片生成的 API Key。');
            setIsSettingsPanelOpen(true);
            return;
        }

        setIsLoading(true);
        setError(null);
        setProgressMessage(`正在批量生成 ${batchCount} 张方案...`);

        try {
            const tasks = Array.from({ length: batchCount }, (_, i) =>
                generateImageWithProvider(
                    rawPrompt + (i > 0 ? ` (variation ${i + 1})` : ''),
                    modelPreference.imageModel,
                    getPreferredApiKey('image', imageProvider)
                ).catch(() => null)
            );
            const results = await Promise.all(tasks);

            const images: { href: string; mimeType: string; width: number; height: number }[] = [];
            for (const res of results) {
                if (res && res.newImageBase64 && res.newImageMimeType) {
                    const href = `data:${res.newImageMimeType};base64,${res.newImageBase64}`;
                    // Get dimensions
                    const dim = await new Promise<{ w: number; h: number }>((resolve) => {
                        const img = new Image();
                        img.onload = () => resolve({ w: img.width, h: img.height });
                        img.onerror = () => resolve({ w: 512, h: 512 });
                        img.src = href;
                    });
                    images.push({ href, mimeType: res.newImageMimeType, width: dim.w, height: dim.h });
                }
            }

            if (images.length === 0) {
                setError('批量生成失败，所有请求均未返回图片。');
            } else {
                setBatchResults({ prompt: rawPrompt, images });
                setProgressMessage(`生成完成: ${images.length}/${batchCount} 张成功`);
            }
        } catch (err) {
            setError(`批量生成出错: ${(err as Error).message}`);
        } finally {
            setIsLoading(false);
            setTimeout(() => setProgressMessage(''), 1500);
        }
    };

    /** 用户从批量结果中选择一张放到画布 */
    const handleSelectBatchResult = (img: { href: string; mimeType: string; width: number; height: number }) => {
        if (!svgRef.current) return;
        const svgBounds = svgRef.current.getBoundingClientRect();
        const canvasPoint = getCanvasPoint(
            svgBounds.left + svgBounds.width / 2,
            svgBounds.top + svgBounds.height / 2
        );
        const newImage: ImageElement = {
            id: generateId(), type: 'image',
            x: canvasPoint.x - img.width / 2,
            y: canvasPoint.y - img.height / 2,
            name: 'Batch Pick',
            width: img.width, height: img.height,
            href: img.href, mimeType: img.mimeType,
        };
        commitAction(prev => [...prev, newImage]);
        setSelectedElementIds([newImage.id]);
        saveGenerationToHistory({
            name: 'Batch Pick',
            dataUrl: img.href,
            mimeType: img.mimeType,
            width: img.width,
            height: img.height,
            prompt: batchResults?.prompt || '',
        });
        setBatchResults(null);
    };

    /** 将批量结果全部放到画布（网格排列） */
    const handleSelectAllBatchResults = () => {
        if (!batchResults || !svgRef.current) return;
        const svgBounds = svgRef.current.getBoundingClientRect();
        const center = getCanvasPoint(
            svgBounds.left + svgBounds.width / 2,
            svgBounds.top + svgBounds.height / 2
        );
        const cols = batchResults.images.length <= 2 ? 2 : 2;
        const gap = 20;
        const newEls: ImageElement[] = batchResults.images.map((img, i) => {
            const col = i % cols;
            const row = Math.floor(i / cols);
            return {
                id: generateId(), type: 'image',
                x: center.x + (col - cols / 2) * (img.width + gap),
                y: center.y + (row - 0.5) * (img.height + gap),
                name: `Batch ${i + 1}`,
                width: img.width, height: img.height,
                href: img.href, mimeType: img.mimeType,
            };
        });
        commitAction(prev => [...prev, ...newEls]);
        setSelectedElementIds(newEls.map(e => e.id));
        setBatchResults(null);
    };

    /**
     * ======== 图层蒙版编辑 (Layer Mask) ========
     */
    const startMaskEditing = useCallback((elementId: string) => {
        const el = elements.find(e => e.id === elementId && e.type === 'image') as ImageElement | undefined;
        if (!el) return;
        // Create an offscreen canvas to hold mask data
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(el.width);
        canvas.height = Math.round(el.height);
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        // If existing mask, draw it; otherwise fill white (fully visible)
        if (el.mask) {
            const img = new Image();
            img.onload = () => {
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                maskCanvasRef.current = canvas;
                setMaskEditingId(elementId);
            };
            img.src = el.mask;
        } else {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            maskCanvasRef.current = canvas;
            setMaskEditingId(elementId);
        }
    }, [elements]);

    const commitMask = useCallback(() => {
        if (!maskCanvasRef.current || !maskEditingId) return;
        const dataUrl = maskCanvasRef.current.toDataURL('image/png');
        commitAction(prev => prev.map(el =>
            el.id === maskEditingId && el.type === 'image' ? { ...el, mask: dataUrl } : el
        ));
        setMaskEditingId(null);
        maskCanvasRef.current = null;
    }, [maskEditingId, commitAction]);

    const cancelMask = useCallback(() => {
        setMaskEditingId(null);
        maskCanvasRef.current = null;
    }, []);

    const clearMask = useCallback(() => {
        if (!maskEditingId) return;
        commitAction(prev => prev.map(el =>
            el.id === maskEditingId && el.type === 'image' ? { ...el, mask: undefined } : el
        ));
        setMaskEditingId(null);
        maskCanvasRef.current = null;
    }, [maskEditingId, commitAction]);

    /** Paint on mask canvas at a given canvas-space point */
    const paintMask = useCallback((canvasX: number, canvasY: number) => {
        const el = elements.find(e => e.id === maskEditingId && e.type === 'image') as ImageElement | undefined;
        if (!el || !maskCanvasRef.current) return;
        const ctx = maskCanvasRef.current.getContext('2d');
        if (!ctx) return;
        // Convert canvas point to element-local coordinates
        const localX = (canvasX - el.x) / el.width * maskCanvasRef.current.width;
        const localY = (canvasY - el.y) / el.height * maskCanvasRef.current.height;
        const brushR = maskBrushSize / el.width * maskCanvasRef.current.width;
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = maskBrushMode === 'erase' ? '#000000' : '#ffffff';
        ctx.beginPath();
        ctx.arc(localX, localY, brushR / 2, 0, Math.PI * 2);
        ctx.fill();
        // Live-update the element mask for preview
        const dataUrl = maskCanvasRef.current.toDataURL('image/png');
        setElements(prev => prev.map(e =>
            e.id === maskEditingId && e.type === 'image' ? { ...e, mask: dataUrl } : e
        ));
    }, [maskEditingId, maskBrushSize, maskBrushMode, elements, setElements]);

    const handleCanvasImageDragStart = useCallback((image: ImageElement, e: React.DragEvent<SVGGElement>) => {
        const payload = {
            id: image.id,
            name: image.name,
            href: image.href,
            mimeType: image.mimeType,
        };
        e.dataTransfer.setData('application/x-canvas-image', JSON.stringify(payload));
        e.dataTransfer.setData('text/plain', image.name || image.id);
        e.dataTransfer.effectAllowed = 'copy';
    }, []);
    
    const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); }, []);
    const handleDrop = useCallback((e: React.DragEvent) => { 
        e.preventDefault(); 
        const text = e.dataTransfer.getData('text/plain');
        if (text && handleAssetDropRef.current) { handleAssetDropRef.current(e); return; }
        if (e.dataTransfer.files && e.dataTransfer.files[0]) { handleAddImageElement(e.dataTransfer.files[0]); }
    }, [handleAddImageElement]);

    const handlePropertyChange = (elementId: string, updates: Partial<Element>) => {
        commitAction(prev => prev.map(el => {
            if (el.id === elementId) {
                 return { ...el, ...updates };
            }
            return el;
        }));
    };

     const handleLayerAction = (elementId: string, action: 'front' | 'back' | 'forward' | 'backward') => {
        commitAction(prev => {
            const elementsCopy = [...prev];
            const index = elementsCopy.findIndex(el => el.id === elementId);
            if (index === -1) return elementsCopy;

            const [element] = elementsCopy.splice(index, 1);

            if (action === 'front') {
                elementsCopy.push(element);
            } else if (action === 'back') {
                elementsCopy.unshift(element);
            } else if (action === 'forward') {
                const newIndex = Math.min(elementsCopy.length, index + 1);
                elementsCopy.splice(newIndex, 0, element);
            } else if (action === 'backward') {
                const newIndex = Math.max(0, index - 1);
                elementsCopy.splice(newIndex, 0, element);
            }
            return elementsCopy;
        });
        setContextMenu(null);
    };
    
    const handleRasterizeSelection = async () => {
        const elementsToRasterize = elements.filter(
            el => selectedElementIds.includes(el.id) && el.type !== 'image' && el.type !== 'video'
        ) as Exclude<Element, ImageElement | VideoElement>[];

        if (elementsToRasterize.length === 0) return;

        setContextMenu(null);
        setIsLoading(true);
        setError(null);

        try {
            let minX = Infinity, minY = Infinity;
            elementsToRasterize.forEach(element => {
                const bounds = getElementBounds(element);
                minX = Math.min(minX, bounds.x);
                minY = Math.min(minY, bounds.y);
            });
            
            const { href, mimeType, width, height } = await rasterizeElements(elementsToRasterize);
            
            const newImage: ImageElement = {
                id: generateId(),
                type: 'image', name: 'Rasterized Image',
                x: minX - 10, // Account for padding used during rasterization
                y: minY - 10, // Account for padding
                width,
                height,
                href,
                mimeType
            };

            const idsToRemove = new Set(elementsToRasterize.map(el => el.id));

            commitAction(prev => {
                const remainingElements = prev.filter(el => !idsToRemove.has(el.id));
                return [...remainingElements, newImage];
            });

            setSelectedElementIds([newImage.id]);

        } catch (err) {
            const error = err as Error;
            setError(`Failed to rasterize selection: ${error.message}`);
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleGroup = () => {
        const selectedElements = elements.filter(el => selectedElementIds.includes(el.id));
        if (selectedElements.length < 2) return;
        
        const bounds = getSelectionBounds(selectedElementIds);
        const newGroupId = generateId();

        const newGroup: GroupElement = {
            id: newGroupId,
            type: 'group',
            name: 'Group',
            x: bounds.x,
            y: bounds.y,
            width: bounds.width,
            height: bounds.height,
        };

        commitAction(prev => {
            const updatedElements = prev.map(el => 
                selectedElementIds.includes(el.id) ? { ...el, parentId: newGroupId } : el
            );
            return [...updatedElements, newGroup];
        });

        setSelectedElementIds([newGroupId]);
        setContextMenu(null);
    };

    const handleUngroup = () => {
        if (selectedElementIds.length !== 1) return;
        const groupId = selectedElementIds[0];
        const group = elements.find(el => el.id === groupId);
        if (!group || group.type !== 'group') return;

        const childrenIds: string[] = [];
        commitAction(prev => {
            return prev.map(el => {
                if (el.parentId === groupId) {
                    childrenIds.push(el.id);
                    return { ...el, parentId: undefined };
                }
                return el;
            }).filter(el => el.id !== groupId);
        });

        setSelectedElementIds(childrenIds);
        setContextMenu(null);
    };


    const handleContextMenu = (e: React.MouseEvent<SVGSVGElement>) => {
        e.preventDefault();
        setContextMenu(null);
        const target = e.target as SVGElement;
        const elementId = target.closest('[data-id]')?.getAttribute('data-id');
        setContextMenu({ x: e.clientX, y: e.clientY, elementId: elementId || null });
    };


    useEffect(() => {
        const handlePaste = (e: ClipboardEvent) => { if (e.clipboardData?.files[0]?.type.startsWith("image/")) { e.preventDefault(); handleAddImageElement(e.clipboardData.files[0]); } };
        window.addEventListener('paste', handlePaste);
        return () => window.removeEventListener('paste', handlePaste);
    }, [handleAddImageElement]);

    const getSelectionBounds = useCallback((selectionIds: string[]): Rect => {
        const selectedElements = elementsRef.current.filter(el => selectionIds.includes(el.id));
        if (selectedElements.length === 0) return { x: 0, y: 0, width: 0, height: 0 };

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        selectedElements.forEach(el => {
            const bounds = getElementBounds(el, elementsRef.current);
            minX = Math.min(minX, bounds.x);
            minY = Math.min(minY, bounds.y);
            maxX = Math.max(maxX, bounds.x + bounds.width);
            maxY = Math.max(maxY, bounds.y + bounds.height);
        });

        return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
    }, []);

    const handleAlignSelection = (alignment: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') => {
        const selectedElements = elementsRef.current.filter(el => selectedElementIds.includes(el.id));
        if (selectedElements.length < 2) return;
    
        const selectionBounds = getSelectionBounds(selectedElementIds);
        const { x: minX, y: minY, width, height } = selectionBounds;
        const maxX = minX + width;
        const maxY = minY + height;
    
        const selectionCenterX = minX + width / 2;
        const selectionCenterY = minY + height / 2;
    
        commitAction(prev => {
            const elementsToUpdate = new Map<string, { dx: number; dy: number }>();

            selectedElements.forEach(el => {
                const bounds = getElementBounds(el, prev);
                let dx = 0;
                let dy = 0;
        
                switch (alignment) {
                    case 'left':   dx = minX - bounds.x; break;
                    case 'center': dx = selectionCenterX - (bounds.x + bounds.width / 2); break;
                    case 'right':  dx = maxX - (bounds.x + bounds.width); break;
                    case 'top':    dy = minY - bounds.y; break;
                    case 'middle': dy = selectionCenterY - (bounds.y + bounds.height / 2); break;
                    case 'bottom': dy = maxY - (bounds.y + bounds.height); break;
                }
        
                if (dx !== 0 || dy !== 0) {
                    const elementsToMove = [el, ...getDescendants(el.id, prev)];
                    elementsToMove.forEach(elementToMove => {
                        if (!elementsToUpdate.has(elementToMove.id)) {
                            elementsToUpdate.set(elementToMove.id, { dx, dy });
                        }
                    });
                }
            });
            return prev.map((el): Element => {
                const delta = elementsToUpdate.get(el.id);
                if (!delta) {
                    return el;
                }

                const { dx, dy } = delta;
                
                switch (el.type) {
                    case 'image':
                    case 'shape':
                    case 'text':
                    case 'group':
                    case 'video':
                        return { ...el, x: el.x + dx, y: el.y + dy };
                    case 'arrow':
                    case 'line':
                        return { ...el, points: el.points.map(p => ({ x: p.x + dx, y: p.y + dy })) as [Point, Point] };
                    case 'path':
                        return { ...el, points: el.points.map(p => ({ x: p.x + dx, y: p.y + dy })) };
                }
            });
        });
    };

    const isElementVisible = useCallback((element: Element, allElements: Element[]): boolean => {
        if (element.isVisible === false) return false;
        if (element.parentId) {
            const parent = allElements.find(el => el.id === element.parentId);
            if (parent) {
                return isElementVisible(parent, allElements);
            }
        }
        return true;
    }, []);


    const isSelectionActive = selectedElementIds.length > 0;
    const singleSelectedElement = selectedElementIds.length === 1 ? elements.find(el => el.id === selectedElementIds[0]) : null;

    let cursor = 'default';
    if (maskEditingId) cursor = 'crosshair';
    else if (croppingState) cursor = 'default';
    else if (interactionMode.current === 'pan') cursor = 'grabbing';
    else if (activeTool === 'pan') cursor = 'grab';
    else if (['draw', 'erase', 'rectangle', 'circle', 'triangle', 'arrow', 'line', 'text', 'highlighter', 'lasso'].includes(activeTool)) cursor = 'crosshair';

    // Board Management
    const handleAddBoard = () => {
        const newBoard = createNewBoard(`Board ${boards.length + 1}`);
        setBoards(prev => [...prev, newBoard]);
        setActiveBoardId(newBoard.id);
    };

    const handleDuplicateBoard = (boardId: string) => {
        const boardToDuplicate = boards.find(b => b.id === boardId);
        if (!boardToDuplicate) return;
        const newBoard = {
            ...boardToDuplicate,
            id: generateId(),
            name: `${boardToDuplicate.name} Copy`,
            history: [boardToDuplicate.elements],
            historyIndex: 0,
        };
        setBoards(prev => [...prev, newBoard]);
        setActiveBoardId(newBoard.id);
    };
    
    const handleDeleteBoard = (boardId: string) => {
        if (boards.length <= 1) return; // Can't delete the last board
        const nextBoards = boards.filter(board => board.id !== boardId);
        setBoards(nextBoards);
        if (activeBoardId === boardId && nextBoards.length > 0) {
            setActiveBoardId(nextBoards[0].id);
        }
    };
    
    const handleRenameBoard = (boardId: string, name: string) => {
        setBoards(prev => prev.map(b => b.id === boardId ? { ...b, name } : b));
    };

    const generateBoardThumbnail = useCallback((elements: Element[], bgColor: string): string => {
         const THUMB_WIDTH = 120;
         const THUMB_HEIGHT = 80;

        if (elements.length === 0) {
            const emptySvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${THUMB_WIDTH}" height="${THUMB_HEIGHT}"><rect width="100%" height="100%" fill="${bgColor}" /></svg>`;
            return `data:image/svg+xml;base64,${btoa(emptySvg)}`;
        }
        
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        elements.forEach(el => {
            const bounds = getElementBounds(el, elements);
            minX = Math.min(minX, bounds.x);
            minY = Math.min(minY, bounds.y);
            maxX = Math.max(maxX, bounds.x + bounds.width);
            maxY = Math.max(maxY, bounds.y + bounds.height);
        });

        const contentWidth = maxX - minX;
        const contentHeight = maxY - minY;

        if (contentWidth <= 0 || contentHeight <= 0) {
            const emptySvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${THUMB_WIDTH}" height="${THUMB_HEIGHT}"><rect width="100%" height="100%" fill="${bgColor}" /></svg>`;
            return `data:image/svg+xml;base64,${btoa(emptySvg)}`;
        }

        const scale = Math.min(THUMB_WIDTH / contentWidth, THUMB_HEIGHT / contentHeight) * 0.9;
        const dx = (THUMB_WIDTH - contentWidth * scale) / 2 - minX * scale;
        const dy = (THUMB_HEIGHT - contentHeight * scale) / 2 - minY * scale;

        const svgContent = elements.map(el => {
             if (el.type === 'path') {
                const pathData = el.points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
                return `<path d="${pathData}" stroke="${el.strokeColor}" stroke-width="${el.strokeWidth}" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-opacity="${el.strokeOpacity || 1}" />`;
             }
             if (el.type === 'image') {
                 return `<image href="${el.href}" x="${el.x}" y="${el.y}" width="${el.width}" height="${el.height}" />`;
             }
             // Add other element types for more accurate thumbnails if needed
             return '';
        }).join('');

        const fullSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${THUMB_WIDTH}" height="${THUMB_HEIGHT}"><rect width="100%" height="100%" fill="${bgColor}" /><g transform="translate(${dx} ${dy}) scale(${scale})">${svgContent}</g></svg>`;
        return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(fullSvg)))}`;
    }, []);

    return (
        <div className="theme-aware w-screen h-screen flex flex-col font-sans" style={{ backgroundColor: themePalette.appBackground }} onDragOver={handleDragOver} onDrop={handleDrop}>
            {isLoading && <Loader progressMessage={progressMessage} />}
            {error && (
                <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 p-3 bg-red-100 border border-red-400 text-red-700 rounded-md shadow-lg flex items-center max-w-lg">
                    <span className="flex-grow">{error}</span>
                    <button onClick={() => setError(null)} className="ml-4 p-1 rounded-full hover:bg-red-200" title={t('common.close')} aria-label={t('common.close')}>
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd"></path></svg>
                    </button>
                </div>
            )}
            <WorkspaceSidebar
                isOpen={!isLayerMinimized}
                onToggle={() => setIsLayerMinimized(prev => !prev)}
                outerGap={chromeMetrics.outerGap}
                panelWidth={chromeMetrics.sidebarWidth}
                boards={boards}
                activeBoardId={activeBoardId}
                onSwitchBoard={setActiveBoardId}
                onAddBoard={handleAddBoard}
                onRenameBoard={handleRenameBoard}
                onDuplicateBoard={handleDuplicateBoard}
                onDeleteBoard={handleDeleteBoard}
                generateBoardThumbnail={(els) => generateBoardThumbnail(els, canvasBackgroundColor)}
                elements={elements}
                selectedElementIds={selectedElementIds}
                onSelectElement={id => setSelectedElementIds(id ? [id] : [])}
                onToggleVisibility={id => handlePropertyChange(id, { isVisible: !(elements.find(el => el.id === id)?.isVisible ?? true) })}
                onToggleLock={id => handlePropertyChange(id, { isLocked: !(elements.find(el => el.id === id)?.isLocked ?? false) })}
                onRenameElement={(id, name) => handlePropertyChange(id, { name })}
                onReorder={(draggedId, targetId, position) => {
                    commitAction(prev => {
                        const newElements = [...prev];
                        const draggedIndex = newElements.findIndex(el => el.id === draggedId);
                        if (draggedIndex === -1) return prev;

                        const [draggedItem] = newElements.splice(draggedIndex, 1);
                        const targetIndex = newElements.findIndex(el => el.id === targetId);
                        if (targetIndex === -1) {
                            newElements.push(draggedItem);
                            return newElements;
                        }

                        const finalIndex = position === 'before' ? targetIndex : targetIndex + 1;
                        newElements.splice(finalIndex, 0, draggedItem);
                        return newElements;
                    });
                }}
            />
            {/* New Right Panel (multi-function: generate + inspiration) */}
            <RightPanel
                theme={resolvedTheme}
                isMinimized={isInspirationMinimized}
                onToggleMinimize={() => setIsInspirationMinimized(prev => !prev)}
                outerGap={chromeMetrics.outerGap}
                defaultWidth={chromeMetrics.rightPanelDefaultWidth}
                minWidth={chromeMetrics.rightPanelMinWidth}
                widthCap={chromeMetrics.rightPanelWidthCap}
                compactMode={chromeMetrics.isTablet}
                library={assetLibrary}
                generationHistory={generationHistory}
                onRemove={(cat, id) => setAssetLibrary(prev => removeAsset(prev, cat, id))}
                onRename={(cat, id, name) => setAssetLibrary(prev => renameAsset(prev, cat, id, name))}
                onWidthChange={setRightPanelWidth}
                textModel={modelPreference.textModel}
                getApiKeyForModel={(model: string) => {
                    const provider = inferProviderFromModel(model);
                    return getPreferredApiKey('text', provider);
                }}
                onAgentFinalPrompt={(finalPrompt: string) => {
                    setPrompt(finalPrompt);
                }}
                onAgentGenerateImage={(finalPrompt: string) => {
                    handleGenerate(finalPrompt, 'agent');
                }}
            />
            <CanvasSettings 
                isOpen={isSettingsPanelOpen} 
                onClose={() => setIsSettingsPanelOpen(false)} 
                language={language}
                setLanguage={setLanguage}
                themeMode={themeMode}
                resolvedTheme={resolvedTheme}
                setThemeMode={setThemeMode}
                wheelAction={wheelAction}
                setWheelAction={setWheelAction}
                userApiKeys={userApiKeys}
                onAddApiKey={handleAddApiKey}
                onDeleteApiKey={handleDeleteApiKey}
                onUpdateApiKey={handleUpdateApiKey}
                onSetDefaultApiKey={handleSetDefaultApiKey}
                modelPreference={modelPreference}
                setModelPreference={setModelPreference}
                t={t}
                clearKeysOnExit={clearKeysOnExit}
                setClearKeysOnExit={setClearKeysOnExit}
                usageSummary={usageSummaryMap}
                dynamicModelOptions={dynamicModelOptions}
            />
            {/* ============ 图层蒙版编辑浮动面板 ============ */}

            {/* ============ A/B 对比弹窗 ============ */}
            {abCompare && (
                <ABCompareOverlay
                    imageA={abCompare.imageA}
                    imageB={abCompare.imageB}
                    onClose={() => setAbCompare(null)}
                    theme={resolvedTheme}
                />
            )}

            {/* ============ 图层蒙版编辑浮动面板 (controls) ============ */}
            {maskEditingId && (() => {
                const maskEl = elements.find(e => e.id === maskEditingId) as ImageElement | undefined;
                if (!maskEl) return null;
                return (
                    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[9998] flex items-center gap-3 px-4 py-2.5 rounded-2xl shadow-2xl border"
                         style={{ background: resolvedTheme === 'dark' ? '#1C2333' : '#ffffff', borderColor: resolvedTheme === 'dark' ? '#2A3142' : '#e5e7eb' }}>
                        <span className={`text-sm font-medium ${resolvedTheme === 'dark' ? 'text-white' : 'text-gray-900'}`}>蒙版编辑</span>
                        <div className="h-5 w-px bg-gray-300" />
                        <button onClick={() => setMaskBrushMode('erase')}
                            className={`px-3 py-1 rounded-lg text-xs font-medium transition ${maskBrushMode === 'erase' ? 'bg-red-500 text-white' : (resolvedTheme === 'dark' ? 'bg-[#2A3142] text-gray-300' : 'bg-gray-100 text-gray-600')}`}>
                            擦除
                        </button>
                        <button onClick={() => setMaskBrushMode('reveal')}
                            className={`px-3 py-1 rounded-lg text-xs font-medium transition ${maskBrushMode === 'reveal' ? 'bg-green-500 text-white' : (resolvedTheme === 'dark' ? 'bg-[#2A3142] text-gray-300' : 'bg-gray-100 text-gray-600')}`}>
                            恢复
                        </button>
                        <div className="h-5 w-px bg-gray-300" />
                        <label className={`text-xs ${resolvedTheme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>笔刷</label>
                        <input type="range" min="5" max="100" value={maskBrushSize} onChange={e => setMaskBrushSize(Number(e.target.value))} className="w-20 h-1 accent-blue-500" />
                        <span className={`text-xs w-6 text-center ${resolvedTheme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>{maskBrushSize}</span>
                        <div className="h-5 w-px bg-gray-300" />
                        <button onClick={clearMask}
                            className={`px-3 py-1 rounded-lg text-xs font-medium transition ${resolvedTheme === 'dark' ? 'bg-[#2A3142] hover:bg-[#3A4458] text-gray-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-600'}`}>
                            清除蒙版
                        </button>
                        <button onClick={commitMask}
                            className="px-3 py-1 rounded-lg text-xs font-medium bg-blue-500 hover:bg-blue-600 text-white transition">
                            完成
                        </button>
                        <button onClick={cancelMask}
                            className={`px-3 py-1 rounded-lg text-xs font-medium transition ${resolvedTheme === 'dark' ? 'bg-[#2A3142] hover:bg-[#3A4458] text-gray-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-600'}`}>
                            取消
                        </button>
                    </div>
                );
            })()}

            {/* ============ 批量生成结果对比弹窗 ============ */}
            {batchResults && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm"
                     onClick={() => setBatchResults(null)}>
                    <div className={`relative rounded-2xl shadow-2xl p-6 max-w-[90vw] max-h-[90vh] overflow-auto ${resolvedTheme === 'dark' ? 'bg-[#1C2333] text-white' : 'bg-white text-gray-900'}`}
                         onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-semibold">批量生成结果 — 选择最佳方案</h3>
                            <div className="flex gap-2">
                                <button onClick={handleSelectAllBatchResults}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${resolvedTheme === 'dark' ? 'bg-[#2A3142] hover:bg-[#3A4458] text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'}`}>
                                    全部放入画布
                                </button>
                                <button onClick={() => setBatchResults(null)}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${resolvedTheme === 'dark' ? 'bg-[#2A3142] hover:bg-[#3A4458] text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'}`}>
                                    关闭
                                </button>
                            </div>
                        </div>
                        <p className={`text-sm mb-4 ${resolvedTheme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                            提示词: {batchResults.prompt}
                        </p>
                        <div className={`grid gap-4 ${batchResults.images.length <= 2 ? 'grid-cols-2' : 'grid-cols-2'}`}>
                            {batchResults.images.map((img, idx) => (
                                <div key={idx}
                                     className={`group relative rounded-xl overflow-hidden border-2 transition cursor-pointer hover:scale-[1.02] ${resolvedTheme === 'dark' ? 'border-[#2A3142] hover:border-blue-500' : 'border-gray-200 hover:border-blue-400'}`}
                                     onClick={() => handleSelectBatchResult(img)}>
                                    <img src={img.href} alt={`方案 ${idx + 1}`}
                                         className="w-full h-auto max-h-[40vh] object-contain"
                                         style={{ background: resolvedTheme === 'dark' ? '#0D1117' : '#F9FAFB' }} />
                                    <div className={`absolute bottom-0 inset-x-0 p-3 bg-gradient-to-t ${resolvedTheme === 'dark' ? 'from-black/80' : 'from-black/50'} to-transparent opacity-0 group-hover:opacity-100 transition`}>
                                        <div className="flex items-center justify-between">
                                            <span className="text-white text-sm font-medium">方案 {idx + 1}</span>
                                            <span className="text-white/80 text-xs">{img.width}×{img.height}</span>
                                        </div>
                                        <button className="mt-2 w-full py-1.5 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-xs font-medium transition">
                                            选择此方案
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* 新用户引导弹窗 — 无 API Key 时自动出现 */}
            <OnboardingWizard
                isOpen={showOnboarding}
                onClose={() => {
                    setShowOnboarding(false);
                    localStorage.setItem('onboarding.skipped', 'true');
                }}
                onAddApiKey={handleAddApiKey}
                resolvedTheme={resolvedTheme}
            />
            <Toolbar
                t={t}
                theme={resolvedTheme}
                compactScale={chromeMetrics.toolbarScale}
                topOffset={chromeMetrics.outerGap}
                leftClosed={chromeMetrics.toolbarLeftClosed}
                leftOpen={chromeMetrics.toolbarLeftOpen}
                activeTool={activeTool}
                setActiveTool={setActiveTool}
                drawingOptions={drawingOptions}
                setDrawingOptions={setDrawingOptions}
                onUpload={handleAddImageElement}
                isCropping={!!croppingState}
                onConfirmCrop={handleConfirmCrop}
                onCancelCrop={handleCancelCrop}
                onSettingsClick={() => setIsSettingsPanelOpen(true)}
                onLayersClick={() => setIsLayerMinimized(prev => !prev)}
                onBoardsClick={() => setIsLayerMinimized(prev => !prev)}
                onAssetsClick={() => setIsInspirationMinimized(prev => !prev)}
                onUndo={handleUndo}
                onRedo={handleRedo}
                isLayerPanelExpanded={!isLayerMinimized}
                onHeightChange={() => { /* reserved for aligning external buttons under toolbar */ }}
                onLeftChange={(left) => setToolbarLeft(left)}
                canUndo={historyIndex > 0}
                canRedo={historyIndex < history.length - 1}
            />
            {addAssetModal?.open && (
                <AssetAddModal 
                    isOpen={addAssetModal.open}
                    onClose={() => setAddAssetModal(null)}
                    previewDataUrl={addAssetModal.dataUrl}
                    onConfirm={(category, name) => {
                        const newItem: AssetItem = {
                            id: generateId(),
                            name,
                            category,
                            dataUrl: addAssetModal.dataUrl,
                            mimeType: addAssetModal.mimeType,
                            width: addAssetModal.width,
                            height: addAssetModal.height,
                            createdAt: Date.now(),
                        };
                        setAssetLibrary(prev => addAsset(prev, newItem));
                        setAddAssetModal(null);
                    }}
                />
            )}
            <div 
                className="compact-canvas-stage flex-grow relative overflow-hidden"
                style={{
                    paddingRight: chromeMetrics.isTablet ? `${chromeMetrics.outerGap}px` : `${rightPanelWidth + chromeMetrics.promptSideInset}px`,
                    paddingBottom: croppingState ? '0px' : `${chromeMetrics.canvasBottomInset}px`,
                    transition: 'padding-right 0.35s cubic-bezier(0.4, 0, 0.2, 1), padding-bottom 0.35s cubic-bezier(0.4, 0, 0.2, 1)'
                }}
            >
                <svg
                    ref={svgRef}
                    className="w-full h-full"
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                    onWheel={handleWheel}
                    onContextMenu={handleContextMenu}
                    style={{ cursor }}
                >
                    <defs>
                        <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
                            <circle cx="1" cy="1" r="1" className="fill-gray-400 opacity-50"/>
                        </pattern>
                         {elements.map(el => {
                            if (el.type === 'image' && el.borderRadius && el.borderRadius > 0) {
                                const clipPathId = `clip-${el.id}`;
                                return (
                                    <clipPath id={clipPathId} key={clipPathId}>
                                        <rect
                                            width={el.width}
                                            height={el.height}
                                            rx={el.borderRadius}
                                            ry={el.borderRadius}
                                        />
                                    </clipPath>
                                );
                            }
                            return null;
                        })}
                    </defs>
                    <g transform={`translate(${panOffset.x}, ${panOffset.y}) scale(${zoom})`}>
                        <rect x={-panOffset.x/zoom} y={-panOffset.y/zoom} width={`calc(100% / ${zoom})`} height={`calc(100% / ${zoom})`} fill="url(#grid)" />
                        
                        {elements.map(el => {
                            if (!isElementVisible(el, elements)) return null;

                            const isSelected = selectedElementIds.includes(el.id);
                            let selectionComponent = null;

                            if (isSelected && !croppingState) {
                                if (selectedElementIds.length > 1 || el.type === 'path' || el.type === 'arrow' || el.type === 'line' || el.type === 'group') {
                                     const bounds = getElementBounds(el, elements);
                                     selectionComponent = <rect x={bounds.x} y={bounds.y} width={bounds.width} height={bounds.height} fill="none" stroke="rgb(59 130 246)" strokeWidth={2/zoom} strokeDasharray={`${6/zoom} ${4/zoom}`} pointerEvents="none" />
                                } else if ((el.type === 'image' || el.type === 'shape' || el.type === 'text' || el.type === 'video')) {
                                    const handleSize = 8 / zoom;
                                    const handles = [
                                        { name: 'tl', x: el.x, y: el.y, cursor: 'nwse-resize' }, { name: 'tm', x: el.x + el.width / 2, y: el.y, cursor: 'ns-resize' }, { name: 'tr', x: el.x + el.width, y: el.y, cursor: 'nesw-resize' },
                                        { name: 'ml', x: el.x, y: el.y + el.height / 2, cursor: 'ew-resize' }, { name: 'mr', x: el.x + el.width, y: el.y + el.height / 2, cursor: 'ew-resize' },
                                        { name: 'bl', x: el.x, y: el.y + el.height, cursor: 'nesw-resize' }, { name: 'bm', x: el.x + el.width / 2, y: el.y + el.height, cursor: 'ns-resize' }, { name: 'br', x: el.x + el.width, y: el.y + el.height, cursor: 'nwse-resize' },
                                    ];
                                     selectionComponent = <g>
                                        <rect x={el.x} y={el.y} width={el.width} height={el.height} fill="none" stroke="rgb(59 130 246)" strokeWidth={2 / zoom} pointerEvents="none" />
                                        {handles.map(h => <rect key={h.name} data-handle={h.name} x={h.x - handleSize / 2} y={h.y - handleSize / 2} width={handleSize} height={handleSize} fill="white" stroke="#3b82f6" strokeWidth={1 / zoom} style={{ cursor: h.cursor }} />)}
                                    </g>;
                                }
                            }
                           
                            if (el.type === 'path') {
                                const pathData = el.points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
                                return <g key={el.id} data-id={el.id} className="cursor-pointer"><path d={pathData} stroke={el.strokeColor} strokeWidth={el.strokeWidth / zoom} fill="none" strokeLinecap="round" strokeLinejoin="round" pointerEvents="stroke" strokeOpacity={el.strokeOpacity} />{selectionComponent}</g>;
                            }
                            if (el.type === 'arrow') {
                                const [start, end] = el.points;
                                const angle = Math.atan2(end.y - start.y, end.x - start.x);
                                const headLength = el.strokeWidth * 4;

                                const arrowHeadHeight = headLength * Math.cos(Math.PI / 6);
                                const lineEnd = {
                                    x: end.x - arrowHeadHeight * Math.cos(angle),
                                    y: end.y - arrowHeadHeight * Math.sin(angle),
                                };

                                const headPoint1 = { x: end.x - headLength * Math.cos(angle - Math.PI / 6), y: end.y - headLength * Math.sin(angle - Math.PI / 6) };
                                const headPoint2 = { x: end.x - headLength * Math.cos(angle + Math.PI / 6), y: end.y - headLength * Math.sin(angle + Math.PI / 6) };
                                return (
                                    <g key={el.id} data-id={el.id} className="cursor-pointer">
                                        <line x1={start.x} y1={start.y} x2={lineEnd.x} y2={lineEnd.y} stroke={el.strokeColor} strokeWidth={el.strokeWidth / zoom} strokeLinecap="round" />
                                        <polygon points={`${end.x},${end.y} ${headPoint1.x},${headPoint1.y} ${headPoint2.x},${headPoint2.y}`} fill={el.strokeColor} />
                                        {selectionComponent}
                                    </g>
                                );
                            }
                            if (el.type === 'line') {
                                const [start, end] = el.points;
                                return (
                                    <g key={el.id} data-id={el.id} className="cursor-pointer">
                                        <line x1={start.x} y1={start.y} x2={end.x} y2={end.y} stroke={el.strokeColor} strokeWidth={el.strokeWidth / zoom} strokeLinecap="round" />
                                        {selectionComponent}
                                    </g>
                                );
                            }
                            if (el.type === 'text') {
                                const isEditing = editingElement?.id === el.id;
                                return (
                                    <g key={el.id} data-id={el.id} transform={`translate(${el.x}, ${el.y})`} className="cursor-pointer">
                                        {!isEditing && (
                                            <foreignObject width={el.width} height={el.height} style={{ overflow: 'visible' }}>
                                                <div style={{ fontSize: el.fontSize, color: el.fontColor, width: '100%', height: '100%', wordBreak: 'break-word' }}>
                                                    {el.text}
                                                </div>
                                            </foreignObject>
                                        )}
                                        {selectionComponent && React.cloneElement(selectionComponent, { transform: `translate(${-el.x}, ${-el.y})` })}
                                    </g>
                                )
                            }
                             if (el.type === 'shape') {
                                let shapeJsx;
                                if (el.shapeType === 'rectangle') shapeJsx = <rect width={el.width} height={el.height} rx={el.borderRadius || 0} ry={el.borderRadius || 0} />
                                else if (el.shapeType === 'circle') shapeJsx = <ellipse cx={el.width/2} cy={el.height/2} rx={el.width/2} ry={el.height/2} />
                                else if (el.shapeType === 'triangle') shapeJsx = <polygon points={`${el.width/2},0 0,${el.height} ${el.width},${el.height}`} />
                                return (
                                     <g key={el.id} data-id={el.id} transform={`translate(${el.x}, ${el.y})`} className="cursor-pointer">
                                        {shapeJsx && React.cloneElement(shapeJsx, { 
                                            fill: el.fillColor, 
                                            stroke: el.strokeColor, 
                                            strokeWidth: el.strokeWidth / zoom,
                                            strokeDasharray: el.strokeDashArray ? el.strokeDashArray.join(' ') : 'none'
                                        })}
                                        {selectionComponent && React.cloneElement(selectionComponent, { transform: `translate(${-el.x}, ${-el.y})` })}
                                    </g>
                                );
                            }
                            if (el.type === 'image') {
                                const hasBorderRadius = el.borderRadius && el.borderRadius > 0;
                                const clipPathId = `clip-${el.id}`;
                                const maskId = el.mask ? `mask-${el.id}` : undefined;
                                const cssFilter = buildCssFilter(el.filters);
                                const hasTemp = el.filters?.temperature && el.filters.temperature !== 0;
                                const hasSharpen = el.filters?.sharpen && el.filters.sharpen > 0;
                                const svgFilterId = (hasTemp || hasSharpen) ? `imgfilter-${el.id}` : undefined;
                                const combinedFilter = [cssFilter, svgFilterId ? `url(#${svgFilterId})` : ''].filter(Boolean).join(' ');
                                return (
                                    <g
                                        key={el.id}
                                        data-id={el.id}
                                    >
                                        {/* SVG filter defs for temperature / sharpen */}
                                        {svgFilterId && (
                                            <defs>
                                                <filter id={svgFilterId} colorInterpolationFilters="sRGB">
                                                    {hasTemp && <feColorMatrix type="matrix" values={temperatureMatrix(el.filters!.temperature!)} />}
                                                    {hasSharpen && <feConvolveMatrix order="3" kernelMatrix={sharpenKernel(el.filters!.sharpen!)} preserveAlpha="true" />}
                                                </filter>
                                            </defs>
                                        )}
                                        {/* Non-destructive layer mask — coordinates in element-local space (0,0) to match transform-based positioning */}
                                        {maskId && (
                                            <defs>
                                                <mask id={maskId} maskUnits="userSpaceOnUse" x={0} y={0} width={el.width} height={el.height}>
                                                    <image href={el.mask} x={0} y={0} width={el.width} height={el.height} />
                                                </mask>
                                            </defs>
                                        )}
                                        <image 
                                            transform={`translate(${el.x}, ${el.y})`} 
                                            href={el.href} 
                                            width={el.width} 
                                            height={el.height} 
                                            className={croppingState && croppingState.elementId !== el.id ? 'opacity-30' : ''} 
                                            clipPath={hasBorderRadius ? `url(#${clipPathId})` : undefined}
                                            mask={maskId ? `url(#${maskId})` : undefined}
                                            style={combinedFilter ? { filter: combinedFilter } : undefined}
                                        />
                                        {selectionComponent}
                                    </g>
                                );
                            }
                             if (el.type === 'video') {
                                return (
                                    <g key={el.id} data-id={el.id}>
                                        <foreignObject x={el.x} y={el.y} width={el.width} height={el.height}>
                                            <video 
                                                src={el.href} 
                                                controls 
                                                style={{ width: '100%', height: '100%', borderRadius: '8px' }}
                                                className={croppingState ? 'opacity-30' : ''}
                                            ></video>
                                        </foreignObject>
                                        {selectionComponent}
                                    </g>
                                );
                            }
                             if (el.type === 'group') {
                                return <g key={el.id} data-id={el.id}>{selectionComponent}</g>
                             }
                            return null;
                        })}

                        {lassoPath && (
                            <path d={lassoPath.map((p, i) => i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`).join(' ')} stroke="rgb(59 130 246)" strokeWidth={1 / zoom} strokeDasharray={`${4/zoom} ${4/zoom}`} fill="rgba(59, 130, 246, 0.1)" />
                        )}

                        {/* Inpaint mask overlay + prompt input */}
                        {inpaintState && (() => {
                            const pts = inpaintState.maskPoints;
                            const pathD = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z';
                            const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
                            const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
                            const promptBoxW = 320 / zoom;
                            const promptBoxH = 120 / zoom;
                            return (
                                <>
                                    {/* Animated dashed mask outline */}
                                    <path
                                        d={pathD}
                                        fill="rgba(239, 68, 68, 0.15)"
                                        stroke="#ef4444"
                                        strokeWidth={2 / zoom}
                                        strokeDasharray={`${6/zoom} ${4/zoom}`}
                                        pointerEvents="none"
                                    >
                                        <animate attributeName="stroke-dashoffset" from="0" to={`${20/zoom}`} dur="1s" repeatCount="indefinite" />
                                    </path>
                                    {/* Floating inpaint prompt box */}
                                    {inpaintState.promptVisible && (
                                        <foreignObject
                                            x={cx - promptBoxW / 2}
                                            y={cy - promptBoxH / 2}
                                            width={promptBoxW}
                                            height={promptBoxH}
                                            style={{ overflow: 'visible' }}
                                        >
                                            <div
                                                style={{
                                                    transform: `scale(${1 / zoom})`,
                                                    transformOrigin: 'top left',
                                                    width: 320,
                                                }}
                                                onMouseDown={e => e.stopPropagation()}
                                            >
                                                <div style={{
                                                    background: 'white',
                                                    borderRadius: 12,
                                                    boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
                                                    border: '2px solid #ef4444',
                                                    padding: 12,
                                                }}>
                                                    <div style={{ fontSize: 12, fontWeight: 600, color: '#ef4444', marginBottom: 8 }}>
                                                        🎯 AI 局部重绘
                                                    </div>
                                                    <textarea
                                                        value={inpaintPrompt}
                                                        onChange={e => setInpaintPrompt(e.target.value)}
                                                        placeholder="描述你想在选区内生成的内容..."
                                                        autoFocus
                                                        style={{
                                                            width: '100%',
                                                            height: 48,
                                                            border: '1px solid #d1d5db',
                                                            borderRadius: 8,
                                                            padding: '6px 10px',
                                                            fontSize: 13,
                                                            resize: 'none',
                                                            outline: 'none',
                                                        }}
                                                        onKeyDown={e => {
                                                            if (e.key === 'Enter' && !e.shiftKey) {
                                                                e.preventDefault();
                                                                handleInpaint();
                                                            }
                                                            if (e.key === 'Escape') {
                                                                setInpaintState(null);
                                                                setInpaintPrompt('');
                                                            }
                                                        }}
                                                    />
                                                    <div style={{ display: 'flex', gap: 8, marginTop: 8, justifyContent: 'flex-end' }}>
                                                        <button
                                                            onClick={() => { setInpaintState(null); setInpaintPrompt(''); }}
                                                            style={{
                                                                padding: '4px 12px',
                                                                fontSize: 12,
                                                                borderRadius: 6,
                                                                border: '1px solid #d1d5db',
                                                                background: 'white',
                                                                cursor: 'pointer',
                                                            }}
                                                        >
                                                            取消
                                                        </button>
                                                        <button
                                                            onClick={handleInpaint}
                                                            disabled={!inpaintPrompt.trim() || isLoading}
                                                            style={{
                                                                padding: '4px 16px',
                                                                fontSize: 12,
                                                                borderRadius: 6,
                                                                border: 'none',
                                                                background: inpaintPrompt.trim() ? '#ef4444' : '#fca5a5',
                                                                color: 'white',
                                                                cursor: inpaintPrompt.trim() ? 'pointer' : 'not-allowed',
                                                                fontWeight: 600,
                                                            }}
                                                        >
                                                            {isLoading ? '重绘中...' : '✨ 重绘'}
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        </foreignObject>
                                    )}
                                </>
                            );
                        })()}
                        
                        {alignmentGuides.map((guide, i) => (
                             <line key={i} x1={guide.type === 'v' ? guide.position : guide.start} y1={guide.type === 'h' ? guide.position : guide.start} x2={guide.type === 'v' ? guide.position : guide.end} y2={guide.type === 'h' ? guide.position : guide.end} stroke="red" strokeWidth={1/zoom} strokeDasharray={`${4/zoom} ${2/zoom}`} />
                        ))}

                        {selectedElementIds.length > 0 && !croppingState && !editingElement && (() => {
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
                                    <div className="p-1.5 bg-white rounded-lg shadow-lg flex items-center justify-start space-x-2 border border-gray-200 text-gray-800 overflow-x-auto">
                                        <button title={t('contextMenu.alignment.alignLeft')} onClick={() => handleAlignSelection('left')} className="p-2 rounded hover:bg-gray-100"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="4" y1="21" x2="4" y2="3"></line><rect x="8" y="6" width="8" height="4" rx="1"></rect><rect x="8" y="14" width="12" height="4" rx="1"></rect></svg></button>
                                        <button title={t('contextMenu.alignment.alignCenter')} onClick={() => handleAlignSelection('center')} className="p-2 rounded hover:bg-gray-100"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="21" x2="12" y2="3" strokeDasharray="2 2"></line><rect x="7" y="6" width="10" height="4" rx="1"></rect><rect x="4" y="14" width="16" height="4" rx="1"></rect></svg></button>
                                        <button title={t('contextMenu.alignment.alignRight')} onClick={() => handleAlignSelection('right')} className="p-2 rounded hover:bg-gray-100"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="20" y1="21" x2="20" y2="3"></line><rect x="12" y="6" width="8" height="4" rx="1"></rect><rect x="8" y="14" width="12" height="4" rx="1"></rect></svg></button>
                                        <div className="h-6 w-px bg-gray-200"></div>
                                        <button title={t('contextMenu.alignment.alignTop')} onClick={() => handleAlignSelection('top')} className="p-2 rounded hover:bg-gray-100"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="4" x2="21" y2="4"></line><rect x="6" y="8" width="4" height="8" rx="1"></rect><rect x="14" y="8" width="4" height="12" rx="1"></rect></svg></button>
                                        <button title={t('contextMenu.alignment.alignMiddle')} onClick={() => handleAlignSelection('middle')} className="p-2 rounded hover:bg-gray-100"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="12" x2="21" y2="12" strokeDasharray="2 2"></line><rect x="6" y="7" width="4" height="10" rx="1"></rect><rect x="14" y="4" width="4" height="16" rx="1"></rect></svg></button>
                                        <button title={t('contextMenu.alignment.alignBottom')} onClick={() => handleAlignSelection('bottom')} className="p-2 rounded hover:bg-gray-100"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="20" x2="21" y2="20"></line><rect x="6" y="12" width="4" height="8" rx="1"></rect><rect x="14" y="8" width="4" height="12" rx="1"></rect></svg></button>
                                    </div>
                                </div>;
                                return (
                                    <foreignObject x={x} y={y} width={toolbarCanvasWidth} height={toolbarCanvasHeight} style={{ overflow: 'visible' }}>
                                        {toolbar}
                                    </foreignObject>
                                );
                            } else if (singleSelectedElement) {
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
                                    <div className="p-1.5 bg-white rounded-lg shadow-lg flex items-center justify-start space-x-2 border border-gray-200 text-gray-800 overflow-x-auto">
                                        <button title={t('contextMenu.copy')} onClick={() => handleCopyElement(element)} className="p-2 rounded hover:bg-gray-100 flex items-center justify-center"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg></button>
                                        {element.type === 'image' && <button title={t('contextMenu.download')} onClick={() => handleDownloadImage(element)} className="p-2 rounded hover:bg-gray-100 flex items-center justify-center"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg></button>}
                                        {element.type === 'image' && <button title="Add to asset library" onClick={async () => {
                                                const { href, mimeType, width, height } = { href: (element as ImageElement).href, mimeType: (element as ImageElement).mimeType, width: (element as ImageElement).width, height: (element as ImageElement).height };
                                                setAddAssetModal({ open: true, dataUrl: href, mimeType, width, height });
                                            }} className="p-2 rounded hover:bg-gray-100 flex items-center justify-center">
                                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M8 12h8"/><path d="M12 8v8"/></svg>
                                            </button>}
                                        {element.type === 'image' && <button title="Split into layers with BANANA" onClick={() => handleSplitImageWithBanana(element)} className="p-2 rounded hover:bg-gray-100 flex items-center justify-center disabled:opacity-50" disabled={isLoading}>
                                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="8" height="8" rx="1"></rect><rect x="13" y="3" width="8" height="8" rx="1"></rect><rect x="3" y="13" width="8" height="8" rx="1"></rect><path d="M13 17h8"></path><path d="M17 13v8"></path></svg>
                                            </button>}
                                        {element.type === 'image' && <button title="BANANA Agent: upscale x2" onClick={() => handleUpscaleImageWithBanana(element)} className="p-2 rounded hover:bg-gray-100 flex items-center justify-center disabled:opacity-50" disabled={isLoading}>
                                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line><line x1="11" y1="8" x2="11" y2="14"></line><line x1="8" y1="11" x2="14" y2="11"></line></svg>
                                            </button>}
                                        {element.type === 'image' && <button title="BANANA Agent: remove background" onClick={() => handleRemoveBackgroundWithBanana(element)} className="p-2 rounded hover:bg-gray-100 flex items-center justify-center disabled:opacity-50" disabled={isLoading}>
                                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3l18 18"></path><path d="M20 12a8 8 0 0 1-11.31 7.31"></path><path d="M4 12a8 8 0 0 1 11.31-7.31"></path></svg>
                                            </button>}
                                        {element.type === 'video' && <a title={t('contextMenu.download')} href={element.href} download={`video-${element.id}.mp4`} className="p-2 rounded hover:bg-gray-100 flex items-center justify-center"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg></a>}
                                        {element.type === 'image' && <button title={t('contextMenu.crop')} onClick={() => handleStartCrop(element)} className="p-2 rounded hover:bg-gray-100 flex items-center justify-center"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6.13 1L6 16a2 2 0 0 0 2 2h15"></path><path d="M1 6.13L16 6a2 2 0 0 1 2 2v15"></path></svg></button>}
                                        {element.type === 'image' && <button title="调色 / Filters" onClick={() => setFilterPanelElementId(filterPanelElementId === element.id ? null : element.id)} className={`p-2 rounded flex items-center justify-center ${filterPanelElementId === element.id ? 'bg-blue-100 text-blue-600' : 'hover:bg-gray-100'}`}>
                                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="13.5" cy="6.5" r="2.5"></circle><circle cx="17.5" cy="10.5" r="2.5"></circle><circle cx="8.5" cy="7.5" r="2.5"></circle><circle cx="6.5" cy="12.5" r="2.5"></circle><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"></path></svg>
                                            </button>}
                                        {element.type === 'image' && (
                                            <div style={{ position: 'relative' }}>
                                                <button title="AI 扩图 / Outpaint" onClick={() => setOutpaintMenuId(outpaintMenuId === element.id ? null : element.id)} className={`p-2 rounded flex items-center justify-center ${outpaintMenuId === element.id ? 'bg-green-100 text-green-600' : 'hover:bg-gray-100'}`} disabled={isLoading}>
                                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 3 21 3 21 9"></polyline><polyline points="9 21 3 21 3 15"></polyline><line x1="21" y1="3" x2="14" y2="10"></line><line x1="3" y1="21" x2="10" y2="14"></line></svg>
                                                </button>
                                                {outpaintMenuId === element.id && (
                                                    <div style={{
                                                        position: 'absolute',
                                                        top: '100%',
                                                        left: '50%',
                                                        transform: 'translateX(-50%)',
                                                        background: 'white',
                                                        borderRadius: 10,
                                                        boxShadow: '0 8px 24px rgba(0,0,0,0.16)',
                                                        border: '1px solid #e5e7eb',
                                                        padding: 8,
                                                        zIndex: 100,
                                                        whiteSpace: 'nowrap',
                                                        minWidth: 140,
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
                                                                onMouseEnter={e => (e.currentTarget.style.background = '#f3f4f6')}
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
                                            <button title="图层蒙版 / Layer Mask" onClick={() => startMaskEditing(element.id)} className={`p-2 rounded flex items-center justify-center ${maskEditingId === element.id ? 'bg-purple-100 text-purple-600' : 'hover:bg-gray-100'}`}>
                                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"></rect><path d="M12 3v18"></path><path d="M3 12h9"></path></svg>
                                            </button>
                                        )}
                                        
                                        {element.type === 'shape' && (
                                            <>
                                                <input type="color" title={t('contextMenu.fillColor')} value={element.fillColor} onChange={e => handlePropertyChange(element.id, { fillColor: e.target.value })} className="w-7 h-7 p-0 border-none rounded cursor-pointer" />
                                                <div className="h-6 w-px bg-gray-200"></div>
                                                <input type="color" title={t('contextMenu.strokeColor')} value={element.strokeColor} onChange={e => handlePropertyChange(element.id, { strokeColor: e.target.value })} className="w-7 h-7 p-0 border-none rounded cursor-pointer" />
                                                <div className="h-6 w-px bg-gray-200"></div>
                                                <div title={t('contextMenu.strokeStyle')} className="flex items-center space-x-1 p-1 bg-gray-100 rounded-md">
                                                    <button title={t('contextMenu.solid')} onClick={() => handlePropertyChange(element.id, { strokeDashArray: undefined })} className={`p-1 rounded ${!element.strokeDashArray ? 'bg-blue-200' : 'hover:bg-gray-200'}`}>
                                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                                                    </button>
                                                    <button title={t('contextMenu.dashed')} onClick={() => handlePropertyChange(element.id, { strokeDashArray: [10, 10] })} className={`p-1 rounded ${element.strokeDashArray?.toString() === '10,10' ? 'bg-blue-200' : 'hover:bg-gray-200'}`}>
                                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="5" y1="12" x2="9" y2="12"></line><line x1="15" y1="12" x2="19" y2="12"></line></svg>
                                                    </button>
                                                    <button title={t('contextMenu.dotted')} onClick={() => handlePropertyChange(element.id, { strokeDashArray: [2, 6] })} className={`p-1 rounded ${element.strokeDashArray?.toString() === '2,6' ? 'bg-blue-200' : 'hover:bg-gray-200'}`}>
                                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="5" y1="12" x2="5.01" y2="12"></line><line x1="12" y1="12" x2="12.01" y2="12"></line><line x1="19" y1="12" x2="19.01" y2="12"></line></svg>
                                                    </button>
                                                </div>
                                            </>
                                        )}
                                         
                                        {element.type === 'text' && <input type="color" title={t('contextMenu.fontColor')} value={element.fontColor} onChange={e => handlePropertyChange(element.id, { fontColor: e.target.value })} className="w-7 h-7 p-0 border-none rounded cursor-pointer" />}
                                        {element.type === 'text' && <input type="number" title={t('contextMenu.fontSize')} value={element.fontSize} onChange={e => handlePropertyChange(element.id, { fontSize: parseInt(e.target.value, 10) || 16 })} className="w-16 p-1 border rounded bg-gray-100 text-gray-800" />}
                                        {(element.type === 'arrow' || element.type === 'line') && <input type="color" title={t('contextMenu.strokeColor')} value={element.strokeColor} onChange={e => handlePropertyChange(element.id, { strokeColor: e.target.value })} className="w-7 h-7 p-0 border-none rounded cursor-pointer" />}
                                        {(element.type === 'arrow' || element.type === 'line') && <input type="range" title={t('contextMenu.strokeWidth')} min="1" max="50" value={element.strokeWidth} onChange={e => handlePropertyChange(element.id, { strokeWidth: parseInt(e.target.value, 10) })} className="w-20" />}
                                        <div className="h-6 w-px bg-gray-200"></div>
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
                                                            filters={element.filters || {}}
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
                            return null;
                        })()}
                        {editingElement && (() => {
                             const element = elements.find(el => el.id === editingElement.id) as TextElement;
                             if (!element) return null;
                             return <foreignObject 
                                x={element.x} y={element.y} width={element.width} height={element.height}
                                onMouseDown={(e) => e.stopPropagation()}
                             >
                                <textarea
                                    ref={editingTextareaRef}
                                    value={editingElement.text}
                                    onChange={(e) => setEditingElement({ ...editingElement, text: e.target.value })}
                                    onBlur={() => handleStopEditing()}
                                    placeholder={t('editor.editText')}
                                    title={t('editor.editText')}
                                    style={{
                                        width: '100%', height: '100%', border: 'none', padding: 0, margin: 0,
                                        outline: 'none', resize: 'none', background: 'transparent',
                                        fontSize: element.fontSize, color: element.fontColor,
                                        overflow: 'hidden'
                                    }}
                                 />
                             </foreignObject>
                        })()}
                        {croppingState && (
                             <g>
                                <path
                                    d={`M ${-panOffset.x/zoom},${-panOffset.y/zoom} H ${window.innerWidth/zoom - panOffset.x/zoom} V ${window.innerHeight/zoom - panOffset.y/zoom} H ${-panOffset.x/zoom} Z M ${croppingState.cropBox.x},${croppingState.cropBox.y} v ${croppingState.cropBox.height} h ${croppingState.cropBox.width} v ${-croppingState.cropBox.height} Z`}
                                    fill="rgba(0,0,0,0.5)"
                                    fillRule="evenodd"
                                    pointerEvents="none"
                                />
                                <rect x={croppingState.cropBox.x} y={croppingState.cropBox.y} width={croppingState.cropBox.width} height={croppingState.cropBox.height} fill="none" stroke="white" strokeWidth={2 / zoom} pointerEvents="all" />
                                {(() => {
                                    const { x, y, width, height } = croppingState.cropBox;
                                    const handleSize = 10 / zoom;
                                    const handles = [
                                        { name: 'tl', x, y, cursor: 'nwse-resize' }, { name: 'tr', x: x + width, y, cursor: 'nesw-resize' },
                                        { name: 'bl', x, y: y + height, cursor: 'nesw-resize' }, { name: 'br', x: x + width, y: y + height, cursor: 'nwse-resize' },
                                    ];
                                    return handles.map(h => <rect key={h.name} data-handle={h.name} x={h.x - handleSize/2} y={h.y - handleSize/2} width={handleSize} height={handleSize} fill="white" stroke="#3b82f6" strokeWidth={1/zoom} style={{ cursor: h.cursor }}/>)
                                })()}
                            </g>
                        )}
                        {selectionBox && (
                             <rect
                                x={selectionBox.x}
                                y={selectionBox.y}
                                width={selectionBox.width}
                                height={selectionBox.height}
                                fill="rgba(59, 130, 246, 0.1)"
                                stroke="rgb(59, 130, 246)"
                                strokeWidth={1 / zoom}
                            />
                        )}
                    </g>
                </svg>
                 {contextMenu && (() => {
                    const hasDrawableSelection = elements.some(el => selectedElementIds.includes(el.id) && el.type !== 'image' && el.type !== 'video');
                    const isGroupable = selectedElementIds.length > 1;
                    const isUngroupable = selectedElementIds.length === 1 && elements.find(el => el.id === selectedElementIds[0])?.type === 'group';

                    return (
                        <div style={{ top: contextMenu.y, left: contextMenu.x }} className="absolute z-30 bg-white rounded-md shadow-lg border border-gray-200 text-sm py-1 text-gray-800" onContextMenu={e => e.stopPropagation()}>
                           {isGroupable && <button onClick={handleGroup} className="block w-full text-left px-4 py-1.5 hover:bg-gray-100">{t('contextMenu.group')}</button>}
                           {isUngroupable && <button onClick={handleUngroup} className="block w-full text-left px-4 py-1.5 hover:bg-gray-100">{t('contextMenu.ungroup')}</button>}
                           {(isGroupable || isUngroupable) && <div className="border-t border-gray-100 my-1"></div>}
                            
                            {contextMenu.elementId && (<>
                                <button onClick={() => handleLayerAction(contextMenu.elementId!, 'forward')} className="block w-full text-left px-4 py-1.5 hover:bg-gray-100">{t('contextMenu.bringForward')}</button>
                                <button onClick={() => handleLayerAction(contextMenu.elementId!, 'backward')} className="block w-full text-left px-4 py-1.5 hover:bg-gray-100">{t('contextMenu.sendBackward')}</button>
                                <div className="border-t border-gray-100 my-1"></div>
                                <button onClick={() => handleLayerAction(contextMenu.elementId!, 'front')} className="block w-full text-left px-4 py-1.5 hover:bg-gray-100">{t('contextMenu.bringToFront')}</button>
                                <button onClick={() => handleLayerAction(contextMenu.elementId!, 'back')} className="block w-full text-left px-4 py-1.5 hover:bg-gray-100">{t('contextMenu.sendToBack')}</button>
                            </>)}
                            
                            {hasDrawableSelection && (
                                <>
                                    <div className="border-t border-gray-100 my-1"></div>
                                    <button onClick={handleRasterizeSelection} className="block w-full text-left px-4 py-1.5 hover:bg-gray-100">{t('contextMenu.rasterize')}</button>
                                </>
                            )}
                            {/* A/B Compare: show when right-clicking an image and there's at least 1 other image or history item */}
                            {contextMenu.elementId && (() => {
                                const ctxEl = elements.find(e => e.id === contextMenu.elementId);
                                if (!ctxEl || ctxEl.type !== 'image') return null;
                                const otherImages = elements.filter(e => e.type === 'image' && e.id !== ctxEl.id) as ImageElement[];
                                const hasCompareTarget = otherImages.length > 0 || generationHistory.length > 0;
                                if (!hasCompareTarget) return null;
                                return (
                                    <>
                                        <div className="border-t border-gray-100 my-1"></div>
                                        {otherImages.slice(0, 3).map(other => (
                                            <button key={other.id} onClick={() => {
                                                setAbCompare({
                                                    imageA: { src: (ctxEl as ImageElement).href, label: ctxEl.name || 'A' },
                                                    imageB: { src: other.href, label: other.name || 'B' },
                                                });
                                                setContextMenu(null);
                                            }} className="block w-full text-left px-4 py-1.5 hover:bg-gray-100 truncate max-w-[200px]">
                                                A/B 对比: {other.name || other.id.slice(0, 6)}
                                            </button>
                                        ))}
                                        {generationHistory.length > 0 && (
                                            <button onClick={() => {
                                                const latest = generationHistory[0];
                                                setAbCompare({
                                                    imageA: { src: (ctxEl as ImageElement).href, label: ctxEl.name || '当前' },
                                                    imageB: { src: latest.dataUrl, label: latest.name || latest.prompt.slice(0, 20) || '历史' },
                                                });
                                                setContextMenu(null);
                                            }} className="block w-full text-left px-4 py-1.5 hover:bg-gray-100">
                                                A/B 对比: 最近生成
                                            </button>
                                        )}
                                    </>
                                );
                            })()}
                        </div>
                    );
                })()}
            </div>
            {!croppingState && (
                <div 
                    className="compact-prompt-dock absolute bottom-0 left-0 right-0 z-[40] transition-all duration-300 ease-out flex flex-col items-center pointer-events-none"
                    style={{
                        paddingLeft: chromeMetrics.isTablet ? `${chromeMetrics.promptSideInset}px` : `${isLayerMinimized ? chromeMetrics.outerGap : chromeMetrics.sidebarWidth + chromeMetrics.outerGap + 8}px`,
                        paddingRight: chromeMetrics.isTablet ? `${chromeMetrics.promptSideInset}px` : `${rightPanelWidth + chromeMetrics.promptSideInset}px`,
                        paddingBottom: `${chromeMetrics.promptDockBottom}px`
                    }}
                >
                    {/* 自省诊断条 — 显示 API Key 能力覆盖状态 */}
                    <div className="pointer-events-auto mb-1.5">
                        <DiagnosticBar
                            userApiKeys={userApiKeys}
                            theme={resolvedTheme}
                            onOpenSettings={() => setIsSettingsPanelOpen(true)}
                        />
                    </div>
                    <div className="compact-prompt-dock__inner pointer-events-auto w-full transition-transform hover:-translate-y-0.5 duration-300 drop-shadow-xl" style={{ maxWidth: `${chromeMetrics.promptMaxWidth}px` }}>
                        <PromptBar 
                            t={t}
                            theme={resolvedTheme}
                            compactMode={chromeMetrics.isTablet}
                            prompt={prompt} 
                            setPrompt={setPrompt} 
                            onGenerate={() => {
                                if (batchCount > 1) {
                                    handleBatchGenerate();
                                } else {
                                    handleGenerate(undefined, 'prompt');
                                }
                            }} 
                            isLoading={isLoading} 
                            isSelectionActive={isSelectionActive} 
                            selectedElementCount={selectedElementIds.length}
                            onAddUserEffect={handleAddUserEffect}
                            userEffects={userEffects}
                            onDeleteUserEffect={handleDeleteUserEffect}
                            generationMode={generationMode}
                            setGenerationMode={setGenerationMode}
                            videoAspectRatio={videoAspectRatio}
                            setVideoAspectRatio={setVideoAspectRatio}
                            selectedTextModel={modelPreference.textModel}
                            selectedImageModel={modelPreference.imageModel}
                            selectedVideoModel={modelPreference.videoModel}
                            textModelOptions={dynamicModelOptions.text}
                            imageModelOptions={dynamicModelOptions.image}
                            videoModelOptions={dynamicModelOptions.video}
                            onTextModelChange={(model) => setModelPreference(prev => ({ ...prev, textModel: model }))}
                            onImageModelChange={(model) => setModelPreference(prev => ({ ...prev, imageModel: model }))}
                            onVideoModelChange={(model) => setModelPreference(prev => ({ ...prev, videoModel: model }))}
                            canvasElements={elements}
                            attachments={promptAttachments}
                            onAddAttachments={handleAddPromptAttachmentFiles}
                            onRemoveAttachment={handleRemovePromptAttachment}
                            onMentionedElementIds={setMentionedElementIds}
                            onEnhancePrompt={handleEnhancePrompt}
                            isEnhancingPrompt={isEnhancingPrompt}
                            isAutoEnhanceEnabled={isAutoEnhanceEnabled}
                            onAutoEnhanceToggle={() => setIsAutoEnhanceEnabled(prev => !prev)}
                            onLockCharacterFromSelection={handleLockCharacterFromSelection}
                            canLockCharacter={!!selectedSingleImage}
                            characterLocks={characterLocks}
                            activeCharacterLockId={activeCharacterLockId}
                            onSetActiveCharacterLock={handleSetActiveCharacterLock}
                            apiConfigs={userApiKeys}
                            activeApiConfigId={activeUserKeyId}
                            activeApiModelId={activeUserModelId}
                            onApiConfigChange={handleUserKeyChange}
                            onApiModelChange={setActiveUserModelId}
                            userApiKeys={userApiKeys}
                            onOpenSettings={() => setIsSettingsPanelOpen(true)}
                            batchCount={batchCount}
                            onBatchCountChange={setBatchCount}
                        />
                    </div>
                    {/* 底部法律链接 */}
                    <div className="pointer-events-auto flex items-center gap-2 mt-1 text-[10px] opacity-40 hover:opacity-70 transition-opacity select-none">
                        <button className="underline-offset-2 hover:underline cursor-pointer bg-transparent border-none p-0 text-inherit text-[10px]" onClick={() => openLegalModal('terms')}>使用条款</button>
                        <span>·</span>
                        <button className="underline-offset-2 hover:underline cursor-pointer bg-transparent border-none p-0 text-inherit text-[10px]" onClick={() => openLegalModal('privacy')}>隐私政策</button>
                    </div>
                </div>
            )}

            {/* 法律文档弹窗 */}
            {legalModal && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setLegalModal(null)}>
                    <div
                        className="relative w-[90vw] max-w-[680px] max-h-[80vh] rounded-2xl shadow-2xl overflow-hidden flex flex-col"
                        style={{ background: resolvedTheme === 'dark' ? '#1e1e24' : '#fff', color: resolvedTheme === 'dark' ? '#e0e0e0' : '#222' }}
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: resolvedTheme === 'dark' ? '#333' : '#e5e5e5' }}>
                            <h2 className="text-lg font-semibold m-0">{legalModal === 'terms' ? '使用条款' : '隐私政策'}</h2>
                            <button className="text-2xl leading-none cursor-pointer bg-transparent border-none p-1" style={{ color: resolvedTheme === 'dark' ? '#888' : '#666' }} onClick={() => setLegalModal(null)}>×</button>
                        </div>
                        <div className="overflow-y-auto px-6 py-5 text-sm leading-relaxed legal-markdown" style={{ whiteSpace: 'pre-wrap' }}>
                            {legalContent || '加载中…'}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default App;

