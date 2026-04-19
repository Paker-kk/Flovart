/**
 * API Usage Monitoring — per-key call tracking and cost estimation.
 * Data is persisted in localStorage.
 */

const STORAGE_KEY = 'flovart.api_usage';

export interface UsageRecord {
  /** UserApiKey.id */
  keyId: string;
  /** Provider name */
  provider: string;
  /** Model used */
  model: string;
  /** Timestamp (ms) */
  timestamp: number;
  /** Type: text generation, image generation, video generation */
  type: 'text' | 'image' | 'video';
  /** Estimated cost in USD cents (rough estimate) */
  estimatedCostCents: number;
  /** Whether the call succeeded */
  success: boolean;
  /** Optional error message */
  error?: string;
}

export interface KeyUsageSummary {
  keyId: string;
  provider: string;
  totalCalls: number;
  successCalls: number;
  errorCalls: number;
  totalCostCents: number;
  byType: {
    text: number;
    image: number;
    video: number;
  };
  /** Calls in the last 24h */
  last24h: number;
  /** Calls in the last 7d */
  last7d: number;
  lastUsed: number | null;
}

// ──── Cost estimates per call (rough, in USD cents) ────
const COST_MAP: Record<string, Record<string, number>> = {
  google:     { text: 0.5, image: 3, video: 10 },
  openai:     { text: 1,   image: 4, video: 0  },
  anthropic:  { text: 1.5, image: 0, video: 0  },
  qwen:       { text: 0.3, image: 2, video: 5  },
  deepseek:   { text: 0.2, image: 0, video: 0  },
  siliconflow: { text: 0.2, image: 1.5, video: 5 },
  keling:     { text: 0,   image: 2, video: 8  },
  flux:       { text: 0,   image: 2, video: 0  },
  midjourney: { text: 0,   image: 5, video: 0  },
  banana:     { text: 0,   image: 2, video: 5  },
  runningHub: { text: 0,   image: 3, video: 8  },
  custom:     { text: 0.5, image: 2, video: 5  },
};

function getEstimatedCost(provider: string, type: 'text' | 'image' | 'video'): number {
  return COST_MAP[provider]?.[type] ?? 1;
}

// ──── Storage ────

function loadRecords(): UsageRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as UsageRecord[];
  } catch {
    return [];
  }
}

function saveRecords(records: UsageRecord[]): void {
  // Keep at most 10000 records (trim oldest)
  const trimmed = records.length > 10000 ? records.slice(-10000) : records;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch (err) {
    console.error('[Storage] Failed to save usage records', err);
  }
}

// ──── Public API ────

/** Record a single API call */
export function recordApiUsage(opts: {
  keyId: string;
  provider: string;
  model: string;
  type: 'text' | 'image' | 'video';
  success: boolean;
  error?: string;
}): void {
  const records = loadRecords();
  records.push({
    keyId: opts.keyId,
    provider: opts.provider,
    model: opts.model,
    timestamp: Date.now(),
    type: opts.type,
    estimatedCostCents: getEstimatedCost(opts.provider, opts.type),
    success: opts.success,
    error: opts.error,
  });
  saveRecords(records);
}

/** Get usage summary for all keys */
export function getUsageSummary(keyIds: string[]): Map<string, KeyUsageSummary> {
  const records = loadRecords();
  const now = Date.now();
  const DAY = 86400000;
  const WEEK = 7 * DAY;
  const map = new Map<string, KeyUsageSummary>();

  // Init summaries
  for (const id of keyIds) {
    map.set(id, {
      keyId: id,
      provider: '',
      totalCalls: 0,
      successCalls: 0,
      errorCalls: 0,
      totalCostCents: 0,
      byType: { text: 0, image: 0, video: 0 },
      last24h: 0,
      last7d: 0,
      lastUsed: null,
    });
  }

  for (const rec of records) {
    let s = map.get(rec.keyId);
    if (!s) continue;
    s.provider = rec.provider;
    s.totalCalls++;
    if (rec.success) s.successCalls++;
    else s.errorCalls++;
    s.totalCostCents += rec.estimatedCostCents;
    s.byType[rec.type]++;
    if (now - rec.timestamp < DAY) s.last24h++;
    if (now - rec.timestamp < WEEK) s.last7d++;
    if (!s.lastUsed || rec.timestamp > s.lastUsed) s.lastUsed = rec.timestamp;
  }

  return map;
}

/** Get usage summary for a single key */
export function getKeyUsage(keyId: string): KeyUsageSummary {
  const map = getUsageSummary([keyId]);
  return map.get(keyId) ?? {
    keyId,
    provider: '',
    totalCalls: 0,
    successCalls: 0,
    errorCalls: 0,
    totalCostCents: 0,
    byType: { text: 0, image: 0, video: 0 },
    last24h: 0,
    last7d: 0,
    lastUsed: null,
  };
}

/** Get all records for a key (for detailed view) */
export function getKeyRecords(keyId: string): UsageRecord[] {
  return loadRecords().filter(r => r.keyId === keyId);
}

/** Clear all usage data */
export function clearAllUsageData(): void {
  localStorage.removeItem(STORAGE_KEY);
}

/** Format cost in cents to display string */
export function formatCost(cents: number): string {
  if (cents < 100) return `$${(cents / 100).toFixed(3)}`;
  return `$${(cents / 100).toFixed(2)}`;
}
