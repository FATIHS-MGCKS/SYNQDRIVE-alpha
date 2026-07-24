import { getAiDomainErrorCatalogEntry } from './ai-domain-error.catalog';
import type { AiDomainErrorCode } from './ai-domain-error.enums';
import type {
  AiDomainError,
  AiDomainQueryOutcome,
  CreateAiDomainErrorInput,
} from './ai-domain-error.types';
import type { AiEvidence } from './ai-evidence.types';
import { toAiDomainErrorPublicView } from './ai-domain-error.serialization';

export function createAiDomainError(input: CreateAiDomainErrorInput): AiDomainError {
  const entry = getAiDomainErrorCatalogEntry(input.code);
  const locale = input.locale ?? 'en';
  const publicMessage =
    input.publicMessageOverride ??
    (locale === 'de' ? entry.publicMessageDe : entry.publicMessageEn);

  return {
    code: input.code,
    publicMessage,
    severity: entry.severity,
    retryPolicy: entry.retryPolicy,
    httpStatus: entry.httpStatus,
    auditEvent: entry.auditEvent,
    maskEntityExistence: input.maskEntityExistence ?? entry.maskEntityExistence,
    blockLlmInference: entry.blockLlmInference,
    diagnostics: input.diagnostics ?? {},
  };
}

export function createVehicleNotFoundError(
  diagnostics?: CreateAiDomainErrorInput['diagnostics'],
  locale?: 'en' | 'de',
): AiDomainError {
  return createAiDomainError({
    code: 'vehicle_not_found',
    locale,
    diagnostics,
  });
}

export function createVehicleAmbiguousError(
  diagnostics?: CreateAiDomainErrorInput['diagnostics'],
  locale?: 'en' | 'de',
): AiDomainError {
  return createAiDomainError({
    code: 'vehicle_ambiguous',
    locale,
    diagnostics,
  });
}

export function createDataNotAvailableError(
  diagnostics?: CreateAiDomainErrorInput['diagnostics'],
): AiDomainError {
  return createAiDomainError({ code: 'data_not_available', diagnostics });
}

export function createDataTooOldError(
  diagnostics?: CreateAiDomainErrorInput['diagnostics'],
): AiDomainError {
  return createAiDomainError({ code: 'data_too_old', diagnostics });
}

export function createIntegrationNotConnectedError(
  diagnostics?: CreateAiDomainErrorInput['diagnostics'],
): AiDomainError {
  return createAiDomainError({ code: 'integration_not_connected', diagnostics });
}

export function createIntegrationTemporarilyUnavailableError(
  diagnostics?: CreateAiDomainErrorInput['diagnostics'],
): AiDomainError {
  return createAiDomainError({
    code: 'integration_temporarily_unavailable',
    diagnostics,
  });
}

export function createSignalNotSupportedError(
  diagnostics?: CreateAiDomainErrorInput['diagnostics'],
): AiDomainError {
  return createAiDomainError({ code: 'signal_not_supported', diagnostics });
}

export function createPermissionDeniedError(
  diagnostics?: CreateAiDomainErrorInput['diagnostics'],
): AiDomainError {
  return createAiDomainError({
    code: 'permission_denied',
    diagnostics,
    maskEntityExistence: true,
  });
}

export function createRoleRestrictedError(
  diagnostics?: CreateAiDomainErrorInput['diagnostics'],
): AiDomainError {
  return createAiDomainError({
    code: 'role_restricted',
    diagnostics,
    maskEntityExistence: true,
  });
}

export function createDomainStatusInconsistentError(
  diagnostics?: CreateAiDomainErrorInput['diagnostics'],
): AiDomainError {
  return createAiDomainError({
    code: 'domain_status_inconsistent',
    diagnostics,
  });
}

export function createTimeoutError(
  diagnostics?: CreateAiDomainErrorInput['diagnostics'],
): AiDomainError {
  return createAiDomainError({ code: 'timeout', diagnostics });
}

export function createInvalidInputError(
  diagnostics?: CreateAiDomainErrorInput['diagnostics'],
): AiDomainError {
  return createAiDomainError({ code: 'invalid_input', diagnostics });
}

export function createInternalProcessingFailedError(
  diagnostics?: CreateAiDomainErrorInput['diagnostics'],
): AiDomainError {
  return createAiDomainError({
    code: 'internal_processing_failed',
    diagnostics,
  });
}

/**
 * Secure entity access resolution — never leak existence across permission boundary.
 *
 * - No read permission → `permission_denied` (masked), even if entity exists.
 * - Read permission + missing entity → `vehicle_not_found`.
 */
export function resolveSecureVehicleAccessError(input: {
  readonly canReadVehicles: boolean;
  readonly vehicleExists: boolean;
  readonly organizationId: string;
  readonly vehicleId?: string;
  readonly correlationId?: string;
  readonly locale?: 'en' | 'de';
}): AiDomainError | null {
  if (!input.canReadVehicles) {
    return createPermissionDeniedError({
      organizationId: input.organizationId,
      entityId: input.vehicleId,
      entityKind: 'vehicle',
      correlationId: input.correlationId,
      internalDetail: 'vehicle_read_permission_missing',
    });
  }
  if (!input.vehicleExists) {
    return createVehicleNotFoundError(
      {
        organizationId: input.organizationId,
        entityId: input.vehicleId,
        entityKind: 'vehicle',
        correlationId: input.correlationId,
      },
      input.locale,
    );
  }
  return null;
}

export function buildAiDomainQueryOutcome<T>(input: {
  readonly tenantId: string;
  readonly data: T | null;
  readonly evidence?: readonly AiEvidence[];
  readonly errors?: readonly AiDomainError[];
  readonly warnings?: readonly string[];
}): AiDomainQueryOutcome<T> {
  const errors = input.errors ?? [];
  const blocking = errors.some((e) => e.blockLlmInference);
  const hasData = input.data != null;
  const partial = hasData && errors.length > 0;

  return {
    tenantId: input.tenantId,
    partial,
    data: hasData ? input.data : null,
    evidence: input.evidence ?? [],
    errors,
    warnings: input.warnings ?? [],
    allowLlmInference: !blocking,
  };
}

export function buildPartialAiDomainQueryOutcome<T>(input: {
  readonly tenantId: string;
  readonly data: T;
  readonly evidence: readonly AiEvidence[];
  readonly errors: readonly AiDomainError[];
  readonly warnings?: readonly string[];
}): AiDomainQueryOutcome<T> {
  return buildAiDomainQueryOutcome({
    tenantId: input.tenantId,
    data: input.data,
    evidence: input.evidence,
    errors: input.errors,
    warnings: input.warnings,
  });
}

/** Convenience map for each catalogued error code. */
export const AI_DOMAIN_ERROR_FACTORIES: Readonly<
  Record<AiDomainErrorCode, () => AiDomainError>
> = {
  vehicle_not_found: () => createVehicleNotFoundError(),
  vehicle_ambiguous: () => createVehicleAmbiguousError(),
  data_not_available: () => createDataNotAvailableError(),
  data_too_old: () => createDataTooOldError(),
  integration_not_connected: () => createIntegrationNotConnectedError(),
  integration_temporarily_unavailable: () =>
    createIntegrationTemporarilyUnavailableError(),
  signal_not_supported: () => createSignalNotSupportedError(),
  permission_denied: () => createPermissionDeniedError(),
  role_restricted: () => createRoleRestrictedError(),
  domain_status_inconsistent: () => createDomainStatusInconsistentError(),
  timeout: () => createTimeoutError(),
  invalid_input: () => createInvalidInputError(),
  internal_processing_failed: () => createInternalProcessingFailedError(),
};

export function toAiDomainQueryOutcomeForLlm<T>(
  outcome: AiDomainQueryOutcome<T>,
): Omit<AiDomainQueryOutcome<T>, 'errors'> & {
  errors: ReturnType<typeof toAiDomainErrorPublicView>[];
} {
  return {
    ...outcome,
    errors: outcome.errors.map((error) =>
      toAiDomainErrorPublicView(error, outcome.partial),
    ),
  };
}
