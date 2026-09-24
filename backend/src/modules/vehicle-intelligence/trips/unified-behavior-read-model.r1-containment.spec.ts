import {
  buildUnifiedBehaviorEvents,
  type BehaviorEventRow,
  type DrivingEventRow,
} from './unified-behavior-read-model';
import { serializeUnifiedBehaviorEvent } from './unified-behavior-event.dto';

const T0 = new Date('2026-09-01T10:00:00.000Z');

function behaviorRow(id: string, eventCategory: string, eventType: string, offsetS: number): BehaviorEventRow {
  return {
    id,
    organizationId: 'org-1',
    vehicleId: 'v1',
    tripId: 't1',
    eventCategory,
    eventType,
    classification: 'SEVERE',
    startedAt: new Date(T0.getTime() + offsetS * 1000),
    endedAt: null,
    durationMs: 1000,
    startSpeedKmh: 60,
    endSpeedKmh: 20,
    peakValue: 9,
    peakValueUnit: 'm/s²',
    peakG: 0.9,
    maxThrottlePos: null,
    maxEngineRpm: null,
    maxCoolantTemp: null,
    metadataJson: { detectionMethod: 'HF_RECONSTRUCTION', confidence: 'medium' },
    createdAt: T0,
  };
}

function nativeRow(): DrivingEventRow {
  return {
    id: 'de-1',
    organizationId: 'org-1',
    vehicleId: 'v1',
    tripId: 't1',
    eventType: 'HARSH_ACCELERATION',
    severity: 2,
    latitude: null,
    longitude: null,
    speedKmh: 30,
    deltaKmh: 12,
    durationMs: 1000,
    metadataJson: {
      dimoEventName: 'behavior.harshAcceleration',
      rpm: 4200,
      throttlePct: 88,
      coolantC: 41,
      contextAssessment: {
        version: 3,
        status: 'SUCCESS',
        anchorTimestamp: T0.toISOString(),
        confidence: 'HIGH',
        evidenceGrade: 'A',
        dataQuality: { sampleCount: 60, nearestSampleToAnchorMs: 0 },
        contextQuality: { providerDelayMs: 0, contextConfidence: 'HIGH' },
        speedContext: { max: 60, valueBeforeAnchor: 2, valueAfterAnchor: 30, nearestValueToAnchor: 5, nearestSampleDistanceMs: 0 },
        coolantContext: { min: 38, max: 42, nearestValueToAnchor: 39, nearestSampleDistanceMs: 0 },
      },
    },
    recordedAt: new Date(T0.getTime() + 120_000),
    createdAt: T0,
  };
}

const behaviorEvents = [
  behaviorRow('b-fb', 'ABUSE', 'FULL_BRAKING', 0),
  behaviorRow('b-imp', 'ABUSE', 'POSSIBLE_IMPACT', 30),
  behaviorRow('b-esd', 'ABUSE', 'ENGINE_SHUTDOWN_WHILE_DRIVING', 60),
  behaviorRow('b-kd', 'ABUSE', 'KICKDOWN', 90),
];

describe('Unified behaviour read-model — R1 temporal containment (EXP-021 C0.3)', () => {
  it('omits persisted R1 FULL_BRAKING / POSSIBLE_IMPACT / ENGINE_SHUTDOWN rows from presentation', () => {
    const events = buildUnifiedBehaviorEvents({
      behaviorEvents,
      drivingEvents: [],
      tripId: 't1',
      telemetrySourceFamily: 'RUPTELA_R1',
    });
    expect(events.map((e) => e.id)).toEqual(['b-kd']);
  });

  it('withholds point-in-time engine values and marks context as time-uncertain for R1 native events', () => {
    const [event] = buildUnifiedBehaviorEvents({
      behaviorEvents: [],
      drivingEvents: [nativeRow()],
      tripId: 't1',
      telemetrySourceFamily: 'RUPTELA_R1',
    });
    expect(event.maxEngineRpm).toBeNull();
    expect(event.maxThrottlePos).toBeNull();
    expect(event.maxCoolantTemp).toBeNull();
    expect(event.legacyIngestEvidence).toBeNull();
    const meta = event.metadataJson as Record<string, unknown>;
    expect(meta.rpm).toBeUndefined();
    expect(meta.throttlePct).toBeUndefined();
    expect(meta.coolantC).toBeUndefined();
    expect(meta.dimoEventName).toBe('behavior.harshAcceleration');
    expect((meta.contextAssessment as any).temporalContainment).toBeDefined();

    const dto = serializeUnifiedBehaviorEvent(event);
    expect(dto.contextAssessment?.temporalContainment?.reason).toBe(
      'R1_HISTORICAL_OBD_RECORD_TIME_UNCERTAIN',
    );
    expect(dto.contextAssessment?.confidence).toBe('LOW');
    expect(dto.contextAssessment?.keyValues).toMatchObject({
      preSpeed: null,
      postSpeed: null,
      coolantAtEvent: null,
      maxSpeed: 60,
    });
    expect(dto.contextAssessment?.dataQuality.nearestSampleToAnchorMs).toBeNull();
  });

  it.each([undefined, 'API_SYNTHETIC', 'UNKNOWN'] as const)(
    'leaves presentation unchanged for family %s',
    (family) => {
      const events = buildUnifiedBehaviorEvents({
        behaviorEvents,
        drivingEvents: [nativeRow()],
        tripId: 't1',
        telemetrySourceFamily: family,
      });
      expect(events.map((e) => e.id).sort()).toEqual(['b-esd', 'b-fb', 'b-imp', 'b-kd', 'de-1']);
      const native = events.find((e) => e.id === 'de-1')!;
      expect(native.maxEngineRpm).toBe(4200);
      expect(native.legacyIngestEvidence).toEqual({ rpm: 4200, throttlePct: 88, coolantC: 41 });
      const dto = serializeUnifiedBehaviorEvent(native);
      expect(dto.contextAssessment?.temporalContainment).toBeUndefined();
      expect(dto.contextAssessment?.keyValues.coolantAtEvent).toBe(39);
      expect(dto.contextAssessment?.confidence).toBe('HIGH');
    },
  );
});
