import type { Element } from '../types';

export const MAX_BOARD_HISTORY = 50;

/**
 * Append a new snapshot to the history stack, trimming forward entries
 * (after undo) and capping total length to MAX_BOARD_HISTORY.
 */
export function appendHistorySnapshot(
  history: Element[][],
  historyIndex: number,
  nextElements: Element[],
): { history: Element[][]; historyIndex: number } {
  const trimmed = [...history.slice(0, historyIndex + 1), nextElements];
  const capped = trimmed.length > MAX_BOARD_HISTORY
    ? trimmed.slice(trimmed.length - MAX_BOARD_HISTORY)
    : trimmed;
  return {
    history: capped,
    historyIndex: capped.length - 1,
  };
}
