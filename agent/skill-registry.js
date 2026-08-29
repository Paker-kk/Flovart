// Source-mode alias for the Node-side Skill registry.
// The canonical implementation lives in tools/flovart/skill-registry.js (the
// published package root). prepack rewrites the copy under managed-agent/ to
// `../skill-registry.js` for the packaged layout.
export * from '../tools/flovart/skill-registry.js';