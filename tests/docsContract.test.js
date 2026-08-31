import { describe, expect, it } from 'vitest';
import { checkDocsContract } from '../scripts/check-docs-contract.mjs';

describe('release documentation contract', () => {
  it('keeps documented commands, stable Skill projections, and retired paths aligned', () => {
    const result = checkDocsContract();
    expect(result.errors).toEqual([]);
  });
});
