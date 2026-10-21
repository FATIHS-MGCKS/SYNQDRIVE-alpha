const REDACTED = '[REDACTED]';

const SECRET_KEYS = new Set([
  'opsToken',
  'ops_token',
  'token',
  'hmac',
  'secret',
  'password',
  'authorization',
]);

export function redactOperatorSecrets<T extends Record<string, unknown>>(value: T): T {
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value)) {
    if (SECRET_KEYS.has(key)) {
      out[key] = REDACTED;
      continue;
    }
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      out[key] = redactOperatorSecrets(val as Record<string, unknown>);
      continue;
    }
    out[key] = val;
  }
  return out as T;
}

export function buildSanitizedPrepareDryRun(input: {
  organizationId: string;
  cohortOrganizationIds: string[];
  cohortConfigFingerprintSha256: string;
  cohortConfigVersion: string;
  b2PolicyVersion: string;
  b4PolicyVersion: string;
  operatorActor: string;
  operatorReason: string;
  operationRequestId: string;
  approvedReleaseSha: string | null;
}): Record<string, unknown> {
  return {
    organizationId: input.organizationId,
    cohortOrganizationIds: input.cohortOrganizationIds,
    cohortConfigFingerprintSha256: input.cohortConfigFingerprintSha256,
    cohortConfigVersion: input.cohortConfigVersion,
    b2PolicyVersion: input.b2PolicyVersion,
    b4PolicyVersion: input.b4PolicyVersion,
    operatorActor: input.operatorActor,
    operatorReason: input.operatorReason,
    operationRequestId: input.operationRequestId,
    approvedReleaseSha: input.approvedReleaseSha,
  };
}

export function buildSanitizedActivateDryRun(input: {
  epochId: string;
  activationRequestKey: string;
  cohortOrganizationIds: string[];
  cohortConfigFingerprintSha256: string;
  b2PolicyVersion: string;
  b4PolicyVersion: string;
  operatorActor: string;
  operatorReason: string;
  operationRequestId: string;
  approvedReleaseSha: string | null;
}): Record<string, unknown> {
  return {
    epochId: input.epochId,
    activationRequestKey: input.activationRequestKey,
    cohortOrganizationIds: input.cohortOrganizationIds,
    cohortConfigFingerprintSha256: input.cohortConfigFingerprintSha256,
    b2PolicyVersion: input.b2PolicyVersion,
    b4PolicyVersion: input.b4PolicyVersion,
    operatorActor: input.operatorActor,
    operatorReason: input.operatorReason,
    operationRequestId: input.operationRequestId,
    approvedReleaseSha: input.approvedReleaseSha,
  };
}

export function assertOutputContainsNoCredentialLeak(
  serialized: string,
  credential: string,
): void {
  if (!credential) return;
  if (serialized.includes(credential)) {
    throw new Error('operator output leaked credential material');
  }
}
