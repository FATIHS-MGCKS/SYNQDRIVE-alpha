import {
  normalizeContextAssessmentForDto,
  serializeUnifiedBehaviorEvent,
} from './unified-behavior-event.dto';
import {
  buildUnifiedBehaviorEvents,
  mapDrivingEventRow,
  type DrivingEventRow,
} from './unified-behavior-read-model';

const TRIP = 'trip-1';
const VEH = 'veh-1';
const ORG = 'org-1';
const T0 = new Date('2026-01-01T10:00:00.000Z');

function sampleContextAssessment() {
  return {
    version: 1,
    status: 'COMPLETED' as const,
    anchorType: 'DIMO_NATIVE_BEHAVIOR_EVENT' as const,
    anchorTimestamp: T0.toISOString(),
    windowStart: '2026-01-01T09:59:30.000Z',
    windowEnd: '2026-01-01T10:00:30.000Z',
    engineSignalsApplicable: true,
    engineOnHint: true,
    dataQuality: {
      sampleCount: 21,
      medianIntervalMs: 1000,
      p95IntervalMs: 2000,
      maxGapMs: 3000,
      nearestSampleToAnchorMs: 0,
      coverage: [],
    },
    signalCoverage: [{ signal: 'speed', quality: 'GOOD' }],
    speedContext: {
      signal: 'speed',
      count: 21,
      nonNullCount: 21,
      min: 20,
      max: 80,
      avg: 50,
      valueBeforeAnchor: 45,
      valueAfterAnchor: 55,
      nearestValueToAnchor: 50,
      coverageQuality: 'GOOD',
    },
    rpmContext: {
      signal: 'rpm',
      count: 21,
      nonNullCount: 18,
      min: 1200,
      max: 4200,
      avg: 2500,
      valueBeforeAnchor: 1500,
      valueAfterAnchor: 2800,
      nearestValueToAnchor: 1800,
      coverageQuality: 'GOOD',
    },
    throttleContext: {
      signal: 'throttle',
      count: 21,
      nonNullCount: 18,
      min: 5,
      max: 95,
      avg: 40,
      valueBeforeAnchor: 20,
      valueAfterAnchor: 60,
      nearestValueToAnchor: 45,
      coverageQuality: 'GOOD',
    },
    engineLoadContext: {
      signal: 'engineLoad',
      count: 21,
      nonNullCount: 18,
      min: 10,
      max: 88,
      avg: 42,
      valueBeforeAnchor: 30,
      valueAfterAnchor: 55,
      nearestValueToAnchor: 35,
      coverageQuality: 'GOOD',
    },
    coolantContext: {
      signal: 'coolant',
      count: 21,
      nonNullCount: 15,
      min: 58,
      max: 92,
      avg: 75,
      valueBeforeAnchor: 60,
      valueAfterAnchor: 78,
      nearestValueToAnchor: 72,
      coverageQuality: 'SPARSE',
    },
    reasonCodes: ['HIGH_RPM_IN_WINDOW'],
    preliminaryClassifications: ['AGGRESSIVE_START'],
    classifications: ['AGGRESSIVE_START'],
    confidence: 'MEDIUM' as const,
    evidenceGrade: 'B' as const,
    usedSignals: ['speed', 'rpm', 'throttle'],
    missingSignals: ['engineLoad'],
    generatedAt: T0.toISOString(),
    error: null,
  };
}

function nativeEvent(
  overrides: Partial<DrivingEventRow> & { eventType: string },
): DrivingEventRow {
  return {
    id: `de-${Math.random().toString(36).slice(2)}`,
    organizationId: ORG,
    vehicleId: VEH,
    tripId: TRIP,
    severity: 0.9,
    latitude: null,
    longitude: null,
    speedKmh: 50,
    deltaKmh: null,
    durationMs: 1000,
    metadataJson: {},
    recordedAt: T0,
    createdAt: T0,
    ...overrides,
  };
}

describe('normalizeContextAssessmentForDto', () => {
  it('maps full contextAssessment including keyValues and classifications', () => {
    const dto = normalizeContextAssessmentForDto(
      sampleContextAssessment(),
      'behavior.harshAcceleration',
    );
    expect(dto).not.toBeNull();
    expect(dto!.status).toBe('COMPLETED');
    expect(dto!.anchorType).toBe('DIMO_NATIVE_BEHAVIOR_EVENT');
    expect(dto!.originalEventName).toBe('behavior.harshAcceleration');
    expect(dto!.dimoEventName).toBe('behavior.harshAcceleration');
    expect(dto!.classifications).toEqual(['AGGRESSIVE_START']);
    expect(dto!.confidence).toBe('MEDIUM');
    expect(dto!.evidenceGrade).toBe('B');
    expect(dto!.usedSignals).toEqual(['speed', 'rpm', 'throttle']);
    expect(dto!.missingSignals).toEqual(['engineLoad']);
    expect(dto!.signalCoverage).toHaveLength(1);
    expect(dto!.keyValues).toEqual({
      preSpeed: 45,
      postSpeed: 55,
      maxSpeed: 80,
      maxRpm: 4200,
      maxThrottle: 95,
      maxEngineLoad: 88,
      coolantAtEvent: 72,
      coolantMin: 58,
      coolantMax: 92,
    });
  });

  it('returns null for missing or invalid assessment blobs', () => {
    expect(normalizeContextAssessmentForDto(null, null)).toBeNull();
    expect(normalizeContextAssessmentForDto({ foo: 'bar' }, null)).toBeNull();
  });
});

describe('serializeUnifiedBehaviorEvent', () => {
  it('includes structured contextAssessment on native events', () => {
    const row = nativeEvent({
      eventType: 'HARSH_ACCELERATION',
      metadataJson: {
        classification: 'HARD',
        dimoEventName: 'behavior.harshAcceleration',
        rpm: 1800,
        throttlePct: 45,
        coolantC: 72,
        contextAssessment: sampleContextAssessment(),
      },
    });
    const mapped = mapDrivingEventRow(row, TRIP);
    const dto = serializeUnifiedBehaviorEvent(mapped);

    expect(dto.contextAssessment).not.toBeNull();
    expect(dto.contextAssessment!.status).toBe('COMPLETED');
    expect(dto.contextAssessment!.windowStart).toBe('2026-01-01T09:59:30.000Z');
    expect(dto.contextAssessment!.keyValues.maxRpm).toBe(4200);
    expect(dto.originalEventName).toBe('behavior.harshAcceleration');
    expect(dto.legacyIngestEvidence).toEqual({
      rpm: 1800,
      throttlePct: 45,
      coolantC: 72,
    });
    expect(dto.startedAt).toBe(T0.toISOString());
  });

  it('remains compatible when contextAssessment is absent', () => {
    const row = nativeEvent({
      eventType: 'HARSH_BRAKING',
      metadataJson: { dimoEventName: 'behavior.harshBraking' },
    });
    const dto = serializeUnifiedBehaviorEvent(mapDrivingEventRow(row, TRIP));
    expect(dto.contextAssessment).toBeNull();
    expect(dto.legacyIngestEvidence).toBeNull();
    expect(dto.originalEventName).toBe('behavior.harshBraking');
    expect(dto.eventType).toBe('HARSH_BRAKING');
  });
});

describe('buildUnifiedBehaviorEvents context + dedupe', () => {
  it('dedupes duplicate native rows at same timestamp/type/source (context wins)', () => {
    const context = sampleContextAssessment();
    const merged = buildUnifiedBehaviorEvents({
      drivingEvents: [
        nativeEvent({
          id: 'de-a',
          eventType: 'HARSH_ACCELERATION',
          recordedAt: T0,
          metadataJson: { dimoEventName: 'behavior.harshAcceleration' },
        }),
        nativeEvent({
          id: 'de-b',
          eventType: 'HARSH_ACCELERATION',
          recordedAt: T0,
          metadataJson: {
            dimoEventName: 'behavior.harshAcceleration',
            contextAssessment: context,
          },
        }),
      ],
      behaviorEvents: [],
      tripId: TRIP,
    });

    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe('de-b');
    expect(merged[0].contextAssessment).toBeDefined();
    expect(merged[0].originalEventName).toBe('behavior.harshAcceleration');
  });

  it('native + derived same category within dedup window => one native row', () => {
    const merged = buildUnifiedBehaviorEvents({
      drivingEvents: [
        nativeEvent({
          eventType: 'EXTREME_BRAKING',
          recordedAt: T0,
          metadataJson: { dimoEventName: 'behavior.extremeBraking' },
        }),
      ],
      behaviorEvents: [
        {
          id: 'be-1',
          organizationId: ORG,
          vehicleId: VEH,
          tripId: TRIP,
          eventCategory: 'BRAKING',
          eventType: 'BRAKING',
          classification: 'SEVERE',
          startedAt: new Date(T0.getTime() + 2_000),
          endedAt: null,
          durationMs: 1000,
          startSpeedKmh: 50,
          endSpeedKmh: 0,
          peakValue: 1,
          peakValueUnit: 'g',
          peakG: null,
          maxThrottlePos: null,
          maxEngineRpm: null,
          maxCoolantTemp: null,
          metadataJson: {},
          createdAt: T0,
        },
      ],
      tripId: TRIP,
    });
    expect(merged).toHaveLength(1);
    expect(merged[0].provenance).toBe('NATIVE');
    expect(merged[0].originalEventName).toBe('behavior.extremeBraking');
  });
});
