/**
 * Deterministic Git name-status (-z) parsing for PR gate change discovery.
 */

const SUPPORTED_STATUSES = new Set(['A', 'M', 'D', 'R', 'C']);
const UNSUPPORTED_STATUSES = new Set(['T', 'U', 'X', 'B']);

/**
 * Parse standard `git diff --name-status -z -M` output where rename lines are:
 * R<score>\0<old>\0<new>
 * @param {Buffer|string} buffer
 * @returns {Array<{status: string, oldPath: string|null, newPath: string|null, similarity?: number|null}>}
 */
export function parseNameStatusZGit(buffer) {
  const raw = Buffer.isBuffer(buffer) ? buffer : Buffer.from(String(buffer ?? ''), 'utf8');
  const parts = raw.toString('utf8').split('\0').filter((part) => part.length > 0);
  const entries = [];
  let index = 0;

  while (index < parts.length) {
    const token = parts[index++];
    if (!token) continue;

    const status = token[0];
    const rest = token.slice(1);

    if (UNSUPPORTED_STATUSES.has(status)) {
      throw new Error(`UNSUPPORTED_GIT_STATUS: ${status}`);
    }

    if (!SUPPORTED_STATUSES.has(status)) {
      throw new Error(`Unknown git name-status token: ${token}`);
    }

    if (status === 'R' || status === 'C') {
      const oldPath = parts[index++];
      const newPath = parts[index++];
      if (!oldPath || !newPath) {
        throw new Error(`Malformed rename/copy entry for ${token}`);
      }
      entries.push({
        status,
        similarity: rest ? Number(rest) : null,
        oldPath,
        newPath,
      });
      continue;
    }

    const path = rest || parts[index++];
    if (!path) {
      throw new Error(`Malformed git name-status stream near status ${status}`);
    }
    entries.push({
      status,
      oldPath: status === 'A' ? null : path,
      newPath: status === 'D' ? null : path,
    });
  }

  return entries;
}

export function normalizeRepoPath(path) {
  return String(path ?? '').replace(/\\/g, '/');
}

export function toSrcRelativePath(repoPath) {
  const normalized = normalizeRepoPath(repoPath);
  const prefix = 'frontend/src/';
  if (!normalized.startsWith(prefix)) return null;
  return normalized.slice(prefix.length);
}

export function collectChangedPaths(entries) {
  const paths = new Set();
  for (const entry of entries) {
    if (entry.oldPath) paths.add(normalizeRepoPath(entry.oldPath));
    if (entry.newPath) paths.add(normalizeRepoPath(entry.newPath));
  }
  return [...paths].sort();
}
