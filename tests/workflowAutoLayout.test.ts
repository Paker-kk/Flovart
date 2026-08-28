import { describe, expect, it } from 'vitest';

import type { WorkflowConnection, WorkflowNode } from '../components/workflow/types';
import { computeAutoLayout } from '../components/workflow/layoutAlgorithm';

function node(id: string, face: { x: number; y: number; width: number; height: number; isVisible?: boolean }): WorkflowNode {
  return {
    id,
    type: 'text',
    position: { x: face.x, y: face.y },
    width: face.width,
    height: face.height,
    ...(face.isVisible !== undefined ? { isVisible: face.isVisible } : {}),
    metadata: {},
  } as WorkflowNode;
}

const edge = (fromNodeId: string, toNodeId: string): WorkflowConnection => ({
  id: `e-${fromNodeId}-${toNodeId}`,
  fromNodeId,
  toNodeId,
});

describe('computeAutoLayout', () => {
  it('places a chain in left-to-right layers with no overlap', () => {
    const nodes = [node('a', { x: 0, y: 0, width: 200, height: 100 }), node('b', { x: 0, y: 0, width: 200, height: 120 }), node('c', { x: 0, y: 0, width: 200, height: 80 })];
    const positions = computeAutoLayout(nodes, [edge('a', 'b'), edge('b', 'c')]);
    expect(positions.get('a')).toEqual({ x: 40, y: 40 });
    expect(positions.get('b')!.x).toBeGreaterThan(positions.get('a')!.x + 200);
    expect(positions.get('c')!.x).toBeGreaterThan(positions.get('b')!.x + 200);
    expect(positions.get('b')!.y).toBe(40);
    expect(positions.get('c')!.y).toBe(40);
  });

  it('reduces crossing for a classic crossing case', () => {
    // 两层：a,b → c,d；同层上下堆叠（x 相同、y 递增）。
    const nodes = [
      node('a', { x: 0, y: 0, width: 100, height: 50 }),
      node('b', { x: 0, y: 0, width: 100, height: 50 }),
      node('c', { x: 0, y: 0, width: 100, height: 50 }),
      node('d', { x: 0, y: 0, width: 100, height: 50 }),
    ];
    const positions = computeAutoLayout(nodes, [edge('a', 'c'), edge('b', 'd')]);
    // 同层同列（x 相同），按堆叠顺序 y 递增
    expect(positions.get('c')!.x).toBe(positions.get('d')!.x);
    expect(positions.get('a')!.x).toBe(positions.get('b')!.x);
    // 无交叉：层 0 顺序与层 1 的入边顺序一致（a 在上 ⇒ c 在上）
    const firstOrder = positions.get('a')!.y < positions.get('b')!.y ? 'ab' : 'ba';
    const secondOrder = positions.get('c')!.y < positions.get('d')!.y ? 'cd' : 'dc';
    expect(secondOrder === 'cd').toBe(firstOrder === 'ab');
  });

  it('places isolated nodes in a separate grid to the right', () => {
    const nodes = [
      node('a', { x: 0, y: 0, width: 200, height: 80 }),
      node('b', { x: 0, y: 0, width: 200, height: 80 }),
      node('iso1', { x: 0, y: 0, width: 150, height: 60 }),
      node('iso2', { x: 0, y: 0, width: 150, height: 60 }),
      node('iso3', { x: 0, y: 0, width: 150, height: 60 }),
    ];
    const positions = computeAutoLayout(nodes, [edge('a', 'b')]);
    const mainX = Math.max(positions.get('a')!.x, positions.get('b')!.x);
    const isoXs = [positions.get('iso1')!.x, positions.get('iso2')!.x, positions.get('iso3')!.x];
    expect(Math.min(...isoXs)).toBeGreaterThan(mainX + 200);
    // iso1/iso2 同行两列，iso3 换行回区块起始列
    expect(positions.get('iso1')!.x).toBe(positions.get('iso3')!.x);
    expect(positions.get('iso3')!.y).toBeGreaterThan(positions.get('iso1')!.y);
  });

  it('ignores hidden nodes but keeps visible ones positioned', () => {
    const nodes = [
      node('keep', { x: 0, y: 0, width: 200, height: 80 }),
      node('hidden', { x: 0, y: 0, width: 200, height: 80, isVisible: false }),
      node('sink', { x: 0, y: 0, width: 200, height: 80 }),
    ];
    const positions = computeAutoLayout(nodes, [edge('keep', 'sink'), edge('hidden', 'sink')]);
    expect(positions.has('hidden')).toBe(false);
    expect(positions.has('keep')).toBe(true);
    expect(positions.has('sink')).toBe(true);
  });

  it('survives cyclic connections without recursion overflow', () => {
    const nodes = [node('a', { x: 0, y: 0, width: 120, height: 60 }), node('b', { x: 0, y: 0, width: 120, height: 60 })];
    const positions = computeAutoLayout(nodes, [edge('a', 'b'), edge('b', 'a')]);
    expect(positions.size).toBe(2);
    for (const id of ['a', 'b']) {
      expect(Number.isFinite(positions.get(id)!.x)).toBe(true);
      expect(Number.isFinite(positions.get(id)!.y)).toBe(true);
    }
  });

  it('stacks variable-height nodes of the same layer without vertical overlap', () => {
    const nodes = [
      node('tall', { x: 0, y: 0, width: 200, height: 300 }),
      node('short', { x: 0, y: 0, width: 200, height: 60 }),
      node('c', { x: 0, y: 0, width: 120, height: 40 }),
    ];
    const positions = computeAutoLayout(nodes, [edge('tall', 'c'), edge('short', 'c')]);
    const gap = positions.get('short')!.y - (positions.get('tall')!.y + 300);
    expect(gap).toBeGreaterThanOrEqual(32);
  });

  it('falls back to type default sizes for legacy nodes without width/height', () => {
    const nodes = [
      { ...node('legacy-text', { x: 0, y: 0, width: 0, height: 0 }), width: undefined, height: undefined },
      { ...node('legacy-image', { x: 0, y: 0, width: 0, height: 0 }), type: 'image' as const, width: undefined, height: undefined },
      { ...node('c', { x: 0, y: 0, width: 100, height: 50 }), type: 'image' as const },
    ];
    const positions = computeAutoLayout(nodes, [edge('legacy-text', 'c'), edge('legacy-image', 'c')]);
    // text 默认高 220、image 默认高 240：同层堆叠间隔必须 ≥ 240 + 32，不重叠
    const a = positions.get('legacy-text')!;
    const b = positions.get('legacy-image')!;
    expect(a.x).toBe(b.x); // 同层同列
    const gap = b.y - (a.y + 220);
    expect(gap).toBeGreaterThanOrEqual(32);
  });
});