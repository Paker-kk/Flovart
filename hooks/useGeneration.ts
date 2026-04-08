import { useState, useCallback } from 'react';
import type {
    Element, ImageElement, PathElement, GroupElement, VideoElement,
    UserApiKey, ModelPreference, PromptEnhanceMode, GenerationHistoryItem,
    CharacterLockProfile, ChatAttachment, AICapability, AIProvider,
} from '../types';
import { generateId, getElementBounds, rasterizeElement, rasterizeMask } from '../utils/canvasHelpers';
import { splitImageByBanana, runBananaImageAgent } from '../services/bananaService';
import {
    editImageWithProvider, enhancePromptWithProvider, generateImageWithProvider, generateVideoWithProvider,
    inferProviderFromModel, inferCapabilitiesByProvider, PROVIDER_LABELS, supportsMaskImageEditing, supportsReferenceImageEditing,
    DEFAULT_PROVIDER_MODELS,
} from '../services/aiGateway';
import { addGenerationHistoryItem } from '../utils/generationHistory';
import { recordApiUsage } from '../utils/usageMonitor';
import { generateId, getElementBounds, rasterizeElement, rasterizeMask } from '../utils/canvasHelpers';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface UseGenerationParams {
    // state
    elements: Element[];
    selectedElementIds: string[];
    prompt: string;
    generationMode: 'image' | 'video' | 'keyframe';
    videoAspectRatio: '16:9' | '9:16';
    isAutoEnhanceEnabled: boolean;
    mentionedElementIds: string[];
    chatAttachments: ChatAttachment[];
    promptAttachments: ChatAttachment[];
    activeCharacterLock: CharacterLockProfile | null;
    batchCount: number;
    inpaintState: { targetImageId: string; maskPoints: { x: number; y: number }[]; promptVisible: boolean } | null;
    inpaintPrompt: string;
    modelPreference: ModelPreference;
    userApiKeys: UserApiKey[];

    // refs from useCanvasInteraction
    svgRef: React.RefObject<SVGSVGElement | null>;
    getCanvasPoint: (clientX: number, clientY: number) => { x: number; y: number };

    // setters
    setSelectedElementIds: (ids: string[]) => void;
    setIsLoading: (v: boolean) => void;
    setError: (v: string | null) => void;
    setProgressMessage: (v: string) => void;
    setIsSettingsPanelOpen: (v: boolean) => void;
    setGenerationHistory: React.Dispatch<React.SetStateAction<GenerationHistoryItem[]>>;
    setInpaintState: (v: null) => void;
    setInpaintPrompt: (v: string) => void;
    commitAction: (updater: (prev: Element[]) => Element[]) => void;
    getPreferredApiKey: (capability: AICapability, provider?: AIProvider) => UserApiKey | undefined;
}

/* ------------------------------------------------------------------ */
/*  Hook                                                               */
/* ------------------------------------------------------------------ */

export function useGeneration(params: UseGenerationParams) {
    const {
        elements, selectedElementIds, prompt, generationMode, videoAspectRatio,
        isAutoEnhanceEnabled, mentionedElementIds, chatAttachments, promptAttachments,
        activeCharacterLock, batchCount, inpaintState, inpaintPrompt,
        modelPreference, userApiKeys,
        svgRef, getCanvasPoint,
        setSelectedElementIds, setIsLoading, setError, setProgressMessage,
        setIsSettingsPanelOpen, setGenerationHistory, setInpaintState, setInpaintPrompt,
        commitAction, getPreferredApiKey,
    } = params;

    /* ---- local state ---- */
    const [isEnhancingPrompt, setIsEnhancingPrompt] = useState(false);
    const [batchResults, setBatchResults] = useState<{
        prompt: string;
        images: { href: string; mimeType: string; width: number; height: number }[];
    } | null>(null);

    /* ---- helpers ---- */

    /** 智能解析模型+Key：如果当前模型的 Provider 没有健康 Key，自动降级到任意可用 Key */
    const resolveModelKey = useCallback((capability: 'image' | 'video' | 'text', currentModel: string) => {
        const provider = inferProviderFromModel(currentModel);
        const healthyKeys = userApiKeys.filter(k => k.status !== 'error');
        const directKey = healthyKeys.find(k => {
            const caps = k.capabilities?.length ? k.capabilities : inferCapabilitiesByProvider(k.provider);
            return caps.includes(capability) && k.provider === provider;
        });
        if (directKey) return { model: currentModel, provider, key: directKey };
        for (const key of healthyKeys) {
            const caps = key.capabilities?.length ? key.capabilities : inferCapabilitiesByProvider(key.provider);
            if (!caps.includes(capability)) continue;
            const models = DEFAULT_PROVIDER_MODELS[key.provider]?.[capability];
            const fallbackModel = models?.[0] || key.customModels?.[0] || key.defaultModel;
            if (fallbackModel) return { model: fallbackModel, provider: key.provider, key };
        }
        return null;
    }, [userApiKeys]);

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
    }, [modelPreference, userApiKeys, setGenerationHistory]);

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
        outputMimeType?: string,
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

    /* ---- Banana handlers ---- */

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
            setProgressMessage('BANANA Agent 正在放大图片...');
            const result = await runBananaImageAgent(
                { href: element.href, mimeType: element.mimeType },
                'upscale',
                { scale: 2 },
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
            setProgressMessage('BANANA Agent 正在移除背景...');
            const result = await runBananaImageAgent(
                { href: element.href, mimeType: element.mimeType },
                'remove-background',
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

    /* ---- Outpaint ---- */

    const handleOutpaint = async (element: ImageElement, direction: 'all' | 'left' | 'right' | 'up' | 'down', expandRatio = 0.3) => {
        const outpaintResolved = resolveModelKey('image', modelPreference.imageModel);
        if (!outpaintResolved) {
            setError('未找到可用于 AI 扩图的 API Key，请先在设置中配置。');
            setIsSettingsPanelOpen(true);
            return;
        }

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

            const expandCanvas = document.createElement('canvas');
            expandCanvas.width = nw;
            expandCanvas.height = nh;
            const ectx = expandCanvas.getContext('2d')!;
            ectx.fillStyle = '#808080';
            ectx.fillRect(0, 0, nw, nh);
            ectx.drawImage(img, padL, padT, ow, oh);
            const expandedDataUrl = expandCanvas.toDataURL('image/png');

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

            const result = await editImageWithProvider(
                [{ href: expandedDataUrl, mimeType: 'image/png' }],
                `Seamlessly extend the image content outward. Continue the existing scene, lighting, and style naturally into the new areas. Do not change or alter the original central area.`,
                outpaintResolved.model,
                outpaintResolved.key,
                { mask: { href: maskDataUrl, mimeType: 'image/png' } },
            );

            if (result && result.newImageBase64) {
                const newMime = result.newImageMimeType || 'image/png';
                const newHref = `data:${newMime};base64,${result.newImageBase64}`;
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

    /* ---- buildMentionAwarePrompt ---- */

    const buildMentionAwarePrompt = useCallback((
        rawPrompt: string,
        mentionedImages: ImageElement[],
    ): { prompt: string; orderedMentionImages: { href: string; mimeType: string }[] } => {
        if (mentionedImages.length === 0) {
            return { prompt: rawPrompt, orderedMentionImages: [] };
        }

        const mentionOrder: { element: ImageElement; index: number }[] = [];
        for (const el of mentionedImages) {
            const escapedName = (el.name || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(`@${escapedName}\\b`, 'i');
            const match = rawPrompt.match(regex);
            mentionOrder.push({ element: el, index: match ? match.index! : Infinity });
        }
        mentionOrder.sort((a, b) => a.index - b.index);

        let processedPrompt = rawPrompt;
        const orderedImages: { href: string; mimeType: string }[] = [];
        mentionOrder.forEach(({ element }, idx) => {
            const escapedName = (element.name || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(`@${escapedName}\\b`, 'gi');
            processedPrompt = processedPrompt.replace(regex, `[参考图${idx + 1}]`);
            orderedImages.push({ href: element.href, mimeType: element.mimeType });
        });

        if (orderedImages.length > 1) {
            const mapping = orderedImages.map((_, i) => `[参考图${i + 1}]`).join('、');
            processedPrompt = `以下提示词中包含 ${mapping} 分别对应按顺序传入的参考图片。\n${processedPrompt}`;
        }

        return { prompt: processedPrompt, orderedMentionImages: orderedImages };
    }, []);

    /* ---- Inpaint ---- */

    const handleInpaint = async () => {
        if (!inpaintState || !inpaintPrompt.trim()) return;
        const targetImage = elements.find(el => el.id === inpaintState.targetImageId) as ImageElement | undefined;
        if (!targetImage) { setInpaintState(null); return; }

        const inpaintResolved = resolveModelKey('image', modelPreference.imageModel);
        if (!inpaintResolved) {
            setError('未找到可用于图片编辑的 API Key，请先在设置中配置。');
            setIsSettingsPanelOpen(true);
            return;
        }

        setIsLoading(true);
        setError(null);
        setProgressMessage('正在生成 AI 局部重绘 mask...');

        try {
            const { width, height, x: imgX, y: imgY } = targetImage;
            const maskCanvas = document.createElement('canvas');
            maskCanvas.width = width;
            maskCanvas.height = height;
            const maskCtx = maskCanvas.getContext('2d')!;

            maskCtx.fillStyle = 'black';
            maskCtx.fillRect(0, 0, width, height);

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

            const result = await editImageWithProvider(
                [{ href: targetImage.href, mimeType: targetImage.mimeType }],
                inpaintPrompt.trim(),
                inpaintResolved.model,
                inpaintResolved.key,
                { mask: { href: maskDataUrl, mimeType: 'image/png' } },
            );

            if (result && result.newImageBase64) {
                const newMime = result.newImageMimeType || 'image/png';
                commitAction(prev => prev.map(el =>
                    el.id === targetImage.id
                        ? { ...el, href: `data:${newMime};base64,${result.newImageBase64}`, mimeType: newMime }
                        : el
                ));

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

    /* ---- Main generate ---- */

    const handleGenerate = async (promptOverride?: string, source: 'prompt' | 'right' | 'agent' = 'prompt') => {
        let rawPrompt = (promptOverride ?? prompt).trim();
        if (!rawPrompt) {
            setError('请输入提示词。');
            return;
        }

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

        const neededCapability: 'image' | 'video' = generationMode === 'video' ? 'video' : 'image';

        const imageResolved = resolveModelKey('image', modelPreference.imageModel);
        const videoResolved = resolveModelKey('video', modelPreference.videoModel);
        const activeResolved = neededCapability === 'video' ? videoResolved : imageResolved;

        if (!activeResolved) {
            const capLabel = neededCapability === 'video' ? '视频' : '图片';
            setError(`未配置${capLabel}生成所需的 API Key。点击右上角 ⚙️ 设置添加。`);
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
        const resolvedImageModel = imageResolved?.model || modelPreference.imageModel;
        const resolvedVideoModel = videoResolved?.model || modelPreference.videoModel;
        const imageProvider = imageResolved?.provider || inferProviderFromModel(modelPreference.imageModel);
        const videoProvider = videoResolved?.provider || inferProviderFromModel(modelPreference.videoModel);
        const resolvedImageKey = imageResolved?.key || getPreferredApiKey('image', imageProvider);
        const resolvedVideoKey = videoResolved?.key || getPreferredApiKey('video', videoProvider);
        const supportsReferenceEditing = supportsReferenceImageEditing(resolvedImageModel);
        const supportsMaskEditing = supportsMaskImageEditing(resolvedImageModel);
        const imageOutputName = generationMode === 'keyframe' ? 'Keyframe' : 'Generated Image';

        if (generationMode === 'keyframe') {
            try {
                const mentionedImages = mentionedElementIds
                    .map(id => elements.find(el => el.id === id))
                    .filter((el): el is ImageElement => !!el && el.type === 'image');
                const selectedImages = elements
                    .filter(el => selectedElementIds.includes(el.id) && el.type === 'image') as ImageElement[];
                const allFrameRefs = [...selectedImages, ...mentionedImages];

                if (allFrameRefs.length < 1) {
                    setError('首尾帧模式至少需要 1 张参考图（选中或 @引用画布图片）作为起始帧。');
                    setIsLoading(false);
                    return;
                }

                const startFrame = allFrameRefs[0];
                const keyframePrompt = allFrameRefs.length >= 2
                    ? `Animate a smooth cinematic transition from the first frame to the second frame. ${effectivePrompt}`
                    : `Animate this image with smooth motion. ${effectivePrompt}`;

                setProgressMessage('正在生成首尾帧过渡动画...');
                const { videoBlob, mimeType } = await generateVideoWithProvider(
                    keyframePrompt,
                    resolvedVideoModel,
                    resolvedVideoKey,
                    {
                        aspectRatio: videoAspectRatio,
                        onProgress: (message) => setProgressMessage(message),
                        image: { href: startFrame.href, mimeType: startFrame.mimeType },
                    },
                );

                setProgressMessage('处理视频中...');
                const videoUrl = URL.createObjectURL(videoBlob);
                const video = document.createElement('video');

                video.onloadedmetadata = () => {
                    if (!svgRef.current) return;

                    let newWidth = video.videoWidth;
                    let newHeight = video.videoHeight;
                    const MAX_DIM = 800;
                    if (newWidth > MAX_DIM || newHeight > MAX_DIM) {
                        const ratio = newWidth / newHeight;
                        if (ratio > 1) { newWidth = MAX_DIM; newHeight = MAX_DIM / ratio; }
                        else { newHeight = MAX_DIM; newWidth = MAX_DIM * ratio; }
                    }

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
                    } catch { /* thumbnail failure doesn't block main flow */ }

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
                const selectedElements = elements.filter(el => selectedElementIds.includes(el.id));
                const imageElement = selectedElements.find(el => el.type === 'image') as ImageElement | undefined;
                const attachmentImage = activeAttachments[0];

                const mentionedImages = mentionedElementIds
                    .map(id => elements.find(el => el.id === id))
                    .filter((el): el is ImageElement => !!el && el.type === 'image');

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

                const { videoBlob, mimeType } = await generateVideoWithProvider(
                    effectivePrompt,
                    resolvedVideoModel,
                    resolvedVideoKey,
                    {
                        aspectRatio: videoAspectRatio,
                        onProgress: (message) => setProgressMessage(message),
                        image: baseVideoReference,
                    },
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
                        if (ratio > 1) { newWidth = MAX_DIM; newHeight = MAX_DIM / ratio; }
                        else { newHeight = MAX_DIM; newWidth = MAX_DIM * ratio; }
                    }

                    const svgBounds = svgRef.current!.getBoundingClientRect();
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
                    } catch { /* thumbnail failure doesn't block main flow */ }

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
                console.error('Video generation failed:', error);
                setIsLoading(false);
            }
            return;
        }

        // IMAGE GENERATION LOGIC
        try {
            const isEditing = selectedElementIds.length > 0;

            const mentionedImageElements = mentionedElementIds
                .map(id => elements.find(el => el.id === id))
                .filter((el): el is ImageElement => !!el && el.type === 'image' && !selectedElementIds.includes(el.id));

            if (isEditing) {
                if (!supportsReferenceEditing) {
                    setError('当前图片模型不支持白板编辑或多图合成。请切换到支持参考图编辑的 Gemini、GPT Image 或 OpenRouter 图像模型。');
                    return;
                }
                const selectedElements = elements.filter(el => selectedElementIds.includes(el.id));
                const imageElements = selectedElements.filter(el => el.type === 'image') as ImageElement[];
                const maskPaths = selectedElements.filter(el => el.type === 'path' && el.strokeOpacity && el.strokeOpacity < 1) as PathElement[];

                if (imageElements.length === 1 && maskPaths.length > 0 && selectedElements.length === (1 + maskPaths.length)) {
                    if (!supportsMaskEditing) {
                        setError('当前图片模型不支持遮罩局部重绘。请切换到 Gemini 图像编辑模型或 GPT Image 模型。');
                        return;
                    }
                    const baseImage = imageElements[0];
                    const maskData = await rasterizeMask(maskPaths, baseImage);
                    const result = await editImageWithProvider(
                        [{ href: baseImage.href, mimeType: baseImage.mimeType }],
                        effectivePrompt,
                        resolvedImageModel,
                        resolvedImageKey,
                        { mask: { href: maskData.href, mimeType: maskData.mimeType } },
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
                    return;
                }

                const imagePromises = selectedElements.map(el => {
                    if (el.type === 'image') return Promise.resolve({ href: el.href, mimeType: el.mimeType });
                    if (el.type === 'video') return Promise.reject(new Error('Cannot use video elements in image generation.'));
                    return rasterizeElement(el as Exclude<Element, ImageElement | VideoElement>);
                });
                const imagesToProcess = await Promise.all(imagePromises);

                const { prompt: mentionPrompt, orderedMentionImages } = buildMentionAwarePrompt(effectivePrompt, mentionedImageElements);
                const result = await editImageWithProvider(
                    [...imagesToProcess, ...orderedMentionImages, ...attachmentReferenceImages, ...characterReferenceImages],
                    mentionPrompt,
                    resolvedImageModel,
                    resolvedImageKey,
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
                    setError('当前图片模型不支持 @ 参考图生成。请切换到支持参考图编辑的 Gemini、GPT Image 或 OpenRouter 图像模型。');
                    return;
                }
                setProgressMessage('Generating with reference images...');
                const { prompt: mentionPrompt2, orderedMentionImages: orderedRefs } = buildMentionAwarePrompt(effectivePrompt, mentionedImageElements);
                const result = await editImageWithProvider(
                    [...orderedRefs, ...attachmentReferenceImages, ...characterReferenceImages],
                    mentionPrompt2,
                    resolvedImageModel,
                    resolvedImageKey,
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

            } else {
                const baseRefs = [...attachmentReferenceImages, ...characterReferenceImages];
                if (baseRefs.length > 0 && !supportsReferenceEditing) {
                    setError('当前图片模型不支持参考图生成。请切换到支持参考图编辑的 Gemini、GPT Image 或 OpenRouter 图像模型。');
                    return;
                }
                const result = baseRefs.length > 0
                    ? await editImageWithProvider(
                        baseRefs,
                        effectivePrompt,
                        resolvedImageModel,
                        resolvedImageKey,
                    )
                    : await generateImageWithProvider(
                        effectivePrompt,
                        resolvedImageModel,
                        resolvedImageKey,
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
            console.error('Generation failed:', error);

            const usageKey = activeResolved.key;
            if (usageKey) {
                recordApiUsage({
                    keyId: usageKey.id,
                    provider: usageKey.provider,
                    model: neededCapability === 'video' ? resolvedVideoModel : resolvedImageModel,
                    type: neededCapability,
                    success: false,
                    error: error.message,
                });
            }
        } finally {
            setIsLoading(false);
        }
    };

    /* ---- Batch generate ---- */

    const handleBatchGenerate = async () => {
        const rawPrompt = prompt.trim();
        if (!rawPrompt || batchCount <= 1) return;

        const batchResolved = resolveModelKey('image', modelPreference.imageModel);
        if (!batchResolved) {
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
                    batchResolved.model,
                    batchResolved.key,
                ).catch(() => null)
            );
            const results = await Promise.all(tasks);

            const images: { href: string; mimeType: string; width: number; height: number }[] = [];
            for (const res of results) {
                if (res && res.newImageBase64 && res.newImageMimeType) {
                    const href = `data:${res.newImageMimeType};base64,${res.newImageBase64}`;
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

    const handleSelectBatchResult = (img: { href: string; mimeType: string; width: number; height: number }) => {
        if (!svgRef.current) return;
        const svgBounds = svgRef.current.getBoundingClientRect();
        const canvasPoint = getCanvasPoint(
            svgBounds.left + svgBounds.width / 2,
            svgBounds.top + svgBounds.height / 2,
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

    const handleSelectAllBatchResults = () => {
        if (!batchResults || !svgRef.current) return;
        const svgBounds = svgRef.current.getBoundingClientRect();
        const center = getCanvasPoint(
            svgBounds.left + svgBounds.width / 2,
            svgBounds.top + svgBounds.height / 2,
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

    return {
        // state
        isEnhancingPrompt,
        batchResults,
        setBatchResults,
        // handlers
        handleEnhancePrompt,
        saveGenerationToHistory,
        handleSplitImageWithBanana,
        handleUpscaleImageWithBanana,
        handleRemoveBackgroundWithBanana,
        handleOutpaint,
        handleInpaint,
        handleGenerate,
        handleBatchGenerate,
        handleSelectBatchResult,
        handleSelectAllBatchResults,
    };
}
