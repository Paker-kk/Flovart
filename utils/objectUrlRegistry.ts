import type { Element } from '../types';

/** Collect all blob: URLs from video elements. */
export function collectVideoObjectUrls(elements: Element[]): Set<string> {
  return new Set(
    elements
      .filter((el): el is Extract<Element, { type: 'video' }> => el.type === 'video')
      .map(el => el.href)
      .filter(href => typeof href === 'string' && href.startsWith('blob:')),
  );
}

/** Return URLs present in `prev` but absent in `next`. */
export function diffRemovedObjectUrls(prev: Set<string>, next: Set<string>): string[] {
  return [...prev].filter(url => !next.has(url));
}
