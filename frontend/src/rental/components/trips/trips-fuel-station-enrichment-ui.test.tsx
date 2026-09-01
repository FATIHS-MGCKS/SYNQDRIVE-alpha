import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { LanguageProvider } from '../../i18n/LanguageContext';
import { TripTimelineEnergyCard } from './trip-timeline-shared';
import type { EnergyEvent, EnergyEventStationEnrichment } from '../../../lib/api';

function stationEnrichment(
  overrides: Partial<EnergyEventStationEnrichment> = {},
): EnergyEventStationEnrichment {
  return {
    processingStatus: 'COMPLETED',
    resolutionStatus: 'MATCHED',
    trusted: true,
    matchConfidence: 'HIGH',
    score: 0.92,
    station: {
      osmType: 'node',
      osmId: '12345',
      name: 'Esso',
      brand: 'Esso',
      address: 'Kölnische Straße 123, 34117 Kassel',
      latitude: 51.32,
      longitude: 9.53,
      distanceMeters: 12,
    },
    resolverVersion: 'fuel-station-resolver-v1',
    osmDatasetVersion: 'de-2026-08-30',
    resolvedAt: '2026-08-31T20:00:01.000Z',
    ...overrides,
  };
}

function baseEvent(overrides: Partial<EnergyEvent> = {}): EnergyEvent {
  return {
    id: 'evt-1',
    vehicleId: 'veh-1',
    dimoSegmentId: 'dimo-refuel-187336-1787950855000',
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
    fuelLevelRiseStart: '2026-08-28T22:10:00.000Z',
    fuelLevelRiseEnd: '2026-08-28T22:14:40.000Z',
    fuelLevelRiseDurationSeconds: 280,
    ...overrides,
  };
}

function renderCard(event: EnergyEvent, isDark = false): string {
  return renderToStaticMarkup(
    <LanguageProvider>
      <TripTimelineEnergyCard event={event} isDark={isDark} />
    </LanguageProvider>,
  );
}

describe('TripTimelineEnergyCard fuel station enrichment', () => {
  it('A/B. trusted MATCHED station identity is rendered prominently', () => {
    const html = renderCard(
      baseEvent({ stationEnrichment: stationEnrichment({ matchConfidence: 'HIGH' }) }),
    );
    expect(html).toContain('Esso');
    expect(html).toContain('Kölnische Straße 123, 34117 Kassel');
    expect(html).not.toContain('fuel-station-resolver-v1');
    expect(html).not.toContain('51.320, 9.530');
  });

  it('C. MATCHED LOW is not presented as authoritative', () => {
    const html = renderCard(
      baseEvent({
        stationEnrichment: stationEnrichment({
          matchConfidence: 'LOW',
          trusted: false,
        }),
      }),
    );
    expect(html).toContain('Possible fuel station');
    expect(html).toContain('Esso');
    expect(html).not.toContain('font-semibold text-foreground');
  });

  it('D. AMBIGUOUS shows non-authoritative message only', () => {
    const html = renderCard(
      baseEvent({
        stationEnrichment: stationEnrichment({
          resolutionStatus: 'AMBIGUOUS',
          trusted: false,
        }),
      }),
    );
    expect(html).toContain('Fuel station not uniquely identified');
    expect(html).not.toContain('Kölnische Straße');
  });

  it('E. NOT_FOUND keeps coordinate fallback', () => {
    const html = renderCard(
      baseEvent({
        stationEnrichment: stationEnrichment({
          resolutionStatus: 'NOT_FOUND',
          trusted: false,
          station: undefined,
          matchConfidence: null,
        }),
      }),
    );
    expect(html).toContain('51.320, 9.530');
    expect(html).not.toContain('Esso');
  });

  it('F. NO_COORDINATES remains renderable with coordinates fallback', () => {
    const html = renderCard(
      baseEvent({
        stationEnrichment: stationEnrichment({
          resolutionStatus: 'NO_COORDINATES',
          trusted: false,
          station: undefined,
        }),
      }),
    );
    expect(html).toContain('Refuel detected');
    expect(html).toContain('51.320, 9.530');
  });

  it('G. PROCESSING shows subtle resolving state without blocking card', () => {
    const html = renderCard(
      baseEvent({
        stationEnrichment: stationEnrichment({
          processingStatus: 'PROCESSING',
          resolutionStatus: null,
          trusted: false,
          station: undefined,
        }),
      }),
    );
    expect(html).toContain('Station identification pending');
    expect(html).toContain('Refuel detected');
  });

  it('H. FAILED does not leak internal resolver errors', () => {
    const html = renderCard(
      baseEvent({
        stationEnrichment: stationEnrichment({
          processingStatus: 'FAILED',
          resolutionStatus: 'ERROR',
          trusted: false,
          station: undefined,
        }),
      }),
    );
    expect(html).not.toContain('WORKER_MAX_RETRIES');
    expect(html).not.toContain('resolver');
    expect(html).toContain('Refuel detected');
  });

  it('I. historical REFUEL without enrichment remains backward compatible', () => {
    const html = renderCard(baseEvent());
    expect(html).toContain('Refuel detected');
    expect(html).toContain('51.320, 9.530');
    expect(html).not.toContain('Possible fuel station');
  });

  it('J. RECHARGE card is unchanged by enrichment payload', () => {
    const html = renderCard(
      baseEvent({
        kind: 'RECHARGE',
        detectionMechanism: 'recharge',
        durationSeconds: 3600,
        fuelDeltaLiters: null,
        fuelDeltaPercent: null,
        socDeltaPercent: 42,
        energyDeltaKwh: 18,
        fuelLevelRiseDurationSeconds: null,
        stationEnrichment: stationEnrichment(),
      }),
    );
    expect(html).toContain('60 min');
    expect(html).not.toContain('Esso');
    expect(html).not.toContain('Possible fuel station');
  });

  it('K. HIGH detection confidence does not confirm LOW station match', () => {
    const html = renderCard(
      baseEvent({
        confidence: 'HIGH',
        stationEnrichment: stationEnrichment({
          matchConfidence: 'LOW',
          trusted: false,
        }),
      }),
    );
    expect(html).toContain('Possible fuel station');
    expect(html).not.toMatch(/font-semibold text-foreground[^"]*">Esso</);
  });

  it('L. long station name and address wrap without layout-breaking markup', () => {
    const longName = 'Autobahntankstelle '.repeat(8).trim();
    const longAddress = 'Sehr lange Straßenbezeichnung mit Hausnummer 123, 34117 Kassel, Deutschland';
    const html = renderCard(
      baseEvent({
        stationEnrichment: stationEnrichment({
          station: {
            osmType: 'way',
            osmId: '999',
            name: longName,
            brand: 'Shell',
            address: longAddress,
            latitude: 51.32,
            longitude: 9.53,
            distanceMeters: 8,
          },
        }),
      }),
    );
    expect(html).toContain(longName);
    expect(html).toContain(longAddress);
    expect(html).toContain('break-words');
  });
});
