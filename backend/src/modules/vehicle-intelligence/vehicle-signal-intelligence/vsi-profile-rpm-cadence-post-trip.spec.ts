import type { Logger } from '@nestjs/common';
import {
  logVsiPostTripRpmCadenceDecision,
  refreshVsiRpmCadenceAfterTrip,
  resolvePostTripRpmCadenceHfEvidenceReady,
} from './vsi-profile-rpm-cadence-post-trip';
import type { VsiSignalProfileMaterializationService } from './vsi-profile-materialization.service';
import type { PrismaService } from '../../../shared/database/prisma.service';

describe('resolvePostTripRpmCadenceHfEvidenceReady', () => {
  const ids = { vehicleId: 'veh-1', tripId: 'trip-1' };

  it('returns true when new HF points were inserted this run', async () => {
    const ready = await resolvePostTripRpmCadenceHfEvidenceReady({
      ...ids,
      pointsInserted: 12,
      hasTripHfPoints: jest.fn().mockResolvedValue(false),
    });
    expect(ready).toBe(true);
  });

  it('returns true when pointsInserted=0 but trip HF points already exist in ClickHouse', async () => {
    const hasTripHfPoints = jest.fn().mockResolvedValue(true);
    const ready = await resolvePostTripRpmCadenceHfEvidenceReady({
      ...ids,
      pointsInserted: 0,
      hasTripHfPoints,
    });
    expect(ready).toBe(true);
    expect(hasTripHfPoints).toHaveBeenCalledWith('veh-1', 'trip-1');
  });

  it('returns false when no points inserted and ClickHouse reports none for the trip', async () => {
    const ready = await resolvePostTripRpmCadenceHfEvidenceReady({
      ...ids,
      pointsInserted: 0,
      hasTripHfPoints: jest.fn().mockResolvedValue(false),
    });
    expect(ready).toBe(false);
  });

  it('returns false when ClickHouse probe is unavailable (no hasTripHfPoints)', async () => {
    const ready = await resolvePostTripRpmCadenceHfEvidenceReady({
      ...ids,
      pointsInserted: 0,
    });
    expect(ready).toBe(false);
  });

  it('returns false when ClickHouse probe throws (fail closed)', async () => {
    const ready = await resolvePostTripRpmCadenceHfEvidenceReady({
      ...ids,
      pointsInserted: 0,
      hasTripHfPoints: jest.fn().mockRejectedValue(new Error('clickhouse down')),
    });
    expect(ready).toBe(false);
  });
});

describe('refreshVsiRpmCadenceAfterTrip', () => {
  const logger: Logger = {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    verbose: jest.fn(),
  } as unknown as Logger;

  const materialization = {
    materializeFromPersistedEvidence: jest.fn().mockResolvedValue({}),
  } as unknown as VsiSignalProfileMaterializationService;

  const prisma = {} as PrismaService;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('triggers TRIP_FINALIZED_RPM_CADENCE when HF trip points are ready', async () => {
    await refreshVsiRpmCadenceAfterTrip({
      prisma,
      materialization,
      logger,
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      tripId: 'trip-1',
      providerSourceLinkId: 'link-1',
      hfTripPointsReady: true,
    });

    expect(materialization.materializeFromPersistedEvidence).toHaveBeenCalledWith({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      providerSourceLinkId: 'link-1',
      requireBindingMatch: true,
      lifecycleMode: 'TRIP_FINALIZED_RPM_CADENCE',
      rpmCadenceTripId: 'trip-1',
    });
    expect(logger.log).toHaveBeenCalledWith(
      expect.stringContaining('"outcome":"TRIGGER"'),
    );
  });

  it('skips safely when HF evidence is not proven', async () => {
    await refreshVsiRpmCadenceAfterTrip({
      prisma,
      materialization,
      logger,
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      tripId: 'trip-1',
      providerSourceLinkId: 'link-1',
      hfTripPointsReady: false,
    });

    expect(materialization.materializeFromPersistedEvidence).not.toHaveBeenCalled();
    expect(logger.log).toHaveBeenCalledWith(
      expect.stringContaining('"skipReason":"HF_EVIDENCE_NOT_PROVEN"'),
    );
  });

  it('skips when organization is missing', async () => {
    await refreshVsiRpmCadenceAfterTrip({
      prisma,
      materialization,
      logger,
      organizationId: null,
      vehicleId: 'veh-1',
      tripId: 'trip-1',
      providerSourceLinkId: 'link-1',
      hfTripPointsReady: true,
    });

    expect(materialization.materializeFromPersistedEvidence).not.toHaveBeenCalled();
    expect(logger.log).toHaveBeenCalledWith(
      expect.stringContaining('"skipReason":"ORGANIZATION_MISSING"'),
    );
  });

  it('skips when DIMO source link is missing', async () => {
    await refreshVsiRpmCadenceAfterTrip({
      prisma,
      materialization,
      logger,
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      tripId: 'trip-1',
      providerSourceLinkId: null,
      hfTripPointsReady: true,
    });

    expect(materialization.materializeFromPersistedEvidence).not.toHaveBeenCalled();
    expect(logger.log).toHaveBeenCalledWith(
      expect.stringContaining('"skipReason":"SOURCE_LINK_MISSING"'),
    );
  });

  it('logs materialization failure without throwing', async () => {
    (materialization.materializeFromPersistedEvidence as jest.Mock).mockRejectedValueOnce(
      new Error('persist failed'),
    );

    await expect(
      refreshVsiRpmCadenceAfterTrip({
        prisma,
        materialization,
        logger,
        organizationId: 'org-1',
        vehicleId: 'veh-1',
        tripId: 'trip-1',
        providerSourceLinkId: 'link-1',
        hfTripPointsReady: true,
      }),
    ).resolves.toBeUndefined();

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('"outcome":"MATERIALIZATION_FAILED"'),
    );
  });

  it('repeated post-trip calls remain idempotent at the hook layer (delegate to materialization)', async () => {
    await refreshVsiRpmCadenceAfterTrip({
      prisma,
      materialization,
      logger,
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      tripId: 'trip-1',
      providerSourceLinkId: 'link-1',
      hfTripPointsReady: true,
    });
    await refreshVsiRpmCadenceAfterTrip({
      prisma,
      materialization,
      logger,
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      tripId: 'trip-1',
      providerSourceLinkId: 'link-1',
      hfTripPointsReady: true,
    });

    expect(materialization.materializeFromPersistedEvidence).toHaveBeenCalledTimes(2);
  });
});

describe('logVsiPostTripRpmCadenceDecision', () => {
  it('emits structured JSON for skip decisions', () => {
    const logger = { log: jest.fn(), warn: jest.fn() } as unknown as Logger;
    logVsiPostTripRpmCadenceDecision(logger, {
      tripId: 't1',
      vehicleId: 'v1',
      decision: { outcome: 'SKIP', skipReason: 'HF_EVIDENCE_NOT_PROVEN' },
    });
    expect(logger.log).toHaveBeenCalledWith(
      expect.stringMatching(/"event":"VSI_POST_TRIP_RPM_CADENCE"/),
    );
  });
});
