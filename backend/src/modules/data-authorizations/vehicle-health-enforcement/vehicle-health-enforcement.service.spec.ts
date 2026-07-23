import { AuthorizationActorType } from '@prisma/client';
import {
  AUTHORIZATION_DECISION_OUTCOME,
  AUTHORIZATION_DECISION_REASON,
} from '../authorization-decision-engine/authorization-decision.constants';
import { DataAuthorizationAuditService } from '../privacy-domain/audit-log/data-authorization-audit.service';
import { VehicleHealthEnforcementMetricsService } from './vehicle-health-enforcement.metrics';
import { VehicleHealthEnforcementService } from './vehicle-health-enforcement.service';
import {
  VEHICLE_HEALTH_ACTION,
  VEHICLE_HEALTH_DATA_CATEGORY,
  VEHICLE_HEALTH_OBSERVATION_SOURCE,
  VEHICLE_HEALTH_PATH,
  VEHICLE_HEALTH_PURPOSE,
  VEHICLE_HEALTH_SERVICE_IDENTITY,
} from './vehicle-health-enforcement.constants';

describe('VehicleHealthEnforcementService', () => {
  const baseCtx = {
    organizationId: 'org-1',
    vehicleId: 'veh-1',
    dataCategory: VEHICLE_HEALTH_DATA_CATEGORY.HEALTH_SIGNALS,
    purpose: VEHICLE_HEALTH_PURPOSE.VEHICLE_HEALTH,
    processingPath: VEHICLE_HEALTH_PATH.BATTERY_DERIVE,
    serviceIdentity: VEHICLE_HEALTH_SERVICE_IDENTITY.BATTERY_WORKER,
    correlationId: 'corr-health-1',
  };

  let prisma: {
    vehicle: { findFirst: jest.Mock; findUnique: jest.Mock };
  };
  let authorizationDecision: { decide: jest.Mock };
  let auditService: { recordIngestionSkipped: jest.Mock };
  let metrics: VehicleHealthEnforcementMetricsService;
  let service: VehicleHealthEnforcementService;

  beforeEach(() => {
    prisma = {
      vehicle: {
        findFirst: jest.fn().mockResolvedValue({ id: 'veh-1' }),
        findUnique: jest.fn().mockResolvedValue({ organizationId: 'org-1' }),
      },
    };
    authorizationDecision = { decide: jest.fn() };
    auditService = { recordIngestionSkipped: jest.fn().mockResolvedValue('audit-1') };
    metrics = new VehicleHealthEnforcementMetricsService();
    service = new VehicleHealthEnforcementService(
      prisma as never,
      authorizationDecision as never,
      auditService as unknown as DataAuthorizationAuditService,
      metrics,
    );
    process.env.DATA_AUTH_HEALTH_SHADOW_MODE = 'true';
    delete process.env.DATA_AUTH_HEALTH_FAIL_CLOSED;
  });

  afterEach(() => {
    metrics.reset();
    delete process.env.DATA_AUTH_HEALTH_SHADOW_MODE;
    delete process.env.DATA_AUTH_HEALTH_FAIL_CLOSED;
  });

  function mockDecision(decision: string, reasonCode = 'POLICY_MATCH') {
    authorizationDecision.decide.mockResolvedValue({
      decision,
      enforced: decision === AUTHORIZATION_DECISION_OUTCOME.DENY,
      isShadowMode: decision === AUTHORIZATION_DECISION_OUTCOME.SHADOW_WOULD_DENY,
      reasonCode,
      reasonCodes: [reasonCode],
      correlationId: baseCtx.correlationId,
      auditEventId: 'evt-1',
      policyVersion: 1,
      matchedPolicyId: 'policy-1',
      resolverResult: null,
    });
  }

  it('DTC INGEST ALLOW — may ingest telemetry DTC', async () => {
    mockDecision(AUTHORIZATION_DECISION_OUTCOME.ALLOW);
    const result = await service.evaluate({
      ...baseCtx,
      action: VEHICLE_HEALTH_ACTION.INGEST,
      dataCategory: VEHICLE_HEALTH_DATA_CATEGORY.DTC_CODES,
      processingPath: VEHICLE_HEALTH_PATH.DTC_INGEST,
      serviceIdentity: VEHICLE_HEALTH_SERVICE_IDENTITY.DTC_WORKER,
      observationSource: VEHICLE_HEALTH_OBSERVATION_SOURCE.TELEMETRY,
    });
    expect(result.mayProceed).toBe(true);
    expect(authorizationDecision.decide).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'INGEST',
        dataCategory: 'DTC_CODES',
        sourceSystem: 'DIMO',
        actorType: AuthorizationActorType.SYSTEM,
      }),
    );
  });

  it('DTC INGEST DENY in fail-closed — blocks ingest', async () => {
    process.env.DATA_AUTH_HEALTH_SHADOW_MODE = 'false';
    process.env.DATA_AUTH_HEALTH_FAIL_CLOSED = 'true';
    mockDecision(AUTHORIZATION_DECISION_OUTCOME.DENY, 'PROVIDER_GRANT_REVOKED');
    const result = await service.mayIngest({
      ...baseCtx,
      dataCategory: VEHICLE_HEALTH_DATA_CATEGORY.DTC_CODES,
      processingPath: VEHICLE_HEALTH_PATH.DTC_INGEST,
      serviceIdentity: VEHICLE_HEALTH_SERVICE_IDENTITY.DTC_WORKER,
      observationSource: VEHICLE_HEALTH_OBSERVATION_SOURCE.TELEMETRY,
    });
    expect(result).toBe(false);
    expect(auditService.recordIngestionSkipped).toHaveBeenCalled();
  });

  it('health derivation uses DERIVE action', async () => {
    mockDecision(AUTHORIZATION_DECISION_OUTCOME.ALLOW);
    await service.mayDerive({
      ...baseCtx,
      processingPath: VEHICLE_HEALTH_PATH.TIRE_DERIVE,
      serviceIdentity: VEHICLE_HEALTH_SERVICE_IDENTITY.TIRE_WORKER,
      observationSource: VEHICLE_HEALTH_OBSERVATION_SOURCE.TELEMETRY,
    });
    expect(authorizationDecision.decide).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'DERIVE' }),
    );
  });

  it('service derivation DENY blocks maintenance materialization path', async () => {
    process.env.DATA_AUTH_HEALTH_SHADOW_MODE = 'false';
    process.env.DATA_AUTH_HEALTH_FAIL_CLOSED = 'true';
    mockDecision(AUTHORIZATION_DECISION_OUTCOME.DENY, 'NO_MATCHING_POLICY');
    const result = await service.mayDerive({
      ...baseCtx,
      processingPath: VEHICLE_HEALTH_PATH.SERVICE_DERIVE,
      serviceIdentity: VEHICLE_HEALTH_SERVICE_IDENTITY.SERVICE_API,
    });
    expect(result).toBe(false);
  });

  it('alert derive DENY suppresses new alert materialization', async () => {
    process.env.DATA_AUTH_HEALTH_SHADOW_MODE = 'false';
    process.env.DATA_AUTH_HEALTH_FAIL_CLOSED = 'true';
    mockDecision(AUTHORIZATION_DECISION_OUTCOME.DENY, 'PROCESSING_ACTIVITY_DENIED');
    const result = await service.mayDerive({
      ...baseCtx,
      purpose: VEHICLE_HEALTH_PURPOSE.ALERTS,
      processingPath: VEHICLE_HEALTH_PATH.BRAKE_ALERT,
      serviceIdentity: VEHICLE_HEALTH_SERVICE_IDENTITY.HEALTH_ALERT,
    });
    expect(result).toBe(false);
    expect(
      metrics.countFor(VEHICLE_HEALTH_PATH.BRAKE_ALERT, 'DERIVE', 'HEALTH_SIGNALS', 'skipped'),
    ).toBe(1);
  });

  it('USE_FOR_AI requires explicit action for health AI context', async () => {
    mockDecision(AUTHORIZATION_DECISION_OUTCOME.DENY, 'NO_MATCHING_POLICY');
    const allowed = await service.mayUseForAi({
      ...baseCtx,
      processingPath: VEHICLE_HEALTH_PATH.HEALTH_AI,
      serviceIdentity: VEHICLE_HEALTH_SERVICE_IDENTITY.HEALTH_AI,
    });
    expect(authorizationDecision.decide).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'USE_FOR_AI' }),
    );
    expect(allowed).toBe(true);
  });

  it('EXPORT requires explicit action for health export', async () => {
    mockDecision(AUTHORIZATION_DECISION_OUTCOME.DENY, 'NO_MATCHING_POLICY');
    const result = await service.assertExport({
      ...baseCtx,
      processingPath: VEHICLE_HEALTH_PATH.HEALTH_EXPORT,
      serviceIdentity: VEHICLE_HEALTH_SERVICE_IDENTITY.HEALTH_EXPORT,
    });
    expect(authorizationDecision.decide).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'EXPORT' }),
    );
    expect(result.mayProceed).toBe(true);
  });

  it('foreign vehicle — tenant mismatch', async () => {
    prisma.vehicle.findFirst.mockResolvedValue(null);
    const result = await service.evaluate({
      ...baseCtx,
      action: VEHICLE_HEALTH_ACTION.INGEST,
    });
    expect(result.mayProceed).toBe(false);
    expect(result.reasonCode).toBe('TENANT_MISMATCH');
    expect(authorizationDecision.decide).not.toHaveBeenCalled();
  });

  it('revoked policy on derive with effectiveTimestamp — no bypass', async () => {
    mockDecision(AUTHORIZATION_DECISION_OUTCOME.DENY, 'PROVIDER_GRANT_REVOKED');
    const replayAt = new Date('2025-03-01T00:00:00.000Z');
    await service.mayDerive({
      ...baseCtx,
      processingPath: VEHICLE_HEALTH_PATH.DTC_DERIVE,
      dataCategory: VEHICLE_HEALTH_DATA_CATEGORY.DTC_CODES,
      effectiveTimestamp: replayAt,
      isBackfill: true,
    });
    expect(authorizationDecision.decide).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'DERIVE',
        effectiveTimestamp: replayAt,
      }),
    );
  });

  it('manual observation maps to MANUAL_UPLOAD source system', async () => {
    mockDecision(AUTHORIZATION_DECISION_OUTCOME.ALLOW);
    await service.mayIngest({
      ...baseCtx,
      processingPath: VEHICLE_HEALTH_PATH.MANUAL_OBSERVATION,
      serviceIdentity: VEHICLE_HEALTH_SERVICE_IDENTITY.HEALTH_API,
      observationSource: VEHICLE_HEALTH_OBSERVATION_SOURCE.MANUAL,
    });
    expect(authorizationDecision.decide).toHaveBeenCalledWith(
      expect.objectContaining({ sourceSystem: 'MANUAL_UPLOAD' }),
    );
  });

  it('telemetry observation maps to DIMO source system', async () => {
    mockDecision(AUTHORIZATION_DECISION_OUTCOME.ALLOW);
    await service.mayIngest({
      ...baseCtx,
      processingPath: VEHICLE_HEALTH_PATH.TELEMETRY_OBSERVATION,
      serviceIdentity: VEHICLE_HEALTH_SERVICE_IDENTITY.HEALTH_API,
      observationSource: VEHICLE_HEALTH_OBSERVATION_SOURCE.TELEMETRY,
    });
    expect(authorizationDecision.decide).toHaveBeenCalledWith(
      expect.objectContaining({ sourceSystem: 'DIMO' }),
    );
  });

  it('resolver error on derive — no legacy fallback', async () => {
    mockDecision(
      AUTHORIZATION_DECISION_OUTCOME.DENY,
      AUTHORIZATION_DECISION_REASON.RESOLVER_ERROR,
    );
    const result = await service.evaluate({
      ...baseCtx,
      action: VEHICLE_HEALTH_ACTION.DERIVE,
      processingPath: VEHICLE_HEALTH_PATH.BATTERY_DERIVE,
    });
    expect(result.isAuthorizationDeny).toBe(true);
    expect(
      metrics.countFor(
        VEHICLE_HEALTH_PATH.BATTERY_DERIVE,
        'DERIVE',
        'HEALTH_SIGNALS',
        'resolver_error',
      ),
    ).toBe(1);
  });

  it('emptyDtcSummary redacts fault counts on READ deny', () => {
    const summary = service.emptyDtcSummary();
    expect(summary.activeCount).toBe(0);
    expect(summary.accessDenied).toBe(true);
  });
});
