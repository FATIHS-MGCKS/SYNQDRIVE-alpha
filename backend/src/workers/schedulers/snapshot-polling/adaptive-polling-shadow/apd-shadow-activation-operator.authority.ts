import { createHmac, timingSafeEqual } from 'node:crypto';

const OPS_TOKEN_ENV = 'APD_SHADOW_EPOCH_OPS_TOKEN';
const DEPLOYED_SHA_ENV = 'SYNQDRIVE_DEPLOYED_GIT_SHA';

export interface ApdShadowEpochOpsContext {
  operatorActor: string;
  operationRequestId: string;
  operationReason: string;
  opsToken: string;
  expectedDeployedSha?: string;
}

export interface ApdShadowEpochOpsAuditRecord {
  operation: string;
  operatorActor: string;
  operationRequestId: string;
  operationReason: string;
  expectedDeployedSha: string | null;
  observedDeployedSha: string | null;
  success: boolean;
  error: string | null;
  timestampUtc: string;
  dryRun: boolean;
  epochId?: string;
  organizationId?: string;
  cohortFingerprintSha256?: string;
}

let testBypassEnabled = false;
let testBypassContext: ApdShadowEpochOpsContext | null = null;

export function enableApdShadowEpochOpsAuthorityForTests(
  context?: ApdShadowEpochOpsContext,
): void {
  testBypassEnabled = true;
  testBypassContext = context ?? {
    operatorActor: 'integration-test',
    operationRequestId: 'test-request',
    operationReason: 'integration-test',
    opsToken: 'test-token',
  };
}

export function disableApdShadowEpochOpsAuthorityForTests(): void {
  testBypassEnabled = false;
  testBypassContext = null;
}

export function resolveObservedDeployedGitSha(): string | null {
  const raw = process.env[DEPLOYED_SHA_ENV];
  if (!raw?.trim()) return null;
  return raw.trim();
}

function mergeOpsContext(partial: Partial<ApdShadowEpochOpsContext>): ApdShadowEpochOpsContext {
  return {
    operatorActor: partial.operatorActor ?? testBypassContext?.operatorActor ?? '',
    operationRequestId:
      partial.operationRequestId ?? testBypassContext?.operationRequestId ?? '',
    operationReason: partial.operationReason ?? testBypassContext?.operationReason ?? '',
    opsToken: partial.opsToken ?? testBypassContext?.opsToken ?? '',
    expectedDeployedSha:
      partial.expectedDeployedSha ?? testBypassContext?.expectedDeployedSha,
  };
}

/** @deprecated name retained for epoch service call sites — requires full operator provenance (not env boolean alone). */
export function assertApdShadowEpochInternalOpsAuthorized(
  operation: string,
  partial: Partial<ApdShadowEpochOpsContext> = {},
): void {
  assertApdShadowEpochOpsAuthorized(operation, mergeOpsContext(partial));
}

export function assertApdShadowEpochOpsAuthorized(
  operation: string,
  ctx: ApdShadowEpochOpsContext,
): void {
  if (testBypassEnabled) {
    const actor = (ctx.operatorActor ?? testBypassContext?.operatorActor)?.trim();
    if (!actor) {
      throw new Error(`${operation}: operatorActor required even in test bypass`);
    }
    return;
  }

  const actor = ctx.operatorActor?.trim();
  const requestId = ctx.operationRequestId?.trim();
  const reason = ctx.operationReason?.trim();
  const token = ctx.opsToken?.trim();

  if (!actor || actor.length < 3) {
    throw new Error(`${operation}: operatorActor is required (authenticated identity)`);
  }
  if (!requestId || requestId.length < 8) {
    throw new Error(`${operation}: operationRequestId is required (unique audit id)`);
  }
  if (!reason || reason.length < 8) {
    throw new Error(`${operation}: operationReason is required`);
  }
  if (!token) {
    throw new Error(`${operation}: opsToken is required (must match ${OPS_TOKEN_ENV})`);
  }

  const configured = process.env[OPS_TOKEN_ENV]?.trim();
  if (!configured) {
    throw new Error(`${operation}: ${OPS_TOKEN_ENV} is not configured on this runtime`);
  }

  const presented = Buffer.from(token, 'utf8');
  const expected = Buffer.from(configured, 'utf8');
  if (presented.length !== expected.length || !timingSafeEqual(presented, expected)) {
    throw new Error(`${operation}: opsToken rejected`);
  }

  const proof = buildOperatorExecutionProof(actor, requestId, configured);
  const presentedProof = buildOperatorExecutionProof(actor, requestId, token);
  if (proof !== presentedProof) {
    throw new Error(`${operation}: operator execution proof invalid`);
  }
}

export function assertDeployedReleaseIdentity(expectedDeployedSha: string | undefined): {
  observed: string | null;
  expected: string | null;
} {
  const observed = resolveObservedDeployedGitSha();
  if (!expectedDeployedSha?.trim()) {
    return { observed, expected: null };
  }
  const expected = expectedDeployedSha.trim();
  if (!observed) {
    throw new Error(
      `release identity verification failed: ${DEPLOYED_SHA_ENV} not set on runtime`,
    );
  }
  if (observed !== expected) {
    throw new Error(
      `release identity mismatch: expected ${expected} observed ${observed}`,
    );
  }
  return { observed, expected };
}

export function buildOperatorExecutionProof(
  operatorActor: string,
  operationRequestId: string,
  opsToken: string,
): string {
  return createHmac('sha256', opsToken)
    .update(`${operatorActor}\u0000${operationRequestId}`)
    .digest('hex');
}

export function emitApdShadowEpochOpsAudit(record: ApdShadowEpochOpsAuditRecord): void {
  process.stdout.write(`${JSON.stringify({ apdShadowEpochOps: record })}\n`);
}
