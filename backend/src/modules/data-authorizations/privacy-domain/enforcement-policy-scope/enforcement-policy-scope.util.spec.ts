import { fingerprintResourceReference } from './enforcement-policy-scope.util';

describe('enforcement-policy-scope.util', () => {
  it('fingerprints references without exposing raw values in output shape', () => {
    const fingerprint = fingerprintResourceReference('550e8400-e29b-41d4-a716-446655440000');
    expect(fingerprint).toHaveLength(16);
    expect(fingerprint).not.toContain('550e8400');
  });
});
