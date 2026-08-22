import {
  CANONICAL_MESSAGE_PREVIEW_MAX_LENGTH,
  CANONICAL_MESSAGE_TEXT_MAX_LENGTH,
} from './communication-content.constants';

const URL_LIKE = /https?:\/\//i;
const JSON_LIKE = /^\s*[\[{]/;

/** Truncate by Unicode code point — never splits surrogate pairs. */
export function truncateToCodePoints(
  text: string,
  maxCodePoints: number,
): { text: string; truncated: boolean } {
  const codePoints = [...text];
  if (codePoints.length <= maxCodePoints) {
    return { text, truncated: false };
  }
  return {
    text: codePoints.slice(0, maxCodePoints).join(''),
    truncated: true,
  };
}

export function normalizeCanonicalText(
  raw: string | null | undefined,
): { text: string | null; truncated: boolean } {
  if (raw === null || raw === undefined) {
    return { text: null, truncated: false };
  }
  const normalized = raw.replace(/\r\n/g, '\n');
  return truncateToCodePoints(normalized, CANONICAL_MESSAGE_TEXT_MAX_LENGTH);
}

export function truncatePreviewText(text: string): string {
  const collapsed = text.replace(/\s+/g, ' ').trim();
  const { text: bounded } = truncateToCodePoints(collapsed, CANONICAL_MESSAGE_PREVIEW_MAX_LENGTH);
  if (collapsed.length <= CANONICAL_MESSAGE_PREVIEW_MAX_LENGTH) {
    return bounded;
  }
  const { text: prefix } = truncateToCodePoints(collapsed, CANONICAL_MESSAGE_PREVIEW_MAX_LENGTH - 1);
  return `${prefix}…`;
}

/**
 * Returns user-visible caption text only. Rejects URLs, JSON blobs, and empty media payloads.
 */
export function extractSafeUserVisibleText(
  messageType: string,
  raw: string | null | undefined,
): string | null {
  if (raw === null || raw === undefined) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const normalizedType = messageType.trim().toLowerCase();
  const isTextLike = normalizedType === 'text' || normalizedType === 'template';

  if (URL_LIKE.test(trimmed)) return null;
  if (JSON_LIKE.test(trimmed)) return null;

  if (!isTextLike) {
    if (trimmed.length > 1024) return null;
  }

  return trimmed;
}
