import React from 'react';
import type { WheelAction, UserApiKey, ModelPreference, AIProvider, AICapability, ThemeMode, ModelItem } from '../types';
import { DEFAULT_PROVIDER_MODELS, validateApiKey, inferProviderFromKey, inferCapabilitiesByProvider, PROVIDER_LABELS } from '../services/aiGateway';
import { formatCost, type KeyUsageSummary } from '../utils/usageMonitor';
import { fetchModelsForProvider, FREE_KEY_LINKS, type FetchedModel } from '../services/modelFetcher';

interface CanvasSettingsProps {
    isOpen: boolean;
    onClose: () => void;
    language: 'en' | 'zho';
    setLanguage: (lang: 'en' | 'zho') => void;
    themeMode: ThemeMode;
    resolvedTheme: 'light' | 'dark';
    setThemeMode: (mode: ThemeMode) => void;
    wheelAction: WheelAction;
    setWheelAction: (action: WheelAction) => void;
    userApiKeys: UserApiKey[];
    onAddApiKey: (payload: Omit<UserApiKey, 'id' | 'createdAt' | 'updatedAt'>) => void;
    onDeleteApiKey: (id: string) => void;
    onUpdateApiKey: (id: string, patch: Partial<Omit<UserApiKey, 'id' | 'createdAt'>>) => void;
    onSetDefaultApiKey: (id: string) => void;
    modelPreference: ModelPreference;
    setModelPreference: (prefs: ModelPreference) => void;
    t: (key: string) => string;
    clearKeysOnExit: boolean;
    setClearKeysOnExit: (v: boolean) => void;
    /** Per-key usage summary (optional) */
    usageSummary?: Map<string, KeyUsageSummary>;
    /** 动态模型选项（从 App.tsx 传入，基于用户 Key 计算） */
    dynamicModelOptions?: { text: string[]; image: string[]; video: string[] };
}

const providerBaseUrl: Record<AIProvider, string> = {
    openai: 'https://api.openai.com/v1',
    anthropic: 'https://api.anthropic.com/v1',
    google: 'https://generativelanguage.googleapis.com/v1beta/models',
    qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    banana: 'https://api.banana.dev/v1/vision',
    deepseek: 'https://api.deepseek.com/v1',
    siliconflow: 'https://api.siliconflow.cn/v1',
    keling: 'https://api.klingai.com/v1',
    flux: 'https://api.bfl.ml/v1',
    midjourney: 'https://api.midjourney.com/v1',
    runningHub: 'https://www.runninghub.cn/openapi/v2',
    minimax: 'https://api.minimax.chat/v1',
    volcengine: 'https://ark.cn-beijing.volces.com/api/v3',
    openrouter: 'https://openrouter.ai/api/v1',
    custom: '',
};

const capabilityLabels: Record<AICapability, string> = {
    text: 'LLM',
    image: '图片',
    video: '视频',
    agent: 'Agent',
};

const ensureModelOption = (options: string[], model?: string) => {
    const trimmed = model?.trim();
    if (!trimmed) return options;
    return options.includes(trimmed) ? options : [trimmed, ...options];
};

export const CanvasSettings: React.FC<CanvasSettingsProps> = ({
    isOpen,
    onClose,
    language,
    setLanguage,
    themeMode,
    resolvedTheme,
    setThemeMode,
    wheelAction,
    setWheelAction,
    userApiKeys,
    onAddApiKey,
    onDeleteApiKey,
    onUpdateApiKey,
    onSetDefaultApiKey,
    modelPreference,
    setModelPreference,
    clearKeysOnExit,
    setClearKeysOnExit,
    usageSummary,
    dynamicModelOptions,
}) => {
    const [provider, setProvider] = React.useState<AIProvider>('google');
    const [apiKey, setApiKey] = React.useState('');
    const [baseUrl, setBaseUrl] = React.useState(providerBaseUrl.google);
    const [displayName, setDisplayName] = React.useState('');
    const [showKey, setShowKey] = React.useState(false);
    const [capabilities, setCapabilities] = React.useState<AICapability[]>(['text', 'image', 'video']);
    const [isValidating, setIsValidating] = React.useState(false);
    const [validationResult, setValidationResult] = React.useState<{ ok: boolean; message?: string } | null>(null);
    // 当前正在编辑的 API Key（null = 新增模式）
    const [editingKeyId, setEditingKeyId] = React.useState<string | null>(null);
    // 控制 API Key 添加/编辑弹窗
    const [showKeyModal, setShowKeyModal] = React.useState(false);
    // 模型管理
    const [editModels, setEditModels] = React.useState<ModelItem[]>([]);
    const [editDefaultModel, setEditDefaultModel] = React.useState('');
    const [newModelId, setNewModelId] = React.useState('');
    const [extraConfig, setExtraConfig] = React.useState<Record<string, string>>({});
    // 批量测试状态
    const [batchTestResults, setBatchTestResults] = React.useState<Record<string, { ok: boolean; message?: string }>>({});
    const [isBatchTesting, setIsBatchTesting] = React.useState(false);
    // 联网拉取模型
    const [fetchedModels, setFetchedModels] = React.useState<FetchedModel[]>([]);
    const [isFetchingModels, setIsFetchingModels] = React.useState(false);
    const [fetchError, setFetchError] = React.useState<string | null>(null);
    const [autoDetectedProvider, setAutoDetectedProvider] = React.useState<AIProvider | null>(null);
    const [endpointFlavor, setEndpointFlavor] = React.useState<'google' | 'openai-compatible' | 'openrouter-compatible' | null>(null);
    const [detectedCapabilities, setDetectedCapabilities] = React.useState<AICapability[]>([]);

    const modelOptions = React.useMemo(() => ({
        text: ensureModelOption(
            dynamicModelOptions?.text?.length ? dynamicModelOptions.text : [
                ...(DEFAULT_PROVIDER_MODELS.google?.text || []),
                ...(DEFAULT_PROVIDER_MODELS.openai?.text || []),
                ...(DEFAULT_PROVIDER_MODELS.anthropic?.text || []),
                ...(DEFAULT_PROVIDER_MODELS.qwen?.text || []),
            ],
            modelPreference.textModel
        ),
        image: ensureModelOption(
            dynamicModelOptions?.image?.length ? dynamicModelOptions.image : [
                ...(DEFAULT_PROVIDER_MODELS.google?.image || []),
            ],
            modelPreference.imageModel
        ),
        video: ensureModelOption(
            dynamicModelOptions?.video?.length ? dynamicModelOptions.video : [
                ...(DEFAULT_PROVIDER_MODELS.google?.video || []),
            ],
            modelPreference.videoModel
        ),
        agent: ensureModelOption([...(DEFAULT_PROVIDER_MODELS.banana?.agent || [])], modelPreference.agentModel),
    }), [dynamicModelOptions, modelPreference.agentModel, modelPreference.imageModel, modelPreference.textModel, modelPreference.videoModel]);

    if (!isOpen) return null;

    const isDark = resolvedTheme === 'dark';
    const inputClass = `w-full rounded-2xl border px-3 py-2.5 text-sm outline-none transition ${
        isDark
            ? 'border-[#2A3140] bg-[#161A22] text-[#F3F4F6] placeholder:text-[#667085] focus:border-[#4B5B78]'
            : 'border-[#E4E7EC] bg-white text-[#344054] placeholder:text-[#98A2B3] focus:border-[#98A2B3]'
    }`;
    const chipClass = `rounded-full border px-3 py-2 text-sm transition ${
        isDark
            ? 'border-[#2A3140] bg-[#1B2029] text-[#D0D5DD] hover:bg-[#252C39]'
            : 'border-[#E4E7EC] bg-[#F8FAFC] text-[#475467] hover:bg-[#F2F4F7]'
    }`;

    const toggleCapability = (capability: AICapability) => {
        setCapabilities(prev =>
            prev.includes(capability)
                ? prev.filter(item => item !== capability)
                : [...prev, capability]
        );
    };

    const maskKey = (key: string) => {
        if (key.length < 10) return '****';
        return `${key.slice(0, 4)}****${key.slice(-4)}`;
    };

    const handleProviderChange = (next: AIProvider) => {
        setProvider(next);
        setBaseUrl(providerBaseUrl[next]);
        setCapabilities(inferCapabilitiesByProvider(next));
        setEndpointFlavor(null);
        setDetectedCapabilities([]);
        setFetchError(null);
        // 自动填充该 provider 的预设模型
        const pm = DEFAULT_PROVIDER_MODELS[next];
        if (pm) {
            const models: ModelItem[] = [
                ...(pm.text || []).map(id => ({ id, name: id })),
                ...(pm.image || []).map(id => ({ id, name: id })),
                ...(pm.video || []).map(id => ({ id, name: id })),
                ...(pm.agent || []).map(id => ({ id, name: id })),
            ];
            setEditModels(models);
            setEditDefaultModel(models[0]?.id || '');
        } else {
            setEditModels([]);
            setEditDefaultModel('');
        }
    };

    const handleSaveKey = async () => {
        if (!apiKey.trim() || capabilities.length === 0) return;

        // 先验证 key 是否有效
        setIsValidating(true);
        setValidationResult(null);
        const result = await validateApiKey(provider, apiKey.trim(), baseUrl.trim() || undefined);
        setIsValidating(false);
        setValidationResult(result);

        if (!result.ok) return; // 验证失败不保存

        const modelsToSave = editModels.length > 0 ? editModels : undefined;
        const customModelsToSave = editModels.map(m => m.id);
        const fallbackEndpointFlavor = provider === 'custom'
            ? (/openrouter/i.test(baseUrl) ? 'openrouter-compatible' : 'openai-compatible')
            : undefined;
        const extraToSave = Object.keys(extraConfig).length > 0 || fallbackEndpointFlavor
            ? { ...extraConfig, ...(fallbackEndpointFlavor && !extraConfig.endpointFlavor ? { endpointFlavor: fallbackEndpointFlavor } : {}) }
            : undefined;

        if (editingKeyId) {
            // 编辑模式：更新已有 Key
            onUpdateApiKey(editingKeyId, {
                provider,
                capabilities,
                key: apiKey.trim(),
                baseUrl: baseUrl.trim() || undefined,
                name: displayName.trim() || undefined,
                status: 'ok',
                models: modelsToSave,
                customModels: customModelsToSave.length > 0 ? customModelsToSave : undefined,
                defaultModel: editDefaultModel || undefined,
                extraConfig: extraToSave,
            });
        } else {
            // 新增模式
            onAddApiKey({
                provider,
                capabilities,
                key: apiKey.trim(),
                baseUrl: baseUrl.trim() || undefined,
                name: displayName.trim() || undefined,
                status: 'ok',
                isDefault: false,
                models: modelsToSave,
                customModels: customModelsToSave.length > 0 ? customModelsToSave : undefined,
                defaultModel: editDefaultModel || undefined,
                extraConfig: extraToSave,
            });
        }
        handleCancelEdit();
    };

    /** 点击已有 Key 的"编辑"按钮 — 将其字段填入表单并打开弹窗 */
    const handleStartEdit = (item: UserApiKey) => {
        setEditingKeyId(item.id);
        setProvider(item.provider);
        setApiKey(item.key);
        setBaseUrl(item.baseUrl || providerBaseUrl[item.provider]);
        setDisplayName(item.name || '');
        setCapabilities(item.capabilities?.length ? [...item.capabilities] : inferCapabilitiesByProvider(item.provider));
        setEditModels(item.models || (item.customModels || []).map(id => ({ id, name: id })));
        setEditDefaultModel(item.defaultModel || '');
        setExtraConfig(item.extraConfig || {});
        setEndpointFlavor((item.extraConfig?.endpointFlavor as 'google' | 'openai-compatible' | 'openrouter-compatible' | undefined) || null);
        setDetectedCapabilities(item.capabilities?.length ? [...item.capabilities] : []);
        setValidationResult(null);
        setShowKeyModal(true);
    };

    /** 取消编辑 / 重置表单并关闭弹窗 */
    const handleCancelEdit = () => {
        setEditingKeyId(null);
        setApiKey('');
        setDisplayName('');
        setEditModels([]);
        setEditDefaultModel('');
        setNewModelId('');
        setExtraConfig({});
        setValidationResult(null);
        setFetchedModels([]);
        setFetchError(null);
        setAutoDetectedProvider(null);
        setEndpointFlavor(null);
        setDetectedCapabilities([]);
        setShowKeyModal(false);
    };

    /** 联网拉取当前 Provider 可用的模型列表 */
    const handleFetchModels = async (targetProvider: AIProvider, targetKey: string, targetBaseUrl?: string) => {
        if (!targetKey.trim()) return;
        setIsFetchingModels(true);
        setFetchError(null);
        try {
            const result = await fetchModelsForProvider(targetProvider, targetKey.trim(), targetBaseUrl?.trim() || undefined);
            if (result.ok && result.models.length > 0) {
                setFetchedModels(result.models);
                setEndpointFlavor(result.endpointFlavor || null);
                setDetectedCapabilities(result.capabilitySummary || []);
                // 自动填充到编辑模型列表
                const modelItems: ModelItem[] = result.models.map(m => ({ id: m.id, name: m.name || m.id }));
                setEditModels(modelItems);
                if (modelItems.length > 0) setEditDefaultModel(modelItems[0].id);
                // 自动推断 capabilities
                const caps = new Set<AICapability>();
                for (const m of result.models) caps.add(m.capability);
                if (caps.size > 0) setCapabilities(Array.from(caps));
                if (result.endpointFlavor) {
                    setExtraConfig(prev => ({ ...prev, endpointFlavor: result.endpointFlavor }));
                }
            } else if (!result.ok) {
                setFetchError(result.error || '拉取失败');
            }
        } catch {
            setFetchError('网络错误');
        }
        setIsFetchingModels(false);
    };

    /** API Key 粘贴自动检测 Provider + 拉取模型 */
    const handleKeyPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
        const pasted = e.clipboardData.getData('text');
        if (pasted) {
            const detected = inferProviderFromKey(pasted);
            if (detected) {
                setAutoDetectedProvider(detected);
                if (detected !== provider) {
                    handleProviderChange(detected);
                }
                // 自动拉取模型
                const targetBaseUrl = detected !== provider ? providerBaseUrl[detected] : baseUrl;
                handleFetchModels(detected, pasted, targetBaseUrl);
            }
        }
    };

    /** 添加模型到当前编辑列表 */
    const handleAddModel = () => {
        const id = newModelId.trim();
        if (!id || editModels.some(m => m.id === id)) return;
        const next = [...editModels, { id, name: id }];
        setEditModels(next);
        if (!editDefaultModel) setEditDefaultModel(id);
        setNewModelId('');
    };

    /** 删除模型 */
    const handleRemoveModel = (id: string) => {
        const next = editModels.filter(m => m.id !== id);
        setEditModels(next);
        if (editDefaultModel === id) setEditDefaultModel(next[0]?.id || '');
    };

    /** 导出所有 API Key 配置为 JSON */
    const handleExportKeys = () => {
        const exportData = userApiKeys.map(k => ({
            provider: k.provider,
            name: k.name,
            baseUrl: k.baseUrl,
            capabilities: k.capabilities,
            customModels: k.customModels,
            defaultModel: k.defaultModel,
            models: k.models,
            extraConfig: k.extraConfig,
            key: '***', // 不导出明文 key
        }));
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `flovart-api-configs-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    /** 导入 JSON 配置文件 */
    const handleImportKeys = () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = async (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (!file) return;
            try {
                const text = await file.text();
                const parsed = JSON.parse(text);
                if (!Array.isArray(parsed)) throw new Error('格式错误');
                for (const item of parsed) {
                    if (!item.provider || !item.key || item.key === '***') continue;
                    onAddApiKey({
                        provider: item.provider,
                        capabilities: item.capabilities || inferCapabilitiesByProvider(item.provider),
                        key: item.key,
                        baseUrl: item.baseUrl,
                        name: item.name,
                        status: 'unknown',
                        isDefault: false,
                        customModels: item.customModels,
                        defaultModel: item.defaultModel,
                        models: item.models,
                        extraConfig: item.extraConfig,
                    });
                }
            } catch {
                alert('导入失败：文件格式不正确');
            }
        };
        input.click();
    };

    /** 带 Key 导出（含明文，用于设备迁移） */
    const handleExportKeysWithSecrets = () => {
        if (!confirm('导出将包含明文 API Key，请妥善保管导出文件！')) return;
        const exportData = userApiKeys.map(k => ({
            provider: k.provider,
            name: k.name,
            key: k.key,
            baseUrl: k.baseUrl,
            capabilities: k.capabilities,
            customModels: k.customModels,
            defaultModel: k.defaultModel,
            models: k.models,
            extraConfig: k.extraConfig,
        }));
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `flovart-api-configs-full-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    /** 一键测试所有 Key */
    const handleBatchTest = async () => {
        setIsBatchTesting(true);
        setBatchTestResults({});
        const results: Record<string, { ok: boolean; message?: string }> = {};
        for (const item of userApiKeys) {
            const result = await validateApiKey(item.provider, item.key, item.baseUrl);
            results[item.id] = result;
            onUpdateApiKey(item.id, { status: result.ok ? 'ok' : 'error' });
            setBatchTestResults({ ...results });
        }
        setIsBatchTesting(false);
    };

    return (
        <div className="theme-aware fixed inset-0 z-[100] flex items-center justify-center bg-black/35 backdrop-blur-sm" onClick={onClose}>
            <div
                className={`relative max-h-[88vh] w-[92%] max-w-[680px] overflow-y-auto rounded-[28px] border p-6 shadow-[0_40px_120px_rgba(15,23,42,0.18)] ${
                    isDark ? 'border-[#2A3140] bg-[#12151B]' : 'border-[#E4E7EC] bg-white'
                }`}
                onClick={(event) => event.stopPropagation()}
            >
                <div className="mb-6 flex items-center justify-between">
                    <div>
                        <h3 className={`text-xl font-semibold ${isDark ? 'text-[#F3F4F6]' : 'text-[#101828]'}`}>设置</h3>
                        <p className={`mt-1 text-sm ${isDark ? 'text-[#98A2B3]' : 'text-[#667085]'}`}>
                            管理主题模式、交互方式、API 能力和默认模型。
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className={`flex h-10 w-10 items-center justify-center rounded-2xl border transition ${
                            isDark ? 'border-[#2A3140] text-[#98A2B3] hover:bg-[#1B2029]' : 'border-[#E4E7EC] text-[#667085] hover:bg-[#F9FAFB]'
                        }`}
                    >
                        ×
                    </button>
                </div>

                <div className="space-y-6">
                    <section className="space-y-3">
                        <div className={`text-xs font-semibold uppercase tracking-[0.18em] ${isDark ? 'text-[#667085]' : 'text-[#98A2B3]'}`}>
                            界面主题
                        </div>
                        <div className="grid gap-3 md:grid-cols-3">
                            {([
                                ['light', '浅色模式', '明亮白板与柔和面板'],
                                ['dark', '黑夜模式', '深色工作台与高对比内容'],
                                ['system', '跟随系统', '自动跟随设备主题'],
                            ] as Array<[ThemeMode, string, string]>).map(([mode, title, description]) => (
                                <button
                                    key={mode}
                                    type="button"
                                    onClick={() => setThemeMode(mode)}
                                    className={`rounded-[24px] border p-4 text-left transition ${
                                        themeMode === mode
                                            ? isDark
                                                ? 'border-[#4B5B78] bg-[#1B2330] shadow-[0_10px_30px_rgba(0,0,0,0.18)]'
                                                : 'border-[#B2CCFF] bg-[#EEF4FF] shadow-[0_10px_30px_rgba(23,92,211,0.08)]'
                                            : isDark
                                                ? 'border-[#2A3140] bg-[#161A22] hover:bg-[#1B2029]'
                                                : 'border-[#E4E7EC] bg-[#F8FAFC] hover:bg-white'
                                    }`}
                                >
                                    <div className="mb-3 flex items-center justify-between">
                                        <div className={`text-sm font-semibold ${isDark ? 'text-[#F3F4F6]' : 'text-[#101828]'}`}>{title}</div>
                                        {themeMode === mode && (
                                            <span className={`rounded-full px-2 py-1 text-[11px] font-medium ${
                                                isDark ? 'bg-[#7CB4FF]/20 text-[#7CB4FF]' : 'bg-[#DCEBFF] text-[#175CD3]'
                                            }`}>
                                                当前
                                            </span>
                                        )}
                                    </div>
                                    <div className={`mb-4 text-xs ${isDark ? 'text-[#98A2B3]' : 'text-[#667085]'}`}>{description}</div>
                                    <div className={`grid h-16 grid-cols-[1fr_56px] gap-2 rounded-2xl p-2 ${
                                        mode === 'dark' || (mode === 'system' && resolvedTheme === 'dark')
                                            ? 'bg-[#0F141C]'
                                            : 'bg-white'
                                    }`}>
                                        <div className={`rounded-xl border ${
                                            mode === 'dark' || (mode === 'system' && resolvedTheme === 'dark')
                                                ? 'border-[#2A3140] bg-[#161A22]'
                                                : 'border-[#E4E7EC] bg-[#F8FAFC]'
                                        }`} />
                                        <div className={`rounded-xl border ${
                                            mode === 'dark' || (mode === 'system' && resolvedTheme === 'dark')
                                                ? 'border-[#2A3140] bg-[#12151B]'
                                                : 'border-[#E4E7EC] bg-white'
                                        }`} />
                                    </div>
                                </button>
                            ))}
                        </div>
                    </section>

                    <section className="space-y-3">
                        <div className={`text-xs font-semibold uppercase tracking-[0.18em] ${isDark ? 'text-[#667085]' : 'text-[#98A2B3]'}`}>
                            语言与交互
                        </div>
                        <div className="grid gap-3 md:grid-cols-2">
                            <div className={`rounded-2xl p-3 ${isDark ? 'bg-[#161A22]' : 'bg-[#F8FAFC]'}`}>
                                <div className={`mb-2 text-sm font-medium ${isDark ? 'text-[#D0D5DD]' : 'text-[#344054]'}`}>语言</div>
                                <div className={`inline-flex w-full rounded-full border p-1 ${isDark ? 'border-[#2A3140] bg-[#12151B]' : 'border-[#E4E7EC] bg-white'}`}>
                                    {([
                                        ['en', 'English'],
                                        ['zho', '中文'],
                                    ] as Array<['en' | 'zho', string]>).map(([value, label]) => (
                                        <button
                                            key={value}
                                            type="button"
                                            onClick={() => setLanguage(value)}
                                            className={`flex-1 rounded-full px-3 py-2 text-sm transition ${
                                                language === value
                                                    ? isDark
                                                        ? 'bg-[#F3F4F6] text-[#111827]'
                                                        : 'bg-[#111827] text-white'
                                                    : isDark
                                                        ? 'text-[#98A2B3]'
                                                        : 'text-[#667085]'
                                            }`}
                                        >
                                            {label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className={`rounded-2xl p-3 ${isDark ? 'bg-[#161A22]' : 'bg-[#F8FAFC]'}`}>
                                <div className={`mb-2 text-sm font-medium ${isDark ? 'text-[#D0D5DD]' : 'text-[#344054]'}`}>滚轮行为</div>
                                <div className={`inline-flex w-full rounded-full border p-1 ${isDark ? 'border-[#2A3140] bg-[#12151B]' : 'border-[#E4E7EC] bg-white'}`}>
                                    {([
                                        ['zoom', '缩放'],
                                        ['pan', '平移'],
                                    ] as Array<[WheelAction, string]>).map(([value, label]) => (
                                        <button
                                            key={value}
                                            type="button"
                                            onClick={() => setWheelAction(value)}
                                            className={`flex-1 rounded-full px-3 py-2 text-sm transition ${
                                                wheelAction === value
                                                    ? isDark
                                                        ? 'bg-[#F3F4F6] text-[#111827]'
                                                        : 'bg-[#111827] text-white'
                                                    : isDark
                                                        ? 'text-[#98A2B3]'
                                                        : 'text-[#667085]'
                                            }`}
                                        >
                                            {label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* ── 统一 API 配置管理 ───────────────────────── */}
                    <section className="space-y-3">
                        <div className="flex items-center justify-between">
                            <div className={`text-xs font-semibold uppercase tracking-[0.18em] ${isDark ? 'text-[#667085]' : 'text-[#98A2B3]'}`}>
                                🔑 API 配置
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={handleImportKeys}
                                    className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition ${
                                        isDark ? 'border-[#2A3140] text-[#98A2B3] hover:bg-[#252C39]' : 'border-[#E4E7EC] text-[#667085] hover:bg-[#F2F4F7]'
                                    }`}
                                >
                                    导入
                                </button>
                                <button
                                    type="button"
                                    onClick={handleExportKeysWithSecrets}
                                    className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition ${
                                        isDark ? 'border-[#2A3140] text-[#98A2B3] hover:bg-[#252C39]' : 'border-[#E4E7EC] text-[#667085] hover:bg-[#F2F4F7]'
                                    }`}
                                >
                                    导出
                                </button>
                                {userApiKeys.length > 0 && (
                                    <button
                                        type="button"
                                        onClick={handleBatchTest}
                                        disabled={isBatchTesting}
                                        className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition ${
                                            isDark ? 'border-[#2A3140] text-[#98A2B3] hover:bg-[#252C39]' : 'border-[#E4E7EC] text-[#667085] hover:bg-[#F2F4F7]'
                                        } disabled:opacity-50`}
                                    >
                                        {isBatchTesting ? '测试中...' : '全部测试'}
                                    </button>
                                )}
                                <button
                                    type="button"
                                    onClick={() => { setEditingKeyId(null); setApiKey(''); setDisplayName(''); setProvider('google'); setBaseUrl(providerBaseUrl.google); setCapabilities(inferCapabilitiesByProvider('google')); handleProviderChange('google'); setValidationResult(null); setShowKeyModal(true); }}
                                    className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                                        isDark ? 'border-[#4B5B78] bg-[#1B2330] text-[#B2CCFF] hover:bg-[#252C39]' : 'border-[#B2CCFF] bg-[#EEF4FF] text-[#175CD3] hover:bg-[#DBEAFE]'
                                    }`}
                                >
                                    + 添加 API Key
                                </button>
                            </div>
                        </div>

                        <div className="space-y-2">
                            {userApiKeys.length === 0 ? (
                                <div className={`rounded-2xl border border-dashed px-4 py-6 text-center text-sm ${
                                    isDark ? 'border-[#3A4458] text-[#98A2B3]' : 'border-[#D0D5DD] text-[#667085]'
                                }`}>
                                    <div className="mb-2 text-lg">🔑</div>
                                    <div className="font-medium">还没有配置 API Key</div>
                                    <div className="mt-1 text-xs">点击右上方「+ 添加 API Key」按钮开始配置</div>
                                </div>
                            ) : (
                                userApiKeys.map(item => (
                                    <div key={item.id} className={`flex items-center justify-between rounded-2xl border px-4 py-3 ${
                                        editingKeyId === item.id
                                            ? isDark ? 'border-[#4B5B78] bg-[#1B2330]' : 'border-[#1D4ED8] bg-[#EFF6FF]'
                                            : isDark ? 'border-[#2A3140] bg-[#161A22]' : 'border-[#E4E7EC] bg-white'
                                    }`}>
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className={`inline-block h-2 w-2 rounded-full ${
                                                    item.status === 'ok' ? 'bg-green-500' : item.status === 'error' ? 'bg-red-400' : 'bg-yellow-400'
                                                }`} title={item.status === 'ok' ? '已验证' : item.status === 'error' ? '验证失败' : '未验证'} />
                                                <span className={`truncate text-sm font-medium ${isDark ? 'text-[#F3F4F6]' : 'text-[#101828]'}`}>{item.name || PROVIDER_LABELS[item.provider] || item.provider}</span>
                                                {editingKeyId === item.id && (
                                                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                                                        isDark ? 'bg-[#1B2330] text-[#7CB4FF]' : 'bg-[#EFF6FF] text-[#1D4ED8]'
                                                    }`}>编辑中</span>
                                                )}
                                            </div>
                                            <div className={`mt-1 text-xs ${isDark ? 'text-[#98A2B3]' : 'text-[#667085]'}`}>{maskKey(item.key)}</div>
                                            <div className="mt-2 flex flex-wrap gap-1.5">
                                                {(item.capabilities || []).map(capability => (
                                                    <span key={capability} className={`rounded-full px-2 py-1 text-[11px] ${
                                                        isDark ? 'bg-[#1B2029] text-[#98A2B3]' : 'bg-[#F2F4F7] text-[#667085]'
                                                    }`}>
                                                        {capabilityLabels[capability]}
                                                    </span>
                                                ))}
                                            </div>
                                            {/* Usage stats */}
                                            {usageSummary?.get(item.id) && (() => {
                                                const u = usageSummary.get(item.id)!;
                                                if (u.totalCalls === 0) return null;
                                                return (
                                                    <div className={`mt-1.5 flex gap-3 text-[10px] ${isDark ? 'text-[#667085]' : 'text-[#98A2B3]'}`}>
                                                        <span>调用 {u.totalCalls} 次</span>
                                                        {u.errorCalls > 0 && <span className="text-red-400">失败 {u.errorCalls}</span>}
                                                        <span>≈ {formatCost(u.totalCostCents)}</span>
                                                        <span>24h: {u.last24h}</span>
                                                    </div>
                                                );
                                            })()}
                                        </div>
                                        <div className="ml-3 flex items-center gap-2">
                                            {!item.isDefault ? (
                                                <button type="button" onClick={() => onSetDefaultApiKey(item.id)} className={chipClass}>
                                                    设为默认
                                                </button>
                                            ) : (
                                                <span className={`rounded-full px-3 py-2 text-xs font-medium ${
                                                    isDark ? 'bg-[#123524] text-[#75E0A7]' : 'bg-[#ECFDF3] text-[#027A48]'
                                                }`}>
                                                    默认
                                                </span>
                                            )}
                                            <button
                                                type="button"
                                                onClick={() => handleStartEdit(item)}
                                                className={`rounded-full border px-3 py-2 text-xs font-medium ${
                                                    isDark ? 'border-[#2A3140] text-[#D0D5DD] hover:bg-[#252C39]' : 'border-[#E4E7EC] text-[#475467] hover:bg-[#F2F4F7]'
                                                }`}
                                            >
                                                编辑
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => onDeleteApiKey(item.id)}
                                                className={`rounded-full border px-3 py-2 text-xs font-medium ${
                                                    isDark ? 'border-[#7A271A] text-[#FDA29B]' : 'border-[#FECACA] text-[#DC2626]'
                                                }`}
                                            >
                                                删除
                                            </button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </section>

                    <section className="space-y-3">
                        <div className={`text-xs font-semibold uppercase tracking-[0.18em] ${isDark ? 'text-[#667085]' : 'text-[#98A2B3]'}`}>
                            模型偏好
                        </div>
                        <div className="grid gap-3 md:grid-cols-2">
                            <label className={`rounded-2xl p-3 ${isDark ? 'bg-[#161A22]' : 'bg-[#F8FAFC]'}`}>
                                <div className={`mb-2 text-sm font-medium ${isDark ? 'text-[#D0D5DD]' : 'text-[#344054]'}`}>LLM 润色模型</div>
                                <select value={modelPreference.textModel} onChange={(event) => setModelPreference({ ...modelPreference, textModel: event.target.value })} className={inputClass}>
                                    {modelOptions.text.map(model => <option key={model} value={model}>{model}</option>)}
                                </select>
                            </label>
                            <label className={`rounded-2xl p-3 ${isDark ? 'bg-[#161A22]' : 'bg-[#F8FAFC]'}`}>
                                <div className={`mb-2 text-sm font-medium ${isDark ? 'text-[#D0D5DD]' : 'text-[#344054]'}`}>图片模型</div>
                                <select value={modelPreference.imageModel} onChange={(event) => setModelPreference({ ...modelPreference, imageModel: event.target.value })} className={inputClass}>
                                    {modelOptions.image.map(model => <option key={model} value={model}>{model}</option>)}
                                </select>
                            </label>
                            <label className={`rounded-2xl p-3 ${isDark ? 'bg-[#161A22]' : 'bg-[#F8FAFC]'}`}>
                                <div className={`mb-2 text-sm font-medium ${isDark ? 'text-[#D0D5DD]' : 'text-[#344054]'}`}>视频模型</div>
                                <select value={modelPreference.videoModel} onChange={(event) => setModelPreference({ ...modelPreference, videoModel: event.target.value })} className={inputClass}>
                                    {modelOptions.video.map(model => <option key={model} value={model}>{model}</option>)}
                                </select>
                            </label>
                            <label className={`rounded-2xl p-3 ${isDark ? 'bg-[#161A22]' : 'bg-[#F8FAFC]'}`}>
                                <div className={`mb-2 text-sm font-medium ${isDark ? 'text-[#D0D5DD]' : 'text-[#344054]'}`}>Agent 模型</div>
                                <select value={modelPreference.agentModel} onChange={(event) => setModelPreference({ ...modelPreference, agentModel: event.target.value })} className={inputClass}>
                                    {modelOptions.agent.map(model => <option key={model} value={model}>{model}</option>)}
                                </select>
                            </label>
                        </div>
                    </section>

                    {/* Security section */}
                    <section className="space-y-3">
                        <div className={`text-xs font-semibold uppercase tracking-[0.18em] ${isDark ? 'text-[#667085]' : 'text-[#98A2B3]'}`}>
                            🔒 安全
                        </div>
                        <label className={`flex cursor-pointer items-center justify-between rounded-2xl p-4 ${isDark ? 'bg-[#161A22]' : 'bg-[#F8FAFC]'}`}>
                            <div>
                                <div className={`text-sm font-medium ${isDark ? 'text-[#D0D5DD]' : 'text-[#344054]'}`}>关闭页面时清除 API Key</div>
                                <div className={`mt-1 text-xs ${isDark ? 'text-[#667085]' : 'text-[#98A2B3]'}`}>启用后每次关闭浏览器标签页将自动清除保存的 API Key，下次访问需重新输入</div>
                            </div>
                            <div
                                role="switch"
                                aria-checked={clearKeysOnExit}
                                tabIndex={0}
                                onClick={() => setClearKeysOnExit(!clearKeysOnExit)}
                                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setClearKeysOnExit(!clearKeysOnExit); } }}
                                className={`relative ml-4 inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${
                                    clearKeysOnExit
                                        ? 'bg-green-500'
                                        : isDark ? 'bg-[#3A4458]' : 'bg-[#D0D5DD]'
                                }`}
                            >
                                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${clearKeysOnExit ? 'translate-x-6' : 'translate-x-1'}`} />
                            </div>
                        </label>
                        <div className={`rounded-2xl border p-3 text-xs ${isDark ? 'border-[#2A3140] text-[#667085]' : 'border-[#E4E7EC] text-[#98A2B3]'}`}>
                            ✅ API Key 已加密存储（AES-GCM），不再以明文保留在 localStorage 中。
                        </div>
                    </section>
                </div>
            </div>

            {/* API Key 添加/编辑弹窗（统一版） */}
            {showKeyModal && (
                <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={handleCancelEdit}>
                    <div
                        className={`relative max-h-[85vh] w-[90%] max-w-[500px] overflow-y-auto rounded-[24px] border p-6 shadow-[0_40px_100px_rgba(0,0,0,0.2)] ${
                            isDark ? 'border-[#2A3140] bg-[#12151B]' : 'border-[#E4E7EC] bg-white'
                        }`}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="mb-4 flex items-center justify-between">
                            <h4 className={`text-base font-semibold ${isDark ? 'text-[#F3F4F6]' : 'text-[#101828]'}`}>
                                {editingKeyId ? '编辑 API Key' : '添加 API Key'}
                            </h4>
                            <button type="button" onClick={handleCancelEdit} className={`rounded-full p-1.5 transition ${isDark ? 'hover:bg-[#252C39]' : 'hover:bg-[#F2F4F7]'}`}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12" /></svg>
                            </button>
                        </div>

                        <div className="space-y-3">
                            {/* 免费获取 API Key 引导 */}
                            {!editingKeyId && (
                                <div className={`rounded-2xl border p-3 ${isDark ? 'border-[#2A3140] bg-[#161A22]' : 'border-[#E4E7EC] bg-[#F8FAFC]'}`}>
                                    <div className={`mb-2 text-xs font-semibold ${isDark ? 'text-[#D0D5DD]' : 'text-[#344054]'}`}>🆓 免费获取 API Key</div>
                                    <div className="flex flex-wrap gap-2">
                                        {FREE_KEY_LINKS.map(link => (
                                            <a
                                                key={link.provider}
                                                href={link.url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-medium transition ${
                                                    isDark
                                                        ? 'border-[#2A3140] text-[#7CB4FF] hover:bg-[#1B2330]'
                                                        : 'border-[#B2CCFF] text-[#175CD3] hover:bg-[#EEF4FF]'
                                                }`}
                                                title={link.description}
                                            >
                                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                                                {link.label}
                                            </a>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* ComfyUI 本地模型 — Coming Soon */}
                            {!editingKeyId && (
                                <div className={`flex items-center gap-3 rounded-2xl border border-dashed p-3 ${isDark ? 'border-[#2A3140] bg-[#161A22]' : 'border-[#E4E7EC] bg-[#F8FAFC]'}`}>
                                    <span className="text-lg">🖥️</span>
                                    <div className="flex-1 min-w-0">
                                        <div className={`text-xs font-semibold ${isDark ? 'text-[#D0D5DD]' : 'text-[#344054]'}`}>ComfyUI 本地模型</div>
                                        <div className={`text-[10px] mt-0.5 ${isDark ? 'text-[#667085]' : 'text-[#98A2B3]'}`}>连接本地 ComfyUI 服务，运行 Wan2.1 等视频模型</div>
                                    </div>
                                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-medium ${isDark ? 'bg-purple-900/30 text-purple-400' : 'bg-purple-50 text-purple-600'}`}>Coming Soon</span>
                                </div>
                            )}

                            <div className="grid gap-3 md:grid-cols-2">
                                <select value={provider} onChange={(event) => handleProviderChange(event.target.value as AIProvider)} className={inputClass}>
                                    {Object.entries(PROVIDER_LABELS).map(([key, label]) => (
                                        <option key={key} value={key}>{label}</option>
                                    ))}
                                </select>
                                <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="备注名称（可选）" className={inputClass} />
                            </div>

                            <div className="flex gap-2">
                                <input
                                    value={apiKey}
                                    onChange={(event) => setApiKey(event.target.value)}
                                    onPaste={handleKeyPaste}
                                    type={showKey ? 'text' : 'password'}
                                    placeholder="粘贴 API Key（自动识别 Provider 并拉取模型）"
                                    className={inputClass}
                                    autoFocus
                                />
                                <button type="button" onClick={() => setShowKey(prev => !prev)} className={chipClass}>
                                    {showKey ? '隐藏' : '显示'}
                                </button>
                            </div>

                            {/* 自动识别结果提示 */}
                            {autoDetectedProvider && (
                                <div className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs ${
                                    isDark ? 'bg-[#1B2330] text-[#7CB4FF]' : 'bg-[#EFF6FF] text-[#1D4ED8]'
                                }`}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                                    自动识别为 <strong>{PROVIDER_LABELS[autoDetectedProvider]}</strong>
                                    {isFetchingModels && <span className="ml-1 animate-pulse">正在拉取模型列表...</span>}
                                </div>
                            )}

                            {endpointFlavor && (
                                <div className={`rounded-xl px-3 py-2 text-xs ${
                                    isDark ? 'bg-[#161A22] text-[#D0D5DD]' : 'bg-[#F8FAFC] text-[#475467]'
                                }`}>
                                    兼容端点识别：
                                    <strong className="ml-1">
                                        {endpointFlavor === 'openrouter-compatible'
                                            ? 'OpenRouter 风格'
                                            : endpointFlavor === 'openai-compatible'
                                                ? 'OpenAI 兼容风格'
                                                : 'Google 原生风格'}
                                    </strong>
                                    {detectedCapabilities.length > 0 && (
                                        <span className="ml-2">
                                            能力：{detectedCapabilities.map(cap => capabilityLabels[cap]).join(' / ')}
                                        </span>
                                    )}
                                    {fetchedModels.length > 0 && <span className="ml-2">已识别 {fetchedModels.length} 个模型</span>}
                                </div>
                            )}

                            <input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder="Base URL（可选）" className={inputClass} />

                            <div>
                                <div className={`mb-2 flex items-center justify-between`}>
                                    <span className={`text-sm font-medium ${isDark ? 'text-[#D0D5DD]' : 'text-[#344054]'}`}>这个 API 用于</span>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {(['text', 'image', 'video', 'agent'] as AICapability[]).map(capability => (
                                        <button
                                            key={capability}
                                            type="button"
                                            onClick={() => toggleCapability(capability)}
                                            className={`${chipClass} ${
                                                capabilities.includes(capability)
                                                    ? isDark
                                                        ? 'border-[#4B5B78] bg-[#1B2330] text-[#7CB4FF]'
                                                        : 'border-[#1D4ED8] bg-[#EFF6FF] text-[#1D4ED8]'
                                                    : ''
                                            }`}
                                        >
                                            {capabilityLabels[capability]}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* 模型管理 */}
                            <div>
                                <div className={`mb-2 flex items-center justify-between`}>
                                    <span className={`text-sm font-medium ${isDark ? 'text-[#D0D5DD]' : 'text-[#344054]'}`}>模型列表</span>
                                    <button
                                        type="button"
                                        disabled={!apiKey.trim() || isFetchingModels}
                                        onClick={() => handleFetchModels(provider, apiKey, baseUrl)}
                                        className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition disabled:opacity-40 ${
                                            isDark ? 'border-[#4B5B78] text-[#7CB4FF] hover:bg-[#1B2330]' : 'border-[#B2CCFF] text-[#175CD3] hover:bg-[#EEF4FF]'
                                        }`}
                                    >
                                        {isFetchingModels ? '拉取中...' : '🔄 获取模型'}
                                    </button>
                                </div>
                                {fetchError && (
                                    <div className={`mb-2 rounded-xl px-3 py-1.5 text-xs ${isDark ? 'bg-[#3A1616] text-[#FDA29B]' : 'bg-[#FEF3F2] text-[#B42318]'}`}>
                                        拉取模型失败：{fetchError}（可手动添加模型）
                                    </div>
                                )}
                                {editModels.length > 0 && (
                                    <div className="mb-2 flex flex-wrap gap-1.5">
                                        {editModels.map(m => (
                                            <span key={m.id} className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] ${
                                                editDefaultModel === m.id
                                                    ? isDark ? 'bg-blue-500/20 text-blue-400 border border-blue-500/40' : 'bg-blue-50 text-blue-600 border border-blue-200'
                                                    : isDark ? 'bg-[#1B2029] text-[#98A2B3]' : 'bg-[#F2F4F7] text-[#667085]'
                                            }`}>
                                                <button type="button" onClick={() => setEditDefaultModel(m.id)} title="设为默认">{m.name || m.id}</button>
                                                <button type="button" onClick={() => handleRemoveModel(m.id)} className="ml-0.5 opacity-60 hover:opacity-100">×</button>
                                            </span>
                                        ))}
                                    </div>
                                )}
                                <div className="flex gap-2">
                                    <input
                                        value={newModelId}
                                        onChange={(e) => setNewModelId(e.target.value)}
                                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddModel(); } }}
                                        placeholder="输入模型 ID 并回车添加"
                                        className={inputClass}
                                    />
                                    <button type="button" onClick={handleAddModel} className={chipClass}>添加</button>
                                </div>
                                {editModels.length > 0 && (
                                    <div className={`mt-1.5 text-[11px] ${isDark ? 'text-[#667085]' : 'text-[#98A2B3]'}`}>
                                        点击模型名称设为默认（蓝色高亮），点击 × 删除
                                    </div>
                                )}
                            </div>

                            {/* extraConfig（如 Google Veo projectId） */}
                            {(provider === 'keling' || provider === 'custom') && (
                                <div>
                                    <div className={`mb-2 text-sm font-medium ${isDark ? 'text-[#D0D5DD]' : 'text-[#344054]'}`}>额外配置</div>
                                    <input
                                        value={extraConfig.projectId || ''}
                                        onChange={(e) => setExtraConfig({ ...extraConfig, projectId: e.target.value })}
                                        placeholder="Project ID（可选）"
                                        className={inputClass}
                                    />
                                </div>
                            )}

                            <div className="flex items-center gap-2 pt-1">
                                <button
                                    type="button"
                                    onClick={handleSaveKey}
                                    disabled={!apiKey.trim() || capabilities.length === 0 || isValidating}
                                    className={`flex-1 rounded-full px-4 py-2.5 text-sm font-medium transition disabled:cursor-not-allowed ${
                                        isDark
                                            ? 'bg-[#F3F4F6] text-[#111827] hover:bg-white disabled:bg-[#3A4458] disabled:text-[#98A2B3]'
                                            : 'bg-[#111827] text-white hover:bg-[#0F172A] disabled:bg-[#D0D5DD]'
                                    }`}
                                >
                                    {isValidating ? '验证中...' : editingKeyId ? '验证并更新' : '验证并保存'}
                                </button>
                                <button
                                    type="button"
                                    onClick={handleCancelEdit}
                                    className={`rounded-full border px-4 py-2.5 text-sm font-medium transition ${
                                        isDark ? 'border-[#2A3140] text-[#D0D5DD] hover:bg-[#252C39]' : 'border-[#E4E7EC] text-[#475467] hover:bg-[#F2F4F7]'
                                    }`}
                                >
                                    取消
                                </button>
                            </div>

                            {validationResult && (
                                <div className={`rounded-xl px-3 py-2 text-sm ${
                                    validationResult.ok
                                        ? isDark ? 'bg-[#123524] text-[#75E0A7]' : 'bg-[#ECFDF3] text-[#027A48]'
                                        : isDark ? 'bg-[#3A1616] text-[#FDA29B]' : 'bg-[#FEF3F2] text-[#B42318]'
                                }`}>
                                    {validationResult.ok
                                        ? '✓ Key 验证通过，已保存'
                                        : `✗ 验证失败：${validationResult.message || 'API Key 无效'}`
                                    }
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
