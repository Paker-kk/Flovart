export const PRODUCTION_SKILL_SNAPSHOT_PATHS = Object.freeze([
  'SKILL.md',
  'agents/openai.yaml',
  'evals/cases.json',
  'examples/production-spec.json',
  'flovart.skill.yaml',
  'references/creative-direction.md',
  'schemas/extension.schema.json',
]);

export function canonicalProductionSkillSnapshot(entries) {
  // 按码点顺序排序（非 localeCompare）：快照 hash 必须与运行环境 locale 无关，
  // 否则不同机器/区域设置的 contentHash 会漂移，导致 Skill 绑定校验失败。
  return JSON.stringify([...entries]
    .map(entry => ({ path: String(entry.path), content: String(entry.content) }))
    .sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0)));
}

export async function hashProductionSkillSnapshot(entries) {
  const bytes = new TextEncoder().encode(canonicalProductionSkillSnapshot(entries));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return `sha256:${Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')}`;
}
