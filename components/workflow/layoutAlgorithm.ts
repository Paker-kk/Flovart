import { WORKFLOW_NODE_SPECS } from './constants';
import type { WorkflowConnection, WorkflowNode } from './types';

const AUTO_LAYOUT_GAP_X = 96;
const AUTO_LAYOUT_GAP_Y = 32;
const AUTO_LAYOUT_PADDING = 40;
const AUTO_LAYOUT_ISOLATED_COLS = 2;
const AUTO_LAYOUT_SORT_PASSES = 5;

/** 节点缺 width/height 时按类型默认兜底（老数据/手动构造节点渲染时由内容撑高，布局必须与其一致）。 */
function nodeWidth(node: WorkflowNode): number {
  return node.width || WORKFLOW_NODE_SPECS[node.type]?.width || 320;
}

function nodeHeight(node: WorkflowNode): number {
  return node.height || WORKFLOW_NODE_SPECS[node.type]?.height || 200;
}

/**
 * 整理画布：Sugiyama 风格分层布局（最长路径分层 + barycenter 层间排序减小交叉 +
 * 按节点实际尺寸紧凑排布 + 孤立节点独立孤岛区）。
 * 规则：
 * 1. 隐藏节点（isVisible === false）不参与，其连线忽略；
 * 2. 分层按最长路径；环内节点留在同一层，不递归爆栈；
 * 3. 层内顺序用 barycenter 启发式迭代排序，显著减少跨层连线交叉；
 * 4. x 按层最大宽度紧凑累积，y 按节点实际高度紧凑堆叠，整图贴左上（PADDING）；
 * 5. 孤立节点放主图右侧孤岛区（2 列网格），不与主图混排。
 */
export function computeAutoLayout(nodes: WorkflowNode[], connections: WorkflowConnection[]): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  const visible = nodes.filter(node => node.isVisible !== false);
  if (!visible.length) return positions;
  const byId = new Map(visible.map(node => [node.id, node]));
  const incoming = new Map<string, string[]>();
  const outgoing = new Map<string, string[]>();
  const connected = new Set<string>();
  for (const conn of connections) {
    if (!byId.has(conn.fromNodeId) || !byId.has(conn.toNodeId)) continue;
    (outgoing.get(conn.fromNodeId) || (outgoing.set(conn.fromNodeId, []).get(conn.fromNodeId) as string[])).push(conn.toNodeId);
    (incoming.get(conn.toNodeId) || (incoming.set(conn.toNodeId, []).get(conn.toNodeId) as string[])).push(conn.fromNodeId);
    connected.add(conn.fromNodeId);
    connected.add(conn.toNodeId);
  }

  // 1) 最长路径分层（环保护：visiting 命中返回 0）。
  const layer = new Map<string, number>();
  const computeLayer = (id: string, visiting = new Set<string>()): number => {
    if (layer.has(id)) return layer.get(id) as number;
    if (visiting.has(id)) return 0;
    visiting.add(id);
    const preds = incoming.get(id) || [];
    const l = preds.length ? 1 + Math.max(...preds.map(p => computeLayer(p, visiting))) : 0;
    layer.set(id, l);
    visiting.delete(id);
    return l;
  };
  visible.forEach(node => { if (connected.has(node.id)) computeLayer(node.id); });

  const layerCount = layer.size ? Math.max(...layer.values()) + 1 : 0;
  const layers: string[][] = Array.from({ length: layerCount }, () => []);
  visible.forEach(node => {
    const l = layer.has(node.id) ? (layer.get(node.id) as number) : layerCount; // 孤立节点归入孤岛
    if (l < layerCount) layers[l].push(node.id);
  });
  const isolated = visible.filter(node => !connected.has(node.id)).map(node => node.id);

  // 2) barycenter 层间排序：每轮自上而下、自下而上交替，稳定排序降低交叉。
  for (let pass = 0; pass < AUTO_LAYOUT_SORT_PASSES; pass += 1) {
    for (let l = 1; l < layers.length; l += 1) {
      const anchor = new Map<string, number>();
      layers[l - 1].forEach((id, index) => anchor.set(id, index));
      const indexed = layers[l].map((id, index) => {
        const neighbors = (incoming.get(id) || []).map(n => anchor.get(n)).filter((v): v is number => v !== undefined);
        const center = neighbors.length ? neighbors.reduce((a, b) => a + b, 0) / neighbors.length : index;
        return { id, index, center };
      });
      indexed.sort((a, b) => a.center - b.center || a.index - b.index);
      layers[l] = indexed.map(entry => entry.id);
    }
    for (let l = layers.length - 2; l >= 0; l -= 1) {
      const anchor = new Map<string, number>();
      layers[l + 1].forEach((id, index) => anchor.set(id, index));
      const indexed = layers[l].map((id, index) => {
        const neighbors = (outgoing.get(id) || []).map(n => anchor.get(n)).filter((v): v is number => v !== undefined);
        const center = neighbors.length ? neighbors.reduce((a, b) => a + b, 0) / neighbors.length : index;
        return { id, index, center };
      });
      indexed.sort((a, b) => a.center - b.center || a.index - b.index);
      layers[l] = indexed.map(entry => entry.id);
    }
  }

  // 3) 紧凑坐标：x 按层最大宽度累积，y 按节点实际高度堆叠。
  let x = AUTO_LAYOUT_PADDING;
  for (const ids of layers) {
    if (!ids.length) continue; // 环等结构可能产生空层，跳过避免 -Infinity 污染坐标
    const width = Math.max(...ids.map(id => nodeWidth(byId.get(id)!)));
    let y = AUTO_LAYOUT_PADDING;
    for (const id of ids) {
      const node = byId.get(id);
      positions.set(id, { x, y });
      y += nodeHeight(node) + AUTO_LAYOUT_GAP_Y;
    }
    x += width + AUTO_LAYOUT_GAP_X;
  }

  // 4) 孤立节点孤岛区：主图右侧独立网格，不与主图混排。
  if (isolated.length) {
    const isolatedStartX = x + AUTO_LAYOUT_GAP_X;
    let ix = isolatedStartX;
    let iy = AUTO_LAYOUT_PADDING;
    let column = 0;
    let rowHeight = 0;
    for (const id of isolated) {
      const node = byId.get(id);
      const w = node ? nodeWidth(node) : 0;
      const h = node ? nodeHeight(node) : 0;
      positions.set(id, { x: ix, y: iy });
      rowHeight = Math.max(rowHeight, h);
      column += 1;
      if (column >= AUTO_LAYOUT_ISOLATED_COLS) {
        column = 0;
        iy += rowHeight + AUTO_LAYOUT_GAP_Y;
        rowHeight = 0;
        ix = isolatedStartX;
      } else {
        ix += w + AUTO_LAYOUT_GAP_X;
      }
    }
  }
  return positions;
}