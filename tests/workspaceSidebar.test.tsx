import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { WorkspaceSidebar } from '../components/WorkspaceSidebar';
import type { Board, Element } from '../types';

const board: Board = {
  id: 'board_1',
  name: 'Board 1',
  elements: [],
  history: [[]],
  historyIndex: 0,
};

function renderSidebar(elements: Element[]) {
  return render(
    <WorkspaceSidebar
      isOpen
      onToggle={() => undefined}
      outerGap={16}
      panelWidth={280}
      boards={[board]}
      activeBoardId={board.id}
      onSwitchBoard={() => undefined}
      onAddBoard={() => undefined}
      onRenameBoard={() => undefined}
      onDuplicateBoard={() => undefined}
      onDeleteBoard={() => undefined}
      generateBoardThumbnail={() => 'data:image/png;base64,thumbnail'}
      elements={elements}
      selectedElementIds={[]}
      onSelectElement={() => undefined}
      onToggleVisibility={() => undefined}
      onToggleLock={() => undefined}
      onRenameElement={() => undefined}
      onReorder={() => undefined}
    />,
  );
}

describe('WorkspaceSidebar layers', () => {
  it('shows a Canva group as one layer and expands to reveal grouped children', () => {
    renderSidebar([
      {
        id: 'image_1',
        type: 'image',
        name: 'Reference image',
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        href: 'data:image/png;base64,img',
        mimeType: 'image/png',
        parentId: 'group_1',
      },
      {
        id: 'video_1',
        type: 'video',
        name: 'Motion clip',
        x: 120,
        y: 0,
        width: 160,
        height: 90,
        href: 'blob:video',
        mimeType: 'video/mp4',
        parentId: 'group_1',
      },
      {
        id: 'group_1',
        type: 'group',
        name: 'Group',
        x: 0,
        y: 0,
        width: 280,
        height: 100,
      },
    ]);

    expect(screen.getByText('Group')).toBeTruthy();
    expect(screen.queryByText('Reference image')).toBeNull();
    expect(screen.queryByText('Motion clip')).toBeNull();

    fireEvent.click(screen.getByLabelText('Expand group layer'));
    expect(screen.getByText('Reference image')).toBeTruthy();
    expect(screen.getByText('Motion clip')).toBeTruthy();
  });

  it('passes additive layer selection for multi-select gestures', () => {
    const onSelectElement = vi.fn();
    render(
      <WorkspaceSidebar
        isOpen
        onToggle={() => undefined}
        outerGap={16}
        panelWidth={280}
        boards={[board]}
        activeBoardId={board.id}
        onSwitchBoard={() => undefined}
        onAddBoard={() => undefined}
        onRenameBoard={() => undefined}
        onDuplicateBoard={() => undefined}
        onDeleteBoard={() => undefined}
        generateBoardThumbnail={() => 'data:image/png;base64,thumbnail'}
        elements={[{
          id: 'video_1',
          type: 'video',
          name: 'Motion clip',
          x: 0,
          y: 0,
          width: 160,
          height: 90,
          href: 'blob:video',
          mimeType: 'video/mp4',
        }]}
        selectedElementIds={[]}
        onSelectElement={onSelectElement}
        onToggleVisibility={() => undefined}
        onToggleLock={() => undefined}
        onRenameElement={() => undefined}
        onReorder={() => undefined}
      />,
    );

    fireEvent.click(screen.getByText('Motion clip'), { ctrlKey: true });
    expect(onSelectElement).toHaveBeenCalledWith('video_1', true);
  });
});
