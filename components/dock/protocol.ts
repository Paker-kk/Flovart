/**
 * DeepSeek Dock 插件面嵌入协议
 *
 * 目标：Flovart 以可嵌入插件形态运行在 DeepSeek Harness 主壳中。Harness 通过
 * iframe/microfrontend 挂载 Flovart Dock 页面，两端只交换版本化类型化消息，
 * 不共享可变 store，不传长期 Token 或 Provider Secret。
 *
 * 传输：window.postMessage，targetOrigin 由宿主通过 bootstrap 注入或同源降级。
 *
 * 方向：
 *   Harness -> Flovart（适配请求）
 *     { channel: 'flovart-dock', version: 1, type: 'handshake', data: { agentUrl, token, projectId?, theme?, locale? } }
 *     { channel: 'flovart-dock', version: 1, type: 'focus-surface', data: { surface: 'workflow' | 'table' | 'production', nodeId? } }
 *     { channel: 'flovart-dock', version: 1, type: 'theme', data: { mode: 'light' | 'dark' } }
 *     { channel: 'flovart-dock', version: 1, type: 'session.bound', data: { bindingId, hostKind, sessionId, projectId } }
 *     { channel: 'flovart-dock', version: 1, type: 'session.unbound', data: null }
 *   Flovart -> Harness（状态发布）
 *     { channel: 'flovart-dock', version: 1, type: 'ready', data: { protocolVersion, registryHash } }
 *     { channel: 'flovart-dock', version: 1, type: 'badges', data: { waiting, error, artifacts } }
 *     { channel: 'flovart-dock', version: 1, type: 'intent.status', data: { intentId, status, changeSetId? } }
 *     { channel: 'flovart-dock', version: 1, type: 'receipt.completed', data: { intentId, status, changeSetId? } }
 *     { channel: 'flovart-dock', version: 1, type: 'open-surface', data: { surface, nodeId? } }
 *     { channel: 'flovart-dock', version: 1, type: 'open-window', data: { route } }
 *
 * 兼容性：版本不匹配时 Flovart 保留只读模式并输出可复制的 CLI 命令，不静默降级。
 */

export const DOCK_CHANNEL = 'flovart-dock';
export const DOCK_PROTOCOL_VERSION = 1;

export type DockSurface = 'workflow' | 'table' | 'production';

export interface DockHandshake {
  agentUrl?: string;
  token?: string;
  projectId?: string;
  theme?: 'light' | 'dark';
  locale?: string;
}

export interface DockBadges {
  waiting: number;
  error: number;
  artifacts: number;
}

export interface DockMessage<P = unknown> {
  channel: typeof DOCK_CHANNEL;
  version: number;
  type: string;
  data: P;
}

export type DockIncoming =
  | DockMessage<DockHandshake & { type?: 'handshake' }> & { type: 'handshake' }
  | DockMessage<{ surface: DockSurface; nodeId?: string }> & { type: 'focus-surface' }
  | DockMessage<{ mode: 'light' | 'dark' }> & { type: 'theme' }
  | DockMessage<{ bindingId: string; hostKind: string; sessionId: string; projectId: string }> & { type: 'session.bound' }
  | DockMessage<null> & { type: 'session.unbound' };

export function isDockMessage(event: MessageEvent): event is MessageEvent & { data: DockIncoming } {
  const data = event.data as Partial<DockMessage> | undefined;
  return Boolean(
    data
    && typeof data === 'object'
    && data.channel === DOCK_CHANNEL
    && data.version === DOCK_PROTOCOL_VERSION
    && typeof data.type === 'string',
  );
}

export function sendDockMessage(target: Window | null, message: DockMessage, targetOrigin = '*') {
  if (!target) return;
  target.postMessage(message, targetOrigin);
}