const FULL_COMMIT_SHA_PATTERN = /^[0-9a-f]{40}$/;

export function normalizePhaseAAuthorizedReleaseShaV1(
  raw: string | undefined,
): { ok: true; normalized: string } | { ok: false; reasonCode: string } {
  const trimmed = raw?.trim();
  if (!trimmed) {
    return { ok: false, reasonCode: 'PHASE_A_AUTHORIZED_RELEASE_SHA_REQUIRED' };
  }
  const normalized = trimmed.toLowerCase();
  if (!FULL_COMMIT_SHA_PATTERN.test(normalized)) {
    return { ok: false, reasonCode: 'PHASE_A_AUTHORIZED_RELEASE_SHA_MALFORMED' };
  }
  return { ok: true, normalized };
}

export function parseUtcIsoTimestampV1(
  raw: string | undefined,
): { ok: true; epochMs: number } | { ok: false; reasonCode: string } {
  const trimmed = raw?.trim();
  if (!trimmed) {
    return { ok: false, reasonCode: 'PHASE_A_GO_NO_GO_TIMESTAMP_REQUIRED' };
  }
  const epochMs = Date.parse(trimmed);
  if (Number.isNaN(epochMs)) {
    return { ok: false, reasonCode: 'PHASE_A_GO_NO_GO_TIMESTAMP_INVALID' };
  }
  return { ok: true, epochMs };
}

/** Reject verifier attestation unreasonably in the future (clock skew allowance). */
export const M3_3_HV_H4_A3_PHASE_A_VERIFIER_TIMESTAMP_FUTURE_SKEW_MS = 5 * 60 * 1000;

export function validatePhaseAIndependentVerifierTimestampV1(
  verifiedAtUtc: string,
  now: Date,
  approvalValidFrom: string,
): { ok: true } | { ok: false; reasonCode: string } {
  const parsed = parseUtcIsoTimestampV1(verifiedAtUtc);
  if (!parsed.ok) return parsed;

  const approvalFrom = parseUtcIsoTimestampV1(approvalValidFrom);
  if (!approvalFrom.ok) {
    return { ok: false, reasonCode: 'PHASE_A_GO_NO_GO_APPROVAL_BINDING_TIMESTAMP_INVALID' };
  }

  const nowMs = now.getTime();
  if (parsed.epochMs > nowMs + M3_3_HV_H4_A3_PHASE_A_VERIFIER_TIMESTAMP_FUTURE_SKEW_MS) {
    return { ok: false, reasonCode: 'PHASE_A_GO_NO_GO_VERIFIER_TIMESTAMP_FUTURE' };
  }
  if (parsed.epochMs < approvalFrom.epochMs - M3_3_HV_H4_A3_PHASE_A_VERIFIER_TIMESTAMP_FUTURE_SKEW_MS) {
    return { ok: false, reasonCode: 'PHASE_A_GO_NO_GO_VERIFIER_TIMESTAMP_BEFORE_APPROVAL' };
  }
  return { ok: true };
}

export function validatePhaseAAuditCredentialExpectationsV1(
  expectations: unknown,
): { ok: true } | { ok: false; reasonCode: string } {
  if (typeof expectations !== 'object' || expectations === null || Array.isArray(expectations)) {
    return { ok: false, reasonCode: 'PHASE_A_GO_NO_GO_AUDIT_CREDENTIAL_EXPECTATIONS_INVALID' };
  }
  const e = expectations as Record<string, unknown>;
  const fields = [
    'dedicatedReadOnlyAuditLogin',
    'distinctFromApplicationDatabaseUrl',
    'distinctFromMigrationOwnerCredentials',
    'distinctFromAttestationIssuerPool',
  ] as const;
  for (const field of fields) {
    if (e[field] !== true) {
      return { ok: false, reasonCode: 'PHASE_A_GO_NO_GO_AUDIT_CREDENTIAL_EXPECTATIONS_INVALID' };
    }
  }
  return { ok: true };
}

export function validatePhaseAStopConditionsV1(
  stopConditions: unknown,
): { ok: true; conditions: string[] } | { ok: false; reasonCode: string } {
  if (!Array.isArray(stopConditions) || stopConditions.length === 0) {
    return { ok: false, reasonCode: 'PHASE_A_GO_NO_GO_STOP_CONDITIONS_REQUIRED' };
  }
  for (const item of stopConditions) {
    if (typeof item !== 'string' || !item.trim()) {
      return { ok: false, reasonCode: 'PHASE_A_GO_NO_GO_STOP_CONDITIONS_INVALID' };
    }
  }
  return { ok: true, conditions: stopConditions.map((s) => s.trim()) };
}
