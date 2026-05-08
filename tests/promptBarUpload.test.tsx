import React from 'react';
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';

import { PromptBar } from '../components/PromptBar';

describe('PromptBar media attachments', () => {
  it('accepts both image and video reference uploads', () => {
    const { container } = render(
      <PromptBar
        t={(key) => key}
        theme="light"
        prompt=""
        setPrompt={() => undefined}
        onGenerate={() => undefined}
        isLoading={false}
        isSelectionActive={false}
        selectedElementCount={0}
        userEffects={[]}
        onAddUserEffect={() => undefined}
        onDeleteUserEffect={() => undefined}
        generationMode="image"
        setGenerationMode={() => undefined}
        videoAspectRatio="16:9"
        setVideoAspectRatio={() => undefined}
      />,
    );

    const input = container.querySelector('input[type="file"]') as HTMLInputElement | null;
    expect(input?.accept).toBe('image/*,video/*');
  });
});
