import { AuthorizationActorType } from '@prisma/client';
import {
  AUTHORIZATION_DECISION_OUTCOME,
  AUTHORIZATION_DECISION_REASON,
} from '../authorization-decision-engine/authorization-decision.constants';
import { LiveGpsEnforcementService } from '../live-gps-enforcement/live-gps-enforcement.service';
import { DataAuthorizationAuditService } from '../privacy-domain/audit-log/data-authorization-audit.service';
import { TripLocationEnforcementMetricsService } from './trip-location-enforcement.metrics';
import { TripLocationEnforcementService } from './trip-location-enforcement.service';
import {
  TRIP_LOCATION_ACTION,
  TRIP_LOCATION_DATA_CATEGORY,
  TRIP_LOCATION_PATH,
  TRIP_LOCATION_PURPOSE,
  TRIP_LOCATION_SERVICE_IDENTITY,
} from './trip-location-enforcement.constants';

describe('TripLocationEnforcementService', () => {
  const baseCtx = {
    organizationId: 'org-1',
    vehicleId: 'veh-1',
    dataCategory: TRIP_LOCATION_DATA_CATEGORY.GPS_LOCATION,
    purpose: TRIP_LOCATION_PURPOSE.TRIPS,
    processingPath: TRIP_LOCATION_PATH.TRIP_CREATE,
    serviceIdentity: TRIP_LOCATION_SERVICE_IDENTITY.TRIP_TRACKING_WORKER,
    correlationId: 'corr-trip-1',
  };

  let prisma: {
    vehicle: { findFirst: jest.Mock };
    customer: { findFirst: jest.Mock };
    booking: { findFirst: jest.Mock };
  };
  let authorizationDecision: { decide: jest.Mock };
  let liveGps: {
    isVehicleGpsReadAllowed: jest.Mock;
    assertVehicleGpsRead: jest.Mock;
  };
  let auditService: { recordIngestionSkipped: jest.Mock };
  let metrics: TripLocationEnforcementMetricsService;
  let service: TripLocationEnforcementService;

  beforeEach(() => {
    prisma = {
      vehicle: { findFirst: jest.fn().mockResolvedValue({ id: 'veh-1' }) },
      customer: { findFirst: jest.fn().mockResolvedValue({ id: 'cust-1' }) },
      booking: { findFirst: jest.fn().mockResolvedValue({ id: 'book-1' }) },
    };
    authorizationDecision = { decide: jest.fn() };
    liveGps = {
      isVehicleGpsReadAllowed: jest.fn().mockResolvedValue(true),
      assertVehicleGpsRead: jest.fn().mockResolvedValue(undefined),
    };
    auditService = { recordIngestionSkipped: jest.fn().mockResolvedValue('audit-1') };
    metrics = new TripLocationEnforcementMetricsService();
    service = new TripLocationEnforcementService(
      prisma as never,
      authorizationDecision as never,
      liveGps as unknown as LiveGpsEnforcementService,
      auditService as unknown as DataAuthorizationAuditService,
      metrics,
    );
    process.env.DATA_AUTH_TRIP_LOCATION_SHADOW_MODE = 'true';
    delete process.env.DATA_AUTH_TRIP_LOCATION_FAIL_CLOSED;
  });

  afterEach(() => {
    metrics.reset();
    delete process.env.DATA_AUTH_TRIP_LOCATION_SHADOW_MODE;
    delete process.env.DATA_AUTH_TRIP_LOCATION_FAIL_CLOSED;
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

  it('trip creation ALLOW — may ingest', async () => {
    mockDecision(AUTHORIZATION_DECISION_OUTCOME.ALLOW);
    const result = await service.evaluate({
      ...baseCtx,
      action: TRIP_LOCATION_ACTION.INGEST,
    });
    expect(result.mayProceed).toBe(true);
    expect(authorizationDecision.decide).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'INGEST',
        dataCategory: 'GPS_LOCATION',
        actorType: AuthorizationActorType.SYSTEM,
      }),
    );
  });

  it('trip creation DENY in fail-closed — blocks ingest', async () => {
    process.env.DATA_AUTH_TRIP_LOCATION_SHADOW_MODE = 'false';
    process.env.DATA_AUTH_TRIP_LOCATION_FAIL_CLOSED = 'true';
    mockDecision(AUTHORIZATION_DECISION_OUTCOME.DENY, 'PROVIDER_GRANT_REVOKED');
    const result = await service.evaluate({
      ...baseCtx,
      action: TRIP_LOCATION_ACTION.INGEST,
    });
    expect(result.mayProceed).toBe(false);
    expect(auditService.recordIngestionSkipped).toHaveBeenCalled();
  });

  it('waypoint persist uses INGEST action', async () => {
    mockDecision(AUTHORIZATION_DECISION_OUTCOME.ALLOW);
    await service.mayIngest({
      ...baseCtx,
      processingPath: TRIP_LOCATION_PATH.TRIP_WAYPOINT_PERSIST,
    });
    expect(authorizationDecision.decide).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'INGEST' }),
    );
  });

  it('historical display READ delegates to LiveGpsEnforcement', async () => {
    liveGps.isVehicleGpsReadAllowed.mockResolvedValue(false);
    const result = await service.evaluate({
      ...baseCtx,
      action: TRIP_LOCATION_ACTION.READ,
      processingPath: TRIP_LOCATION_PATH.TRIP_LIST_READ,
      serviceIdentity: TRIP_LOCATION_SERVICE_IDENTITY.TRIPS_LIST_API,
    });
    expect(result.mayProceed).toBe(false);
    expect(liveGps.isVehicleGpsReadAllowed).toHaveBeenCalled();
  });

  it('EXPORT requires explicit EXPORT action', async () => {
    mockDecision(AUTHORIZATION_DECISION_OUTCOME.DENY, 'NO_MATCHING_POLICY');
    const result = await service.assertExport({
      ...baseCtx,
      processingPath: TRIP_LOCATION_PATH.TRIP_EXPORT,
      serviceIdentity: TRIP_LOCATION_SERVICE_IDENTITY.TRIPS_EXPORT_API,
    });
    expect(authorizationDecision.decide).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'EXPORT' }),
    );
    expect(result.mayProceed).toBe(true);
  });

  it('wrong customer — tenant mismatch on ingest', async () => {
    prisma.customer.findFirst.mockResolvedValue(null);
    const result = await service.evaluate({
      ...baseCtx,
      action: TRIP_LOCATION_ACTION.INGEST,
      customerId: 'foreign-cust',
    });
    expect(result.mayProceed).toBe(false);
    expect(result.reasonCode).toBe('TENANT_MISMATCH');
    expect(authorizationDecision.decide).not.toHaveBeenCalled();
  });

  it('wrong booking — scope mismatch', async () => {
    prisma.booking.findFirst.mockResolvedValue(null);
    const result = await service.evaluate({
      ...baseCtx,
      action: TRIP_LOCATION_ACTION.DERIVE,
      bookingId: 'foreign-booking',
    });
    expect(result.mayProceed).toBe(false);
    expect(result.reasonCode).toBe('SCOPE_MISMATCH');
  });

  it('foreign vehicle — tenant mismatch', async () => {
    prisma.vehicle.findFirst.mockResolvedValue(null);
    const result = await service.evaluate({
      ...baseCtx,
      action: TRIP_LOCATION_ACTION.INGEST,
    });
    expect(result.mayProceed).toBe(false);
    expect(result.reasonCode).toBe('TENANT_MISMATCH');
  });

  it('reprocessing after revoke uses effectiveTimestamp', async () => {
    mockDecision(AUTHORIZATION_DECISION_OUTCOME.DENY, 'PROVIDER_GRANT_REVOKED');
    const replayAt = new Date('2025-03-01T00:00:00.000Z');
    await service.mayDerive({
      ...baseCtx,
      processingPath: TRIP_LOCATION_PATH.TRIP_REPLAY,
      effectiveTimestamp: replayAt,
      isReplay: true,
    });
    expect(authorizationDecision.decide).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'DERIVE',
        effectiveTimestamp: replayAt,
      }),
    );
  });

  it('applyTripSummaryGate redacts coordinates when READ denied', async () => {
    liveGps.isVehicleGpsReadAllowed.mockResolvedValue(false);
    const gated = await service.applyTripSummaryGate(
      'org-1',
      [
        {
          id: 't1',
          vehicleId: 'veh-1',
          startLatitude: 52.1,
          startLongitude: 13.4,
          endLatitude: 52.2,
          endLongitude: 13.5,
        },
      ],
      'trip-list',
    );
    expect(gated[0].startLatitude).toBeNull();
    expect(gated[0].endLatitude).toBeNull();
  });

  it('heatmap/read path records deny metric', async () => {
    liveGps.isVehicleGpsReadAllowed.mockResolvedValue(false);
    await service.isReadAllowed({
      ...baseCtx,
      processingPath: TRIP_LOCATION_PATH.TRIP_HEATMAP,
      serviceIdentity: TRIP_LOCATION_SERVICE_IDENTITY.TRIPS_LIST_API,
    });
    expect(
      metrics.countFor(TRIP_LOCATION_PATH.TRIP_HEATMAP, 'READ', 'GPS_LOCATION', 'deny'),
    ).toBe(1);
  });

  it('resolver error on derive — no legacy fallback', async () => {
    mockDecision(
      AUTHORIZATION_DECISION_OUTCOME.DENY,
      AUTHORIZATION_DECISION_REASON.RESOLVER_ERROR,
    );
    const result = await service.evaluate({
      ...baseCtx,
      action: TRIP_LOCATION_ACTION.DERIVE,
      processingPath: TRIP_LOCATION_PATH.TRIP_ENRICH,
    });
    expect(result.isAuthorizationDeny).toBe(true);
    expect(
      metrics.countFor(TRIP_LOCATION_PATH.TRIP_ENRICH, 'DERIVE', 'GPS_LOCATION', 'resolver_error'),
    ).toBe(1);
  });
});
