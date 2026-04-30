import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { CanvasSettings } from '../components/CanvasSettings';
import type { ModelPreference, UserApiKey } from '../types';

const modelPreference: ModelPreference = {
  textModel: 'custom-text-model',
  imageModel: 'custom-image-model',
  videoModel: 'custom-video-model',
  agentModel: 'custom-agent-model',
};

function renderSettings(userApiKeys: UserApiKey[] = []) {
  return render(
    <CanvasSettings
      isOpen
      onClose={() => undefined}
      language="zho"
      setLanguage={() => undefined}
      themeMode="dark"
      resolvedTheme="dark"
      setThemeMode={() => undefined}
      wheelAction="zoom"
      setWheelAction={() => undefined}
      userApiKeys={userApiKeys}
      onAddApiKey={() => undefined}
      onDeleteApiKey={() => undefined}
      onUpdateApiKey={() => undefined}
      onSetDefaultApiKey={() => undefined}
      modelPreference={modelPreference}
      setModelPreference={() => undefined}
      t={(key) => key}
      clearKeysOnExit={false}
      setClearKeysOnExit={() => undefined}
      dynamicModelOptions={{
        text: ['custom-text-model'],
        image: ['custom-image-model'],
        video: ['custom-video-model'],
        agent: ['custom-agent-model'],
      }}
    />,
  );
}

describe('CanvasSettings provider configuration UI', () => {
  it('removes the Template Insight block from settings', () => {
    renderSettings();

    expect(screen.queryByText('Template Insight')).toBeNull();
    expect(screen.queryByText(/Current preferences resolved/i)).toBeNull();
  });

  it('opens a CC Switch style provider setup flow with advanced model config fields', () => {
    renderSettings();

    fireEvent.click(screen.getByRole('button', { name: /添加 API Key|添加供应商/i }));

    expect(screen.getByText('预设供应商')).toBeTruthy();
    expect(screen.getByText('自定义配置')).toBeTruthy();
    expect(screen.getByText('Claude Official')).toBeTruthy();
    expect(screen.getByText('模型映射')).toBeTruthy();
    expect(screen.getByText('配置 JSON')).toBeTruthy();
    expect(screen.getByText('模型测试配置')).toBeTruthy();
  });

  it('offers Banana as a preset so layer splitting can be wired to a user key', () => {
    renderSettings();

    fireEvent.click(screen.getByRole('button', { name: /添加 API Key|添加供应商/i }));

    expect(screen.getByText('Banana Vision')).toBeTruthy();
  });

  it('uses user configured agent models instead of a hardcoded provider-only list', () => {
    renderSettings();

    expect(screen.getByRole('option', { name: 'custom-agent-model' })).toBeTruthy();
  });
});
