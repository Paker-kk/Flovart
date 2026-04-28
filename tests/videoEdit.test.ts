import { describe, expect, it } from 'vitest';

import { getTrimmedDuration, normalizeVideoTrim } from '../utils/videoEdit';

describe('videoEdit utilities', () => {
  it('clamps trim windows into the source duration', () => {
    expect(normalizeVideoTrim({
      durationSec: 5,
      trimInSec: -2,
      trimOutSec: 9,
    })).toEqual({
      trimInSec: 0,
      trimOutSec: 5,
    });
  });

  it('keeps trimOut at or after trimIn', () => {
    expect(normalizeVideoTrim({
      durationSec: 10,
      trimInSec: 6,
      trimOutSec: 3,
    })).toEqual({
      trimInSec: 6,
      trimOutSec: 6,
    });
  });

  it('computes trimmed duration from normalized values', () => {
    expect(getTrimmedDuration({
      durationSec: 12,
      trimInSec: 2.5,
      trimOutSec: 9,
    })).toBe(6.5);
  });
});
