import { AuthorizationActorType } from '@prisma/client';
import {
  AUTHORIZATION_DECISION_OUTCOME,
  AUTHORIZATION_DECISION_REASON,
} from '../authorization-decision-engine/authorization-decision.constants';
import { DataAuthorizationAuditService } from '../privacy-domain/audit-log/data-authorization-audit.service';
import { DrivingBehaviorEnforcementMetricsService } from './driving-behavior-enforcement.metrics';
import { DrivingBehaviorEnforcementService } from './driving-behavior-enforcement.service';
import {
  DRIVING_BEHAVIOR_ACTION,
  DRIVING_BEHAVIOR_DATA_CATEGORY,
  DRIVING_BEHAVIOR_PATH,
  DRIVING_BEHAVIOR_PURPOSE,
  DRIVING_BEHAVIOR_SERVICE_IDENTITY,
} from './driving-behavior-enforcement.constants';

describe('DrivingBehaviorEnforcementService', () => {
  const baseCtx = {
    organizationId: 'org-1',
    vehicleId: 'veh-1',
    dataCategory: DRIVING_BEHAVIOR_DATA_CATEGORY.DRIVING_BEHAVIOR,
    purpose: DRIVING_BEHAVIOR_PURPOSE.TECHNICAL_EVENT_DETECTION,
    processingPath: DRIVING_BEHAVIOR_PATH.BEHAVIOR_EVENT_DERIVE,
    serviceIdentity: DRIVING_BEHAVIOR_SERVICE_IDENTITY.BEHAVIOR_ENRICH_WORKER,
    correlationId: 'corr-behavior-1',
  };

  let prisma: {
    vehicle: { findFirst: jest.Mock; findUnique: jest.Mock };
    booking: { findFirst: jest.Mock };
  };
  let authorizationDecision: { decide: jest.Mock };
  let auditService: { recordIngestionSkipped: jest.Mock };
  let metrics: DrivingBehaviorEnforcementMetricsService;
  let service: DrivingBehaviorEnforcementService;

  beforeEach(() => {
    prisma = {
      vehicle: {
        findFirst: jest.fn().mockResolvedValue({ id: 'veh-1' }),
        findUnique: jest.fn().mockResolvedValue({ organizationId: 'org-1' }),
      },
      booking: { findFirst: jest.fn().mockResolvedValue({ id: 'book-1' }) },
    };
    authorizationDecision = { decide: jest.fn() };
    auditService = { recordIngestionSkipped: jest.fn().mockResolvedValue('audit-1') };
    metrics = new DrivingBehaviorEnforcementMetricsService();
    service = new DrivingBehaviorEnforcementService(
      prisma as never,
      authorizationDecision as never,
      auditService as unknown as DataAuthorizationAuditService,
      metrics,
    );
    process.env.DATA_AUTH_DRIVING_BEHAVIOR_SHADOW_MODE = 'true';
    delete process.env.DATA_AUTH_DRIVING_BEHAVIOR_FAIL_CLOSED;
  });

  afterEach(() => {
    metrics.reset();
    delete process.env.DATA_AUTH_DRIVING_BEHAVIOR_SHADOW_MODE;
    delete process.env.DATA_AUTH_DRIVING_BEHAVIOR_FAIL_CLOSED;
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

  it('technical event detection uses DERIVE action', async () => {
    mockDecision(AUTHORIZATION_DECISION_OUTCOME.ALLOW);
    await service.mayDerive(baseCtx);
    expect(authorizationDecision.decide).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'DERIVE',
        dataCategory: 'DRIVING_BEHAVIOR',
        purpose: 'TECHNICAL_OVERVIEW',
        actorType: AuthorizationActorType.SYSTEM,
      }),
    );
  });

  it('misuse aggregation uses PROFILE with ABUSE_MISUSE_DETECTION purpose', async () => {
    mockDecision(AUTHORIZATION_DECISION_OUTCOME.ALLOW);
    await service.mayProfile({
      ...baseCtx,
      purpose: DRIVING_BEHAVIOR_PURPOSE.MISUSE_DETECTION,
      processingPath: DRIVING_BEHAVIOR_PATH.MISUSE_AGGREGATE,
      serviceIdentity: DRIVING_BEHAVIOR_SERVICE_IDENTITY.MISUSE_RECONCILE,
    });
    expect(authorizationDecision.decide).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'PROFILE',
        purpose: 'ABUSE_MISUSE_DETECTION',
      }),
    );
  });

  it('profiling cannot use FLEET_ANALYTICS purpose — purpose mismatch', async () => {
    const allowed = await service.mayProfile({
      ...baseCtx,
      purpose: DRIVING_BEHAVIOR_PURPOSE.FLEET_OPERATIONS,
      processingPath: DRIVING_BEHAVIOR_PATH.DRIVER_SCORE_AGGREGATE,
    });
    expect(allowed).toBe(false);
    expect(authorizationDecision.decide).not.toHaveBeenCalled();
    expect(
      metrics.countFor(
        DRIVING_BEHAVIOR_PATH.DRIVER_SCORE_AGGREGATE,
        'PROFILE',
        'DRIVING_BEHAVIOR',
        'purpose_mismatch',
      ),
    ).toBe(1);
  });

  it('derive cannot use RENTAL_ANALYTICS purpose — no implicit profiling', async () => {
    const allowed = await service.mayDerive({
      ...baseCtx,
      purpose: DRIVING_BEHAVIOR_PURPOSE.DRIVER_PROFILING,
    });
    expect(allowed).toBe(false);
    expect(authorizationDecision.decide).not.toHaveBeenCalled();
  });

  it('PROFILE DENY in fail-closed blocks misuse aggregation', async () => {
    process.env.DATA_AUTH_DRIVING_BEHAVIOR_SHADOW_MODE = 'false';
    process.env.DATA_AUTH_DRIVING_BEHAVIOR_FAIL_CLOSED = 'true';
    mockDecision(AUTHORIZATION_DECISION_OUTCOME.DENY, 'DPIA_MISSING');
    const allowed = await service.mayProfile({
      ...baseCtx,
      purpose: DRIVING_BEHAVIOR_PURPOSE.MISUSE_DETECTION,
      processingPath: DRIVING_BEHAVIOR_PATH.MISUSE_AGGREGATE,
    });
    expect(allowed).toBe(false);
    expect(auditService.recordIngestionSkipped).toHaveBeenCalled();
  });

  it('driver score READ requires explicit READ decision', async () => {
    mockDecision(AUTHORIZATION_DECISION_OUTCOME.DENY, 'NO_MATCHING_POLICY');
    const allowed = await service.isReadAllowed({
      ...baseCtx,
      purpose: DRIVING_BEHAVIOR_PURPOSE.DRIVER_PROFILING,
      processingPath: DRIVING_BEHAVIOR_PATH.DRIVER_SCORE_READ,
      serviceIdentity: DRIVING_BEHAVIOR_SERVICE_IDENTITY.DRIVER_SCORE_API,
    });
    expect(authorizationDecision.decide).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'READ' }),
    );
    expect(allowed).toBe(true);
  });

  it('USE_FOR_AI requires explicit action', async () => {
    mockDecision(AUTHORIZATION_DECISION_OUTCOME.DENY);
    await service.mayUseForAi({
      ...baseCtx,
      processingPath: DRIVING_BEHAVIOR_PATH.BEHAVIOR_AI,
      serviceIdentity: DRIVING_BEHAVIOR_SERVICE_IDENTITY.BEHAVIOR_AI,
      purpose: DRIVING_BEHAVIOR_PURPOSE.AUTOMATED_ASSESSMENT,
    });
    expect(authorizationDecision.decide).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'USE_FOR_AI' }),
    );
  });

  it('EXPORT requires explicit action', async () => {
    mockDecision(AUTHORIZATION_DECISION_OUTCOME.DENY);
    await service.mayExport({
      ...baseCtx,
      processingPath: DRIVING_BEHAVIOR_PATH.BEHAVIOR_EXPORT,
      serviceIdentity: DRIVING_BEHAVIOR_SERVICE_IDENTITY.BEHAVIOR_EXPORT_API,
    });
    expect(authorizationDecision.decide).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'EXPORT' }),
    );
  });

  it('NOTIFY gates automated follow-up actions separately', async () => {
    mockDecision(AUTHORIZATION_DECISION_OUTCOME.ALLOW);
    await service.mayNotify({
      ...baseCtx,
      purpose: DRIVING_BEHAVIOR_PURPOSE.MISUSE_DETECTION,
      processingPath: DRIVING_BEHAVIOR_PATH.BEHAVIOR_NOTIFY,
      serviceIdentity: DRIVING_BEHAVIOR_SERVICE_IDENTITY.BEHAVIOR_NOTIFY,
    });
    expect(authorizationDecision.decide).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'NOTIFY' }),
    );
  });

  it('foreign vehicle — tenant mismatch', async () => {
    prisma.vehicle.findFirst.mockResolvedValue(null);
    const result = await service.evaluate({
      ...baseCtx,
      action: DRIVING_BEHAVIOR_ACTION.DERIVE,
    });
    expect(result.mayProceed).toBe(false);
    expect(result.reasonCode).toBe('TENANT_MISMATCH');
  });

  it('revoked policy on reprocess uses effectiveTimestamp — no retroactive bypass', async () => {
    mockDecision(AUTHORIZATION_DECISION_OUTCOME.DENY, 'PROVIDER_GRANT_REVOKED');
    const replayAt = new Date('2025-03-01T00:00:00.000Z');
    await service.mayProfile({
      ...baseCtx,
      purpose: DRIVING_BEHAVIOR_PURPOSE.AUTOMATED_ASSESSMENT,
      processingPath: DRIVING_BEHAVIOR_PATH.TRIP_DECISION_SUMMARY,
      effectiveTimestamp: replayAt,
      isReprocess: true,
    });
    expect(authorizationDecision.decide).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'PROFILE',
        effectiveTimestamp: replayAt,
      }),
    );
  });

  it('booking scope mismatch blocks profile', async () => {
    prisma.booking.findFirst.mockResolvedValue(null);
    const result = await service.evaluate({
      ...baseCtx,
      action: DRIVING_BEHAVIOR_ACTION.PROFILE,
      purpose: DRIVING_BEHAVIOR_PURPOSE.BOOKING_RISK,
      bookingId: 'foreign-booking',
    });
    expect(result.mayProceed).toBe(false);
    expect(result.reasonCode).toBe('SCOPE_MISMATCH');
  });

  it('emptyDriverScoreSummary hides scores on READ deny', () => {
    const summary = service.emptyDriverScoreSummary('CUSTOMER', 'cust-1');
    expect(summary.drivingStressScore).toBeNull();
    expect(summary.accessDenied).toBe(true);
  });

  it('resolver error on profile — no legacy fallback', async () => {
    mockDecision(
      AUTHORIZATION_DECISION_OUTCOME.DENY,
      AUTHORIZATION_DECISION_REASON.RESOLVER_ERROR,
    );
    const result = await service.evaluate({
      ...baseCtx,
      action: DRIVING_BEHAVIOR_ACTION.PROFILE,
      purpose: DRIVING_BEHAVIOR_PURPOSE.MISUSE_DETECTION,
      processingPath: DRIVING_BEHAVIOR_PATH.MISUSE_AGGREGATE,
    });
    expect(result.isAuthorizationDeny).toBe(true);
    expect(
      metrics.countFor(
        DRIVING_BEHAVIOR_PATH.MISUSE_AGGREGATE,
        'PROFILE',
        'DRIVING_BEHAVIOR',
        'resolver_error',
      ),
    ).toBe(1);
  });
});
