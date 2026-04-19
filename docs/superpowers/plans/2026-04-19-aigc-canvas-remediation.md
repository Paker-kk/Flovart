# AIGC Canvas Stability & Provider Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> ## Implementation Status — 2026-04-19 Session
>
> | Task | Status | Tests | Key Deliverables |
> |------|--------|-------|-----------------|
> | Task 0 — Test infra | ✅ Done | 3 | jsdom env, WebCrypto polyfill, URL mock in `tests/setup.ts` |
> | Task 1 — Extension key codec | ✅ Done | 6 | `utils/keyCodec.ts`, `extension/content/content.js` V3 decode |
> | Task 2 — Video URL lifecycle | ✅ Done | 4 | `utils/objectUrlRegistry.ts`, App.tsx cleanup effect |
> | Task 3 — Bounded history | ✅ Done | 4 | `utils/historyState.ts` (MAX=50), App.tsx wiring |
> | Task 4 — RAF batching | ✅ Done | 5 | `utils/rafBatcher.ts`, snap cache + RAF in `useCanvasInteraction.ts` |
> | Task 5 — Video persistence | ✅ Done | 4 | `utils/mediaDB.ts` IndexedDB, App.tsx persist/rehydrate |
> | Task 6 — Capability diagnostics | ✅ Done | 3 | `explainKeyCapabilities()`, agentWarning UI |
> | Task 7 — Agent/Banana semantics | ✅ Done | 3 | `buildAgentRuntimeSummary()`, discussion preflight |
> | **Total** | **8/8** | **84 pass, 1 skip** | 13 test files, 6 new utils, 4 modified components |
>
> ### Post-implementation review notes (Dario-style)
>
> **What went well:**
> - Pure-function extraction (keyCodec, historyState, objectUrlRegistry, rafBatcher) → each testable in isolation
> - No existing tests broken across all changes
> - RAF batcher + snap cache: two-pronged fix — coalesce pointer events AND eliminate per-frame O(n) recomputation
>
> **Risk areas to monitor:**
> 1. **mediaDB rehydration on slow devices** — IndexedDB `getVideoBlob` is async; if a board has many videos, the waterfall load on `loadBoardsWithIDB` may cause visible delay. Mitigation: the current implementation is per-element sequential inside a `Promise.all`-wrapped per-board loop, which is acceptable for <20 videos.
> 2. **Snap cache staleness** — `cachedStaticSnap` is computed once at drag-start. If another user/process modifies elements during drag (collaborative editing), snaps won't reflect the change. This is acceptable for single-user canvas but must be revisited for multiplayer.
> 3. **Extension content.js duplication** — `decodeKeys` logic is inlined in content.js (classic script can't import). If keyCodec.ts changes, content.js must be manually synced. Consider a build step or shared file (`extension/shared/keyStorage.js`) in a future pass.
> 4. **fake-indexeddb Blob fidelity** — The test polyfill doesn't preserve Blob.type/size perfectly. Real browser testing is needed for integration confidence.
>
> ### React 19 + rAF Architecture Research (2026-04-19)
>
> **Q: Does React 19 Concurrent Mode provide a built-in alternative to our custom rAF batcher?**
>
> **A: No.** React 19's concurrent features (`useTransition`, `useDeferredValue`) are designed for React-managed component trees, not for imperative canvas/DOM mutation during high-frequency pointer events. Key findings:
>
> 1. **`useTransition` / `startTransition`** — marks state updates as non-urgent, allowing React to keep the UI responsive. However, transitions are *interruptible* and cannot be used for controlled inputs or real-time canvas coordinates that must update every frame. Transitions solve "tab switching feels janky" not "drag at 60fps."
>
> 2. **`useDeferredValue`** — defers re-rendering of slow subtrees. Useful for search/list patterns but not applicable to direct coordinate mutation during drag — we need immediate visual feedback, not deferred rendering.
>
> 3. **`createRoot` + rAF batching regression** (react/issues/28457) — With `createRoot` (React 18+/19), state updates inside `requestAnimationFrame` callbacks are NOT automatically batched with the initial render. This is a known behavior change from legacy `ReactDOM.render`. Our approach of using refs (not state) during drag completely sidesteps this issue.
>
> 4. **React's own recommendation for imperative DOM work** (react.dev/learn/escape-hatches) — use `useRef` for mutable state that shouldn't trigger re-renders, and use refs + browser APIs for direct DOM manipulation. This is exactly what our `createRafBatcher` + `cachedStaticSnap` pattern does.
>
> **Conclusion:** Our rAF batcher architecture is the correct pattern for React 19 canvas drag. No built-in React 19 hook replaces it. The two complementary optimizations (coalescing pointer events via rAF + caching static snap points at drag-start) align with React's "escape hatch" philosophy for performance-critical imperative work.
>
> **Not addressed (out of scope per plan):**
> - Canvas renderer replacement
> - Provider abstraction rewrite
> - Agent UX redesign
> - General-purpose web↔extension sync service
>
> ### Hotfix: PromptBar Popover 不可见 (2026-04-19)
>
> **症状**：模型选择 / 更多操作弹窗点击后不弹出。
>
> **根因**：`PromptBar.tsx` 按钮容器使用 `overflow-x-auto`（允许横向滚动），CSS spec 规定当 `overflow-x` 为非 `visible` 值时，`overflow-y` 从默认 `visible` 被隐式计算为 `auto`。弹窗使用 `absolute bottom-full`（向上弹出），被父容器的 `overflow-y: auto` 裁切至不可见。
>
> **修复**：将按钮容器的 `overflow-x-auto` 替换为 `flex-wrap`，保留窄屏兜底的同时解除 overflow 裁切。
>
> ### Z-Index 全局审计 (2026-04-19)
>
> **层级表**：z-10(resize) → z-20(拖拽) → z-30(面板) → z-40(工具栏) → z-45(侧栏) → z-48(PromptDock) → z-50(Crop) → z-80(Popover/Config) → z-120(Workflow菜单) → z-9998(通知) → z-9999(Modal)
>
> **风险项**：
> 1. z-80 被 PromptBar 和 ConfigSelector 共用——如果同时出现会互相遮叠
> 2. PromptBar popover 的 z-80 在 z-48 stacking context 内，全局实际效力仅 48，可能被 z-50 Toolbar Crop 遮挡
> 3. Chrome 扩展 z-index: 2147483647（INT32 最大值）过于激进
>
> ### 图片/视频尺寸审计 (2026-04-19)
>
> **问题**：
> 1. 🔴 视频画布展示上限 `MAX_DIM = 800px` (useGeneration.ts:652)——创意工具不应限制 2K/4K 素材展示
> 2. 🔴 扩展导入图片上限 `800×600` (App.tsx:1046)——过于保守
> 3. 🟡 DALL-E 3 硬编码 1024×1024——不跟随用户 aspect ratio 选择
> 4. 🟡 视频仅支持 16:9 / 9:16——缺少 1:1、4:3、21:9 等创意常用比例

**Goal:** Stabilize the AIGC canvas for large image/video workloads, make provider/key behavior truthful, and remove the highest-friction extension/web sync bugs without rewriting the app architecture.

**Architecture:** Keep the current App-centered React architecture and existing provider router, but extract a few small, testable helpers for history management, extension key decoding, object URL lifecycle, and media persistence. Prioritize surgical fixes that reduce runtime memory pressure, remove broken sync paths, and make capability diagnostics match actual behavior.

**Tech Stack:** React, TypeScript, Vite, Vitest, Chrome Extension APIs, IndexedDB, browser Blob/Object URL APIs

---

## Scope and assumptions

This plan assumes:
- The target is remediation, not a product redesign.
- The app should continue to support the current canvas/page model in [App.tsx](App.tsx).
- Existing provider routing in [services/aiGateway.ts](services/aiGateway.ts) stays in place unless it is actively misleading or broken.
- The extension remains a browser extension, not a VS Code extension.
- The fastest path is to fix truthfulness, memory leaks, and persistence gaps before attempting any deeper agent-platform abstraction.

This plan intentionally does **not** include:
- Replacing the canvas renderer.
- Replacing the provider abstraction layer.
- Rewriting the agent UX.
- Building a general-purpose sync service between arbitrary web origins and extension storage.

---

## Priority summary

### P0 — do first
1. Fix extension key decoding mismatch so encrypted keys are readable everywhere.
2. Fix video `blob:` URL lifecycle leaks.
3. Reduce undo/redo runtime pressure with bounded history helpers.

### P1 — do next
4. Throttle high-frequency drag/snap/resize work.
5. Persist generated/imported videos across reloads using IndexedDB-backed media storage.
6. Make provider capability diagnostics and UI warnings match actual router behavior.

### P2 — clean up semantics and operator confusion
7. Separate “generic multi-agent discussion” from “Banana-specific automation/runtime endpoints” in UX and diagnostics.

---

## File map

### Existing files to modify
- `App.tsx`
  - Board persistence (`persistBoardsToIDB`, `loadBoardsWithIDB`)
  - History writes (`setElements`, `commitAction`, `handleUndo`, `handleRedo`)
  - Video rendering (`el.type === 'video'` branch)
  - Runtime API bridge (`window.__flovartAPI`)
- `hooks/useGeneration.ts`
  - Video generation pipeline
  - `URL.createObjectURL(videoBlob)` creation sites
- `hooks/useCanvasInteraction.ts`
  - `dragElements` and resize hot path
- `hooks/useApiKeys.ts`
  - extension/web bridge
  - runtime config derivation
  - preferred key selection warnings
- `services/aiGateway.ts`
  - capability inference
  - key diagnostics
  - provider support messaging
- `components/AgentChatPanel.tsx`
  - agent start UX and warnings
- `extension/popup/popup.js`
  - encrypted key encode/decode
- `extension/content/content.js`
  - reverse prompt key loading and runtime bridge
- `extension/background/service-worker.js`
  - encrypted key decode and command forwarding
- `utils/imageDB.ts`
  - keep as image-only store unless split is too awkward

### New files to create
- `utils/historyState.ts`
  - pure helper for bounded history append/clamp
- `utils/objectUrlRegistry.ts`
  - pure helper for collecting/revoking removed video object URLs
- `utils/mediaDB.ts`
  - Blob-capable IndexedDB store for videos
- `utils/keyCodec.ts`
  - pure-function AES-GCM encode/decode core (no chrome.runtime dependency)
- `extension/shared/keyStorage.js`
  - thin adapter that calls keyCodec with chrome.runtime.id
- `vitest.config.ts`
  - vitest configuration with jsdom environment
- `tests/setup.ts` (rewrite)
  - WebCrypto polyfill + URL.createObjectURL/revokeObjectURL mock
- `tests/historyState.test.ts`
- `tests/objectUrlRegistry.test.ts`
- `tests/mediaDB.test.ts`
- `tests/keyCodec.test.ts`

---

## Current defects this plan addresses

1. **Encrypted key decode mismatch in extension**
   - Popup/background support AES-GCM V3.
   - Content script still only base64-decodes V2-style data.
   - Result: reverse prompt and content-side features can fail even though the popup successfully saved keys.

2. **Generated video object URLs are not reclaimed**
   - `useGeneration.ts` creates `blob:` URLs for videos.
   - Video elements render those URLs in `App.tsx`.
   - No lifecycle manager revokes removed/abandoned URLs.

3. **History growth is unbounded at runtime**
   - `history: Element[][]` grows with every committed operation.
   - Persistence strips history later, but runtime pressure already happened.

4. **High-frequency drag/snap work runs on every pointer move**
   - Snap-point construction and per-element bounds work are performed in the hot path.
   - No clear `requestAnimationFrame` batching.

5. **Videos are not durably persisted like images**
   - Images are rewritten to `idb:` refs on save.
   - Videos are not.
   - Object URLs are session-bound, so reloads can break video elements.

6. **Capability truthfulness is incomplete**
   - Custom/OpenAI-compatible keys can do some things, but not “everything.”
   - Agent UX and key diagnostics over-simplify what is actually supported.

7. **Banana-specific runtime config is easy to confuse with generic agent loop support**
   - The multi-agent discussion loop is generic.
   - Banana endpoints are separate runtime integrations.
   - UI/diagnostic language should reflect that.

---

## Implementation order

0. Test infrastructure (blocker)
1. Extension key decode parity
2. Video object URL cleanup
3. Bounded history helper
4. Video persistence in IndexedDB
5. Interaction throttling
6. Capability diagnostics + UI truthfulness
7. Agent/Banana semantic cleanup

> **Note:** Task 4 (video persistence) moved before Task 5 (interaction throttling) because persisted videos create more object URLs during rehydration, and Task 2 must be in place first. Task 5 is independent and can be done in any order after Task 0.

---

### Task 0: Build test infrastructure (P-1 blocker)

**Files:**
- Create: `vitest.config.ts`
- Rewrite: `tests/setup.ts`
- Verify: existing tests in `tests/` still pass

**Root cause:**
- `tests/setup.ts` is currently a single comment line — no mocks, no polyfills.
- Vitest runs in Node environment by default — no `crypto.subtle`, no `Blob`, no `URL.createObjectURL`.
- All subsequent TDD tasks will fail at Step 1 without this.

**Minimal fix:**
- Add `vitest.config.ts` with `environment: 'jsdom'` and `setupFiles: ['tests/setup.ts']`.
- Rewrite `tests/setup.ts` to provide WebCrypto polyfill and URL mock.

**Completion definition (DoD):**
- `npm test` passes with all existing tests.
- A smoke test using `crypto.subtle.digest` runs and passes.
- A smoke test using `URL.createObjectURL` / `URL.revokeObjectURL` runs and passes.

- [ ] **Step 1: Create vitest.config.ts**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['tests/setup.ts'],
    globals: true,
  },
});
```

- [ ] **Step 2: Rewrite tests/setup.ts with polyfills**

```ts
import { webcrypto } from 'node:crypto';

// Polyfill WebCrypto for jsdom
if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, 'crypto', {
    value: webcrypto,
    writable: true,
  });
}

// Mock URL.createObjectURL / revokeObjectURL (jsdom doesn't implement them)
const blobUrlMap = new Map<string, Blob>();
let blobCounter = 0;

if (typeof URL.createObjectURL !== 'function') {
  URL.createObjectURL = (blob: Blob): string => {
    const url = `blob:test/${++blobCounter}`;
    blobUrlMap.set(url, blob);
    return url;
  };
  URL.revokeObjectURL = (url: string): void => {
    blobUrlMap.delete(url);
  };
}
```

- [ ] **Step 3: Add smoke test to verify infrastructure**

Create `tests/testInfra.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

describe('test infrastructure', () => {
  it('has working crypto.subtle', async () => {
    const data = new TextEncoder().encode('hello');
    const hash = await crypto.subtle.digest('SHA-256', data);
    expect(hash.byteLength).toBe(32);
  });

  it('has working URL.createObjectURL and revokeObjectURL', () => {
    const blob = new Blob(['test'], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    expect(url).toMatch(/^blob:/);
    URL.revokeObjectURL(url);
  });
});
```

- [ ] **Step 4: Run all tests**

Run: `npm test`
Expected: All existing tests PASS, smoke test PASSES.

---

### Task 1: Fix extension key codec mismatch and sync truthfulness (P0)

**Files:**
- Create: `utils/keyCodec.ts` (pure function core — no chrome.runtime dependency)
- Create: `extension/shared/keyStorage.js` (thin adapter calling keyCodec with chrome.runtime.id)
- Modify: `extension/popup/popup.js`
- Modify: `extension/content/content.js`
- Modify: `extension/background/service-worker.js`
- Test: `tests/keyCodec.test.ts`

**Root cause:**
- Popup writes V3 AES-GCM encrypted key payloads.
- Background can decrypt them.
- Content script only tries base64 decode, so V3 keys are effectively invisible there.

**Design decision (revised):**
- Split codec into two layers:
  1. **Pure function layer** (`utils/keyCodec.ts`): accepts a `runtimeId: string` parameter, uses standard WebCrypto API, fully testable in Vitest jsdom.
  2. **Extension adapter** (`extension/shared/keyStorage.js`): thin wrapper that calls keyCodec with `chrome.runtime.id`. Only integration-tested via manual/extension-level verification.
- Keep V2 base64 fallback for migration.

**Completion definition (DoD):**
- `tests/keyCodec.test.ts` passes: round-trip V3 + V2 legacy decode.
- Extension popup/content/background all reference the shared adapter.
- `npm run build` passes.
- Manual: save key in popup → reverse prompt works from content script.

**Regression risk:**
- Low if V2 fallback remains in place.
- Medium if extension adapter import path is wrong.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { decodeKeys, encodeKeys } from '../utils/keyCodec';

const sampleKeys = [
  { id: '1', provider: 'google', key: 'AIza-test', capabilities: ['text', 'image', 'video'] },
];

describe('key codec (pure function)', () => {
  it('round-trips V3 AES-GCM payloads', async () => {
    const encoded = await encodeKeys(sampleKeys, 'runtime-test-id');
    const decoded = await decodeKeys(encoded, 'runtime-test-id');
    expect(decoded).toEqual(sampleKeys);
  });

  it('still decodes legacy V2 base64 payloads', async () => {
    const legacy = btoa(JSON.stringify(sampleKeys));
    const decoded = await decodeKeys(legacy, 'runtime-test-id');
    expect(decoded).toEqual(sampleKeys);
  });

  it('returns null for malformed input', async () => {
    const decoded = await decodeKeys({ iv: null, ct: null }, 'runtime-test-id');
    expect(decoded).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/keyCodec.test.ts`
Expected: FAIL because `utils/keyCodec.ts` does not exist yet.

- [ ] **Step 3: Create the pure function codec**

Create `utils/keyCodec.ts`:

```ts
const ENC_SALT = 'flovart-ext-v3';

async function deriveEncryptionKey(runtimeId: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(runtimeId), 'PBKDF2', false, ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: enc.encode(ENC_SALT), iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encodeKeys(data: unknown, runtimeId: string): Promise<{ iv: number[]; ct: number[] }> {
  const aesKey = await deriveEncryptionKey(runtimeId);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    new TextEncoder().encode(JSON.stringify(data))
  );
  return { iv: Array.from(iv), ct: Array.from(new Uint8Array(ct)) };
}

export async function decodeKeys(encoded: unknown, runtimeId: string): Promise<unknown | null> {
  // V2 legacy: plain base64 string
  if (typeof encoded === 'string') {
    try {
      const s = atob(encoded);
      const bytes = new Uint8Array(s.length);
      for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
      return JSON.parse(new TextDecoder().decode(bytes));
    } catch { return null; }
  }
  // V3: AES-GCM { iv, ct }
  const obj = encoded as Record<string, unknown>;
  if (!obj?.iv || !obj?.ct) return null;
  try {
    const aesKey = await deriveEncryptionKey(runtimeId);
    const pt = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(obj.iv as number[]) },
      aesKey,
      new Uint8Array(obj.ct as number[])
    );
    return JSON.parse(new TextDecoder().decode(pt));
  } catch { return null; }
}
```

- [ ] **Step 4: Create extension adapter**

Create `extension/shared/keyStorage.js`:

```js
// Thin adapter — delegates to the pure codec with chrome.runtime.id
// Extension build step must bundle utils/keyCodec.ts into this context.
import { encodeKeys as encode, decodeKeys as decode } from '../../utils/keyCodec';

export async function encodeKeys(data) {
  return encode(data, chrome.runtime.id);
}

export async function decodeKeys(encoded) {
  return decode(encoded, chrome.runtime.id);
}
```

- [ ] **Step 5: Wire popup/content/background to the adapter**

Step 4 already created the adapter. This step wires the extension entrypoints:

```js
// extension/content/content.js
import { decodeKeys } from '../shared/keyStorage';

async function loadApiKeys() {
  const result = await chrome.storage.local.get([STORAGE_KEY_V2, STORAGE_KEY_OLD]);
  if (result[STORAGE_KEY_V2]?.d) {
    const decoded = await decodeKeys(result[STORAGE_KEY_V2].d);
    if (Array.isArray(decoded)) return decoded;
  }
  return result[STORAGE_KEY_OLD] || [];
}
```

```js
// extension/popup/popup.js
import { decodeKeys, encodeKeys } from '../shared/keyStorage';
```

```js
// extension/background/service-worker.js
import { decodeKeys as decryptStoredKeys } from '../shared/keyStorage';
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -- tests/keyCodec.test.ts`
Expected: PASS

- [ ] **Step 7: Manual verification**

Run:
```bash
npm run build
```
Expected: extension bundle builds without import errors.

Then:
1. Save a key in the popup.
2. Trigger reverse prompt from the content script.
3. Confirm content script sees the encrypted key without re-entry.

---

### Task 2: Add video object URL lifecycle cleanup (P0)

**Files:**
- Create: `utils/objectUrlRegistry.ts`
- Modify: `App.tsx`
- Modify: `hooks/useGeneration.ts`
- Test: `tests/objectUrlRegistry.test.ts`

**Root cause:**
- `useGeneration.ts` creates `blob:` URLs for generated videos.
- Removed/replaced videos are never revoked.
- The renderer in `App.tsx` keeps consuming those URLs until the page dies.

**Minimal fix:**
- Add a pure helper to diff `blob:` URLs between frames.
- In `App.tsx`, track current video object URLs and revoke removed ones.
- On unmount, revoke all tracked video object URLs.
- Keep `useGeneration.ts` responsible only for creation, not global cleanup.

**Optional enhancement:**
- Store whether a video URL is ephemeral vs persisted to IndexedDB, so only ephemeral URLs are revoked.

**Regression risk:**
- Medium if URLs are revoked while still mounted.
- Avoid by diffing after state updates, not during creation.

**Verification:**
- Removing a generated video revokes its `blob:` URL.
- Existing mounted videos continue to play.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { collectVideoObjectUrls, diffRemovedObjectUrls } from '../utils/objectUrlRegistry';

describe('objectUrlRegistry', () => {
  it('collects only video blob URLs', () => {
    const urls = collectVideoObjectUrls([
      { id: '1', type: 'video', href: 'blob:video-1' },
      { id: '2', type: 'video', href: 'idb:video-2' },
      { id: '3', type: 'image', href: 'blob:image-1' },
    ] as any);
    expect([...urls]).toEqual(['blob:video-1']);
  });

  it('returns removed object URLs', () => {
    const removed = diffRemovedObjectUrls(
      new Set(['blob:one', 'blob:two']),
      new Set(['blob:two'])
    );
    expect(removed).toEqual(['blob:one']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/objectUrlRegistry.test.ts`
Expected: FAIL because helper file does not exist yet.

- [ ] **Step 3: Create the helper**

```ts
import type { Element } from '../types';

export function collectVideoObjectUrls(elements: Element[]): Set<string> {
  return new Set(
    elements
      .filter((el): el is Extract<Element, { type: 'video' }> => el.type === 'video')
      .map(el => el.href)
      .filter(href => typeof href === 'string' && href.startsWith('blob:'))
  );
}

export function diffRemovedObjectUrls(prev: Set<string>, next: Set<string>): string[] {
  return [...prev].filter(url => !next.has(url));
}
```

- [ ] **Step 4: Wire cleanup into `App.tsx`**

```ts
const activeVideoUrlsRef = useRef<Set<string>>(new Set());

useEffect(() => {
  const nextUrls = collectVideoObjectUrls(elements);
  const removedUrls = diffRemovedObjectUrls(activeVideoUrlsRef.current, nextUrls);
  removedUrls.forEach(url => URL.revokeObjectURL(url));
  activeVideoUrlsRef.current = nextUrls;
}, [elements]);

useEffect(() => {
  return () => {
    activeVideoUrlsRef.current.forEach(url => URL.revokeObjectURL(url));
    activeVideoUrlsRef.current.clear();
  };
}, []);
```

- [ ] **Step 5: Keep `useGeneration.ts` creation explicit**

```ts
const videoUrl = URL.createObjectURL(videoBlob);
// Do not revoke here; App-level registry owns lifecycle after commit.
```

- [ ] **Step 6: Run tests**

Run: `npm test -- tests/objectUrlRegistry.test.ts`
Expected: PASS

- [ ] **Step 7: Manual verification**

1. Generate 3 videos.
2. Delete 2 videos from the canvas.
3. Confirm the remaining one still plays.
4. Use browser memory tools to verify removed `blob:` URLs are reclaimed.

- [ ] **Step 8: Commit**

```bash
git add utils/objectUrlRegistry.ts App.tsx hooks/useGeneration.ts tests/objectUrlRegistry.test.ts
git commit -m "fix: reclaim video object urls"
```

---

### Task 3: Bound runtime history and skip wasteful commits (P0)

**Files:**
- Create: `utils/historyState.ts`
- Modify: `App.tsx`
- Test: `tests/historyState.test.ts`

**Root cause:**
- Undo/redo state is stored as a growing array of full element snapshots.
- Runtime pressure happens long before persistence strips history.

**Minimal fix:**
- Introduce `MAX_BOARD_HISTORY`.
- Centralize snapshot append logic in a pure helper.
- Keep transient drag/resize updates on `commit=false` path.
- Skip history append when `newElements === board.elements`.

**Optional enhancement:**
- Add a cheap shallow signature to skip commits where only selection UI changed.

**Regression risk:**
- Low to medium if history index clamp is wrong.
- Covered by pure tests.

**Verification:**
- Undo/redo still works.
- History length stops growing after the cap.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { appendHistorySnapshot, MAX_BOARD_HISTORY } from '../utils/historyState';

describe('historyState', () => {
  it('appends a new snapshot and advances index', () => {
    const result = appendHistorySnapshot([[{ id: 'a' }]], 0, [{ id: 'b' }]);
    expect(result.history).toHaveLength(2);
    expect(result.historyIndex).toBe(1);
  });

  it('caps history length', () => {
    let state = { history: [[{ id: '0' }]], historyIndex: 0 };
    for (let i = 1; i <= MAX_BOARD_HISTORY + 5; i++) {
      state = appendHistorySnapshot(state.history, state.historyIndex, [{ id: String(i) }]);
    }
    expect(state.history.length).toBe(MAX_BOARD_HISTORY);
    expect(state.historyIndex).toBe(MAX_BOARD_HISTORY - 1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/historyState.test.ts`
Expected: FAIL because helper file does not exist yet.

- [ ] **Step 3: Create the helper**

```ts
import type { Element } from '../types';

export const MAX_BOARD_HISTORY = 50;

export function appendHistorySnapshot(
  history: Element[][],
  historyIndex: number,
  nextElements: Element[]
) {
  const nextHistory = [...history.slice(0, historyIndex + 1), nextElements];
  const cappedHistory = nextHistory.slice(-MAX_BOARD_HISTORY);
  return {
    history: cappedHistory,
    historyIndex: cappedHistory.length - 1,
  };
}
```

- [ ] **Step 4: Use the helper in `App.tsx`**

```ts
if (newElements === board.elements) return board;

const next = appendHistorySnapshot(board.history, board.historyIndex, newElements);
return {
  ...board,
  elements: newElements,
  history: next.history,
  historyIndex: next.historyIndex,
};
```

Apply this to both `setElements(..., commit=true)` and `commitAction`.

- [ ] **Step 5: Preserve undo/redo correctness**

```ts
if (board.historyIndex > 0) {
  return {
    ...board,
    historyIndex: board.historyIndex - 1,
    elements: board.history[board.historyIndex - 1],
  };
}
```

No new behavior is needed here; just verify the cap does not break index reads.

- [ ] **Step 6: Run tests**

Run: `npm test -- tests/historyState.test.ts tests/types.test.ts`
Expected: PASS

- [ ] **Step 7: Manual verification**

1. Add/move/delete many elements.
2. Undo 10+ times.
3. Redo 10+ times.
4. Confirm the oldest snapshots roll off once the cap is reached.

- [ ] **Step 8: Commit**

```bash
git add utils/historyState.ts App.tsx tests/historyState.test.ts
git commit -m "fix: cap board history growth"
```

---

### Task 4: Batch drag/snap work with `requestAnimationFrame` (P1)

**Files:**
- Modify: `hooks/useCanvasInteraction.ts`
- Create: `tests/rafBatching.test.ts`

**Root cause:**
- Drag snapping recomputes element bounds and snap guides on every pointer move.
- Work scales with element count.

**Minimal fix:**
- Keep only the latest pointer point in a ref.
- Schedule one flush per animation frame.
- Move existing `dragElements` heavy logic into a `flushPointerMove` path.

**Optional enhancement:**
- Cache static snap points for the duration of an active drag instead of recomputing on every frame.

**Regression risk:**
- Medium if pointer-release timing misses the last movement.
- Flush once on pointer-up before commit.

**Verification:**
- Drag remains visually smooth.
- Snap guides still appear.
- CPU usage drops in large boards.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it, vi } from 'vitest';
import { createRafBatcher } from '../hooks/useCanvasInteraction';

describe('raf batching', () => {
  it('coalesces multiple calls into one frame', () => {
    const fn = vi.fn();
    const batch = createRafBatcher(fn);
    batch('a');
    batch('b');
    expect(fn).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/rafBatching.test.ts`
Expected: FAIL because helper is not exposed yet.

- [ ] **Step 3: Add a small batching helper in the hook file**

```ts
export function createRafBatcher<T>(flush: (value: T) => void) {
  let rafId: number | null = null;
  let latest: T;
  return (value: T) => {
    latest = value;
    if (rafId !== null) return;
    rafId = requestAnimationFrame(() => {
      rafId = null;
      flush(latest);
    });
  };
}
```

- [ ] **Step 4: Route pointer-move hot path through the batcher**

```ts
const pendingPointRef = useRef<Point | null>(null);
const flushPointerMove = useCallback((point: Point) => {
  // existing dragElements / resize switch body moves here
}, [elements, zoom, setElements]);

const enqueuePointerMove = useMemo(
  () => createRafBatcher((point: Point) => flushPointerMove(point)),
  [flushPointerMove]
);
```

- [ ] **Step 5: Cache static snap points for one drag session**

```ts
const dragSnapCacheRef = useRef<{ v: Set<number>; h: Set<number> } | null>(null);
```

Populate on drag start, clear on drag end.

- [ ] **Step 6: Run tests**

Run: `npm test -- tests/rafBatching.test.ts`
Expected: PASS

- [ ] **Step 7: Manual verification**

1. Load a board with many elements.
2. Drag a selection across the board.
3. Confirm snapping still works.
4. Confirm movement stays smooth and guide updates remain correct.

- [ ] **Step 8: Commit**

```bash
git add hooks/useCanvasInteraction.ts tests/rafBatching.test.ts
git commit -m "perf: batch canvas drag updates"
```

---

### Task 5: Persist videos durably via IndexedDB (P1)

**Files:**
- Create: `utils/mediaDB.ts`
- Modify: `hooks/useGeneration.ts`
- Modify: `App.tsx`
- Test: `tests/mediaDB.test.ts`

**Root cause:**
- Generated videos are represented as object URLs.
- Current board persistence only rewrites image data to IndexedDB refs.
- Reloaded sessions cannot rely on old object URLs.

**Design decision (revised):**
- **Do NOT add `storageKey` to VideoElement.** Images use dynamic key `board:${el.id}` at persist time — videos must follow the same pattern for type consistency.
- Add a Blob-capable media store for videos.
- In `persistBoardsToIDB`, add a video branch that stores blob data to mediaDB with key `board:${el.id}` and rewrites `href` to `idb-video:${el.id}`.
- On board load, resolve `idb-video:` prefixed hrefs back to fresh object URLs.
- Let Task 2 own revocation of hydrated object URLs.

**Completion definition (DoD):**
- `tests/mediaDB.test.ts` passes.
- Video survives page reload.
- No changes to `types.ts` (VideoElement unchanged).

**Regression risk:**
- Medium due to async load/rehydration and cleanup timing.

**Verification:**
- Generate a video, reload the page, confirm the video still exists and plays.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { putVideoBlob, getVideoBlob } from '../utils/mediaDB';

describe('mediaDB', () => {
  it('stores and retrieves a video blob', async () => {
    const blob = new Blob(['video-bytes'], { type: 'video/mp4' });
    await putVideoBlob('board:test-id', blob);
    const result = await getVideoBlob('board:test-id');
    expect(result?.type).toBe('video/mp4');
  });

  it('returns null for missing keys', async () => {
    const result = await getVideoBlob('board:nonexistent');
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/mediaDB.test.ts`
Expected: FAIL because `utils/mediaDB.ts` does not exist yet.

- [ ] **Step 3: Create the Blob store**

```ts
const DB_NAME = 'flovart-media';
const STORE_NAME = 'videos';

let dbInstance: IDBDatabase | null = null;

async function openDB(): Promise<IDBDatabase> {
  if (dbInstance) return dbInstance;
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME);
    };
    req.onsuccess = () => {
      dbInstance = req.result;
      resolve(req.result);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function putVideoBlob(key: string, blob: Blob): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(blob, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getVideoBlob(key: string): Promise<Blob | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(key);
    req.onsuccess = () => resolve((req.result as Blob) ?? null);
    req.onerror = () => reject(req.error);
  });
}
```

- [ ] **Step 4: Persist videos in `persistBoardsToIDB` (App.tsx)**

Add video branch alongside existing image branch, using same dynamic key pattern:

```ts
// In persistBoardsToIDB, for each element:
if (el.type === 'video' && el.href.startsWith('blob:')) {
  try {
    const resp = await fetch(el.href);
    const blob = await resp.blob();
    const key = `board:${el.id}`;
    await putVideoBlob(key, blob);
    return { ...el, href: `idb-video:${el.id}` };
  } catch {
    return el; // keep blob URL as fallback
  }
}
```

- [ ] **Step 5: Persist generated videos immediately in `useGeneration.ts`**

```ts
const videoUrl = URL.createObjectURL(videoBlob);
// Also persist to IDB immediately for durability
const idbKey = `board:${newId}`;
putVideoBlob(idbKey, videoBlob).catch(() => {/* best-effort */});
```

- [ ] **Step 6: Rehydrate videos on board load in `App.tsx`**

```ts
if (el.type === 'video' && el.href.startsWith('idb-video:')) {
  const elId = el.href.replace('idb-video:', '');
  const blob = await getVideoBlob(`board:${elId}`);
  if (blob) {
    return { ...el, href: URL.createObjectURL(blob) };
  }
}
```

Apply this in the board-loading path alongside image `idb:` resolution.

- [ ] **Step 7: Run tests**

Run: `npm test -- tests/mediaDB.test.ts`
Expected: PASS

- [ ] **Step 8: Manual verification**

1. Generate a video.
2. Refresh the page.
3. Confirm the video element still exists.
4. Confirm the video still plays.

---

### Task 6: Make capability diagnostics and UI warnings truthful (P1)

**Files:**
- Modify: `services/aiGateway.ts`
- Modify: `hooks/useApiKeys.ts`
- Modify: `components/AgentChatPanel.tsx`
- Test: `tests/aiGateway.test.ts`

**Root cause:**
- The router has real constraints.
- UI/state helpers do not always explain those constraints clearly.
- Users can save a key successfully and still assume unsupported capabilities are available.

**Minimal fix:**
- Expand diagnostics to report capability support **with reasons**.
- Make `getPreferredApiKey()` selection fail loudly when the selected model/provider combination is unsupported.
- Show UI warnings before the user runs into a request failure.

**Optional enhancement:**
- Surface a compact capability matrix in settings.

**Regression risk:**
- Low if changes are additive and diagnostic-first.

**Verification:**
- With only a custom/OpenAI-compatible key, the UI clearly says what works and what does not.

- [ ] **Step 1: Extend the failing diagnostics test**

```ts
it('reports unsupported agent coverage for non-Banana keysets with reasons', () => {
  const keys: UserApiKey[] = [{
    id: '1',
    provider: 'custom',
    key: 'sk-test',
    capabilities: ['text', 'image', 'video'],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }];

  const result = diagnoseKeyCapabilities(keys);
  expect(result.covered).toEqual(expect.arrayContaining(['text', 'image', 'video']));
  expect(result.missing).toContain('agent');
  expect(result.warnings.some(w => w.includes('Banana'))).toBe(true);
});
```

- [ ] **Step 2: Run test to verify current messaging is insufficient**

Run: `npm test -- tests/aiGateway.test.ts`
Expected: either FAIL on the new assertion or PASS without the needed diagnostic detail.

- [ ] **Step 3: Add structured capability reasons in `services/aiGateway.ts`**

```ts
export type CapabilityStatus = {
  capability: AICapability;
  supported: boolean;
  reason: string;
};

export function explainKeyCapabilities(keys: UserApiKey[]): CapabilityStatus[] {
  const covered = new Set(keys.flatMap(key => key.capabilities?.length ? key.capabilities : inferCapabilitiesByProvider(key.provider)));
  return [
    { capability: 'text', supported: covered.has('text'), reason: covered.has('text') ? '至少一个已配置文本模型可用。' : '未找到文本模型 Key。' },
    { capability: 'image', supported: covered.has('image'), reason: covered.has('image') ? '至少一个图片模型可用。' : '未找到图片模型 Key。' },
    { capability: 'video', supported: covered.has('video'), reason: covered.has('video') ? '至少一个视频模型可用。' : '未找到视频模型 Key。' },
    { capability: 'agent', supported: covered.has('agent'), reason: covered.has('agent') ? 'Banana agent 端点可用。' : '当前多 Agent 讨论可运行，但 Banana 专用 agent 端点未配置。' },
  ];
}
```

- [ ] **Step 4: Expose capability warnings from `useApiKeys.ts`**

```ts
const capabilityStatus = useMemo(() => explainKeyCapabilities(userApiKeys), [userApiKeys]);
const agentWarning = capabilityStatus.find(item => item.capability === 'agent' && !item.supported)?.reason;
```

Return this from the hook.

- [ ] **Step 5: Show the warning in `AgentChatPanel.tsx`**

```tsx
{agentWarning && (
  <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
    {agentWarning}
  </div>
)}
```

Also update submit-path system messaging so “最终提示词已生成，正在调用图片生成...” is only shown after capability preflight passes.

- [ ] **Step 6: Run tests**

Run: `npm test -- tests/aiGateway.test.ts`
Expected: PASS

- [ ] **Step 7: Manual verification**

1. Configure only a custom key.
2. Open agent panel.
3. Confirm the UI explains that generic discussion can run but Banana-specific endpoints are absent.
4. Attempt unsupported features and confirm warnings are shown before request failure.

- [ ] **Step 8: Commit**

```bash
git add services/aiGateway.ts hooks/useApiKeys.ts components/AgentChatPanel.tsx tests/aiGateway.test.ts
git commit -m "fix: clarify capability diagnostics and agent warnings"
```

---

### Task 7: Clean up agent-vs-Banana semantics without rewriting the orchestrator (P2)

**Files:**
- Modify: `hooks/useApiKeys.ts`
- Modify: `components/AgentChatPanel.tsx`
- Modify: `services/agentOrchestrator.ts`
- Test: `tests/agentRuntimeConfig.test.ts`

**Root cause:**
- The multi-round discussion loop is generic and works through `callLLM(...)`.
- Separate Banana runtime endpoints are configured in `useApiKeys.ts`.
- Users can easily read this as “agent requires Banana,” even though discussion mode is broader.

**Minimal fix:**
- Preserve current Banana endpoint config.
- Rename/clarify UI and diagnostic text so “Agent Chat” is clearly generic discussion, while Banana is described as an optional runtime integration.
- Add explicit preflight text in the agent panel when a selected model lacks a resolvable key.

**Optional enhancement:**
- Add a second label in settings: `discussion model` vs `banana runtime key`.

**Regression risk:**
- Low because this is mostly semantic/UI work.

**Verification:**
- A user with OpenAI/Google text keys understands that multi-agent discussion is available even without Banana.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { buildAgentRuntimeSummary } from '../hooks/useApiKeys';

describe('agent runtime summary', () => {
  it('distinguishes discussion support from Banana endpoint support', () => {
    const summary = buildAgentRuntimeSummary({
      textModel: 'gpt-4o',
      agentModel: 'banana-vision-v1',
      keys: [{ provider: 'openai', key: 'sk-test', capabilities: ['text'] }],
    } as any);

    expect(summary.discussionSupported).toBe(true);
    expect(summary.bananaRuntimeSupported).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/agentRuntimeConfig.test.ts`
Expected: FAIL because helper does not exist yet.

- [ ] **Step 3: Add a tiny summary helper in `useApiKeys.ts`**

```ts
export function buildAgentRuntimeSummary(input: {
  textModel: string;
  agentModel: string;
  keys: Array<Pick<UserApiKey, 'provider' | 'key' | 'capabilities'>>;
}) {
  const discussionProvider = inferProviderFromModel(input.textModel);
  const discussionSupported = input.keys.some(k => !!k.key && (k.provider === discussionProvider || (k.capabilities || []).includes('text')));
  const bananaRuntimeSupported = input.keys.some(k => !!k.key && k.provider === 'banana');
  return { discussionSupported, bananaRuntimeSupported };
}
```

- [ ] **Step 4: Update `AgentChatPanel.tsx` copy**

```tsx
<div className="text-xs text-neutral-500">
  多 Agent 讨论使用当前文本模型；Banana Key 仅用于 Banana 专用运行时端点。
</div>
```

- [ ] **Step 5: Add submit preflight in `components/AgentChatPanel.tsx`**

```ts
if (!discussionSupported) {
  handleMessage({
    id: `error-${Date.now()}`,
    agentId: 'system',
    agentName: '系统',
    agentEmoji: '⚠️',
    agentColor: '#EF4444',
    role: 'system',
    content: '当前未找到可用于多 Agent 讨论的文本模型 Key。',
    timestamp: Date.now(),
  });
  return;
}
```

- [ ] **Step 6: Run tests**

Run: `npm test -- tests/agentRuntimeConfig.test.ts tests/aiGateway.test.ts`
Expected: PASS

- [ ] **Step 7: Manual verification**

1. Keep only a Google or OpenAI text key.
2. Open the agent panel.
3. Confirm the panel states discussion is available even though Banana runtime is not.

- [ ] **Step 8: Commit**

```bash
git add hooks/useApiKeys.ts components/AgentChatPanel.tsx services/agentOrchestrator.ts tests/agentRuntimeConfig.test.ts
git commit -m "fix: separate generic agent chat from banana runtime messaging"
```

---

## Cross-task verification checklist

After all tasks above:

- [ ] Run targeted unit tests

```bash
npm test -- tests/testInfra.test.ts tests/keyCodec.test.ts tests/objectUrlRegistry.test.ts tests/historyState.test.ts tests/mediaDB.test.ts tests/aiGateway.test.ts tests/agentRuntimeConfig.test.ts
```

Expected: PASS

- [ ] Run the full test suite

```bash
npm test
```

Expected: PASS

- [ ] Run the production build

```bash
npm run build
```

Expected: PASS

- [ ] Manual regression pass

Checklist:
1. Add image to canvas.
2. Generate image.
3. Generate video.
4. Delete generated video.
5. Undo/redo repeatedly.
6. Reload the page and confirm persisted video recovery.
7. Save key in popup and use reverse prompt from content script.
8. Run agent discussion with and without Banana key.

---

## Rollout notes

- Ship Task 1, Task 2, and Task 3 together if possible. They are the highest-value stability fixes and are low-to-medium risk.
- Ship Task 5 only after Task 2 is in place, because persisted videos will create more object URLs during rehydration.
- Task 6 and Task 7 are user-trust fixes. They should land before any public claim that custom keys or agent workflows are “fully supported.”

---

## Open questions to resolve before implementation

1. What should the history cap be: 30, 50, or 100 snapshots?
   - Recommendation: `50`.
2. Should imported local videos also be persisted immediately, or only generated videos?
   - Recommendation: both, using the same `storageKey` flow.
3. Should the extension share codec logic via a real shared file, or by duplication?
   - Recommendation: shared file.
4. Should `agent` remain a capability name, or should the UI relabel it as `banana runtime`?
   - Recommendation: keep the type name for compatibility, relabel in UI.

---

## Self-review

### Spec coverage
- Test infrastructure: covered by Task 0 (blocker).
- Large image/video stability: covered by Tasks 2, 3, 4, 5.
- Video object URL lifecycle: covered by Task 2.
- Undo/redo runtime pressure: covered by Task 3.
- Drag/resize/snapping hot path: covered by Task 4.
- Agent loop vs Banana binding: covered by Tasks 6 and 7.
- Third-party/custom key truthfulness: covered by Task 6.
- Plugin/web key sync issues: covered by Task 1.

### Placeholder scan
- No TODO/TBD placeholders remain.
- Each task names exact files.
- Each test step includes actual test code.
- Each verification step includes concrete commands.

### Type consistency (revised)
- `VideoElement` is **not modified**. Videos use dynamic key `board:${el.id}` at persist time, same as images.
- Key codec split into `utils/keyCodec.ts` (pure, testable) and `extension/shared/keyStorage.js` (adapter).
- `encodeKeys` / `decodeKeys` are pure functions accepting explicit `runtimeId`.
- `discussionSupported` and `bananaRuntimeSupported` are distinct semantics.

### Revision history
- **v1** (original): 7 tasks.
- **v2** (current): 8 tasks (added Task 0). Removed `storageKey` from Task 5. Split Task 1 into pure codec + adapter layers. Updated cross-task verification. Removed per-task commit steps (checkpoint-then-batch approach).

---

**Plan revised and ready for execution. Recommended approach: subagent-driven (one agent per task with review checkpoints between tasks).**
