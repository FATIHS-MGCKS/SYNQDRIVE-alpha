import { BatteryGeneralizedEvidenceClass } from '@prisma/client';
import {
  loadGeHistoricalObservationsForAssessment,
  loadGeHistoricalObservationsForDisplay,
} from './lv-ge-historical-observations.loader';

function row(id: string, at: Date) {
  return {
    id,
    sourceMeasurementId: `m-${id}`,
    restSessionId: null,
    voltage: 12.4,
    voltageObservedAt: at,
    providerObservationAt: at,
    evidenceClass: BatteryGeneralizedEvidenceClass.PARKED_REST_CANDIDATE,
    actualRestAgeMs: 3_600_000,
    isLvCharging: false,
    engineRunning: false,
    temperatureC: null,
    providerTimestampSource: 'PROVIDER_FIELD_TIMESTAMP',
    nominalRestIntervalIndex: 1,
    createdAt: at,
  };
}

describe('lv-ge-historical-observations.loader', () => {
  it('display mode: exactly at limit does not mark truncated', async () => {
    const at = new Date('2026-10-01T00:00:00Z');
    const prisma = {
      batteryGeneralizedEvidenceObservation: {
        findMany: jest.fn().mockResolvedValue(Array.from({ length: 500 }, (_, i) => row(`o${i}`, at))),
      },
    };
    const result = await loadGeHistoricalObservationsForDisplay(prisma, {
      organizationId: 'org',
      vehicleId: 'veh',
      observationLimit: 500,
    });
    expect(result.hasMoreRowsInQuery).toBe(false);
    expect(result.rows).toHaveLength(500);
    expect(prisma.batteryGeneralizedEvidenceObservation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 501 }),
    );
  });

  it('display mode: take+1 proves truncation when more rows exist', async () => {
    const at = new Date('2026-10-01T00:00:00Z');
    const prisma = {
      batteryGeneralizedEvidenceObservation: {
        findMany: jest.fn().mockResolvedValue(Array.from({ length: 501 }, (_, i) => row(`o${i}`, at))),
      },
    };
    const result = await loadGeHistoricalObservationsForDisplay(prisma, {
      organizationId: 'org',
      vehicleId: 'veh',
      observationLimit: 500,
    });
    expect(result.hasMoreRowsInQuery).toBe(true);
    expect(result.rows).toHaveLength(500);
  });

  it('assessment mode: batches ASC within measured window', async () => {
    const from = new Date('2026-10-01T00:00:00Z');
    const to = new Date('2026-10-03T00:00:00Z');
    const findMany = jest
      .fn()
      .mockResolvedValueOnce([
        row('a', new Date('2026-10-01T01:00:00Z')),
        row('b', new Date('2026-10-02T01:00:00Z')),
      ])
      .mockResolvedValueOnce([row('b', new Date('2026-10-02T01:00:00Z'))]);
    const prisma = { batteryGeneralizedEvidenceObservation: { findMany } };
    const result = await loadGeHistoricalObservationsForAssessment(prisma, {
      organizationId: 'org',
      vehicleId: 'veh',
      measuredFrom: from,
      measuredTo: to,
      maxRows: 10,
      batchSize: 1,
    });
    expect(result.rows).toHaveLength(2);
    expect(result.queryMode).toBe('DATE_RANGE_ASC');
    expect(findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        orderBy: { voltageObservedAt: 'asc' },
        take: 2,
      }),
    );
  });
});
