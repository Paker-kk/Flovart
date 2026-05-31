/**
 * DiagnosticBar — 画布底部常驻诊断条
 *
 * 极简设计师友好风格：显示 ✅/❌ 各能力可用状态。
 * 点击缺失能力 → 打开设置面板添加 API Key。
 * 全部就绪时也显示完整文字，避免触屏用户看不到状态。
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
    text: { label: '提示词润色', icon: 'Aa' },
    image: { label: '图片生成', icon: 'Img' },
    video: { label: '视频生成', icon: 'Vid' },
};

export const DiagnosticBar: React.FC<DiagnosticBarProps> = ({ userApiKeys, theme, onOpenSettings }) => {
    const diagnosis = useMemo(() => diagnoseKeyCapabilities(userApiKeys), [userApiKeys]);

    const allGood = diagnosis.missing.length === 0;

    if (allGood) {
        return (
            <div
                className="flex items-center justify-center gap-1.5 px-3 py-1 text-[11px] font-bold transition-all cursor-default select-none"
                style={{
                    fontFamily: 'var(--isl-font)',
                    borderRadius: 'var(--isl-r-pill)',
                    background: 'var(--isl-mint-bg)',
                    color: 'var(--isl-mint-deep)',
                }}
            >
                <span>🌱</span>
                <span>全部功能就绪</span>
            </div>
        );
    }

    return (
        <div
            className="flex items-center gap-2 px-3 py-1.5 text-[11px] font-bold select-none"
            style={{
                fontFamily: 'var(--isl-font)',
                borderRadius: 'var(--isl-r-pill)',
                background: 'var(--isl-card)',
                border: '1.5px solid var(--isl-border-strong)',
                boxShadow: '0 2px 0 0 var(--isl-edge)',
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
                            color: covered ? 'var(--isl-mint-deep)' : 'var(--isl-coral-deep)',
                            background: covered ? 'transparent' : 'rgba(232, 97, 90, 0.1)',
                        }}
                        title={covered ? `${label}已就绪` : `${label}不可用 — 点击配置 API Key`}
                    >
                        <span className="font-bold tabular-nums">{icon}</span>
                        <span>{covered ? '✓' : '✗'}</span>
                        <span>{label}</span>
                    </button>
                );
            })}

            {diagnosis.missing.length > 0 && (
                <button
                    onClick={onOpenSettings}
                    className="isl-chip isl-chip--active ml-1 px-2 py-0.5 text-[10px]"
                >
                    <span>⚙️</span>
                    <span>配置</span>
                </button>
            )}
        </div>
    );
};
