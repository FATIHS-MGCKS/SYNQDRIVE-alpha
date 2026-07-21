import { createHash } from 'crypto';

/** Default BullMQ custom job id length cap (Redis key safety; matches Battery V2 prior limit). */
export const BULLMQ_JOB_ID_DEFAULT_MAX_LENGTH = 128;

const HASH_HEX_LENGTH = 40;
const SAFE_CHAR_PATTERN = /^[A-Za-z0-9_-]$/;
const JOB_ID_OUTPUT_PATTERN = /^[A-Za-z0-9_-]+$/;

export interface SanitizeBullMqJobIdInput {
  /** Optional namespace prefix (queue/domain), e.g. `battery-v2`. */
  namespace?: string;
  /** Logical idempotency / business key. Never log raw — use `formatBullMqJobIdLogContext`. */
  key: string;
  /** Output length cap (default {@link BULLMQ_JOB_ID_DEFAULT_MAX_LENGTH}). */
  maxLength?: number;
}

export interface BullMqJobIdLogContext {
  namespace?: string;
  key: string;
  jobId: string;
}

/**
 * Deterministic BullMQ-compatible custom job id.
 *
 * - Encodes unsafe characters injectively (`:` → `_3a`, `_` → `__`, …).
 * - Falls back to SHA-256 when the encoded form exceeds `maxLength`.
 * - Never emits colons or whitespace.
 */
export function sanitizeBullMqJobId(input: SanitizeBullMqJobIdInput): string {
  const key = input.key;
  if (typeof key !== 'string' || key.length === 0) {
    throw new Error('sanitizeBullMqJobId: key must be a non-empty string');
  }

  const maxLength = input.maxLength ?? BULLMQ_JOB_ID_DEFAULT_MAX_LENGTH;
  if (maxLength < HASH_HEX_LENGTH + 2) {
    throw new Error(
      `sanitizeBullMqJobId: maxLength must be at least ${HASH_HEX_LENGTH + 2}`,
    );
  }

  const namespace = normalizeNamespace(input.namespace);
  const encodedKey = encodeBullMqJobIdSegment(key);
  const direct = namespace ? `${namespace}_${encodedKey}` : encodedKey;

  const candidate =
    direct.length <= maxLength ? direct : hashBullMqJobId(namespace, key, maxLength);

  return ensureNonIntegerBullMqJobId(candidate);
}

/** Returns true when `jobId` satisfies BullMQ custom-id constraints used by SynqDrive. */
export function isBullMqCompatibleJobId(jobId: string): boolean {
  if (!jobId || jobId.length === 0) {
    return false;
  }
  if (isIntegerJobId(jobId)) {
    return false;
  }
  if (/\s/.test(jobId) || jobId.includes(':')) {
    return false;
  }
  return JOB_ID_OUTPUT_PATTERN.test(jobId);
}

/** Short stable fingerprint for logs — never includes the raw business key. */
export function fingerprintBullMqJobIdKey(key: string): string {
  return createHash('sha256').update(key, 'utf8').digest('hex').slice(0, 12);
}

/** Safe structured log fragment — omits raw `key`. */
export function formatBullMqJobIdLogContext(context: BullMqJobIdLogContext): string {
  const ns = context.namespace ? normalizeNamespace(context.namespace) : 'default';
  return `jobId=${context.jobId} keyFp=${fingerprintBullMqJobIdKey(context.key)} ns=${ns}`;
}

function normalizeNamespace(namespace: string | undefined): string | undefined {
  if (namespace === undefined || namespace === '') {
    return undefined;
  }
  const cleaned = namespace
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned.length > 0 ? cleaned : 'job';
}

function encodeBullMqJobIdSegment(value: string): string {
  let encoded = '';
  for (const char of value) {
    if (char === '_') {
      encoded += '__';
      continue;
    }
    if (SAFE_CHAR_PATTERN.test(char)) {
      encoded += char;
      continue;
    }
    const codePoint = char.codePointAt(0);
    if (codePoint === undefined) {
      continue;
    }
    if (codePoint <= 0xff) {
      encoded += `_${codePoint.toString(16).padStart(2, '0')}`;
    } else {
      encoded += `_u${codePoint.toString(16).padStart(4, '0')}`;
    }
  }
  return encoded;
}

function buildCanonicalKey(namespace: string | undefined, key: string): string {
  return namespace ? `${namespace}\x1f${key}` : key;
}

function hashBullMqJobId(
  namespace: string | undefined,
  key: string,
  maxLength: number,
): string {
  const digest = createHash('sha256')
    .update(buildCanonicalKey(namespace, key), 'utf8')
    .digest('hex')
    .slice(0, HASH_HEX_LENGTH);
  const prefix = namespace ? `${namespace}_` : 'j_';
  const hashed = `${prefix}${digest}`;
  return hashed.length <= maxLength ? hashed : hashed.slice(0, maxLength);
}

function isIntegerJobId(jobId: string): boolean {
  return `${parseInt(jobId, 10)}` === jobId;
}

function ensureNonIntegerBullMqJobId(jobId: string): string {
  if (isIntegerJobId(jobId)) {
    return `j_${jobId}`;
  }
  return jobId;
}
