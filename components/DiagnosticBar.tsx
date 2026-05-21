/**
 * DiagnosticBar — 画布底部常驻诊断条
 *
 * 极简设计师友好风格：显示 ✅/❌ 各能力可用状态。
 * 点击缺失能力 → 打开设置面板添加 API Key。
 * 全部就绪时显示绿色 ✓ 并自动隐藏到 hover 态。
 */
import React, { useMemo } from 'react';
import type { UserApiKey, AICapability } from '../types';
import { diagnoseKeyCapabilities } from '../services/aiGateway';

interface DiagnosticBarProps {
    userApiKeys: UserApiKey[];
    theme: 'light' | 'dark';
    onOpenSettings: () => void;
}

const CREATIVE_CAPABILITIES: AICapability[] = ['text', 'image', 'video'];

const CAP_LABELS: Record<'text' | 'image' | 'video', { label: string; icon: string }> = {
    text: { label: '润色', icon: '✏️' },
    image: { label: '绘图', icon: '🎨' },
    video: { label: '视频', icon: '🎬' },
};

export const DiagnosticBar: React.FC<DiagnosticBarProps> = ({ userApiKeys, theme, onOpenSettings }) => {
    const diagnosis = useMemo(() => diagnoseKeyCapabilities(userApiKeys), [userApiKeys]);

    const isDark = theme === 'dark';
    const allGood = diagnosis.missing.length === 0;

    // 全部就绪：显示最小化状态（hover 展开）
    if (allGood) {
        return (
            <div
                className="group flex items-center justify-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-medium transition-all cursor-default select-none"
                style={{
                    background: isDark ? 'rgba(16, 185, 129, 0.1)' : 'rgba(16, 185, 129, 0.08)',
                    color: isDark ? '#6EE7B7' : '#059669',
                }}
            >
                <span>✓</span>
                <span className="max-w-0 overflow-hidden opacity-0 group-hover:max-w-[200px] group-hover:opacity-100 transition-all duration-300">
                    全部功能就绪
                </span>
            </div>
        );
    }

    return (
        <div
            className="flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-medium transition-all select-none"
            style={{
                background: isDark ? 'rgba(18, 21, 27, 0.85)' : 'rgba(255, 255, 255, 0.85)',
                backdropFilter: 'blur(8px)',
                border: `1px solid ${isDark ? '#2A3140' : '#E4E7EC'}`,
            }}
        >
            {CREATIVE_CAPABILITIES.map(cap => {
                const covered = diagnosis.covered.includes(cap);
                const { label, icon } = CAP_LABELS[cap];
                return (
                    <button
                        key={cap}
                        onClick={covered ? undefined : onOpenSettings}
                        className={`flex items-center gap-1 rounded-full px-2 py-0.5 transition-all ${
                            covered
                                ? 'cursor-default'
                                : 'cursor-pointer hover:scale-105 active:scale-95'
                        }`}
                        style={{
                            color: covered
                                ? (isDark ? '#6EE7B7' : '#059669')
                                : (isDark ? '#FDA29B' : '#B42318'),
                            background: covered
                                ? 'transparent'
                                : (isDark ? 'rgba(253, 162, 155, 0.08)' : 'rgba(180, 35, 24, 0.06)'),
                        }}
                        title={covered ? `${label}已就绪` : `${label}不可用 — 点击配置 API Key`}
                    >
                        <span>{icon}</span>
                        <span>{covered ? '✓' : '✗'}</span>
                        <span>{label}</span>
                    </button>
                );
            })}

            {diagnosis.missing.length > 0 && (
                <button
                    onClick={onOpenSettings}
                    className="ml-1 flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] transition-all hover:scale-105 active:scale-95"
                    style={{
                        color: isDark ? '#93C5FD' : '#2563EB',
                        background: isDark ? 'rgba(59, 130, 246, 0.1)' : 'rgba(37, 99, 235, 0.06)',
                    }}
                >
                    <span>⚙️</span>
                    <span>配置</span>
                </button>
            )}
        </div>
    );
};
