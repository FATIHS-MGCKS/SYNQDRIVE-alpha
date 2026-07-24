import { AI_DOMAIN_ERROR_CODES } from './ai-domain-error.enums';
import {
  AI_DOMAIN_ERROR_CATALOG,
  describeAiDomainErrorCode,
  getAiDomainErrorCatalogEntry,
  listAiDomainErrorCatalogEntries,
} from './ai-domain-error.catalog';
import {
  AI_DOMAIN_ERROR_FACTORIES,
  buildAiDomainQueryOutcome,
  buildPartialAiDomainQueryOutcome,
  createAiDomainError,
  createDataNotAvailableError,
  createDataTooOldError,
  createDomainStatusInconsistentError,
  createIntegrationNotConnectedError,
  createIntegrationTemporarilyUnavailableError,
  createInternalProcessingFailedError,
  createInvalidInputError,
  createPermissionDeniedError,
  createRoleRestrictedError,
  createSignalNotSupportedError,
  createTimeoutError,
  createVehicleAmbiguousError,
  createVehicleNotFoundError,
  resolveSecureVehicleAccessError,
  toAiDomainQueryOutcomeForLlm,
} from './ai-domain-error.factory';
import {
  assertNoDiagnosticsInPublicView,
  mapEvidenceReasonCodeToDomainErrorCode,
  redactForeignOrganizationReferences,
  sanitizeAiDomainDiagnosticText,
  sanitizeInternalThrowable,
  serializeAiDomainErrorForLlm,
  toAiDomainErrorApiView,
  toAiDomainErrorAuditPayload,
  toAiDomainErrorPublicView,
} from './ai-domain-error.serialization';
import { createObservedAiEvidence } from './ai-evidence.factory';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ORG = '99999999-9999-4999-8999-999999999999';
const VEHICLE_ID = '22222222-2222-4222-8222-222222222222';

describe('AI domain error contract', () => {
  describe.each(AI_DOMAIN_ERROR_CODES)('catalog entry: %s', (code) => {
    it('defines public messages, severity, retry, http, and audit event', () => {
      const entry = getAiDomainErrorCatalogEntry(code);
      expect(entry.code).toBe(code);
      expect(entry.publicMessageEn.length).toBeGreaterThan(0);
      expect(entry.publicMessageDe.length).toBeGreaterThan(0);
      expect(entry.auditEvent.startsWith('ai.domain_query.')).toBe(true);

      const described = describeAiDomainErrorCode(code);
      expect(described.severity).toBe(entry.severity);
      expect(described.retryPolicy).toBe(entry.retryPolicy);
      expect(described.httpStatus).toBe(entry.httpStatus);
    });

    it('factory produces a valid error with blockLlmInference', () => {
      const error = AI_DOMAIN_ERROR_FACTORIES[code]();
      expect(error.code).toBe(code);
      expect(error.blockLlmInference).toBe(true);
      expect(error.publicMessage).toBeTruthy();
    });
  });

  describe('individual error semantics', () => {
    it('vehicle_not_found', () => {
      const error = createVehicleNotFoundError({
        organizationId: TENANT_ID,
        entityId: VEHICLE_ID,
      });
      expect(error.code).toBe('vehicle_not_found');
      expect(error.httpStatus).toBe(404);
      expect(error.maskEntityExistence).toBe(false);
      expect(error.retryPolicy).toBe('non_retryable');
    });

    it('vehicle_ambiguous', () => {
      const error = createVehicleAmbiguousError();
      expect(error.code).toBe('vehicle_ambiguous');
      expect(error.auditEvent).toBe('ai.domain_query.vehicle_ambiguous');
    });

    it('data_not_available', () => {
      const error = createDataNotAvailableError();
      expect(error.code).toBe('data_not_available');
      expect(error.severity).toBe('warning');
    });

    it('data_too_old', () => {
      const error = createDataTooOldError();
      expect(error.code).toBe('data_too_old');
      expect(error.blockLlmInference).toBe(true);
    });

    it('integration_not_connected', () => {
      const error = createIntegrationNotConnectedError();
      expect(error.code).toBe('integration_not_connected');
      expect(error.retryPolicy).toBe('non_retryable');
    });

    it('integration_temporarily_unavailable is retryable', () => {
      const error = createIntegrationTemporarilyUnavailableError();
      expect(error.code).toBe('integration_temporarily_unavailable');
      expect(error.retryPolicy).toBe('retryable');
      expect(error.httpStatus).toBe(503);
    });

    it('signal_not_supported', () => {
      const error = createSignalNotSupportedError();
      expect(error.code).toBe('signal_not_supported');
    });

    it('permission_denied masks entity existence', () => {
      const error = createPermissionDeniedError();
      expect(error.maskEntityExistence).toBe(true);
      expect(error.publicMessage).not.toMatch(/not found/i);
    });

    it('role_restricted masks entity existence', () => {
      const error = createRoleRestrictedError();
      expect(error.maskEntityExistence).toBe(true);
      expect(error.httpStatus).toBe(403);
    });

    it('domain_status_inconsistent', () => {
      const error = createDomainStatusInconsistentError();
      expect(error.code).toBe('domain_status_inconsistent');
      expect(error.severity).toBe('error');
    });

    it('timeout is retryable', () => {
      const error = createTimeoutError();
      expect(error.retryPolicy).toBe('retryable');
      expect(error.httpStatus).toBe(504);
    });

    it('invalid_input', () => {
      const error = createInvalidInputError();
      expect(error.httpStatus).toBe(400);
    });

    it('internal_processing_failed is retryable critical', () => {
      const error = createInternalProcessingFailedError();
      expect(error.severity).toBe('critical');
      expect(error.retryPolicy).toBe('retryable');
    });
  });

  describe('secure not-found vs permission-denied', () => {
    it('returns permission_denied when caller cannot read vehicles (entity may exist)', () => {
      const error = resolveSecureVehicleAccessError({
        canReadVehicles: false,
        vehicleExists: true,
        organizationId: TENANT_ID,
        vehicleId: VEHICLE_ID,
      });
      expect(error?.code).toBe('permission_denied');
      expect(error?.maskEntityExistence).toBe(true);
      expect(error?.publicMessage).not.toContain('not found');
    });

    it('returns vehicle_not_found only when authorized and missing', () => {
      const error = resolveSecureVehicleAccessError({
        canReadVehicles: true,
        vehicleExists: false,
        organizationId: TENANT_ID,
        vehicleId: VEHICLE_ID,
      });
      expect(error?.code).toBe('vehicle_not_found');
    });

    it('returns null when authorized and vehicle exists', () => {
      const error = resolveSecureVehicleAccessError({
        canReadVehicles: true,
        vehicleExists: true,
        organizationId: TENANT_ID,
        vehicleId: VEHICLE_ID,
      });
      expect(error).toBeNull();
    });
  });

  describe('serialization safety', () => {
    it('strips bearer tokens from diagnostics', () => {
      const sanitized = sanitizeAiDomainDiagnosticText(
        'Auth failed Bearer sk-live-secret-token-12345',
      );
      expect(sanitized).not.toContain('sk-live-secret');
      expect(sanitized).toContain('[REDACTED]');
    });

    it('sanitizes thrown errors without stack in public view', () => {
      const internal = sanitizeInternalThrowable(
        new Error('timeout at fetchVehicle (/secret/path.ts:12:3)'),
      );
      expect(internal).not.toContain('/secret/path');
      const error = createTimeoutError({ internalDetail: internal });
      const pub = toAiDomainErrorPublicView(error);
      assertNoDiagnosticsInPublicView(pub);
      expect(JSON.stringify(pub)).not.toContain('diagnostics');
    });

    it('redacts foreign organization UUIDs from audit detail', () => {
      const redacted = redactForeignOrganizationReferences(
        `org ${OTHER_ORG} vs ${TENANT_ID}`,
        TENANT_ID,
      );
      expect(redacted).toContain(TENANT_ID);
      expect(redacted).toContain('[REDACTED_ORG]');
      expect(redacted).not.toContain(OTHER_ORG);
    });

    it('LLM projection never includes diagnostics', () => {
      const error = createInternalProcessingFailedError({
        internalDetail: 'db connection lost',
        correlationId: 'corr-1',
      });
      const llm = serializeAiDomainErrorForLlm(error);
      expect(llm).not.toHaveProperty('diagnostics');
      assertNoDiagnosticsInPublicView(llm);
    });

    it('API view includes httpStatus only', () => {
      const api = toAiDomainErrorApiView(createPermissionDeniedError());
      expect(api.httpStatus).toBe(403);
      assertNoDiagnosticsInPublicView(api);
    });

    it('audit payload includes sanitized diagnostics', () => {
      const payload = toAiDomainErrorAuditPayload(
        createIntegrationTemporarilyUnavailableError({
          domainService: 'DimoTelemetryService',
          internalDetail: '503 upstream',
        }),
        TENANT_ID,
      );
      expect(payload.event).toBe('ai.domain_query.integration_unavailable');
      expect(payload.domainService).toBe('DimoTelemetryService');
      expect(payload.organizationId).toBe(TENANT_ID);
    });
  });

  describe('partial tool outcomes', () => {
    const evidence = createObservedAiEvidence({
      tenantId: TENANT_ID,
      entityId: VEHICLE_ID,
      source: 'vehicle_latest_state',
      sourceEntity: { kind: 'vehicle', id: VEHICLE_ID },
      freshness: 'signal_delayed',
      confidence: 'medium',
      availability: 'partial',
      reasonCode: 'stale_data',
      sensitivity: 'internal',
      value: { odometerKm: 40_000 },
      observedAt: '2026-06-01T10:00:00.000Z',
    });

    it('allows partial data with blocking errors and disables LLM inference', () => {
      const outcome = buildPartialAiDomainQueryOutcome({
        tenantId: TENANT_ID,
        data: { odometerKm: 40_000 },
        evidence: [evidence],
        errors: [createDataTooOldError()],
        warnings: ['stale_odometer'],
      });
      expect(outcome.partial).toBe(true);
      expect(outcome.data).toEqual({ odometerKm: 40_000 });
      expect(outcome.allowLlmInference).toBe(false);
    });

    it('allows inference when no blocking errors', () => {
      const outcome = buildAiDomainQueryOutcome({
        tenantId: TENANT_ID,
        data: { count: 3 },
        evidence: [],
        errors: [],
      });
      expect(outcome.allowLlmInference).toBe(true);
      expect(outcome.partial).toBe(false);
    });

    it('maps outcome errors to LLM-safe views', () => {
      const outcome = buildPartialAiDomainQueryOutcome({
        tenantId: TENANT_ID,
        data: { ok: true },
        evidence: [],
        errors: [createDataNotAvailableError()],
      });
      const llm = toAiDomainQueryOutcomeForLlm(outcome);
      expect(llm.errors[0]?.code).toBe('data_not_available');
      expect(llm.errors[0]).not.toHaveProperty('diagnostics');
      expect(llm.allowLlmInference).toBe(false);
    });
  });

  describe('evidence reason bridge', () => {
    it('maps evidence reason codes to domain errors', () => {
      expect(mapEvidenceReasonCodeToDomainErrorCode('entity_not_found')).toBe(
        'vehicle_not_found',
      );
      expect(mapEvidenceReasonCodeToDomainErrorCode('provider_outage')).toBe(
        'integration_temporarily_unavailable',
      );
      expect(mapEvidenceReasonCodeToDomainErrorCode('partial_data')).toBeNull();
    });
  });

  describe('catalog completeness', () => {
    it('has exactly one catalog entry per error code', () => {
      expect(listAiDomainErrorCatalogEntries()).toHaveLength(
        AI_DOMAIN_ERROR_CODES.length,
      );
      for (const code of AI_DOMAIN_ERROR_CODES) {
        expect(AI_DOMAIN_ERROR_CATALOG[code]).toBeDefined();
      }
    });

    it('supports German locale override via factory', () => {
      const error = createAiDomainError({
        code: 'vehicle_not_found',
        locale: 'de',
      });
      expect(error.publicMessage).toContain('nicht gefunden');
    });
  });
});
