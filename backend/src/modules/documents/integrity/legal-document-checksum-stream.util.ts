import { Transform } from 'stream';
import { createHash } from 'crypto';

/**
 * Wraps a readable stream and computes SHA-256 incrementally without buffering
 * the full object in memory.
 */
export function createChecksumVerifyingTransform(expectedChecksum: string | null): {
  stream: Transform;
  getDigest: () => string | null;
  verify: () => boolean;
} {
  const hash = createHash('sha256');
  let digest: string | null = null;
  const transform = new Transform({
    transform(chunk, _encoding, callback) {
      hash.update(chunk);
      callback(null, chunk);
    },
    flush(callback) {
      digest = hash.digest('hex');
      callback();
    },
  });

  return {
    stream: transform,
    getDigest: () => digest,
    verify: () => {
      if (!expectedChecksum?.trim() || !digest) return false;
      return digest === expectedChecksum.toLowerCase();
    },
  };
}

export async function sha256HexFromReadable(
  stream: NodeJS.ReadableStream,
): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of stream) {
    hash.update(chunk as Buffer);
  }
  return hash.digest('hex');
}
