import { describe, expect, it } from 'vitest';

import { addAsset } from '../utils/assetStorage';
import {
  createAssetFromHistoryItem,
  createRecipePackageFromAsset,
  installRecipePackageToAssets,
  parseRecipePackageJson,
  serializeRecipePackage,
} from '../utils/recipePackage';
import type { AssetLibrary } from '../types';

describe('recipe packages', () => {
  it('exports an asset with prompt/provider/model recipe metadata', () => {
    const asset = {
      id: 'asset-1',
      category: 'scene' as const,
      name: 'Castle',
      dataUrl: 'data:image/png;base64,abc',
      mimeType: 'image/png',
      width: 512,
      height: 512,
      createdAt: 1,
      prompt: 'A castle at dusk',
      provider: 'custom',
      model: 'third-party-image',
      generationParams: { seed: 42, steps: 20 },
    };

    const pack = createRecipePackageFromAsset(asset);

    expect(pack.asset.name).toBe('Castle');
    expect(pack.recipe).toMatchObject({
      prompt: 'A castle at dusk',
      provider: 'custom',
      model: 'third-party-image',
      generationParams: { seed: 42, steps: 20 },
    });
  });

  it('installs a recipe package into the local asset library for one-click recreation', () => {
    const empty: AssetLibrary = { character: [], scene: [], prop: [] };
    const pack = createRecipePackageFromAsset({
      id: 'asset-1',
      category: 'scene',
      name: 'Castle',
      dataUrl: 'data:image/png;base64,abc',
      mimeType: 'image/png',
      width: 512,
      height: 512,
      createdAt: 1,
      prompt: 'A castle at dusk',
      provider: 'custom',
      model: 'third-party-image',
    });

    const next = installRecipePackageToAssets(empty, pack, 2000);

    expect(next.scene).toHaveLength(1);
    expect(next.scene[0]).toMatchObject({
      name: 'Castle',
      prompt: 'A castle at dusk',
      provider: 'custom',
      model: 'third-party-image',
      source: 'recipe',
    });

    const afterDuplicate = addAsset(next, next.scene[0]);
    expect(afterDuplicate.scene).toHaveLength(1);
  });

  it('serializes and validates imported recipe package JSON', () => {
    const pack = createRecipePackageFromAsset({
      id: 'asset-1',
      category: 'scene',
      name: 'Castle',
      dataUrl: 'data:image/png;base64,abc',
      mimeType: 'image/png',
      width: 512,
      height: 512,
      createdAt: 1,
      prompt: 'A castle at dusk',
    });

    const json = serializeRecipePackage(pack);
    const parsed = parseRecipePackageJson(json);

    expect(parsed).toMatchObject({
      version: 1,
      asset: { name: 'Castle', category: 'scene' },
      recipe: { prompt: 'A castle at dusk' },
    });
    expect(parseRecipePackageJson('{"version":1,"asset":{},"recipe":{}}')).toBeNull();
    expect(parseRecipePackageJson('not-json')).toBeNull();
  });

  it('turns a generation history item into a reusable recipe asset', () => {
    const asset = createAssetFromHistoryItem({
      id: 'history-1',
      name: 'Generated Castle',
      dataUrl: 'data:image/jpeg;base64,thumb',
      mimeType: 'image/jpeg',
      width: 768,
      height: 512,
      prompt: 'A painterly castle',
      createdAt: 10,
      provider: 'openrouter',
      model: 'black-forest-labs/flux-kontext-pro',
      generationParams: { aspectRatio: '3:2' },
    });

    expect(asset).toMatchObject({
      id: 'history-1',
      category: 'scene',
      name: 'Generated Castle',
      source: 'generation',
      prompt: 'A painterly castle',
      provider: 'openrouter',
      model: 'black-forest-labs/flux-kontext-pro',
      generationParams: { aspectRatio: '3:2' },
    });
  });
});
