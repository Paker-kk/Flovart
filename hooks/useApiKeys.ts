import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import type { UserApiKey, ModelPreference, AIProvider, AICapability } from '../types';
import { saveKeysEncrypted, loadKeysDecrypted, clearAllKeyData, migrateLegacyKeys } from '../utils/keyVault';
import { getUsageSummary } from '../utils/usageMonitor';
import {
    DEFAULT_PROVIDER_MODELS,
    inferCapabilitiesByProvider,
    inferCapabilityFromModel,
    inferProviderFromModel,
    isGoogleImageEditModel,
    isGoogleTextToImageModel,
    PROVIDER_LABELS,
} from '../services/aiGateway';
import { setGeminiRuntimeConfig } from '../services/geminiService';
import { setBananaRuntimeConfig } from '../services/bananaService';
import { refreshAllProviderModels, type FetchedModel } from '../services/modelFetcher';

const generateId = () => `id_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

export const DEFAULT_MODEL_PREFS: ModelPreference = {
    textModel: 'gemini-3-flash-preview',
    imageModel: 'gemini-3.1-flash-image-preview',
    videoModel: 'veo-3.1-generate-preview',
    agentModel: 'banana-vision-v1',
};

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

const buildApiKeyFingerprint = (item: Pick<Partial<UserApiKey>, 'provider' | 'key' | 'baseUrl'>) => {
    const provider = item.provider || '';
    const key = item.key || '';
    const baseUrl = item.baseUrl?.trim().replace(/\/+$/, '') || '';
    return `${provider}::${key}::${baseUrl}`;
};

const normalizeModelId = (model?: string) => model?.trim().toLowerCase() || '';

const keyOwnsModel = (key: UserApiKey, model?: string) => {
    const normalizedModel = normalizeModelId(model);
    if (!normalizedModel) return false;

    const knownModels = [
        key.defaultModel,
        ...(key.customModels || []),
        ...((key.models || []).map(item => item.id)),
    ];

    return knownModels.some(candidate => normalizeModelId(candidate) === normalizedModel);
};

const getRequestedModelByCapability = (modelPreference: ModelPreference, capability: AICapability) => {
    if (capability === 'text') return modelPreference.textModel;
    if (capability === 'image') return modelPreference.imageModel;
    if (capability === 'video') return modelPreference.videoModel;
    return modelPreference.agentModel;
};

const FALLBACK_TEXT_OPTIONS = ensureModelOption([...(PROVIDER_MODELS.google?.text || [])], DEFAULT_MODEL_PREFS.textModel);
const FALLBACK_IMAGE_OPTIONS = ensureModelOption([...(PROVIDER_MODELS.google?.image || [])], DEFAULT_MODEL_PREFS.imageModel);
const FALLBACK_VIDEO_OPTIONS = ensureModelOption([...(PROVIDER_MODELS.google?.video || [])], DEFAULT_MODEL_PREFS.videoModel);

export const normalizeApiKeyEntry = (item: Partial<UserApiKey>): UserApiKey | null => {
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
        customModels: item.customModels,
        defaultModel: item.defaultModel,
        models: item.models,
        extraConfig: item.extraConfig,
        createdAt: item.createdAt || Date.now(),
        updatedAt: item.updatedAt || Date.now(),
    };
};

const hasCapabilityOverlap = (left: AICapability[], right: AICapability[]) =>
    left.some(capability => right.includes(capability));

export function useApiKeys(isSettingsPanelOpen: boolean) {
    const [userApiKeys, setUserApiKeys] = useState<UserApiKey[]>([]);
    const [apiKeysLoaded, setApiKeysLoaded] = useState(false);
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
    const [activeUserKeyId, setActiveUserKeyId] = useState<string | null>(null);
    const [activeUserModelId, setActiveUserModelId] = useState<string | null>(null);

    const handleUserKeyChange = useCallback((id: string) => {
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
            const caps = key.capabilities?.length ? key.capabilities : inferCapabilitiesByProvider(key.provider);
            if (providerModels) {
                if (caps.includes('text')) providerModels.text.forEach(m => textSet.add(m));
                if (caps.includes('image')) providerModels.image.forEach(m => imageSet.add(m));
                if (caps.includes('video')) providerModels.video.forEach(m => videoSet.add(m));
            }

            const userDefinedModels = [
                ...(key.models?.map(model => model.id) || []),
                ...(key.customModels || []),
                key.defaultModel,
            ].filter((model): model is string => !!model);
            for (const model of userDefinedModels) {
                const capability = inferCapabilityFromModel(model);
                if (capability === 'text' && caps.includes('text')) addUniqueModel(textSet, model);
                else if (capability === 'image' && caps.includes('image')) addUniqueModel(imageSet, model);
                else if (capability === 'video' && caps.includes('video')) addUniqueModel(videoSet, model);
                else if (!capability) {
                    // 模型名无法推断能力时，按 key 自身声明的 capabilities 归类
                    if (caps.includes('image')) addUniqueModel(imageSet, model);
                    if (caps.includes('text')) addUniqueModel(textSet, model);
                    if (caps.includes('video')) addUniqueModel(videoSet, model);
                }
            }
        }
        return {
            text: ensureModelOption(textSet.size > 0 ? Array.from(textSet) : [...FALLBACK_TEXT_OPTIONS], modelPreference.textModel),
            image: ensureModelOption(imageSet.size > 0 ? Array.from(imageSet) : [...FALLBACK_IMAGE_OPTIONS], modelPreference.imageModel),
            video: ensureModelOption(videoSet.size > 0 ? Array.from(videoSet) : [...FALLBACK_VIDEO_OPTIONS], modelPreference.videoModel),
        };
    }, [modelPreference.imageModel, modelPreference.textModel, modelPreference.videoModel, userApiKeys]);

    // 自动适配：当已配置的 API Key 不覆盖当前选中模型的 provider 时，自动切换到有 Key 的 provider 的模型
    const [modelAutoSwitchNotice, setModelAutoSwitchNotice] = useState<string | null>(null);

    useEffect(() => {
        if (!apiKeysLoaded || userApiKeys.length === 0) return;

        // 仅考虑健康状态的 key（跳过 status === 'error'）
        const healthyKeys = userApiKeys.filter(k => k.status !== 'error');
        if (healthyKeys.length === 0) return;

        const hasKeyForModel = (model: string, capability: AICapability) => {
            const provider = inferProviderFromModel(model);
            return healthyKeys.some(k => {
                const caps = k.capabilities?.length ? k.capabilities : inferCapabilitiesByProvider(k.provider);
                return caps.includes(capability) && (k.provider === provider || (k.provider === 'custom' && keyOwnsModel(k, model)));
            });
        };

        const findBestModel = (capability: 'text' | 'image' | 'video', currentModel: string): string | null => {
            if (hasKeyForModel(currentModel, capability)) return null;
            for (const key of healthyKeys) {
                const caps = key.capabilities?.length ? key.capabilities : inferCapabilitiesByProvider(key.provider);
                if (!caps.includes(capability)) continue;
                const providerModels = PROVIDER_MODELS[key.provider];
                if (providerModels) {
                    const modelList = providerModels[capability];
                    if (modelList && modelList.length > 0) return modelList[0];
                }
                if (key.customModels?.length) return key.customModels[0];
                if (key.defaultModel) return key.defaultModel;
            }
            return null;
        };

        setModelPreference(prev => {
            const updates: Partial<ModelPreference> = {};
            const betterText = findBestModel('text', prev.textModel);
            if (betterText) updates.textModel = betterText;
            const betterImage = findBestModel('image', prev.imageModel);
            if (betterImage) updates.imageModel = betterImage;
            const betterVideo = findBestModel('video', prev.videoModel);
            if (betterVideo) updates.videoModel = betterVideo;

            if (Object.keys(updates).length > 0) {
                const switched: string[] = [];
                if (updates.imageModel) {
                    const p = PROVIDER_LABELS[inferProviderFromModel(updates.imageModel)] || inferProviderFromModel(updates.imageModel);
                    switched.push(`图片 → ${p}`);
                }
                if (updates.videoModel) {
                    const p = PROVIDER_LABELS[inferProviderFromModel(updates.videoModel)] || inferProviderFromModel(updates.videoModel);
                    switched.push(`视频 → ${p}`);
                }
                if (updates.textModel) {
                    const p = PROVIDER_LABELS[inferProviderFromModel(updates.textModel)] || inferProviderFromModel(updates.textModel);
                    switched.push(`文本 → ${p}`);
                }
                setModelAutoSwitchNotice(`已自动切换模型：${switched.join('，')}`);
                setTimeout(() => setModelAutoSwitchNotice(null), 5000);
                return { ...prev, ...updates };
            }
            return prev;
        });
    }, [apiKeysLoaded, userApiKeys]);

    // Usage monitoring summary (recomputed when settings panel opens or keys change)
    const usageSummaryMap = useMemo(() => {
        if (!isSettingsPanelOpen || userApiKeys.length === 0) return undefined;
        return getUsageSummary(userApiKeys.map(k => k.id));
    }, [isSettingsPanelOpen, userApiKeys]);

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
        if (!apiKeysLoaded) return;
        saveKeysEncrypted(userApiKeys);
    }, [userApiKeys, apiKeysLoaded]);

    // 新用户引导：API Key 异步加载完成后，如果没有任何 Key 且用户未主动跳过，自动弹出引导
    useEffect(() => {
        if (!apiKeysLoaded) return;
        const hasSkipped = localStorage.getItem('onboarding.skipped') === 'true';
        if (userApiKeys.length === 0 && !hasSkipped) {
            setShowOnboarding(true);
        } else if (userApiKeys.length > 0) {
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
        const safeKeys = userApiKeys.map(k => ({
            provider: k.provider,
            key: k.key,
            baseUrl: k.baseUrl,
            models: k.models,
            capabilities: k.capabilities,
            name: k.name,
            defaultModel: k.defaultModel,
            customModels: k.customModels,
            extraConfig: k.extraConfig,
        }));
        chrome.storage.local.set({ flovart_user_api_keys: safeKeys });
    }, [userApiKeys, apiKeysLoaded]);

    // Chrome Extension bridge: listen for keys added from extension popup → merge into app
    useEffect(() => {
        if (typeof chrome === 'undefined' || !chrome?.storage?.onChanged) return;
        const handleStorageChange = (changes: Record<string, { oldValue?: unknown; newValue?: unknown }>, areaName: string) => {
            if (areaName !== 'local' || !changes.flovart_user_api_keys) return;
            const extKeys = changes.flovart_user_api_keys.newValue as Array<Partial<UserApiKey>> | undefined;
            if (!Array.isArray(extKeys)) return;
            setUserApiKeys(prev => {
                const existingFingerprints = new Set(prev.map(buildApiKeyFingerprint));
                const newKeys: UserApiKey[] = [];
                for (const ek of extKeys) {
                    if (!ek.provider || !ek.key) continue;
                    const fp = buildApiKeyFingerprint(ek);
                    if (existingFingerprints.has(fp)) continue;
                    newKeys.push(normalizeApiKeyEntry({
                        id: crypto.randomUUID(),
                        provider: ek.provider,
                        key: ek.key,
                        baseUrl: ek.baseUrl,
                        capabilities: ek.capabilities,
                        models: ek.models,
                        name: ek.name,
                        defaultModel: ek.defaultModel,
                        customModels: ek.customModels,
                        extraConfig: ek.extraConfig,
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

    // 启动时后台自动刷新所有 Provider 的模型列表（带缓存 TTL）
    const autoRefreshRan = useRef(false);
    useEffect(() => {
        if (!apiKeysLoaded || userApiKeys.length === 0 || autoRefreshRan.current) return;
        autoRefreshRan.current = true;
        const keysToFetch = userApiKeys
            .filter(k => k.key && k.status !== 'error' && k.provider !== 'banana' && k.provider !== 'runningHub')
            .map(k => ({ id: k.id, provider: k.provider, key: k.key, baseUrl: k.baseUrl }));
        if (keysToFetch.length === 0) return;
        refreshAllProviderModels(keysToFetch).then(results => {
            if (results.size === 0) return;
            setUserApiKeys(prev => prev.map(k => {
                const fetched = results.get(k.id);
                if (!fetched || fetched.length === 0) return k;
                const modelItems = fetched.map(m => ({ id: m.id, name: m.name || m.id }));
                return { ...k, models: modelItems, updatedAt: Date.now() };
            }));
        }).catch(() => { /* silent background refresh failure */ });
    }, [apiKeysLoaded, userApiKeys.length]);

    // 持久化 modelPreference
    useEffect(() => {
        localStorage.setItem('modelPreference.v1', JSON.stringify(modelPreference));
    }, [modelPreference]);

    const getPreferredApiKey = useCallback((capability: AICapability, provider?: AIProvider) => {
        const requestedModel = getRequestedModelByCapability(modelPreference, capability);
        const matches = userApiKeys.filter(key => {
            if (key.status === 'error') return false;
            const capabilities = key.capabilities?.length ? key.capabilities : inferCapabilitiesByProvider(key.provider);
            if (!capabilities.includes(capability)) return false;
            if (!provider) return true;
            if (key.provider === provider) return true;
            return key.provider === 'custom' && keyOwnsModel(key, requestedModel);
        });
        return matches.find(key => key.isDefault) || matches[0];
    }, [modelPreference, userApiKeys]);

    // Sync runtime config for Gemini / Banana services
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
            baseUrl: googleTextKey?.baseUrl,
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
        // 新增 Key 后自动拉取模型列表（后台静默）
        if (payload.provider !== 'banana' && payload.provider !== 'runningHub') {
            refreshAllProviderModels([{ id: nextKey.id, provider: payload.provider, key: payload.key, baseUrl: payload.baseUrl }], true)
                .then(results => {
                    const fetched = results.get(nextKey.id);
                    if (fetched && fetched.length > 0) {
                        const modelItems = fetched.map(m => ({ id: m.id, name: m.name || m.id }));
                        setUserApiKeys(prev => prev.map(k =>
                            k.id === nextKey.id ? { ...k, models: modelItems, updatedAt: Date.now() } : k
                        ));
                    }
                })
                .catch(() => {});
        }
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

    return {
        userApiKeys,
        setUserApiKeys,
        apiKeysLoaded,
        showOnboarding,
        setShowOnboarding,
        clearKeysOnExit,
        setClearKeysOnExit,
        modelPreference,
        setModelPreference,
        activeUserKeyId,
        activeUserModelId,
        setActiveUserModelId,
        handleUserKeyChange,
        dynamicModelOptions,
        usageSummaryMap,
        getPreferredApiKey,
        handleAddApiKey,
        handleDeleteApiKey,
        handleUpdateApiKey,
        handleSetDefaultApiKey,
        modelAutoSwitchNotice,
    };
}
