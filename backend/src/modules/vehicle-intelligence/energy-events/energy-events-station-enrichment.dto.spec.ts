import type { VehicleEnergyEventFuelStationEnrichment } from '@prisma/client';
import { toStationEnrichmentDto } from './energy-events-station-enrichment.dto';
import { toEnergyEventDto } from './energy-events.types';

const BASE_ENRICHMENT: VehicleEnergyEventFuelStationEnrichment = {
  id: 'enr-1',
  energyEventId: 'evt-1',
  processingStatus: 'COMPLETED',
  resolutionStatus: 'MATCHED',
  matchConfidence: 'HIGH',
  matchScore: 0.92,
  osmType: 'node',
  osmId: '12345',
  stationName: 'Shell Mitte',
  brand: 'Shell',
  operator: 'Shell Deutschland',
  address: 'Hauptstr. 1, Berlin',
  stationLatitude: 52.52,
  stationLongitude: 13.405,
  distanceMeters: 12.5,
  inputLatitude: 52.5199,
  inputLongitude: 13.4048,
  inputCoordinateSource: 'energy_event_start',
  inputFingerprint: 'fp-1',
  resolverVersion: 'fuel-station-resolver-v1',
  osmDatasetVersion: 'de-2026-08-30',
  attemptCount: 1,
  lastAttemptAt: new Date('2026-08-31T20:00:00.000Z'),
  resolvedAt: new Date('2026-08-31T20:00:01.000Z'),
  failedAt: null,
  errorCode: null,
  errorMessage: null,
  createdAt: new Date('2026-08-31T20:00:00.000Z'),
  updatedAt: new Date('2026-08-31T20:00:01.000Z'),
};

function enrichment(
  overrides: Partial<VehicleEnergyEventFuelStationEnrichment>,
): VehicleEnergyEventFuelStationEnrichment {
  return { ...BASE_ENRICHMENT, ...overrides };
}

function baseEnergyEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: 'evt-1',
    vehicleId: 'veh-1',
    dimoSegmentId: 'dimo-1',
    kind: 'REFUEL' as const,
    detectionMechanism: 'refuel',
    startTime: new Date('2026-08-31T19:50:00.000Z'),
    endTime: new Date('2026-08-31T19:55:00.000Z'),
    durationSeconds: 300,
    startLatitude: 52.5199,
    startLongitude: 13.4048,
    endLatitude: 52.5199,
    endLongitude: 13.4048,
    fuelDeltaLiters: 25,
    fuelDeltaPercent: 40,
    socDeltaPercent: null,
    energyDeltaKwh: null,
    odometerStartKm: 1000,
    odometerEndKm: 1000,
    confidence: 'HIGH' as const,
    fuelLevelRiseStart: null,
    fuelLevelRiseEnd: null,
    fuelLevelRiseDurationSeconds: null,
    rawDetectionMeta: null,
    createdAt: new Date('2026-08-31T19:55:00.000Z'),
    updatedAt: new Date('2026-08-31T19:55:00.000Z'),
    ...overrides,
  };
}

describe('toStationEnrichmentDto', () => {
  it('A. MATCHED/HIGH → trusted station returned', () => {
    const dto = toStationEnrichmentDto(enrichment({ matchConfidence: 'HIGH' }));
    expect(dto.trusted).toBe(true);
    expect(dto.station).toEqual({
      osmType: 'node',
      osmId: '12345',
      name: 'Shell Mitte',
      brand: 'Shell',
      address: 'Hauptstr. 1, Berlin',
      latitude: 52.52,
      longitude: 13.405,
      distanceMeters: 12.5,
    });
    expect(dto.resolvedAt).toBe('2026-08-31T20:00:01.000Z');
  });

  it('B. MATCHED/MEDIUM → trusted=true', () => {
    const dto = toStationEnrichmentDto(enrichment({ matchConfidence: 'MEDIUM' }));
    expect(dto.trusted).toBe(true);
    expect(dto.station?.name).toBe('Shell Mitte');
  });

  it('C. MATCHED/LOW → trusted=false with diagnostic station', () => {
    const dto = toStationEnrichmentDto(enrichment({ matchConfidence: 'LOW', matchScore: 0.41 }));
    expect(dto.trusted).toBe(false);
    expect(dto.station?.name).toBe('Shell Mitte');
    expect(dto.score).toBe(0.41);
  });

  it('D. AMBIGUOUS → trusted=false without authoritative station', () => {
    const dto = toStationEnrichmentDto(
      enrichment({
        resolutionStatus: 'AMBIGUOUS',
        matchConfidence: 'HIGH',
        stationName: 'Candidate A',
      }),
    );
    expect(dto.trusted).toBe(false);
    expect(dto.station).toBeUndefined();
    expect(dto.resolutionStatus).toBe('AMBIGUOUS');
  });

  it('E. NOT_FOUND → status exposed, no station', () => {
    const dto = toStationEnrichmentDto(
      enrichment({
        resolutionStatus: 'NOT_FOUND',
        matchConfidence: null,
        matchScore: null,
        stationName: null,
        osmType: null,
        osmId: null,
        stationLatitude: null,
        stationLongitude: null,
      }),
    );
    expect(dto.trusted).toBe(false);
    expect(dto.resolutionStatus).toBe('NOT_FOUND');
    expect(dto.station).toBeUndefined();
  });

  it('F. NO_COORDINATES → status exposed, no station', () => {
    const dto = toStationEnrichmentDto(
      enrichment({
        resolutionStatus: 'NO_COORDINATES',
        matchConfidence: null,
        stationName: null,
        stationLatitude: null,
        stationLongitude: null,
      }),
    );
    expect(dto.trusted).toBe(false);
    expect(dto.resolutionStatus).toBe('NO_COORDINATES');
    expect(dto.station).toBeUndefined();
  });

  it('G. PENDING → processing state without fabricated result', () => {
    const dto = toStationEnrichmentDto(
      enrichment({
        processingStatus: 'PENDING',
        resolutionStatus: null,
        matchConfidence: null,
        matchScore: null,
        resolvedAt: null,
        stationName: null,
      }),
    );
    expect(dto.processingStatus).toBe('PENDING');
    expect(dto.resolutionStatus).toBeNull();
    expect(dto.trusted).toBe(false);
    expect(dto.station).toBeUndefined();
    expect(dto.resolvedAt).toBeNull();
  });

  it('H. FAILED/ERROR → terminal error state exposed safely', () => {
    const dto = toStationEnrichmentDto(
      enrichment({
        processingStatus: 'FAILED',
        resolutionStatus: 'ERROR',
        matchConfidence: null,
        resolvedAt: null,
        failedAt: new Date('2026-08-31T20:01:00.000Z'),
        errorCode: 'WORKER_MAX_RETRIES',
        errorMessage: 'max retries',
      }),
    );
    expect(dto.processingStatus).toBe('FAILED');
    expect(dto.resolutionStatus).toBe('ERROR');
    expect(dto.trusted).toBe(false);
    expect(dto.station).toBeUndefined();
    expect(dto).not.toHaveProperty('errorMessage');
    expect(dto).not.toHaveProperty('errorCode');
  });

  it('INVALID_COORDINATES → trusted=false, no station', () => {
    const dto = toStationEnrichmentDto(
      enrichment({
        resolutionStatus: 'INVALID_COORDINATES',
        matchConfidence: null,
        stationName: null,
      }),
    );
    expect(dto.trusted).toBe(false);
    expect(dto.station).toBeUndefined();
  });
});

describe('toEnergyEventDto station enrichment integration', () => {
  it('I. historical REFUEL without enrichment remains valid', () => {
    const dto = toEnergyEventDto(baseEnergyEvent());
    expect(dto.stationEnrichment).toBeUndefined();
    expect(dto.confidence).toBe('HIGH');
    expect(dto.startLatitude).toBe(52.5199);
  });

  it('J. non-REFUEL event is unaffected even if enrichment row present', () => {
    const dto = toEnergyEventDto({
      ...baseEnergyEvent({ kind: 'RECHARGE', confidence: 'MEDIUM' }),
      fuelStationEnrichment: enrichment({}),
    });
    expect(dto.kind).toBe('RECHARGE');
    expect(dto.stationEnrichment).toBeUndefined();
    expect(dto.confidence).toBe('MEDIUM');
  });

  it('K. detection confidence and station match confidence remain distinct', () => {
    const dto = toEnergyEventDto({
      ...baseEnergyEvent({ confidence: 'HIGH' }),
      fuelStationEnrichment: enrichment({ matchConfidence: 'MEDIUM' }),
    });
    expect(dto.confidence).toBe('HIGH');
    expect(dto.stationEnrichment?.matchConfidence).toBe('MEDIUM');
    expect(dto.stationEnrichment?.trusted).toBe(true);
  });
});
