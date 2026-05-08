import React from 'react';
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';

import { Toolbar } from '../components/Toolbar';

describe('Toolbar media upload', () => {
  it('accepts both image and video files for Canva uploads', () => {
    const { container } = render(
      <Toolbar
        t={(key) => key}
        theme="light"
        compactScale={1}
        topOffset={0}
        leftClosed={0}
        leftOpen={0}
        activeTool="select"
        setActiveTool={() => undefined}
        drawingOptions={{ strokeColor: '#111827', strokeWidth: 4 }}
        setDrawingOptions={() => undefined}
        onUpload={() => undefined}
        isCropping={false}
        onConfirmCrop={() => undefined}
        onCancelCrop={() => undefined}
        onSettingsClick={() => undefined}
        onLayersClick={() => undefined}
        onBoardsClick={() => undefined}
        onUndo={() => undefined}
        onRedo={() => undefined}
        canUndo={false}
        canRedo={false}
      />,
    );

    const input = container.querySelector('input[type="file"]') as HTMLInputElement | null;
    expect(input?.accept).toBe('image/*,video/*');
  });
});
