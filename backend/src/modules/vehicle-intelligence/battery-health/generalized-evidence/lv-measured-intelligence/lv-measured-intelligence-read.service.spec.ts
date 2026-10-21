import { NotFoundException } from '@nestjs/common';
import {
  BatteryGeneralizedEvidenceClass,
  BatteryRestSessionFeatureComputationPhase,
  BatteryRestSessionFeatureSessionTrust,
  BatteryRestSessionStatus,
} from '@prisma/client';
import { LvMeasuredIntelligenceReadService } from './lv-measured-intelligence-read.service';
import {
  LV_MEASURED_INTELLIGENCE_MAX_OBSERVATION_LIMIT,
  LV_MEASURED_INTELLIGENCE_MAX_SESSION_LIMIT,
} from './lv-measured-intelligence.constants';

function buildService(overrides: {
  vehicleExists: boolean;
  sessions?: unknown[];
  observations?: unknown[];
  globalLatestObservation?: unknown | null;
  sessionObservations?: unknown[];
  featureRows?: unknown[];
  featureCount?: number;
  gapCount?: number;
  latestD3?: { id: string; createdAt: Date } | null;
  d4Inspect?: { status: string; view?: { ackCount: number } };
}) {
  const prisma = {
    vehicle: {
      findFirst: jest.fn().mockResolvedValue(overrides.vehicleExists ? { id: 'v1' } : null),
    },
    batteryRestSession: { findMany: jest.fn().mockResolvedValue(overrides.sessions ?? []) },
    batteryGeneralizedEvidenceObservation: {
      findMany: jest.fn().mockImplementation((args: { where?: { restSessionId?: unknown } }) => {
        if (args.where?.restSessionId) {
          return Promise.resolve(overrides.sessionObservations ?? []);
        }
        return Promise.resolve(overrides.observations ?? []);
      }),
      findFirst: jest.fn().mockResolvedValue(overrides.globalLatestObservation ?? null),
    },
    batteryRestSessionFeature: {
      count: jest.fn().mockResolvedValue(overrides.featureCount ?? 0),
      findMany: jest.fn().mockResolvedValue(overrides.featureRows ?? []),
    },
    batteryProviderObservabilityGap: {
      count: jest.fn().mockResolvedValue(overrides.gapCount ?? 0),
    },
    batteryLongitudinalProfileRevision: {
      findFirst: jest.fn().mockResolvedValue(overrides.latestD3 ?? null),
    },
  };
  const d4Inspection = {
    inspectRevision: jest.fn().mockResolvedValue(
      overrides.d4Inspect ?? { status: 'NOT_FOUND' },
    ),
  };
  const service = new LvMeasuredIntelligenceReadService(prisma as never, d4Inspection as never);
  return { service, prisma, d4Inspection };
}

describe('LvMeasuredIntelligenceReadService', () => {
  const org = 'org-a';
  const vehicle = 'veh-a';

  it('rejects cross-tenant vehicle lookup (org scope)', async () => {
    const { service } = buildService({ vehicleExists: false });
    await expect(
      service.readVehicleIntelligence({ organizationId: org, vehicleId: vehicle }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('clamps session and observation limits to configured maximums', async () => {
    const { service, prisma } = buildService({ vehicleExists: true });
    await service.readVehicleIntelligence({
      organizationId: org,
      vehicleId: vehicle,
      sessionLimit: 999,
      observationLimit: 9999,
    });
    expect(prisma.batteryRestSession.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: LV_MEASURED_INTELLIGENCE_MAX_SESSION_LIMIT }),
    );
    expect(prisma.batteryGeneralizedEvidenceObservation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: LV_MEASURED_INTELLIGENCE_MAX_OBSERVATION_LIMIT }),
    );
  });

  it('preserves driving vs charging operational context from evidence class and charging flag', async () => {
    const at = new Date('2026-03-01T10:00:00Z');
    const { service } = buildService({
      vehicleExists: true,
      observations: [
        {
          id: 'o-drive',
          sourceMeasurementId: 'm-drive',
          voltage: 12.1,
          voltageObservedAt: at,
          providerObservationAt: at,
          providerTimestampSource: 'PROVIDER_FIELD_TIMESTAMP',
          evidenceClass: BatteryGeneralizedEvidenceClass.DRIVING_NON_CHARGING,
          restSessionId: null,
          actualRestAgeMs: null,
          nominalRestIntervalIndex: null,
          isLvCharging: false,
          engineRunning: true,
          createdAt: at,
        },
        {
          id: 'o-charge',
          sourceMeasurementId: 'm-charge',
          voltage: 14.2,
          voltageObservedAt: new Date('2026-03-01T11:00:00Z'),
          providerObservationAt: null,
          providerTimestampSource: 'PROVIDER_FIELD_TIMESTAMP',
          evidenceClass: BatteryGeneralizedEvidenceClass.PARKED_REST_CANDIDATE,
          restSessionId: 'sess-1',
          actualRestAgeMs: 28_800_000,
          nominalRestIntervalIndex: 1,
          isLvCharging: true,
          engineRunning: false,
          createdAt: new Date('2026-03-01T11:00:00Z'),
        },
      ],
    });
    const result = await service.readVehicleIntelligence({ organizationId: org, vehicleId: vehicle });
    const driving = result.historicalMeasured.find((p) => p.observationId === 'o-charge');
    const parked = result.historicalMeasured.find((p) => p.observationId === 'o-drive');
    expect(driving?.operationalContext).toBe('CHARGING');
    expect(driving?.providerObservationAt).toBeNull();
    expect(parked?.operationalContext).toBe('DRIVING');
    expect(result.scientificBoundary.batteryHealthAssessment).toBe('NOT_ASSESSED');
  });

  it('links REST session chart points only to matching restSessionId', async () => {
    const t0 = new Date('2026-04-01T00:00:00Z');
    const { service } = buildService({
      vehicleExists: true,
      sessions: [
        {
          id: 'sess-active',
          organizationId: org,
          vehicleId: vehicle,
          sessionStatus: BatteryRestSessionStatus.RESTING,
          anchorType: 'PHYSICAL_SHUTDOWN',
          anchorAt: t0,
          openedAt: t0,
          endedAt: null,
          endReason: null,
          restObservationCount: 1,
          validRestObservationCount: 1,
        },
      ],
      sessionObservations: [
        {
          id: 'pt-1',
          sourceMeasurementId: 'm-1',
          voltage: 12.4,
          voltageObservedAt: t0,
          providerObservationAt: t0,
          providerTimestampSource: 'PROVIDER_FIELD_TIMESTAMP',
          evidenceClass: BatteryGeneralizedEvidenceClass.PARKED_REST_CANDIDATE,
          restSessionId: 'sess-active',
          actualRestAgeMs: 28_800_000,
          nominalRestIntervalIndex: 1,
          isLvCharging: false,
          engineRunning: false,
          createdAt: t0,
        },
      ],
      featureRows: [],
    });
    const result = await service.readVehicleIntelligence({ organizationId: org, vehicleId: vehicle });
    expect(result.restSessionEpisodes[0].measuredPoints).toHaveLength(1);
    expect(result.restSessionEpisodes[0].measuredPoints[0].restSessionId).toBe('sess-active');
    expect(result.restSessionEpisodes[0].contextLimitedReason).toBeNull();
    expect(result.restSessionEpisodes[0].derivedFeatures).toBeNull();
  });

  it('selects INCREMENTAL canonical C3 for active RESTING session (C5A authority)', async () => {
    const t0 = new Date('2026-05-01T00:00:00Z');
    const { service } = buildService({
      vehicleExists: true,
      sessions: [
        {
          id: 'sess-1',
          organizationId: org,
          vehicleId: vehicle,
          sessionStatus: BatteryRestSessionStatus.RESTING,
          anchorType: 'PHYSICAL_SHUTDOWN',
          anchorAt: t0,
          openedAt: t0,
          endedAt: null,
          endReason: null,
          restObservationCount: 2,
          validRestObservationCount: 2,
        },
      ],
      sessionObservations: [
        {
          id: 'pt',
          sourceMeasurementId: 'm',
          voltage: 12.3,
          voltageObservedAt: t0,
          providerObservationAt: t0,
          providerTimestampSource: 'PROVIDER_FIELD_TIMESTAMP',
          evidenceClass: BatteryGeneralizedEvidenceClass.PARKED_REST_CANDIDATE,
          restSessionId: 'sess-1',
          actualRestAgeMs: 1000,
          nominalRestIntervalIndex: 0,
          isLvCharging: false,
          engineRunning: false,
          createdAt: t0,
        },
      ],
      featureRows: [
        {
          id: 'final-row',
          restSessionId: 'sess-1',
          semanticRevision: 2,
          computationPhase: BatteryRestSessionFeatureComputationPhase.FINAL,
          sessionTrust: BatteryRestSessionFeatureSessionTrust.VALID,
          inputSummary: { retentionPoints: [] },
          minimumRestVoltageMv: 12000,
          maximumRestVoltageMv: 12500,
          medianRestVoltageMv: 12200,
          robustRestSlopeMvPerHour: 1,
          numberOfValidRestPoints: 1,
          missingRungCount: 0,
          observationSpanMs: 1000,
        },
        {
          id: 'incr-row',
          restSessionId: 'sess-1',
          semanticRevision: 3,
          computationPhase: BatteryRestSessionFeatureComputationPhase.INCREMENTAL,
          sessionTrust: BatteryRestSessionFeatureSessionTrust.VALID,
          inputSummary: { retentionPoints: [{ observationId: 'x' }] },
          minimumRestVoltageMv: 11900,
          maximumRestVoltageMv: 12400,
          medianRestVoltageMv: 12100,
          robustRestSlopeMvPerHour: 2,
          numberOfValidRestPoints: 2,
          missingRungCount: 0,
          observationSpanMs: 2000,
        },
      ],
    });
    const result = await service.readVehicleIntelligence({ organizationId: org, vehicleId: vehicle });
    expect(result.restSessionEpisodes[0].derivedFeatures?.canonicalFeatureRowId).toBe('incr-row');
    expect(result.restSessionEpisodes[0].derivedFeatures?.computationPhase).toBe('INCREMENTAL');
  });

  it('reports D4 as ack summary only — not full integrity verification', async () => {
    const created = new Date('2026-06-01T00:00:00Z');
    const { service } = buildService({
      vehicleExists: true,
      latestD3: { id: 'rev-1', createdAt: created },
      d4Inspect: { status: 'OK', view: { ackCount: 2 } },
    });
    const result = await service.readVehicleIntelligence({ organizationId: org, vehicleId: vehicle });
    expect(result.longitudinalD4.note).toBe('LATEST_REVISION_D4_ACK_SUMMARY_ONLY');
    expect(result.longitudinalD4.sourceEvidenceAckCountOnLatest).toBe(2);
    expect(result.longitudinalD4.epistemicBand).toBe('DERIVED');
  });

  it('marks missing D3 history as CONTEXT_LIMITED', async () => {
    const { service } = buildService({ vehicleExists: true, latestD3: null });
    const result = await service.readVehicleIntelligence({ organizationId: org, vehicleId: vehicle });
    expect(result.longitudinalD4.note).toBe('NO_D3_LONGITUDINAL_REVISION_MATERIALIZED');
    expect(result.longitudinalD4.epistemicBand).toBe('CONTEXT_LIMITED');
  });

  it('keeps latestMeasured as vehicle-global latest in date-range mode (not window tail)', async () => {
    const windowOld = new Date('2026-01-01T10:00:00Z');
    const windowNew = new Date('2026-01-02T10:00:00Z');
    const globalNewest = new Date('2026-03-15T12:00:00Z');
    const { service } = buildService({
      vehicleExists: true,
      observations: [
        {
          id: 'hist-old',
          sourceMeasurementId: 'm-old',
          voltage: 12.1,
          voltageObservedAt: windowOld,
          providerObservationAt: windowOld,
          providerTimestampSource: 'PROVIDER_FIELD_TIMESTAMP',
          evidenceClass: BatteryGeneralizedEvidenceClass.PARKED_REST_CANDIDATE,
          restSessionId: 'sess-1',
          actualRestAgeMs: 28_800_000,
          nominalRestIntervalIndex: 1,
          isLvCharging: false,
          engineRunning: false,
          createdAt: windowOld,
        },
        {
          id: 'hist-new-in-window',
          sourceMeasurementId: 'm-win',
          voltage: 12.2,
          voltageObservedAt: windowNew,
          providerObservationAt: windowNew,
          providerTimestampSource: 'PROVIDER_FIELD_TIMESTAMP',
          evidenceClass: BatteryGeneralizedEvidenceClass.PARKED_REST_CANDIDATE,
          restSessionId: 'sess-1',
          actualRestAgeMs: 28_800_000,
          nominalRestIntervalIndex: 1,
          isLvCharging: false,
          engineRunning: false,
          createdAt: windowNew,
        },
      ],
      globalLatestObservation: {
        id: 'global-latest',
        sourceMeasurementId: 'm-global',
        voltage: 12.55,
        voltageObservedAt: globalNewest,
        providerObservationAt: globalNewest,
        providerTimestampSource: 'PROVIDER_FIELD_TIMESTAMP',
        evidenceClass: BatteryGeneralizedEvidenceClass.PARKED_REST_CANDIDATE,
        restSessionId: 'sess-2',
        actualRestAgeMs: 3_600_000,
        nominalRestIntervalIndex: 0,
        isLvCharging: false,
        engineRunning: false,
        createdAt: globalNewest,
      },
    });
    const result = await service.readVehicleIntelligence({
      organizationId: org,
      vehicleId: vehicle,
      measuredFrom: new Date('2026-01-01T00:00:00Z'),
      measuredTo: new Date('2026-01-03T00:00:00Z'),
    });
    expect(result.latestMeasured?.observationId).toBe('global-latest');
    expect(result.provenance.latestMeasuredSemantic).toBe('VEHICLE_GLOBAL_LATEST');
    expect(result.provenance.historicalWindowLatestMeasured?.observationId).toBe('hist-new-in-window');
    expect(result.historicalMeasured.at(-1)?.observationId).toBe('hist-new-in-window');
  });
});
