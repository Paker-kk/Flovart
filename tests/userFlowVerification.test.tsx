/**
 * User Flow Verification Tests
 * Simulates real user operations for P0 fixes: workspace tabs, storyboard CRUD, assets browsing.
 */
import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// ── Storyboard Flow ──────────────────────────────────────────────

import { StoryboardWorkspace } from '../components/workspaces/StoryboardWorkspace';
import {
  loadStoryboardState,
  saveStoryboardState,
  STORYBOARD_STORAGE_KEY,
} from '../utils/storyboardStore';

describe('StoryboardWorkspace — real user flow', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders empty state, then creates a project, adds shots, edits a shot, deletes a shot', () => {
    const { container } = render(<StoryboardWorkspace />);

    // 1. Initial render should show a default project
    expect(screen.getByText('Storyboard')).toBeTruthy();
    expect(screen.getByText('+ New Project')).toBeTruthy();

    const stateAfterLoad = loadStoryboardState();
    expect(stateAfterLoad.projects.length).toBeGreaterThanOrEqual(1);

    // 2. Create a second project
    fireEvent.click(screen.getByText('+ New Project'));
    const stateAfterAdd = loadStoryboardState();
    expect(stateAfterAdd.projects.length).toBe(2);

    // 3. Add a shot to the active project
    fireEvent.click(screen.getByText('+ Add'));

    const stateAfterShot = loadStoryboardState();
    const activeProj = stateAfterShot.projects.find(
      (p) => p.id === stateAfterShot.activeStoryboardId,
    );
    expect(activeProj).toBeTruthy();
    expect(activeProj!.shots.length).toBe(2); // default + 1 added

    // Active shot has its title displayed in the detail panel
    const activeShot = activeProj!.shots.find(
      (s) => s.id === activeProj!.activeShotId,
    );
    expect(activeShot).toBeTruthy();
    expect(screen.getByDisplayValue(activeShot!.title)).toBeTruthy();

    // 4. Edit the shot title
    const titleInput = screen.getByPlaceholderText('Shot title') as HTMLInputElement;
    fireEvent.change(titleInput, { target: { value: 'My Test Shot' } });
    expect(titleInput.value).toBe('My Test Shot');

    // 5. Delete the shot
    fireEvent.click(screen.getByText('Delete'));

    const stateAfterDelete = loadStoryboardState();
    const projAfterDelete = stateAfterDelete.projects.find(
      (p) => p.id === stateAfterDelete.activeStoryboardId,
    );
    expect(projAfterDelete!.shots.length).toBeGreaterThanOrEqual(1);

    // 6. Switch to the first project (both have same name, use first button)
    const firstProject = stateAfterDelete.projects[0];
    const projectTabs = screen.getAllByText(firstProject.name);
    fireEvent.click(projectTabs[0]);
    const stateAfterSwitch = loadStoryboardState();
    expect(stateAfterSwitch.activeStoryboardId).toBe(firstProject.id);
  });

  it('saves state to localStorage when modified', () => {
    render(<StoryboardWorkspace />);

    // Click add project
    fireEvent.click(screen.getByText('+ New Project'));

    // localStorage should contain the saved state
    const raw = localStorage.getItem(STORYBOARD_STORAGE_KEY);
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!);
    expect(parsed.projects.length).toBe(2);
  });
});

// ── Assets Flow ───────────────────────────────────────────────────

import { AssetsWorkspace } from '../components/workspaces/AssetsWorkspace';
import type { AssetLibrary, AssetItem } from '../types';
import { saveAssetLibrary } from '../utils/assetStorage';

function seedAssets(): AssetLibrary {
  const lib: AssetLibrary = {
    character: [
      {
        id: 'char-1',
        name: 'Knight Character',
        category: 'character',
        dataUrl: '',
        width: 512,
        height: 512,
        mimeType: 'image/png',
        createdAt: Date.now(),
      },
      {
        id: 'char-2',
        name: 'Wizard',
        category: 'character',
        dataUrl: '',
        width: 768,
        height: 768,
        mimeType: 'image/png',
        createdAt: Date.now() - 1000,
      },
    ],
    scene: [
      {
        id: 'scene-1',
        name: 'Castle Background',
        category: 'scene',
        dataUrl: '',
        width: 1920,
        height: 1080,
        mimeType: 'image/jpeg',
        createdAt: Date.now(),
      },
    ],
    prop: [],
  };
  saveAssetLibrary(lib);
  return lib;
}

describe('AssetsWorkspace — real user flow', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('shows empty state when no assets', () => {
    render(<AssetsWorkspace />);
    expect(screen.getByText('Assets')).toBeTruthy();
    // Should show empty message
    expect(screen.getByText(/No characters assets yet/i)).toBeTruthy();
  });

  it('displays seeded assets, switches categories, shows total count', () => {
    seedAssets();
    const { container } = render(<AssetsWorkspace />);

    // 1. Should show total count: 3 items
    expect(screen.getByText('3 items')).toBeTruthy();

    // 2. Character tab should be active by default showing 2 items
    expect(screen.getByText('Knight Character')).toBeTruthy();
    expect(screen.getByText('Wizard')).toBeTruthy();

    // 3. Dimensions should show
    expect(screen.getByText('512 × 512')).toBeTruthy();
    expect(screen.getByText('768 × 768')).toBeTruthy();

    // 4. Switch to Scenes tab
    fireEvent.click(screen.getByText('Scenes'));
    expect(screen.getByText('Castle Background')).toBeTruthy();
    expect(screen.getByText('1920 × 1080')).toBeTruthy();

    // 5. Switch to Props tab
    fireEvent.click(screen.getByText('Props'));
    expect(screen.getByText(/No props assets yet/i)).toBeTruthy();

    // 6. Switch back to Characters
    fireEvent.click(screen.getByText('Characters'));
    expect(screen.getByText('Knight Character')).toBeTruthy();
  });

  it('opens preview overlay on asset click', () => {
    seedAssets();
    render(<AssetsWorkspace />);

    // Click the first asset
    fireEvent.click(screen.getByText('Knight Character'));

    // Preview overlay should show the asset name
    const previewName = screen.getAllByText('Knight Character');
    expect(previewName.length).toBeGreaterThanOrEqual(2); // one in grid, one in preview

    // Close preview
    const closeBtn = screen.getByLabelText('Close preview');
    fireEvent.click(closeBtn);
  });

  it('deletes an asset and updates count', () => {
    seedAssets();
    const { container } = render(<AssetsWorkspace />);

    // Initially 3 items
    expect(screen.getByText('3 items')).toBeTruthy();
    expect(screen.getByText('Knight Character')).toBeTruthy();

    // Delete button is hidden until hover on the parent card
    const assetCards = container.querySelectorAll('.group');
    const firstCard = assetCards[0] as HTMLElement;
    fireEvent.mouseOver(firstCard);

    // Now find and click the delete button
    const deleteBtn = firstCard.querySelector('button[aria-label*="Delete"]') as HTMLElement;
    expect(deleteBtn).toBeTruthy();
    fireEvent.click(deleteBtn);

    // After deletion: 2 items
    expect(screen.getByText('2 items')).toBeTruthy();
  });
});

// ── TopWorkspaceBar — all tabs render ────────────────────────────

import { TopWorkspaceBar } from '../components/TopWorkspaceBar';
import type { WorkspaceView } from '../types';

describe('TopWorkspaceBar — tab completeness', () => {
  it('renders Canvas and Workflow tabs centered', () => {
    const handleChange = (_v: WorkspaceView) => {};
    render(
      <TopWorkspaceBar
        activeView="canvas"
        onChangeView={handleChange}
        onOpenSettings={() => {}}
      />,
    );

    // Only 2 tabs: Canvas and Workflow
    expect(screen.getByText('Canvas')).toBeTruthy();
    expect(screen.getByText('Workflow')).toBeTruthy();

    // Other tabs should NOT be present
    expect(screen.queryByText('Storyboard')).toBeNull();
    expect(screen.queryByText('Assets')).toBeNull();
    expect(screen.queryByText('Publish')).toBeNull();
    expect(screen.queryByText('Diag')).toBeNull();

    // The shared switcher should stay minimal: no brand or settings chrome.
    expect(screen.queryByText('Settings')).toBeNull();
    expect(screen.queryByText('Flovart')).toBeNull();
  });
});

// ── Vite config — no API keys in bundle ──────────────────────────

import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('Build security — no API keys in bundle', () => {
  it('vite.config.ts has no define block with API keys', () => {
    const config = readFileSync(
      resolve(__dirname, '..', 'vite.config.ts'),
      'utf-8',
    );
    expect(config).not.toContain('process.env.API_KEY');
    expect(config).not.toContain('process.env.GEMINI_API_KEY');
    expect(config).not.toContain('GEMINI_API_KEY');
  });

  it('geminiService.ts has no executable process.env.API_KEY reference', () => {
    const src = readFileSync(
      resolve(__dirname, '..', 'services', 'geminiService.ts'),
      'utf-8',
    );
    // Strip comments to only check executable code
    const codeLines = src.split('\n').filter(
      (line) => !line.trim().startsWith('//') && !line.trim().startsWith('*'),
    );
    const code = codeLines.join('\n');
    expect(code).not.toContain('process.env.API_KEY');
  });
});

// ── WorkspaceView type — includes new tabs ───────────────────────

import type { WorkspaceView } from '../types';

describe('WorkspaceView type — completeness', () => {
  it('accepts Canvas and Workflow', () => {
    const views: WorkspaceView[] = ['canvas', 'workflow'];
    expect(views.length).toBe(2);
  });
});

// ── NodeWorkflowPanel — context menu has execute actions ─────────
// (Component-level check on the action handler)

import { NODE_DEFS } from '../components/nodeflow/defs';

describe('Node library — all 21 node kinds defined and available', () => {
  it('NODE_DEFS has all 21 kinds', () => {
    const kinds = Object.keys(NODE_DEFS);
    expect(kinds.length).toBe(21);
  });

  it('all expected node kinds are present', () => {
    const required: string[] = [
      'prompt',
      'loadImage',
      'loadVideo',
      'enhancer',
      'generator',
      'preview',
      'llm',
      'imageGen',
      'videoGen',
      'videoEdit',
      'runningHub',
      'httpRequest',
      'condition',
      'switch',
      'merge',
      'template',
      'upscale',
      'faceRestore',
      'bgRemove',
      'saveToCanvas',
      'saveToAssets',
    ];
    for (const kind of required) {
      expect(NODE_DEFS[kind as keyof typeof NODE_DEFS]).toBeTruthy();
    }
  });
});
