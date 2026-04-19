import { describe, expect, it } from 'vitest';
import { appendHistorySnapshot, MAX_BOARD_HISTORY } from '../utils/historyState';

describe('historyState', () => {
  it('appends a new snapshot and advances index', () => {
    const result = appendHistorySnapshot([[{ id: 'a' }] as any], 0, [{ id: 'b' }] as any);
    expect(result.history).toHaveLength(2);
    expect(result.historyIndex).toBe(1);
  });

  it('truncates forward history when appending after undo', () => {
    // history: [A, B, C], index: 1 (at B, C is "future")
    const result = appendHistorySnapshot(
      [['A'], ['B'], ['C']] as any,
      1,
      ['D'] as any,
    );
    // Should be [A, B, D] — C is discarded
    expect(result.history).toHaveLength(3);
    expect(result.historyIndex).toBe(2);
    expect(result.history[2]).toEqual(['D']);
  });

  it('caps history length at MAX_BOARD_HISTORY', () => {
    let state = { history: [[{ id: '0' }]] as any[][], historyIndex: 0 };
    for (let i = 1; i <= MAX_BOARD_HISTORY + 10; i++) {
      state = appendHistorySnapshot(state.history, state.historyIndex, [{ id: String(i) }] as any);
    }
    expect(state.history.length).toBe(MAX_BOARD_HISTORY);
    expect(state.historyIndex).toBe(MAX_BOARD_HISTORY - 1);
  });

  it('preserves newest entries when capping', () => {
    let state = { history: [[{ id: '0' }]] as any[][], historyIndex: 0 };
    for (let i = 1; i <= MAX_BOARD_HISTORY + 5; i++) {
      state = appendHistorySnapshot(state.history, state.historyIndex, [{ id: String(i) }] as any);
    }
    // The last entry should be the most recent
    const last = state.history[state.historyIndex];
    expect(last[0].id).toBe(String(MAX_BOARD_HISTORY + 5));
  });
});
