/** EXP-021 P2.1 — CLI scope parsing (testable, no Prisma). */

import {
  DI_V0_SPEED_QC_DEFAULT_POLICY_VERSION,
  resolveDiV0SpeedQcPolicyVersion,
} from '../speed-qc/di-v0-speed-qc-policy.version';

export const DI_V0_P21_PREVIEW_SCOPE_ENV = {
  organizationId: 'DI_V0_P21_ORGANIZATION_ID',
  tripId: 'DI_V0_P21_TRIP_ID',
  workItemId: 'DI_V0_P21_WORK_ITEM_ID',
  qcPolicyVersion: 'DI_V0_P21_QC_POLICY_VERSION',
} as const;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type DiV0P21PreviewScopeSource = 'cli_flags' | 'p21_env_bundle';

export interface DiV0P21PreviewScope {
  organizationId: string;
  tripId: string;
  workItemId: string;
  /** Resolved QC policy; defaults to V1 when not specified. */
  qcPolicyVersion: string;
  source: DiV0P21PreviewScopeSource;
}

export type DiV0P21PreviewScopeErrorCode =
  | 'MISSING_SCOPE'
  | 'MIXED_INPUT_SOURCES'
  | 'INVALID_UUID'
  | 'AMBIGUOUS_ENV';

export class DiV0P21PreviewScopeError extends Error {
  readonly code: DiV0P21PreviewScopeErrorCode;

  constructor(code: DiV0P21PreviewScopeErrorCode, message: string) {
    super(message);
    this.name = 'DiV0P21PreviewScopeError';
    this.code = code;
  }
}

function readArgvFlag(argv: string[], name: string): string | undefined {
  const flag = `--${name}`;
  const idx = argv.indexOf(flag);
  if (idx >= 0 && argv[idx + 1] && !argv[idx + 1].startsWith('--')) return argv[idx + 1];
  return undefined;
}

function assertUuid(field: string, value: string): void {
  if (!UUID_RE.test(value)) {
    throw new DiV0P21PreviewScopeError('INVALID_UUID', `${field} must be a UUID (got invalid format)`);
  }
}

/**
 * Allowed input paths (exactly one):
 * 1. All three `--organizationId`, `--tripId`, `--workItemId` CLI flags.
 * 2. All three `DI_V0_P21_*` env vars together (explicit ops bundle — no generic `ORGANIZATION_ID`).
 */
export function resolveDiV0P21PreviewScope(
  argv: string[],
  env: Record<string, string | undefined>,
): DiV0P21PreviewScope {
  const fromCli = {
    organizationId: readArgvFlag(argv, 'organizationId'),
    tripId: readArgvFlag(argv, 'tripId'),
    workItemId: readArgvFlag(argv, 'workItemId'),
  };
  const cliCount = [fromCli.organizationId, fromCli.tripId, fromCli.workItemId].filter(Boolean).length;

  const fromEnv = {
    organizationId: env[DI_V0_P21_PREVIEW_SCOPE_ENV.organizationId],
    tripId: env[DI_V0_P21_PREVIEW_SCOPE_ENV.tripId],
    workItemId: env[DI_V0_P21_PREVIEW_SCOPE_ENV.workItemId],
  };
  const envCount = [fromEnv.organizationId, fromEnv.tripId, fromEnv.workItemId].filter(Boolean).length;

  if (cliCount > 0 && envCount > 0) {
    throw new DiV0P21PreviewScopeError(
      'MIXED_INPUT_SOURCES',
      'Use either all CLI flags or all DI_V0_P21_* env vars — not both',
    );
  }

  if (cliCount > 0 && cliCount < 3) {
    throw new DiV0P21PreviewScopeError(
      'MISSING_SCOPE',
      'When using CLI flags, all three are required: --organizationId, --tripId, --workItemId',
    );
  }

  if (envCount > 0 && envCount < 3) {
    throw new DiV0P21PreviewScopeError(
      'MISSING_SCOPE',
      'When using env scope, set all DI_V0_P21_ORGANIZATION_ID, DI_V0_P21_TRIP_ID, DI_V0_P21_WORK_ITEM_ID',
    );
  }

  if (env.ORGANIZATION_ID && envCount === 0 && cliCount === 0) {
    throw new DiV0P21PreviewScopeError(
      'AMBIGUOUS_ENV',
      'ORGANIZATION_ID alone is not accepted; use explicit CLI flags or the DI_V0_P21_* env bundle',
    );
  }

  const qcFromCli = readArgvFlag(argv, 'qcPolicyVersion');
  const qcFromEnv = env[DI_V0_P21_PREVIEW_SCOPE_ENV.qcPolicyVersion];
  if (qcFromCli && qcFromEnv) {
    throw new DiV0P21PreviewScopeError(
      'MIXED_INPUT_SOURCES',
      'Use either --qcPolicyVersion or DI_V0_P21_QC_POLICY_VERSION — not both',
    );
  }
  const qcPolicyVersion = resolveDiV0SpeedQcPolicyVersion(
    qcFromCli ?? qcFromEnv ?? DI_V0_SPEED_QC_DEFAULT_POLICY_VERSION,
  );

  let scope: DiV0P21PreviewScope;
  if (cliCount === 3) {
    scope = {
      organizationId: fromCli.organizationId!,
      tripId: fromCli.tripId!,
      workItemId: fromCli.workItemId!,
      qcPolicyVersion,
      source: 'cli_flags',
    };
  } else if (envCount === 3) {
    scope = {
      organizationId: fromEnv.organizationId!,
      tripId: fromEnv.tripId!,
      workItemId: fromEnv.workItemId!,
      qcPolicyVersion,
      source: 'p21_env_bundle',
    };
  } else {
    throw new DiV0P21PreviewScopeError(
      'MISSING_SCOPE',
      'Required scope: --organizationId, --tripId, --workItemId (or all DI_V0_P21_* env vars)',
    );
  }

  assertUuid('organizationId', scope.organizationId);
  assertUuid('tripId', scope.tripId);
  assertUuid('workItemId', scope.workItemId);
  return scope;
}

export function exitCodeForPreviewOutcome(outcome: 'ASSESSED' | 'NOT_ASSESSABLE'): number {
  return outcome === 'NOT_ASSESSABLE' ? 3 : 0;
}
