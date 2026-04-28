import React, { useCallback, useState } from 'react';
import type { AssetCategory, AssetItem, AssetLibrary } from '../../types';
import { loadAssetLibrary, removeAsset, saveAssetLibrary } from '../../utils/assetStorage';

const CATEGORIES: AssetCategory[] = ['character', 'scene', 'prop'];
const CATEGORY_LABELS: Record<AssetCategory, string> = {
  character: 'Characters',
  scene: 'Scenes',
  prop: 'Props',
};

export const AssetsWorkspace: React.FC = () => {
  const [lib, setLib] = useState<AssetLibrary>(() => loadAssetLibrary());
  const [activeCategory, setActiveCategory] = useState<AssetCategory>('character');
  const [previewAsset, setPreviewAsset] = useState<AssetItem | null>(null);

  const persist = useCallback((next: AssetLibrary) => {
    setLib(next);
    saveAssetLibrary(next);
  }, []);

  const handleDelete = useCallback((id: string) => {
    setLib((prev) => {
      const next = removeAsset(prev, activeCategory, id);
      saveAssetLibrary(next);
      return next;
    });
  }, [activeCategory]);

  const items = lib[activeCategory] ?? [];
  const totalCount = CATEGORIES.reduce((sum, cat) => sum + (lib[cat]?.length ?? 0), 0);
  const isDark = true;

  return (
    <div className={`flex h-full flex-col ${isDark ? 'text-white' : 'text-neutral-900'}`}>
      <div className={`flex items-center gap-4 border-b px-6 py-3 ${isDark ? 'border-white/10' : 'border-neutral-200'}`}>
        <span className="text-lg font-semibold">Assets</span>
        <span className={`text-xs ${isDark ? 'text-white/40' : 'text-neutral-400'}`}>
          {totalCount} item{totalCount !== 1 ? 's' : ''}
        </span>
        <div className="ml-auto flex gap-1">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setActiveCategory(cat)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                cat === activeCategory
                  ? isDark ? 'bg-white text-black' : 'bg-neutral-900 text-white'
                  : isDark ? 'text-white/60 hover:text-white hover:bg-white/5' : 'text-neutral-500 hover:text-neutral-900 hover:bg-black/5'
              }`}
            >
              {CATEGORY_LABELS[cat]}
              <span className="ml-1 opacity-50">{lib[cat]?.length ?? 0}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {items.length === 0 ? (
          <div className="flex h-full items-center justify-center text-center opacity-40">
            <div>
              <div className="text-3xl mb-2">📦</div>
              <div className="text-sm">No {CATEGORY_LABELS[activeCategory].toLowerCase()} assets yet</div>
              <div className="text-xs mt-1">Save outputs from the Canvas or Workflow to appear here</div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {items.map((asset) => (
              <button
                key={asset.id}
                type="button"
                onClick={() => setPreviewAsset(asset)}
                className={`group relative rounded-xl border overflow-hidden transition ${
                  isDark ? 'border-white/10 hover:border-white/20 bg-white/5' : 'border-neutral-200 hover:border-neutral-300 bg-neutral-50'
                }`}
              >
                <div className="aspect-square bg-black/30">
                  {asset.dataUrl ? (
                    <img
                      src={asset.dataUrl}
                      alt={asset.name}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center opacity-30 text-2xl">
                      {activeCategory === 'character' ? '👤' : activeCategory === 'scene' ? '🏞' : '🔧'}
                    </div>
                  )}
                </div>
                <div className="p-2">
                  <div className="text-[11px] font-medium truncate">{asset.name || 'Untitled'}</div>
                  {asset.width && asset.height && (
                    <div className={`text-[10px] mt-0.5 ${isDark ? 'text-white/30' : 'text-neutral-400'}`}>
                      {asset.width} × {asset.height}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handleDelete(asset.id); }}
                  className={`absolute top-1.5 right-1.5 h-6 w-6 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition ${
                    isDark ? 'bg-black/60 hover:bg-red-500/80 text-white/70 hover:text-white' : 'bg-white/80 hover:bg-red-100 text-neutral-500 hover:text-red-600'
                  }`}
                  title="Delete asset"
                  aria-label={`Delete ${asset.name || 'asset'}`}
                >
                  ✕
                </button>
              </button>
            ))}
          </div>
        )}
      </div>

      {previewAsset && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setPreviewAsset(null)}
        >
          <div
            className="relative max-h-[85vh] max-w-[85vw] rounded-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {previewAsset.dataUrl ? (
              <img
                src={previewAsset.dataUrl}
                alt={previewAsset.name}
                className="max-h-[85vh] max-w-[85vw] object-contain"
              />
            ) : (
              <div className={`w-96 h-64 flex items-center justify-center rounded-2xl ${isDark ? 'bg-neutral-800' : 'bg-white'}`}>
                <span className="opacity-30 text-6xl">📦</span>
              </div>
            )}
            <div className={`absolute bottom-0 inset-x-0 p-4 ${isDark ? 'bg-gradient-to-t from-black/80' : 'bg-gradient-to-t from-white/80'}`}>
              <div className="font-semibold">{previewAsset.name || 'Untitled'}</div>
              {previewAsset.width && previewAsset.height && (
                <div className={`text-xs mt-1 ${isDark ? 'text-white/50' : 'text-neutral-500'}`}>
                  {previewAsset.width} × {previewAsset.height}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => setPreviewAsset(null)}
              className="absolute top-3 right-3 h-8 w-8 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70 text-lg"
              aria-label="Close preview"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
