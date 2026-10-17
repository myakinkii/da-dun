// claude.js: access to claude.ai artifact capabilities.
// Outside a claude.ai artifact (a local file, the dev server) every
// capability resolves to null and the app falls back to plain browser features.

const hasClaude = typeof window !== "undefined" && typeof window.claude === "object" &&
  window.claude !== null && typeof window.claude.use === "function";
const cache = new Map();

/** Resolve a capability namespace (db, user, sample, downloads, ...) or null. */
export function capability(name) {
  if (!cache.has(name)) cache.set(name, hasClaude ? window.claude.use(name).catch(() => null) : Promise.resolve(null));
  return cache.get(name);
}
