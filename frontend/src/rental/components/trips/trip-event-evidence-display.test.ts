import { describe, expect, it } from 'vitest';
import type { TripBehaviorEvent, TripEventContextAssessment } from '../../../lib/api';
import {
  formatEventEvidence,
  formatLegacyMeasurements,
  hasLegacyMeasurements,
} from './behavior-ui.utils';
import { contextHeadline, shouldRenderContextBlock } from './event-context-ui';

function assessment(
  overrides: Partial<TripEventContextAssessment> = {},
): TripEventContextAssessment {
  return {
    version: 1,
    status: 'COMPLETED',
    anchorType: 'DIMO_NATIVE_BEHAVIOR_EVENT',
    anchorTimestamp: '2026-06-01T10:00:00Z',
    windowStart: '2026-06-01T09:59:30Z',
    windowEnd: '2026-06-01T10:00:30Z',
    engineSignalsApplicable: true,
    engineOnHint: true,
    reasonCodes: [],
    preliminaryClassifications: ['KICKDOWN_LIKELY'],
    classifications: ['KICKDOWN_LIKELY'],
    usedSignals: [],
    missingSignals: [],
    signalCoverage: [],
    confidence: 'HIGH',
    evidenceGrade: 'A',
    generatedAt: '2026-06-01T10:01:00Z',
    ...overrides,
  };
}

function event(overrides: Partial<TripBehaviorEvent> = {}): TripBehaviorEvent {
  return {
    id: 'e1',
    organizationId: 'o1',
    vehicleId: 'v1',
    tripId: 't1',
    eventCategory: 'ACCELERATION',
    eventType: 'HARSH_ACCELERATION',
    classification: 'HARD',
    startedAt: '2026-06-01T10:00:00Z',
    endedAt: null,
    durationMs: null,
    startSpeedKmh: null,
    endSpeedKmh: null,
    peakValue: null,
    peakValueUnit: null,
    peakG: null,
    maxThrottlePos: 45,
    maxEngineRpm: 1800,
    maxCoolantTemp: 72,
    latitude: null,
    longitude: null,
    metadataJson: {},
    ...overrides,
  };
}

describe('trip event evidence display wiring', () => {
  it('shows context block data when contextAssessment is present', () => {
    const ev = event({ contextAssessment: assessment() });
    expect(shouldRenderContextBlock(ev.contextAssessment)).toBe(true);
    expect(contextHeadline(ev.contextAssessment)).toBe('Kickdown wahrscheinlich');
  });

  it('uses legacy measurements as primary fallback without contextAssessment', () => {
    const ev = event();
    expect(shouldRenderContextBlock(ev.contextAssessment)).toBe(false);
    const evidence = formatEventEvidence(ev);
    expect(evidence.some((e) => e.label === 'Drehzahl')).toBe(true);
    expect(evidence.some((e) => e.label === 'Gaspedal')).toBe(true);
    expect(evidence.some((e) => e.label === 'Kühlmittel')).toBe(true);
  });

  it('keeps legacy measurements available as secondary Messwerte when context exists', () => {
    const ev = event({ contextAssessment: assessment() });
    expect(formatEventEvidence(ev).some((e) => e.label === 'Drehzahl')).toBe(false);
    expect(hasLegacyMeasurements(ev)).toBe(true);
    expect(formatLegacyMeasurements(ev).length).toBeGreaterThan(0);
  });

  it('uses insufficient-context headline without classification label', () => {
    const ev = event({
      contextAssessment: assessment({
        status: 'INSUFFICIENT_CONTEXT',
        confidence: 'INSUFFICIENT',
        classifications: ['INSUFFICIENT_CONTEXT'],
        missingSignals: ['coolant'],
      }),
    });
    expect(contextHeadline(ev.contextAssessment)).toBe(
      'Natives DIMO-Ereignis erkannt, Kontext nicht ausreichend bewertbar',
    );
  });
});
