/**
 * Pinyin fuzzy matching utility for model search.
 * Enables Chinese pinyin input to match against English model names.
 */

const PINYIN_MAP: Record<string, string[]> = {
  '文': ['wen'], '图': ['tu'], '视': ['shi'], '频': ['pin'],
  '生': ['sheng'], '成': ['cheng'], '大': ['da'], '模': ['mo'],
  '型': ['xing'], '通': ['tong'], '用': ['yong'], '千': ['qian'],
  '问': ['wen'], '火': ['huo'], '星': ['xing'], '灵': ['ling'],
  '感': ['gan'], '画': ['hua'], '像': ['xiang'], '智': ['zhi'],
  '能': ['neng'], '搜': ['sou'], '索': ['suo'], '语': ['yu'],
  '言': ['yan'], '理': ['li'], '解': ['jie'], '代': ['dai'],
  '码': ['ma'], '编': ['bian'], '程': ['cheng'],
};

function hasChinese(str: string): boolean {
  return /[一-鿿]/.test(str);
}

function toPinyinTokens(str: string): string[] {
  const tokens: string[] = [];
  for (const char of str) {
    const pinyins = PINYIN_MAP[char];
    if (pinyins) tokens.push(...pinyins);
  }
  return tokens;
}

export interface FuzzyResult {
  item: string;
  score: number;
}

export function fuzzyMatch(query: string, items: string[]): FuzzyResult[] {
  if (!query.trim()) return items.map(item => ({ item, score: 0 }));
  const normalizedQuery = query.toLowerCase().trim();
  const queryTokens = toPinyinTokens(normalizedQuery);
  const hasCjk = hasChinese(normalizedQuery);
  const results: FuzzyResult[] = [];
  for (const item of items) {
    const normalizedItem = item.toLowerCase();
    let score = 0;
    if (normalizedItem.includes(normalizedQuery)) {
      score = 100 + (normalizedItem.startsWith(normalizedQuery) ? 50 : 0);
    }
    const initials = normalizedItem.split(/[\s-]+/).map(w => w[0]).filter(Boolean).join('');
    if (initials.length > 1 && initials.includes(normalizedQuery)) {
      score = Math.max(score, 80);
    }
    if (queryTokens.length > 0) {
      const itemPinyinTokens = toPinyinTokens(normalizedItem);
      const matchedPinyin = queryTokens.some(qt =>
        itemPinyinTokens.some(it => it.includes(qt) || (qt.length > 1 && qt.includes(it)))
      );
      if (matchedPinyin) score = Math.max(score, 70);
    }
    if (hasCjk && normalizedItem.includes(normalizedQuery)) {
      score = Math.max(score, 100);
    }
    if (score > 0 || !query.trim()) results.push({ item, score });
  }
  return results.sort((a, b) => b.score - a.score);
}

export function debounce<T extends (...args: any[]) => void>(
  fn: T, delayMs: number,
): { call: (...args: Parameters<T>) => void; cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return {
    call: (...args: Parameters<T>) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delayMs);
    },
    cancel: () => { if (timer) { clearTimeout(timer); timer = null; } },
  };
}
