import { createHmac, timingSafeEqual } from 'node:crypto';

const OPS_TOKEN_ENV = 'APD_SHADOW_EPOCH_OPS_TOKEN';
const DEPLOYED_SHA_ENV = 'SYNQDRIVE_DEPLOYED_GIT_SHA';
const APPROVED_RELEASE_SHA_ENV = 'APD_SHADOW_EPOCH_APPROVED_RELEASE_SHA';
const OPERATOR_ALLOWLIST_ENV = 'APD_SHADOW_EPOCH_OPERATOR_ALLOWLIST';

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

  assertOperatorActorAllowlisted(operation, actor);

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

export function resolveApprovedReleaseSha(): string | null {
  const raw = process.env[APPROVED_RELEASE_SHA_ENV];
  if (!raw?.trim()) return null;
  return raw.trim();
}

/**
 * Mutation authority: approved release pin (deploy-time env) must match observed runtime SHA.
 * Untrusted CLI `--expected-sha` is never used here.
 */
export function assertMutationReleaseIdentity(operation: string): {
  approved: string;
  observed: string;
} {
  if (testBypassEnabled) {
    const observed = resolveObservedDeployedGitSha() ?? 'test-bypass-release';
    return { approved: observed, observed };
  }
  const approved = resolveApprovedReleaseSha();
  const observed = resolveObservedDeployedGitSha();
  if (!approved) {
    throw new Error(`${operation}: ${APPROVED_RELEASE_SHA_ENV} not configured`);
  }
  if (!observed) {
    throw new Error(`${operation}: ${DEPLOYED_SHA_ENV} not set on runtime`);
  }
  if (approved !== observed) {
    throw new Error(`${operation}: release identity mismatch (approved vs observed)`);
  }
  return { approved, observed };
}

/** @deprecated Preflight display only — mutations use assertMutationReleaseIdentity. */
export function assertDeployedReleaseIdentity(_expectedDeployedSha: string | undefined): {
  observed: string | null;
  expected: string | null;
} {
  try {
    const { approved, observed } = assertMutationReleaseIdentity('preflight');
    return { observed, expected: approved };
  } catch {
    return { observed: resolveObservedDeployedGitSha(), expected: resolveApprovedReleaseSha() };
  }
}

export function assertOperatorActorAllowlisted(operation: string, operatorActor: string): void {
  if (testBypassEnabled) return;
  const raw = process.env[OPERATOR_ALLOWLIST_ENV]?.trim();
  if (!raw) {
    throw new Error(
      `${operation}: ${OPERATOR_ALLOWLIST_ENV} not configured (operator identity not verifiable)`,
    );
  }
  const allowed = raw.split(',').map((s) => s.trim()).filter(Boolean);
  if (!allowed.includes(operatorActor)) {
    throw new Error(`${operation}: operatorActor not in approved allowlist`);
  }
}

export function isOperatorIdentityInfrastructureConfigured(): boolean {
  return Boolean(process.env[OPERATOR_ALLOWLIST_ENV]?.trim());
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
