import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';

export const DOCUMENT_CONTENT_HASH_ALGORITHM = 'sha256' as const;

export type DocumentContentHashAlgorithm = typeof DOCUMENT_CONTENT_HASH_ALGORITHM;

/**
 * Computes a stable SHA-256 hex digest from a buffer or readable stream.
 * Never logs or persists raw file bytes — callers store only the digest.
 */
export async function computeDocumentContentSha256(
  source: Buffer | Readable,
): Promise<string> {
  const hash = createHash(DOCUMENT_CONTENT_HASH_ALGORITHM);
  const stream = Buffer.isBuffer(source) ? Readable.from(source) : source;

  for await (const chunk of stream) {
    hash.update(chunk);
  }

  return hash.digest('hex');
}

export function isValidDocumentContentSha256(value: string | null | undefined): boolean {
  return typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value);
}
