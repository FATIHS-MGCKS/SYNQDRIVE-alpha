import {
  combinedCursor,
  decodeProviderCandidateListCursor,
  encodeProviderCandidateListCursor,
  HM_CANDIDATE_PHASE_START_MIRROR_ID,
  PROVIDER_CANDIDATE_CURSOR_VERSION,
} from '../policy/provider-candidate-list.cursor';

describe('provider-candidate-list.cursor', () => {
  const mirrorId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

  it('round-trips combined cursor', () => {
    const encoded = combinedCursor('DIMO', mirrorId);
    const decoded = decodeProviderCandidateListCursor(encoded);
    expect(decoded).toEqual({
      version: PROVIDER_CANDIDATE_CURSOR_VERSION,
      mode: 'COMBINED',
      phase: 'DIMO',
      sourceMirrorId: mirrorId,
    });
  });

  it('rejects malformed encoding', () => {
    expect(() => decodeProviderCandidateListCursor('not-base64url!!!')).toThrow();
  });

  it('rejects unsupported version', () => {
    const bad = Buffer.from(
      JSON.stringify({ v: 2, m: 'COMBINED', p: 'DIMO', i: mirrorId }),
      'utf8',
    ).toString('base64url');
    expect(() => decodeProviderCandidateListCursor(bad)).toThrow();
  });

  it('rejects mode inconsistent with provider filter', () => {
    const encoded = combinedCursor('DIMO', mirrorId);
    expect(() => decodeProviderCandidateListCursor(encoded, 'DIMO')).toThrow();
    expect(() => decodeProviderCandidateListCursor(encoded, 'HIGH_MOBILITY')).toThrow();
  });

  it('rejects structurally incomplete wire object', () => {
    const partial = Buffer.from(JSON.stringify({ v: 1, m: 'COMBINED' }), 'utf8').toString('base64url');
    expect(() => decodeProviderCandidateListCursor(partial)).toThrow();
  });

  it('rejects malformed provider phase', () => {
    const wire = Buffer.from(
      JSON.stringify({ v: 1, m: 'COMBINED', p: 'BROKEN', i: mirrorId }),
      'utf8',
    ).toString('base64url');
    expect(() => decodeProviderCandidateListCursor(wire)).toThrow();
  });

  it('rejects malformed mirror UUID', () => {
    const wire = Buffer.from(
      JSON.stringify({ v: 1, m: 'COMBINED', p: 'DIMO', i: 'not-a-uuid' }),
      'utf8',
    ).toString('base64url');
    expect(() => decodeProviderCandidateListCursor(wire)).toThrow();
  });

  it('accepts HM phase start sentinel', () => {
    const encoded = combinedCursor('HIGH_MOBILITY', HM_CANDIDATE_PHASE_START_MIRROR_ID);
    const decoded = decodeProviderCandidateListCursor(encoded);
    expect(decoded.phase).toBe('HIGH_MOBILITY');
  });
});
