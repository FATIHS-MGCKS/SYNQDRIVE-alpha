import {
  assertNoRawSecretsInPhaseATextV1,
  formatPhaseAPreflightPublicErrorV1,
  sanitizePhaseAPreflightErrorV1,
} from './m3-3-hv-h4-a3-3-o2-r4-1-phase-a-preflight.errors.v1';

describe('m3-3-hv-h4-a3-o2-r4-1 phase-a error sanitization', () => {
  it('never returns raw database URLs from injected exception messages', () => {
    const injected = new Error(
      'connect failed postgresql://supersecret:NotARealPassword@db.app.synqdrive.eu:5432/prod',
    );
    const sanitized = sanitizePhaseAPreflightErrorV1(injected);
    const formatted = formatPhaseAPreflightPublicErrorV1(sanitized);
    expect(formatted).not.toContain('supersecret');
    expect(formatted).not.toContain('NotARealPassword');
    expect(formatted).not.toContain('postgresql://');
    expect(formatted).toMatch(/^PHASE_A_/);
  });

  it('maps transaction aborted messages to stable code', () => {
    const sanitized = sanitizePhaseAPreflightErrorV1(
      new Error('current transaction is aborted, commands ignored until end of transaction block'),
    );
    expect(sanitized.reasonCode).toBe('PHASE_A_TRANSACTION_ABORTED');
  });

  it('detects credential fragments in outward text guard', () => {
    expect(() => assertNoRawSecretsInPhaseATextV1('password=hunter2')).toThrow(
      'PHASE_A_TEXT_CONTAINS_CREDENTIAL_FRAGMENT',
    );
  });
});
