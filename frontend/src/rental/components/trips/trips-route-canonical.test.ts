import { describe, expect, it } from 'vitest';
import {
  deriveTripMapQuality,
  processingStateLabel,
  routeQualityLabel,
} from './trips-map.utils';

describe('trips-map canonical route quality', () => {
  it('labels MATCHED route quality from persisted routeQuality', () => {
    expect(routeQualityLabel('MATCHED')).toBe('Straßenabgleich');
    expect(routeQualityLabel('FILTERED')).toBe('GPS-bereinigt');
    expect(routeQualityLabel('RAW')).toBe('Telemetrie roh');
  });

  it('keeps quality, continuity, and processing separate', () => {
    const quality = deriveTripMapQuality(
      {
        id: 'trip-1',
        vehicleId: 'veh-1',
        tripStatus: 'COMPLETED',
        startTime: '2026-08-29T10:00:00.000Z',
      },
      {
        routeQuality: 'MATCHED',
        matchConfidence: 0.92,
        matchCoverage: 0.88,
        continuityStatus: 'GAPS_PRESENT',
        processingState: 'READY',
        routeProcessedAt: '2026-08-29T12:00:00.000Z',
        segmentCount: 2,
        routeError: null,
        behaviorLoading: false,
      },
    );

    expect(quality.routeQuality).toBe('MATCHED');
    expect(quality.continuityStatus).toBe('GAPS_PRESENT');
    expect(quality.processingState).toBe('READY');
    expect(quality.routeIncomplete).toBe(true);
  });

  it('shows processing state while route artifact is pending', () => {
    const quality = deriveTripMapQuality(null, {
      routeQuality: null,
      matchConfidence: null,
      matchCoverage: null,
      continuityStatus: 'INSUFFICIENT_DATA',
      processingState: 'PROCESSING',
      routeProcessedAt: null,
      segmentCount: 0,
      routeError: null,
      behaviorLoading: false,
    });

    expect(quality.routeAvailable).toBe(false);
    expect(processingStateLabel('PROCESSING')).toBe('Route wird verarbeitet…');
  });
});
