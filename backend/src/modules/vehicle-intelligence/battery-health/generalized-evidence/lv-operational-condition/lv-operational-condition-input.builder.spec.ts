import { BatteryGeneralizedEvidenceClass } from '@prisma/client';
import { LvMeasuredIntelligenceReadService } from '../lv-measured-intelligence/lv-measured-intelligence-read.service';
import { buildLvOperationalConditionInputV1 } from './lv-operational-condition-input.builder';
import { evaluateLvEstimatedBatteryHealthV1 } from '../lv-estimated-battery-health/lv-estimated-battery-health-v1.evaluator';
import { buildLvEstimatedBatteryHealthInputV1 } from '../lv-estimated-battery-health/lv-estimated-battery-health-input.builder';

function geRow(partial: {
  id: string;
  at: string;
  evidenceClass: BatteryGeneralizedEvidenceClass;
  isLvCharging?: boolean;
  actualRestAgeMs?: number;
  restSessionId?: string;
}) {
  const at = new Date(partial.at);
  return {
    id: partial.id,
    sourceMeasurementId: `src-${partial.id}`,
    restSessionId: partial.restSessionId ?? `sess-${partial.id}`,
    voltage: 12.4,
    voltageObservedAt: at,
    providerObservationAt: at,
    evidenceClass: partial.evidenceClass,
    actualRestAgeMs: partial.actualRestAgeMs ?? 3_600_000,
    isLvCharging: partial.isLvCharging ?? false,
    engineRunning: false,
    temperatureC: null,
    providerTimestampSource: 'PROVIDER_FIELD_TIMESTAMP',
    nominalRestIntervalIndex: 1,
    createdAt: at,
  };
}

describe('buildLvOperationalConditionInputV1 — GE assessment selection', () => {
  const org = 'org-1';
  const vehicle = 'veh-audi';
  const measuredFrom = new Date('2026-09-01T00:00:00Z');
  const measuredTo = new Date('2026-10-22T00:00:00Z');

  function buildAudiLikeRows() {
    const restRows = Array.from({ length: 33 }, (_, i) =>
      geRow({
        id: `rest-${i}`,
        at: `2026-09-${String(10 + (i % 20)).padStart(2, '0')}T08:00:00Z`,
        evidenceClass: BatteryGeneralizedEvidenceClass.PARKED_REST_CANDIDATE,
        restSessionId: `sess-${i}`,
      }),
    );
    const recentNoise = Array.from({ length: 600 }, (_, i) =>
      geRow({
        id: `noise-${i}`,
        at: `2026-10-${String(1 + (i % 20)).padStart(2, '0')}T12:00:00Z`,
        evidenceClass: BatteryGeneralizedEvidenceClass.ACTIVE_VEHICLE_CONTAMINATED,
      }),
    );
    return [...restRows, ...recentNoise].sort(
      (a, b) => (a.voltageObservedAt?.getTime() ?? 0) - (b.voltageObservedAt?.getTime() ?? 0),
    );
  }

  function mockPrisma(allRows: ReturnType<typeof geRow>[]) {
    return {
      vehicleBatterySpec: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'spec',
            batteryType: 'AGM',
            sourceType: 'MANUAL',
            sourceConfidence: 1,
            batteryVolt: 12,
            batteryAmpere: 70,
          },
        ]),
      },
      batteryFeatures: { findUnique: jest.fn().mockResolvedValue(null) },
      batteryGeneralizedEvidenceObservation: {
        count: jest.fn().mockResolvedValue(100),
        findMany: jest.fn().mockImplementation((args: { where?: { voltageObservedAt?: { gt?: Date } }; take?: number }) => {
          const gt = args.where?.voltageObservedAt?.gt;
          const filtered = gt
            ? allRows.filter((r) => r.voltageObservedAt && r.voltageObservedAt > gt)
            : allRows.filter(
                (r) =>
                  r.voltageObservedAt &&
                  r.voltageObservedAt >= measuredFrom &&
                  r.voltageObservedAt <= measuredTo,
              );
          const take = args.take ?? filtered.length;
          return Promise.resolve(filtered.slice(0, take));
        }),
      },
    };
  }

  function mockReadModel() {
    const measured = {
      latestMeasured: null,
      restSessionEpisodes: [],
      provenance: {
        openProviderObservabilityGapCount: 0,
        inputCoverageIncomplete: false,
        historicalObservationsTruncated: false,
        historicalQueryMode: 'DATE_RANGE_ASC' as const,
      },
    };
    return {
      readVehicleIntelligence: jest.fn().mockResolvedValue(measured),
    } as unknown as LvMeasuredIntelligenceReadService;
  }

  it('Audi regression: UI observationLimit 500 does not change N16 eligible REST vs full assessment window', async () => {
    const allRows = buildAudiLikeRows();
    const prisma = mockPrisma(allRows);
    const readModel = mockReadModel();

    const full = await buildLvOperationalConditionInputV1(
      { prisma: prisma as never, readModel },
      { organizationId: org, vehicleId: vehicle, measuredFrom, measuredTo, observationLimit: 10_000 },
    );
    const uiLimited = await buildLvOperationalConditionInputV1(
      { prisma: prisma as never, readModel },
      { organizationId: org, vehicleId: vehicle, measuredFrom, measuredTo, observationLimit: 500 },
    );

    expect(full.geDataSelection.eligibleRestObservationCount).toBe(33);
    expect(uiLimited.geDataSelection.eligibleRestObservationCount).toBe(33);

    const n16Full = evaluateLvEstimatedBatteryHealthV1({
      conditionInput: full,
      restoreCutoffIso: '2026-10-01T00:00:00Z',
      postRestoreObservationCount: 100,
    });
    const n16Ui = evaluateLvEstimatedBatteryHealthV1({
      conditionInput: uiLimited,
      restoreCutoffIso: '2026-10-01T00:00:00Z',
      postRestoreObservationCount: 100,
    });
    expect(n16Full.estimatedHealthStatus).toBe(n16Ui.estimatedHealthStatus);
    expect(n16Full.decisionTrace.finalRuleId).toBe(n16Ui.decisionTrace.finalRuleId);
  });

  it('Tiguan regression: >500 rows in window without extra rows is not truncated', async () => {
    const rows = Array.from({ length: 600 }, (_, i) =>
      geRow({
        id: `g-${i}`,
        at: `2026-09-${String(1 + (i % 28)).padStart(2, '0')}T08:00:00Z`,
        evidenceClass:
          i % 5 === 0
            ? BatteryGeneralizedEvidenceClass.PARKED_REST_CANDIDATE
            : BatteryGeneralizedEvidenceClass.ACTIVE_VEHICLE_CONTAMINATED,
      }),
    );
    const prisma = mockPrisma(rows);
    const readModel = mockReadModel();
    const input = await buildLvOperationalConditionInputV1(
      { prisma: prisma as never, readModel },
      { organizationId: org, vehicleId: 'veh-tiguan', measuredFrom, measuredTo, observationLimit: 500 },
    );
    expect(input.geDataSelection.rawVoltageRowCount).toBe(600);
    expect(input.historicalObservationsTruncated).toBe(false);
  });

  it('deterministic re-evaluation for identical assessment input', async () => {
    const prisma = mockPrisma(buildAudiLikeRows());
    const readModel = mockReadModel();
    const deps = { prisma: prisma as never, readModel };
    const a = await buildLvEstimatedBatteryHealthInputV1(deps, {
      organizationId: org,
      vehicleId: vehicle,
      measuredFrom,
      measuredTo,
    });
    const b = await buildLvEstimatedBatteryHealthInputV1(deps, {
      organizationId: org,
      vehicleId: vehicle,
      measuredFrom,
      measuredTo,
    });
    const outA = evaluateLvEstimatedBatteryHealthV1(a);
    const outB = evaluateLvEstimatedBatteryHealthV1(b);
    expect(outA.estimatedHealthStatus).toBe(outB.estimatedHealthStatus);
    expect(outA.reasonCodes).toEqual(outB.reasonCodes);
  });
});
