import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { fuzzyMatch } from './model-selector/fuzzyMatch';

export interface ModelOption {
  id: string;
  name: string;
  provider: string;
  providerLabel: string;
  category: 'text' | 'image' | 'video';
  baseUrl?: string;
}

export interface FuzzyModelSelectorProps {
  models: ModelOption[];
  selectedModelId?: string;
  onSelect: (model: ModelOption) => void;
  placeholder?: string;
  isDark?: boolean;
}

interface PingResult {
  modelId: string;
  latencyMs: number | null;
  loading: boolean;
}

const CATEGORY_CONFIG: Record<string, { label: string; icon: string; order: number }> = {
  text: { label: 'Text Models (LLM)', icon: 'T', order: 0 },
  image: { label: 'Image Models (Diffusion)', icon: 'I', order: 1 },
  video: { label: 'Video Models', icon: 'V', order: 2 },
};

async function pingUrl(baseUrl: string, signal: AbortSignal): Promise<number | null> {
  const start = performance.now();
  try {
    await fetch(baseUrl + '/models', { method: 'HEAD', signal, mode: 'no-cors' });
    return performance.now() - start;
  } catch {
    try {
      const s2 = performance.now();
      await fetch(baseUrl, { method: 'OPTIONS', signal, mode: 'no-cors' });
      return performance.now() - s2;
    } catch {
      return null;
    }
  }
}

function formatLatency(ms: number | null, loading: boolean): string {
  if (loading) return '...';
  if (ms === null) return '--';
  if (ms < 5) return ms.toFixed(0) + 'ms';
  if (ms < 50) return ms.toFixed(0) + 'ms';
  if (ms < 150) return ms.toFixed(0) + 'ms';
  return ms.toFixed(0) + 'ms';
}

export const FuzzyModelSelector: React.FC<FuzzyModelSelectorProps> = ({
  models, selectedModelId, onSelect, placeholder = 'Search models...', isDark = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [pings, setPings] = useState<Map<string, PingResult>>(new Map());
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const pingControllers = useRef<Map<string, AbortController>>(new Map());

  const filtered = useMemo(() => {
    if (!query.trim()) return models;
    const names = models.map(m => m.name);
    const results = fuzzyMatch(query, names);
    const resultSet = new Set(results.map(r => r.item));
    return models.filter(m => resultSet.has(m.name));
  }, [query, models]);

  const grouped = useMemo(() => {
    const groups: Record<string, ModelOption[]> = { text: [], image: [], video: [] };
    for (const m of filtered) groups[m.category]?.push(m);
    return Object.entries(groups)
      .filter(([, items]) => items.length > 0)
      .sort(([a], [b]) => (CATEGORY_CONFIG[a]?.order ?? 99) - (CATEGORY_CONFIG[b]?.order ?? 99));
  }, [filtered]);

  useEffect(() => {
    if (!isOpen) return;
    pingControllers.current.forEach(c => c.abort());
    pingControllers.current.clear();
    for (const model of filtered) {
      if (!model.baseUrl) continue;
      const controller = new AbortController();
      pingControllers.current.set(model.id, controller);
      setPings(prev => { const next = new Map(prev); next.set(model.id, { modelId: model.id, latencyMs: null, loading: true }); return next; });
      pingUrl(model.baseUrl, controller.signal).then(ms => {
        setPings(prev => { const next = new Map(prev); next.set(model.id, { modelId: model.id, latencyMs: ms, loading: false }); return next; });
      });
    }
    return () => { pingControllers.current.forEach(c => c.abort()); pingControllers.current.clear(); };
  }, [filtered, isOpen]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const flat = filtered;
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); setActiveIndex(i => Math.min(i + 1, flat.length - 1)); break;
      case 'ArrowUp': e.preventDefault(); setActiveIndex(i => Math.max(i - 1, 0)); break;
      case 'Enter': e.preventDefault(); if (flat[activeIndex]) { onSelect(flat[activeIndex]); setIsOpen(false); setQuery(''); } break;
      case 'Escape': setIsOpen(false); break;
    }
  }, [filtered, activeIndex, onSelect]);

  useEffect(() => { if (isOpen) setTimeout(() => inputRef.current?.focus(), 10); }, [isOpen]);

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setIsOpen(false); };
    if (isOpen) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen]);

  const selectedModel = models.find(m => m.id === selectedModelId);

  const cs = {
    bg: isDark ? '#1a1d24' : '#ffffff',
    border: isDark ? '#2a3140' : '#e4e7ec',
    text: isDark ? '#f8fafc' : '#0f172a',
    muted: isDark ? '#98a2b3' : '#667085',
    hoverBg: isDark ? '#212734' : '#f1f5f9',
    activeBg: isDark ? '#2a3140' : '#e2e8f0',
    inputBg: isDark ? '#111318' : '#f8fafc',
  };

  return React.createElement('div', { ref: dropdownRef, style: { position: 'relative', width: '100%' } },
    React.createElement('button', {
      onClick: () => setIsOpen(!isOpen),
      style: { width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid ' + cs.border, background: cs.bg, color: cs.text, cursor: 'pointer', textAlign: 'left', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' },
    }, selectedModel
      ? [React.createElement('span', { key: 'badge', style: { padding: '1px 6px', borderRadius: '3px', fontSize: '10px', fontWeight: 600, background: selectedModel.category === 'text' ? '#3b82f6' : selectedModel.category === 'image' ? '#8b5cf6' : '#f59e0b', color: '#fff' } }, CATEGORY_CONFIG[selectedModel.category]?.icon || '?'),
         React.createElement('span', { key: 'name' }, selectedModel.name),
         React.createElement('span', { key: 'prov', style: { marginLeft: 'auto', fontSize: '11px', color: cs.muted } }, selectedModel.providerLabel)]
      : React.createElement('span', { style: { color: cs.muted } }, placeholder)
    ),
    isOpen && React.createElement('div', {
      style: { position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100, marginTop: '4px', borderRadius: '8px', border: '1px solid ' + cs.border, background: cs.bg, boxShadow: '0 16px 40px rgba(0,0,0,0.16)', maxHeight: '420px', display: 'flex', flexDirection: 'column', overflow: 'hidden' },
    },
      React.createElement('div', { key: 'search', style: { padding: '8px', borderBottom: '1px solid ' + cs.border, position: 'sticky', top: 0, background: cs.bg, zIndex: 1 } },
        React.createElement('input', {
          ref: inputRef, type: 'text', value: query,
          onChange: (e: any) => { setQuery(e.target.value); setActiveIndex(0); },
          onKeyDown: handleKeyDown,
          placeholder: 'Search models...',
          style: { width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid ' + cs.border, background: cs.inputBg, color: cs.text, fontSize: '13px', outline: 'none', boxSizing: 'border-box' },
        })
      ),
      React.createElement('div', { key: 'list', style: { overflowY: 'auto', flex: 1 } },
        grouped.length === 0
          ? React.createElement('div', { style: { padding: '20px', textAlign: 'center', color: cs.muted, fontSize: '12px' } }, 'No models found')
          : grouped.map(([catKey, items]) =>
              React.createElement('div', { key: catKey },
                React.createElement('div', { style: { padding: '6px 12px', fontSize: '10px', fontWeight: 700, color: catKey === 'text' ? '#3b82f6' : catKey === 'image' ? '#8b5cf6' : '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1px solid ' + cs.border, background: cs.inputBg } }, CATEGORY_CONFIG[catKey]?.label || catKey),
                items.map((model) => {
                  const globalIdx = filtered.indexOf(model);
                  const isActive = globalIdx === activeIndex;
                  const ping = pings.get(model.id);
                  return React.createElement('div', {
                    key: model.id,
                    onClick: () => { onSelect(model); setIsOpen(false); setQuery(''); },
                    onMouseEnter: () => setActiveIndex(globalIdx),
                    style: { padding: '8px 12px', cursor: 'pointer', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '8px', background: isActive ? cs.activeBg : 'transparent', color: cs.text, transition: 'background 0.1s' },
                  },
                    React.createElement('span', { style: { padding: '1px 5px', borderRadius: '3px', fontSize: '10px', background: isDark ? '#2a3140' : '#e2e8f0', color: cs.muted, whiteSpace: 'nowrap', flexShrink: 0 } }, model.providerLabel),
                    React.createElement('span', { style: { fontWeight: 500, flex: 1 } }, model.name),
                    React.createElement('span', { style: { fontSize: '10px', color: ping?.loading ? '#888' : ping?.latencyMs === null ? '#888' : ping.latencyMs < 50 ? '#22c55e' : ping.latencyMs < 150 ? '#eab308' : '#ef4444', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' } }, formatLatency(ping?.latencyMs ?? null, ping?.loading ?? false)),
                  );
                })
              )
            )
      )
    )
  );
};
