import { fingerprintLinkMetadata } from '../stable-metadata-fingerprint';

describe('stable metadata fingerprint', () => {
  it('is insensitive to object key order', () => {
    const a = { z: 1, a: { y: 2, b: 3 } };
    const b = { a: { b: 3, y: 2 }, z: 1 };
    expect(fingerprintLinkMetadata(a)).toBe(fingerprintLinkMetadata(b));
  });
});
