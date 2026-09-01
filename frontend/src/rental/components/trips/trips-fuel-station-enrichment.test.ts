import { describe, expect, it } from 'vitest';
import type { EnergyEvent, EnergyEventStationEnrichment } from '../../../lib/api';
import {
  resolveFuelStationPresentation,
  resolveRefuelFuelStationPresentation,
} from './trips-fuel-station-enrichment';

function station(overrides: Partial<NonNullable<EnergyEventStationEnrichment['station']>> = {}) {
  return {
    osmType: 'node',
    osmId: '12345',
    name: 'Esso',
    brand: 'Esso',
    address: 'Kölnische Straße 123, 34117 Kassel',
    latitude: 51.32,
    longitude: 9.53,
    distanceMeters: 12,
    ...overrides,
  };
}

function enrichment(
  overrides: Partial<EnergyEventStationEnrichment> = {},
): EnergyEventStationEnrichment {
  return {
    processingStatus: 'COMPLETED',
    resolutionStatus: 'MATCHED',
    trusted: true,
    matchConfidence: 'HIGH',
    score: 0.92,
    station: station(),
    resolverVersion: 'fuel-station-resolver-v1',
    osmDatasetVersion: 'de-2026-08-30',
    resolvedAt: '2026-08-31T20:00:01.000Z',
    ...overrides,
  };
}

function refuelEvent(overrides: Partial<EnergyEvent> = {}): EnergyEvent {
  return {
    id: 'evt-1',
    vehicleId: 'veh-1',
    dimoSegmentId: 'dimo-1',
    kind: 'REFUEL',
    detectionMechanism: 'refuel',
    startTime: '2026-08-28T21:00:55.000Z',
    endTime: '2026-08-28T22:21:13.000Z',
    durationSeconds: 4818,
    startLatitude: 51.32,
    startLongitude: 9.53,
    endLatitude: 51.33,
    endLongitude: 9.5,
    fuelDeltaLiters: 23,
    fuelDeltaPercent: 34.5,
    socDeltaPercent: null,
    energyDeltaKwh: null,
    odometerStartKm: 187585,
    odometerEndKm: 187592,
    confidence: 'HIGH',
    fuelLevelRiseStart: null,
    fuelLevelRiseEnd: null,
    fuelLevelRiseDurationSeconds: null,
    ...overrides,
  };
}

describe('resolveFuelStationPresentation', () => {
  it('A. MATCHED HIGH trusted renders confirmed station identity', () => {
    const view = resolveFuelStationPresentation(enrichment({ matchConfidence: 'HIGH', trusted: true }));
    expect(view.mode).toBe('trusted');
    expect(view.primaryLabel).toBe('Esso');
    expect(view.secondaryLabel).toContain('Kölnische Straße');
    expect(view.showCoordinatesFallback).toBe(false);
  });

  it('B. MATCHED MEDIUM trusted renders confirmed station identity', () => {
    const view = resolveFuelStationPresentation(
      enrichment({ matchConfidence: 'MEDIUM', trusted: true }),
    );
    expect(view.mode).toBe('trusted');
    expect(view.primaryLabel).toBe('Esso');
  });

  it('C. MATCHED LOW is not authoritative', () => {
    const view = resolveFuelStationPresentation(
      enrichment({ matchConfidence: 'LOW', trusted: false }),
    );
    expect(view.mode).toBe('possible');
    expect(view.showCoordinatesFallback).toBe(true);
  });

  it('D. AMBIGUOUS does not fabricate a confirmed station', () => {
    const view = resolveFuelStationPresentation(
      enrichment({ resolutionStatus: 'AMBIGUOUS', trusted: false, station: station() }),
    );
    expect(view.mode).toBe('ambiguous');
    expect(view.primaryLabel).toBeNull();
  });

  it('E. NOT_FOUND keeps coordinate fallback', () => {
    const view = resolveFuelStationPresentation(
      enrichment({
        resolutionStatus: 'NOT_FOUND',
        trusted: false,
        station: undefined,
        matchConfidence: null,
      }),
    );
    expect(view.mode).toBe('none');
    expect(view.showCoordinatesFallback).toBe(true);
  });

  it('F. NO_COORDINATES remains renderable', () => {
    const view = resolveFuelStationPresentation(
      enrichment({
        resolutionStatus: 'NO_COORDINATES',
        trusted: false,
        station: undefined,
      }),
    );
    expect(view.mode).toBe('none');
    expect(view.showCoordinatesFallback).toBe(true);
  });

  it('G. PENDING/PROCESSING is non-blocking resolving state', () => {
    expect(resolveFuelStationPresentation(enrichment({ processingStatus: 'PENDING' })).mode).toBe(
      'resolving',
    );
    expect(
      resolveFuelStationPresentation(enrichment({ processingStatus: 'PROCESSING' })).mode,
    ).toBe('resolving');
  });

  it('H. FAILED/ERROR does not expose internal details', () => {
    const view = resolveFuelStationPresentation(
      enrichment({
        processingStatus: 'FAILED',
        resolutionStatus: 'ERROR',
        trusted: false,
        station: undefined,
      }),
    );
    expect(view.mode).toBe('none');
    expect(view.primaryLabel).toBeNull();
  });

  it('I. undefined enrichment is backward compatible', () => {
    const view = resolveRefuelFuelStationPresentation(refuelEvent());
    expect(view.mode).toBe('none');
    expect(view.showCoordinatesFallback).toBe(true);
  });

  it('J. RECHARGE ignores enrichment', () => {
    const view = resolveRefuelFuelStationPresentation(
      refuelEvent({
        kind: 'RECHARGE',
        detectionMechanism: 'recharge',
        stationEnrichment: enrichment(),
      }),
    );
    expect(view.mode).toBe('none');
  });

  it('K. detection HIGH does not imply trusted station when match is LOW', () => {
    const view = resolveRefuelFuelStationPresentation(
      refuelEvent({
        confidence: 'HIGH',
        stationEnrichment: enrichment({ matchConfidence: 'LOW', trusted: false }),
      }),
    );
    expect(view.mode).toBe('possible');
    expect(view.mode).not.toBe('trusted');
  });
});
