// Skill Hub client — the local side of the external SKILL HUB protocol.
// The HUB website (external, built separately) exposes:
//   GET {hubUrl}/api/skills.json                 -> { ok: true, skills: HubSkillSummary[] }
//   GET {hubUrl}/api/skills/{id}/package.json    -> { id, version, files: [{ path, content }] }
//   {hubUrl}/skills/{id}                         -> human-readable detail page (导流目标)
// The client only reads; installing/writing goes through the local Agent service
// (browser cannot write the filesystem).

export interface HubSkillSummary {
  id: string;
  name: string;
  version: string;
  description: string;
  author?: string;
  homepageUrl?: string;
  tags?: string[];
  updatedAt?: string;
}

export interface HubSkillPackageFile {
  path: string;
  content: string;
}

export interface HubSkillPackage {
  id: string;
  version: string;
  files: HubSkillPackageFile[];
}

export type SkillHubErrorCode =
  | 'INVALID_URL'
  | 'UNREACHABLE'
  | 'BAD_MANIFEST'
  | 'PACKAGE_REJECTED';

export class SkillHubError extends Error {
  readonly code: SkillHubErrorCode;
  constructor(code: SkillHubErrorCode, message: string) {
    super(message);
    this.name = 'SkillHubError';
    this.code = code;
  }
}

const MAX_PACKAGE_BYTES = 6 * 1024 * 1024;

/** Normalize and validate a hub base URL. Empty/whitespace is allowed (未配置). */
export function normalizeHubUrl(input: string): string {
  const text = String(input || '').trim().replace(/\/+$/, '');
  if (!text) return '';
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw new SkillHubError('INVALID_URL', 'Skill Hub 地址无效，请输入完整 URL（如 https://skills.example.com）。');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new SkillHubError('INVALID_URL', 'Skill Hub 只支持 http(s) 地址。');
  }
  return url.origin + url.pathname.replace(/\/+$/, '');
}

/** External redirect target for one skill (导流地址). */
export function hubSkillExternalUrl(hubUrl: string, id: string): string {
  return `${hubUrl}/skills/${encodeURIComponent(id)}`;
}

function parseSkillList(payload: unknown): HubSkillSummary[] {
  const list = payload && typeof payload === 'object'
    ? Array.isArray(payload) ? payload : (payload as { skills?: unknown }).skills
    : undefined;
  if (!Array.isArray(list)) throw new SkillHubError('BAD_MANIFEST', 'Skill Hub 返回的清单格式无效。');
  const skills: HubSkillSummary[] = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    const id = typeof record.id === 'string' ? record.id : '';
    const name = typeof record.name === 'string' ? record.name : id;
    const version = typeof record.version === 'string' ? record.version : '';
    if (!id || !version) continue;
    skills.push({
      id,
      name,
      version,
      description: typeof record.description === 'string' ? record.description : '',
      author: typeof record.author === 'string' ? record.author : undefined,
      homepageUrl: typeof record.homepageUrl === 'string' ? record.homepageUrl : undefined,
      tags: Array.isArray(record.tags) ? record.tags.map(String) : undefined,
      updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : undefined,
    });
  }
  return skills;
}

/** Fetch the hub skill list. `fetcher` is injectable for tests. */
export async function fetchHubSkills(
  hubUrl: string,
  fetcher: typeof fetch = fetch,
): Promise<HubSkillSummary[]> {
  const url = new URL('/api/skills.json', hubUrl);
  let response: Response;
  try {
    response = await fetcher(url.toString());
  } catch {
    throw new SkillHubError('UNREACHABLE', `无法连接 Skill Hub：${url.origin}`);
  }
  if (!response.ok) {
    throw new SkillHubError('UNREACHABLE', `Skill Hub 返回错误（HTTP ${response.status}）。`);
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new SkillHubError('BAD_MANIFEST', 'Skill Hub 清单不是合法 JSON。');
  }
  return parseSkillList(payload);
}

function parseSkillPackage(payload: unknown): HubSkillPackage {
  if (!payload || typeof payload !== 'object') throw new SkillHubError('PACKAGE_REJECTED', 'Skill Hub 返回的包格式无效。');
  const record = payload as Record<string, unknown>;
  const id = typeof record.id === 'string' ? record.id : '';
  const version = typeof record.version === 'string' ? record.version : '';
  const files = Array.isArray(record.files) ? record.files : [];
  if (!id || !version) throw new SkillHubError('PACKAGE_REJECTED', 'Skill 包缺少 id/version。');
  const entries: HubSkillPackageFile[] = [];
  let total = 0;
  for (const item of files) {
    if (!item || typeof item !== 'object') continue;
    const file = item as Record<string, unknown>;
    const path = typeof file.path === 'string' ? file.path : '';
    const content = typeof file.content === 'string' ? file.content : '';
    if (!path || !content) continue;
    total += content.length;
    if (total > MAX_PACKAGE_BYTES) throw new SkillHubError('PACKAGE_REJECTED', 'Skill 包超过大小限制。');
    entries.push({ path, content });
  }
  if (!entries.some(entry => entry.path === 'SKILL.md')) {
    throw new SkillHubError('PACKAGE_REJECTED', 'Skill 包缺少 SKILL.md。');
  }
  return { id, version, files: entries };
}

/** Fetch one skill's package (for install through the local Agent service). */
export async function fetchHubSkillPackage(
  hubUrl: string,
  id: string,
  fetcher: typeof fetch = fetch,
): Promise<HubSkillPackage> {
  const url = new URL(`/api/skills/${encodeURIComponent(id)}/package.json`, hubUrl);
  let response: Response;
  try {
    response = await fetcher(url.toString());
  } catch {
    throw new SkillHubError('UNREACHABLE', `无法从 Skill Hub 下载 ${id}。`);
  }
  if (!response.ok) {
    throw new SkillHubError('UNREACHABLE', `Skill Hub 下载 ${id} 失败（HTTP ${response.status}）。`);
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new SkillHubError('PACKAGE_REJECTED', 'Skill 包不是合法 JSON。');
  }
  const parsed = parseSkillPackage(payload);
  if (parsed.id !== id) throw new SkillHubError('PACKAGE_REJECTED', 'Skill 包 id 与请求不一致。');
  return parsed;
}
