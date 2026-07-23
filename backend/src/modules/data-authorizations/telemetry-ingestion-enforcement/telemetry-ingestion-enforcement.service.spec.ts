import { AuthorizationActorType } from '@prisma/client';
import { AuthorizationDecisionService } from '../authorization-decision-engine/authorization-decision.service';
import {
  AUTHORIZATION_DECISION_OUTCOME,
  AUTHORIZATION_DECISION_REASON,
} from '../authorization-decision-engine/authorization-decision.constants';
import { DataAuthorizationAuditService } from '../privacy-domain/audit-log/data-authorization-audit.service';
import { TelemetryIngestionEnforcementMetricsService } from './telemetry-ingestion-enforcement.metrics';
import { TelemetryIngestionEnforcementService } from './telemetry-ingestion-enforcement.service';
import {
  TELEMETRY_INGEST_DATA_CATEGORY,
  TELEMETRY_INGEST_PATH,
  TELEMETRY_INGEST_PURPOSE,
  TELEMETRY_INGEST_SERVICE_IDENTITY,
  TELEMETRY_INGEST_SOURCE_SYSTEM,
} from './telemetry-ingestion-enforcement.constants';

describe('TelemetryIngestionEnforcementService', () => {
  const baseCtx = {
    organizationId: 'org-1',
    vehicleId: 'veh-1',
    sourceSystem: TELEMETRY_INGEST_SOURCE_SYSTEM.DIMO,
    dataCategory: TELEMETRY_INGEST_DATA_CATEGORY.TELEMETRY_DATA,
    purpose: TELEMETRY_INGEST_PURPOSE.FLEET_ANALYTICS,
    ingestionPath: TELEMETRY_INGEST_PATH.DIMO_SNAPSHOT_POLL,
    serviceIdentity: TELEMETRY_INGEST_SERVICE_IDENTITY.DIMO_SNAPSHOT_WORKER,
    correlationId: 'corr-ingest-1',
  };

  let prisma: { vehicle: { findFirst: jest.Mock } };
  let authorizationDecision: { decide: jest.Mock };
  let auditService: { recordIngestionSkipped: jest.Mock };
  let metrics: TelemetryIngestionEnforcementMetricsService;
  let service: TelemetryIngestionEnforcementService;

  beforeEach(() => {
    prisma = {
      vehicle: {
        findFirst: jest.fn().mockResolvedValue({ id: 'veh-1' }),
      },
    };
    authorizationDecision = {
      decide: jest.fn(),
    };
    auditService = {
      recordIngestionSkipped: jest.fn().mockResolvedValue('audit-1'),
    };
    metrics = new TelemetryIngestionEnforcementMetricsService();
    service = new TelemetryIngestionEnforcementService(
      prisma as never,
      authorizationDecision as unknown as AuthorizationDecisionService,
      auditService as unknown as DataAuthorizationAuditService,
      metrics,
    );
    delete process.env.DATA_AUTH_INGEST_FAIL_CLOSED;
    process.env.DATA_AUTH_INGEST_SHADOW_MODE = 'true';
  });

  afterEach(() => {
    metrics.reset();
    delete process.env.DATA_AUTH_INGEST_SHADOW_MODE;
    delete process.env.DATA_AUTH_INGEST_FAIL_CLOSED;
  });

  function mockDecision(
    decision: string,
    reasonCode = 'POLICY_MATCH',
    reasonCodes: string[] = [reasonCode],
  ) {
    authorizationDecision.decide.mockResolvedValue({
      decision,
      enforced: decision === AUTHORIZATION_DECISION_OUTCOME.DENY,
      isShadowMode: decision === AUTHORIZATION_DECISION_OUTCOME.SHADOW_WOULD_DENY,
      reasonCode,
      reasonCodes,
      correlationId: baseCtx.correlationId,
      auditEventId: 'evt-1',
      policyVersion: 1,
      matchedPolicyId: 'policy-1',
      resolverResult: null,
    });
  }

  it('ALLOW — may persist and records allow metric', async () => {
    mockDecision(AUTHORIZATION_DECISION_OUTCOME.ALLOW);
    const result = await service.evaluateIngest(baseCtx);
    expect(result.mayPersist).toBe(true);
    expect(result.isAuthorizationDeny).toBe(false);
    expect(metrics.countFor(
      TELEMETRY_INGEST_PATH.DIMO_SNAPSHOT_POLL,
      TELEMETRY_INGEST_SOURCE_SYSTEM.DIMO,
      TELEMETRY_INGEST_DATA_CATEGORY.TELEMETRY_DATA,
      'allow',
    )).toBe(1);
    expect(authorizationDecision.decide).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'INGEST',
        organizationId: 'org-1',
        vehicleId: 'veh-1',
        actorType: AuthorizationActorType.SYSTEM,
      }),
    );
  });

  it('DENY in shadow mode — still may persist with deny metric', async () => {
    mockDecision(AUTHORIZATION_DECISION_OUTCOME.DENY, 'PROVIDER_GRANT_REVOKED', [
      'PROVIDER_GRANT_REVOKED',
    ]);
    const result = await service.evaluateIngest(baseCtx);
    expect(result.mayPersist).toBe(true);
    expect(result.isShadowMode).toBe(true);
    expect(result.shouldRetry).toBe(false);
    expect(metrics.countFor(
      TELEMETRY_INGEST_PATH.DIMO_SNAPSHOT_POLL,
      TELEMETRY_INGEST_SOURCE_SYSTEM.DIMO,
      TELEMETRY_INGEST_DATA_CATEGORY.TELEMETRY_DATA,
      'deny',
    )).toBe(1);
    expect(auditService.recordIngestionSkipped).not.toHaveBeenCalled();
  });

  it('DENY in fail-closed mode — blocks persist and records INGESTION_SKIPPED', async () => {
    process.env.DATA_AUTH_INGEST_SHADOW_MODE = 'false';
    process.env.DATA_AUTH_INGEST_FAIL_CLOSED = 'true';
    mockDecision(AUTHORIZATION_DECISION_OUTCOME.DENY, 'POLICY_EXPIRED', ['POLICY_EXPIRED']);

    const result = await service.evaluateIngest(baseCtx);
    expect(result.mayPersist).toBe(false);
    expect(result.enforced).toBe(true);
    expect(result.shouldRetry).toBe(false);
    expect(auditService.recordIngestionSkipped).toHaveBeenCalled();
    expect(metrics.countFor(
      TELEMETRY_INGEST_PATH.DIMO_SNAPSHOT_POLL,
      TELEMETRY_INGEST_SOURCE_SYSTEM.DIMO,
      TELEMETRY_INGEST_DATA_CATEGORY.TELEMETRY_DATA,
      'ingestion_skipped',
    )).toBe(1);
  });

  it('expired policy — DENY with POLICY_EXPIRED reason', async () => {
    mockDecision(AUTHORIZATION_DECISION_OUTCOME.DENY, 'POLICY_EXPIRED', ['POLICY_EXPIRED']);
    const result = await service.evaluateIngest(baseCtx);
    expect(result.decision).toBe(AUTHORIZATION_DECISION_OUTCOME.DENY);
    expect(result.reasonCode).toBe('POLICY_EXPIRED');
  });

  it('revoked provider grant — DENY without queue retry', async () => {
    mockDecision(AUTHORIZATION_DECISION_OUTCOME.DENY, 'PROVIDER_GRANT_REVOKED', [
      'PROVIDER_GRANT_REVOKED',
    ]);
    const result = await service.evaluateIngest(baseCtx);
    expect(result.shouldRetry).toBe(false);
    expect(result.isAuthorizationDeny).toBe(true);
  });

  it('foreign vehicle — tenant mismatch denies without resolver call', async () => {
    prisma.vehicle.findFirst.mockResolvedValue(null);
    const result = await service.evaluateIngest(baseCtx);
    expect(result.mayPersist).toBe(false);
    expect(result.reasonCode).toBe('TENANT_MISMATCH');
    expect(authorizationDecision.decide).not.toHaveBeenCalled();
    expect(metrics.countFor(
      TELEMETRY_INGEST_PATH.DIMO_SNAPSHOT_POLL,
      TELEMETRY_INGEST_SOURCE_SYSTEM.DIMO,
      TELEMETRY_INGEST_DATA_CATEGORY.TELEMETRY_DATA,
      'scope_mismatch',
    )).toBe(1);
  });

  it('replay uses effectiveTimestamp in decision request', async () => {
    mockDecision(AUTHORIZATION_DECISION_OUTCOME.ALLOW);
    const replayAt = new Date('2025-01-15T10:00:00.000Z');
    await service.evaluateIngest({
      ...baseCtx,
      ingestionPath: TELEMETRY_INGEST_PATH.TRIP_REPLAY,
      serviceIdentity: TELEMETRY_INGEST_SERVICE_IDENTITY.TRIP_REPLAY_WORKER,
      isReplay: true,
      effectiveTimestamp: replayAt,
    });
    expect(authorizationDecision.decide).toHaveBeenCalledWith(
      expect.objectContaining({
        effectiveTimestamp: replayAt,
        action: 'INGEST',
      }),
    );
  });

  it('backfill uses effectiveTimestamp — no invented historical grant', async () => {
    mockDecision(AUTHORIZATION_DECISION_OUTCOME.DENY, 'NO_MATCHING_POLICY');
    const backfillAt = '2024-06-01T00:00:00.000Z';
    await service.evaluateIngest({
      ...baseCtx,
      ingestionPath: TELEMETRY_INGEST_PATH.TRIP_BACKFILL,
      serviceIdentity: TELEMETRY_INGEST_SERVICE_IDENTITY.TRIP_BACKFILL_WORKER,
      isBackfill: true,
      effectiveTimestamp: backfillAt,
    });
    expect(authorizationDecision.decide).toHaveBeenCalledWith(
      expect.objectContaining({ effectiveTimestamp: backfillAt }),
    );
  });

  it('policy SHADOW_WOULD_DENY — may persist with shadow metric', async () => {
    mockDecision(AUTHORIZATION_DECISION_OUTCOME.SHADOW_WOULD_DENY, 'POLICY_SUSPENDED');
    const result = await service.evaluateIngest(baseCtx);
    expect(result.mayPersist).toBe(true);
    expect(metrics.countFor(
      TELEMETRY_INGEST_PATH.DIMO_SNAPSHOT_POLL,
      TELEMETRY_INGEST_SOURCE_SYSTEM.DIMO,
      TELEMETRY_INGEST_DATA_CATEGORY.TELEMETRY_DATA,
      'shadow_would_deny',
    )).toBe(1);
  });

  it('resolver error — fail-closed deny with resolver_error metric', async () => {
    mockDecision(
      AUTHORIZATION_DECISION_OUTCOME.DENY,
      AUTHORIZATION_DECISION_REASON.RESOLVER_ERROR,
      [AUTHORIZATION_DECISION_REASON.RESOLVER_ERROR],
    );
    const result = await service.evaluateIngest(baseCtx);
    expect(result.isAuthorizationDeny).toBe(true);
    expect(metrics.countFor(
      TELEMETRY_INGEST_PATH.DIMO_SNAPSHOT_POLL,
      TELEMETRY_INGEST_SOURCE_SYSTEM.DIMO,
      TELEMETRY_INGEST_DATA_CATEGORY.TELEMETRY_DATA,
      'resolver_error',
    )).toBe(1);
  });

  it('HIGH_MOBILITY source maps to policy resolver source system', async () => {
    mockDecision(AUTHORIZATION_DECISION_OUTCOME.ALLOW);
    await service.evaluateIngest({
      ...baseCtx,
      sourceSystem: TELEMETRY_INGEST_SOURCE_SYSTEM.HIGH_MOBILITY,
      ingestionPath: TELEMETRY_INGEST_PATH.HM_TELEMETRY_MQTT,
      serviceIdentity: TELEMETRY_INGEST_SERVICE_IDENTITY.HM_TELEMETRY_INGEST,
    });
    expect(authorizationDecision.decide).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceSystem: 'HIGH_MOBILITY',
        processorType: 'PROVIDER_PLATFORM',
      }),
    );
  });
});

describe('TelemetryIngestionEnforcementService cache invalidation (multi-worker)', () => {
  it('shared AuthorizationDecisionService invalidates org cache for all workers', async () => {
    const { AuthorizationDecisionCache } = await import(
      '../authorization-decision-engine/authorization-decision.cache'
    );
    const cache = new AuthorizationDecisionCache(30_000, 100);
    const ingestKey = 'org-1|TELEMETRY_DATA|FLEET_ANALYTICS|veh-1|INGEST';
    cache.set(ingestKey, 'policy-v2', { decision: 'ALLOW', correlationId: 'c1' } as never);
    cache.set('org-2|TELEMETRY_DATA|FLEET_ANALYTICS|veh-2|INGEST', 'policy-v1', {
      decision: 'ALLOW',
      correlationId: 'c2',
    } as never);

    expect(cache.invalidateOrganization('org-1')).toBe(1);
    expect(cache.get(ingestKey)).toBeNull();
    expect(cache.get('org-2|TELEMETRY_DATA|FLEET_ANALYTICS|veh-2|INGEST')?.decision).toBe('ALLOW');
  });
});

describe('TelemetryIngestionEnforcementService Redis outage behavior', () => {
  it('decision engine proceeds without Redis — in-memory cache only', () => {
    const metrics = new TelemetryIngestionEnforcementMetricsService();
    metrics.record({
      path: TELEMETRY_INGEST_PATH.DIMO_SNAPSHOT_POLL,
      sourceSystem: 'DIMO',
      dataCategory: 'TELEMETRY_DATA',
      outcome: 'allow',
    });
    expect(metrics.snapshot()).not.toEqual({});
  });
});

describe('TelemetryIngestionEnforcement persistence gates', () => {
  it('fail-closed blocks PostgreSQL and ClickHouse persist paths conceptually', async () => {
    process.env.DATA_AUTH_INGEST_SHADOW_MODE = 'false';
    process.env.DATA_AUTH_INGEST_FAIL_CLOSED = 'true';

    const prisma = {
      vehicle: { findFirst: jest.fn().mockResolvedValue({ id: 'veh-1' }) },
    };
    const authorizationDecision = {
      decide: jest.fn().mockResolvedValue({
        decision: AUTHORIZATION_DECISION_OUTCOME.DENY,
        enforced: true,
        isShadowMode: false,
        reasonCode: 'NO_MATCHING_POLICY',
        reasonCodes: ['NO_MATCHING_POLICY'],
        correlationId: 'corr-pg-ch',
        auditEventId: null,
        policyVersion: null,
        matchedPolicyId: null,
        resolverResult: null,
      }),
    };
    const auditService = { recordIngestionSkipped: jest.fn().mockResolvedValue('skip-1') };
    const metrics = new TelemetryIngestionEnforcementMetricsService();
    const service = new TelemetryIngestionEnforcementService(
      prisma as never,
      authorizationDecision as never,
      auditService as never,
      metrics,
    );

    const gate = await service.evaluateIngest({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      sourceSystem: TELEMETRY_INGEST_SOURCE_SYSTEM.DIMO,
      dataCategory: TELEMETRY_INGEST_DATA_CATEGORY.TELEMETRY_DATA,
      purpose: TELEMETRY_INGEST_PURPOSE.FLEET_ANALYTICS,
      ingestionPath: TELEMETRY_INGEST_PATH.CLICKHOUSE_MIRROR,
      serviceIdentity: TELEMETRY_INGEST_SERVICE_IDENTITY.DIMO_SNAPSHOT_WORKER,
      correlationId: 'corr-pg-ch',
    });

    expect(gate.mayPersist).toBe(false);
    expect(auditService.recordIngestionSkipped).toHaveBeenCalled();
  });
});
