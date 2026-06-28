import { describe, expect, it } from 'vitest';
import type {
  TripBehaviorEvent,
  TripEventContextAssessment,
} from '../../../lib/api';
import {
  contextKeyValues,
  contextSummarySuffix,
  deriveTripAssessability,
  hasNativeBehaviorEvents,
  isContextInsufficient,
  primaryContextClassification,
} from './event-context-ui';

function ca(
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
    preliminaryClassifications: [],
    confidence: 'MEDIUM',
    evidenceGrade: 'B',
    generatedAt: '2026-06-01T10:01:00Z',
    ...overrides,
  };
}

function ev(overrides: Partial<TripBehaviorEvent> = {}): TripBehaviorEvent {
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
    durationMs: 1000,
    startSpeedKmh: 5,
    endSpeedKmh: 40,
    peakValue: null,
    peakValueUnit: null,
    peakG: null,
    maxThrottlePos: null,
    maxEngineRpm: null,
    maxCoolantTemp: null,
    latitude: null,
    longitude: null,
    metadataJson: {},
    ...overrides,
  };
}

describe('contextSummarySuffix', () => {
  it('shows the primary classification label', () => {
    expect(
      contextSummarySuffix(ca({ preliminaryClassifications: ['KICKDOWN_LIKELY'] })),
    ).toBe('Kontext: Kickdown wahrscheinlich');
    expect(
      contextSummarySuffix(ca({ preliminaryClassifications: ['LAUNCH_LIKE_START'] })),
    ).toBe('Kontext: Launch-like Start');
    expect(
      contextSummarySuffix(
        ca({ preliminaryClassifications: ['COLD_ENGINE_ACCELERATION'] }),
      ),
    ).toBe('Kontext: Kaltmotorbelastung');
  });

  it('shows an honest insufficient hint and never a classification', () => {
    const suffix = contextSummarySuffix(
      ca({ status: 'INSUFFICIENT_CONTEXT', confidence: 'INSUFFICIENT' }),
    );
    expect(suffix).toBe('Kontext nicht ausreichend bewertbar');
  });

  it('returns null when not applicable or absent', () => {
    expect(contextSummarySuffix(null)).toBeNull();
    expect(contextSummarySuffix(ca({ status: 'SKIPPED_NOT_APPLICABLE' }))).toBeNull();
  });
});

describe('primaryContextClassification / isContextInsufficient', () => {
  it('skips INSUFFICIENT_CONTEXT when picking a primary classification', () => {
    expect(
      primaryContextClassification(
        ca({ preliminaryClassifications: ['INSUFFICIENT_CONTEXT', 'AGGRESSIVE_START'] }),
      ),
    ).toBe('AGGRESSIVE_START');
  });

  it('detects insufficiency from status or confidence', () => {
    expect(isContextInsufficient(ca({ status: 'INSUFFICIENT_CONTEXT' }))).toBe(true);
    expect(isContextInsufficient(ca({ confidence: 'INSUFFICIENT' }))).toBe(true);
    expect(isContextInsufficient(ca())).toBe(false);
  });
});

describe('contextKeyValues', () => {
  it('renders pre→post speed and engine maxima when present', () => {
    const values = contextKeyValues(
      ca({
        speedContext: { valueBeforeAnchor: 4, valueAfterAnchor: 48 } as never,
        rpmContext: { max: 5200 } as never,
        throttleContext: { max: 92 } as never,
        coolantContext: { max: 40 } as never,
      }),
    );
    const byLabel = Object.fromEntries(values.map((v) => [v.label, v.value]));
    expect(byLabel['Speed (vor→nach)']).toBe('4 → 48 km/h');
    expect(byLabel['Max Drehzahl']).toBe('5200 rpm');
    expect(byLabel['Max Gaspedal']).toBe('92 %');
    expect(byLabel['Kühlmittel']).toBe('40 °C');
  });

  it('returns nothing when there are no signal stats', () => {
    expect(contextKeyValues(ca())).toEqual([]);
  });
});

describe('deriveTripAssessability', () => {
  it('is assessable when native events exist (allows Unauffällig)', () => {
    const a = deriveTripAssessability({
      enrichmentStatus: 'SKIPPED_NO_HF_DATA',
      hasNativeEvents: true,
    });
    expect(a.assessable).toBe(true);
    expect(a.source).toBe('NATIVE_EVENTS');
  });

  it('is assessable when HF completed with sufficient quality', () => {
    const a = deriveTripAssessability({
      enrichmentStatus: 'COMPLETED',
      detailsLimited: false,
      hasNativeEvents: false,
    });
    expect(a.assessable).toBe(true);
    expect(a.source).toBe('HF_SUFFICIENT');
  });

  it('is NOT assessable on skipped/failed/not-run with no source', () => {
    expect(
      deriveTripAssessability({
        enrichmentStatus: 'SKIPPED_NO_HF_DATA',
        hasNativeEvents: false,
      }).assessable,
    ).toBe(false);
    expect(
      deriveTripAssessability({
        enrichmentStatus: null,
        hasNativeEvents: false,
      }).assessable,
    ).toBe(false);
  });

  it('is NOT assessable when HF completed but details are limited (sparse)', () => {
    const a = deriveTripAssessability({
      enrichmentStatus: 'COMPLETED',
      detailsLimited: true,
      hasNativeEvents: false,
    });
    expect(a.assessable).toBe(false);
    expect(a.source).toBe('INSUFFICIENT_DATA');
  });
});

describe('hasNativeBehaviorEvents', () => {
  it('detects native provenance', () => {
    expect(hasNativeBehaviorEvents([ev({ provenance: 'NATIVE' })])).toBe(true);
    expect(hasNativeBehaviorEvents([ev({ source: 'DRIVING_EVENT' })])).toBe(true);
    expect(hasNativeBehaviorEvents([ev({ provenance: 'RECONSTRUCTED' })])).toBe(false);
    expect(hasNativeBehaviorEvents([])).toBe(false);
  });
});
