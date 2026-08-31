/**
 * Deterministic Git name-status (-z) parsing for PR gate change discovery.
 */

const KNOWN_STATUSES = new Set(['A', 'M', 'D', 'R', 'C', 'T', 'U', 'X', 'B']);

/**
 * Parse NUL-delimited `git diff --name-status -z` output.
 * @param {Buffer|string} buffer
 * @returns {Array<{status: string, oldPath: string|null, newPath: string|null}>}
 */
export function parseNameStatusZ(buffer) {
  const raw = Buffer.isBuffer(buffer) ? buffer : Buffer.from(String(buffer ?? ''), 'utf8');
  const parts = raw.toString('utf8').split('\0').filter((part) => part.length > 0);
  const entries = [];
  let index = 0;

  while (index < parts.length) {
    const token = parts[index];
    index += 1;
    if (!token) continue;

    const status = token.length > 1 && KNOWN_STATUSES.has(token[0]) ? token[0] : token;
  const remainder = token.length > 1 && KNOWN_STATUSES.has(token[0]) ? token.slice(1) : '';

    if (status === 'R' || status === 'C') {
      const similarity = remainder || parts[index] || '';
      if (remainder) {
        // token like R100path — rare combined form; treat remainder as similarity only when numeric
      }
      const oldPath = remainder && !/^\d+$/.test(remainder) ? remainder : parts[index++];
      const similarityScore = /^\d+$/.test(String(oldPath)) ? oldPath : parts[index++];
      const newPath = /^\d+$/.test(String(oldPath)) ? parts[index++] : parts[index++];
      if (!oldPath || !newPath) {
        throw new Error(`Malformed rename/copy entry near index ${index}`);
      }
      entries.push({
        status,
        similarity: Number(/^\d+$/.test(String(similarityScore)) ? similarityScore : similarity) || null,
        oldPath: String(/^\d+$/.test(String(oldPath)) ? newPath : oldPath),
        newPath: String(/^\d+$/.test(String(oldPath)) ? parts[index - 1] : newPath),
      });
      continue;
    }

    if (!KNOWN_STATUSES.has(status)) {
      throw new Error(`Unknown git name-status token: ${token}`);
    }

    const path = remainder || parts[index++];
    if (!path) {
      throw new Error(`Missing path for status ${status}`);
    }
    entries.push({
      status,
      oldPath: status === 'A' ? null : path,
      newPath: status === 'D' ? null : path,
    });
  }

  return entries;
}

/**
 * Parse standard `git diff --name-status -z -M` output where rename lines are:
 * R<score>\0<old>\0<new>
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

    if (!KNOWN_STATUSES.has(status)) {
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
      throw new Error(`Missing path for status ${status}`);
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
