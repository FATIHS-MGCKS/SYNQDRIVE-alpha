import { fingerprintMirrorSnapshot } from './pdi-identity-drift-shadow.serial';

describe('fingerprintMirrorSnapshot', () => {
  it('ignores mirrorSyncedAt — same identity payload yields same fingerprint', () => {
    const a = fingerprintMirrorSnapshot({
      dimoTokenId: 1001,
      observedSerial: 'R1-TEST-SAME-ID',
      mirrorRawJsonSha256: 'raw-hash-1',
    });
    const b = fingerprintMirrorSnapshot({
      dimoTokenId: 1001,
      observedSerial: 'R1-TEST-SAME-ID',
      mirrorRawJsonSha256: 'raw-hash-1',
    });
    expect(a).toBe(b);
  });

  it('changes when provider identity payload changes', () => {
    const a = fingerprintMirrorSnapshot({
      dimoTokenId: 1001,
      observedSerial: 'R1-TEST-SAME-ID',
      mirrorRawJsonSha256: 'raw-hash-1',
    });
    const b = fingerprintMirrorSnapshot({
      dimoTokenId: 1001,
      observedSerial: 'R1-TEST-OTHER-ID',
      mirrorRawJsonSha256: 'raw-hash-2',
    });
    expect(a).not.toBe(b);
  });
});
