import {
  normalizePhaseAAuthorizedReleaseShaV1,
  validatePhaseAAuditCredentialExpectationsV1,
  validatePhaseAStopConditionsV1,
} from './m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-production-readiness-validation.v1';

describe('normalizePhaseAAuthorizedReleaseShaV1', () => {
  it('requires non-empty 40-char hex SHA', () => {
    const missing = normalizePhaseAAuthorizedReleaseShaV1(undefined);
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.reasonCode).toBe('PHASE_A_AUTHORIZED_RELEASE_SHA_REQUIRED');

    const empty = normalizePhaseAAuthorizedReleaseShaV1('');
    expect(empty.ok).toBe(false);
    if (!empty.ok) expect(empty.reasonCode).toBe('PHASE_A_AUTHORIZED_RELEASE_SHA_REQUIRED');

    const short = normalizePhaseAAuthorizedReleaseShaV1('abc');
    expect(short.ok).toBe(false);
    if (!short.ok) expect(short.reasonCode).toBe('PHASE_A_AUTHORIZED_RELEASE_SHA_MALFORMED');
  });

  it('normalizes uppercase hex to lowercase', () => {
    const sha = 'A5B45A186774FD64E0AF2DDF57CFDCD0A350550E';
    const result = normalizePhaseAAuthorizedReleaseShaV1(sha);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.normalized).toBe(sha.toLowerCase());
    }
  });
});

describe('validatePhaseAAuditCredentialExpectationsV1', () => {
  it('requires all four boolean fields to be exactly true', () => {
    const result = validatePhaseAAuditCredentialExpectationsV1({
      dedicatedReadOnlyAuditLogin: true,
      distinctFromApplicationDatabaseUrl: true,
      distinctFromMigrationOwnerCredentials: true,
      distinctFromAttestationIssuerPool: false,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reasonCode).toBe('PHASE_A_GO_NO_GO_AUDIT_CREDENTIAL_EXPECTATIONS_INVALID');
    }
  });
});

describe('validatePhaseAStopConditionsV1', () => {
  it('rejects empty strings in stopConditions', () => {
    const result = validatePhaseAStopConditionsV1(['ok', '']);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasonCode).toBe('PHASE_A_GO_NO_GO_STOP_CONDITIONS_INVALID');
  });
});
