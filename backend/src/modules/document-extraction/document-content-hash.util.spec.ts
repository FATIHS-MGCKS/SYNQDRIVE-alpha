import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { computeDocumentContentSha256 } from './document-content-hash.util';

describe('document-content-hash.util', () => {
  const bytesA = Buffer.from('%PDF-1.4 same-bytes-content');
  const bytesB = Buffer.from('%PDF-1.4 different-bytes');

  it('produces identical hashes for identical bytes with the same filename', async () => {
    const first = await computeDocumentContentSha256(bytesA);
    const second = await computeDocumentContentSha256(Buffer.from(bytesA));
    expect(first).toBe(second);
    expect(first).toHaveLength(64);
  });

  it('produces identical hashes for identical bytes with different filenames', async () => {
    const hashFromNameA = await computeDocumentContentSha256(bytesA);
    const hashFromNameB = await computeDocumentContentSha256(Buffer.from(bytesA));
    expect(hashFromNameA).toBe(hashFromNameB);
  });

  it('produces different hashes for different content with the same filename', async () => {
    const hashA = await computeDocumentContentSha256(bytesA);
    const hashB = await computeDocumentContentSha256(bytesB);
    expect(hashA).not.toBe(hashB);
  });

  it('handles parallel uploads of identical bytes consistently', async () => {
    const expected = createHash('sha256').update(bytesA).digest('hex');
    const results = await Promise.all(
      Array.from({ length: 8 }, () => computeDocumentContentSha256(Buffer.from(bytesA))),
    );
    expect(new Set(results)).toEqual(new Set([expected]));
  });

  it('hashes readable streams without loading extra copies', async () => {
    const stream = Readable.from([bytesA.subarray(0, 8), bytesA.subarray(8)]);
    await expect(computeDocumentContentSha256(stream)).resolves.toBe(
      createHash('sha256').update(bytesA).digest('hex'),
    );
  });
});
