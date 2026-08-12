import {
  EVALUATIONS_PSEUDONYM_DEV_FALLBACK_SECRET,
  resolveEvaluationsPseudonymSecret,
  isEvaluationsPseudonymSecretAvailable,
} from './evaluations-privacy.config';

const STRONG = 'a'.repeat(48); // >= min length, not a placeholder

function env(overrides: Record<string, string | undefined>): NodeJS.ProcessEnv {
  return overrides as NodeJS.ProcessEnv;
}

describe('E5.2 evaluations pseudonym secret resolution (fail-closed in production)', () => {
  // A — production + secret absent → unavailable (fail closed).
  it('A: production + missing secret → not ok (MISSING), never the dev fallback', () => {
    const res = resolveEvaluationsPseudonymSecret(env({ NODE_ENV: 'production' }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('MISSING');
    expect(JSON.stringify(res)).not.toContain(EVALUATIONS_PSEUDONYM_DEV_FALLBACK_SECRET);
  });

  // B — production + secret empty → fail closed.
  it('B: production + empty secret → not ok (EMPTY)', () => {
    const res = resolveEvaluationsPseudonymSecret(
      env({ NODE_ENV: 'production', EVALUATIONS_PSEUDONYM_SECRET: '   ' }),
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('EMPTY');
  });

  // C — production + explicit dev fallback value → rejected.
  it('C: production + dev fallback value → rejected (DEV_FALLBACK_IN_PRODUCTION)', () => {
    const res = resolveEvaluationsPseudonymSecret(
      env({
        NODE_ENV: 'production',
        EVALUATIONS_PSEUDONYM_SECRET: EVALUATIONS_PSEUDONYM_DEV_FALLBACK_SECRET,
      }),
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('DEV_FALLBACK_IN_PRODUCTION');
  });

  it('C2: production + obviously insufficient secret → rejected (INSUFFICIENT)', () => {
    const res = resolveEvaluationsPseudonymSecret(
      env({ NODE_ENV: 'production', EVALUATIONS_PSEUDONYM_SECRET: 'short' }),
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('INSUFFICIENT');
  });

  it('C3: production + placeholder-looking secret → rejected', () => {
    for (const placeholder of ['changeme-changeme-changeme-changeme', 'replace-me-with-a-real-secret-value', 'your-secret-your-secret-your-secret']) {
      const res = resolveEvaluationsPseudonymSecret(
        env({ NODE_ENV: 'production', EVALUATIONS_PSEUDONYM_SECRET: placeholder }),
      );
      expect(res.ok).toBe(false);
    }
  });

  // D — production + valid configured secret → works.
  it('D: production + valid configured secret → ok (configured)', () => {
    const res = resolveEvaluationsPseudonymSecret(
      env({ NODE_ENV: 'production', EVALUATIONS_PSEUDONYM_SECRET: STRONG }),
    );
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.secret).toBe(STRONG);
      expect(res.source).toBe('configured');
    }
    expect(isEvaluationsPseudonymSecretAvailable(env({ NODE_ENV: 'production', EVALUATIONS_PSEUDONYM_SECRET: STRONG }))).toBe(true);
  });

  // E — test/development + secret absent → deterministic dev behavior allowed.
  it('E: development + missing secret → ok with explicit development fallback', () => {
    const res = resolveEvaluationsPseudonymSecret(env({ NODE_ENV: 'development' }));
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.source).toBe('development-fallback');
      expect(res.secret).toBe(EVALUATIONS_PSEUDONYM_DEV_FALLBACK_SECRET);
    }
  });

  it('E2: test env + configured secret → uses the configured secret', () => {
    const res = resolveEvaluationsPseudonymSecret(
      env({ NODE_ENV: 'test', EVALUATIONS_PSEUDONYM_SECRET: STRONG }),
    );
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.secret).toBe(STRONG);
  });

  // G — the secret value never appears in a failure result payload.
  it('G: unavailable resolutions never contain the secret value', () => {
    const res = resolveEvaluationsPseudonymSecret(
      env({ NODE_ENV: 'production', EVALUATIONS_PSEUDONYM_SECRET: 'super-secret-but-too-shortish' }),
    );
    expect(res.ok).toBe(false);
    expect(JSON.stringify(res)).not.toContain('super-secret-but-too-shortish');
  });
});
