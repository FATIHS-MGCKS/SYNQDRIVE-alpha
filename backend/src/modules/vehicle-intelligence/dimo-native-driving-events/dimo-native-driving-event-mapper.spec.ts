import { DrivingEventType } from '@prisma/client';
import {
  mapDimoNativeDrivingEvent,
  normalizeDimoNativeEventKey,
  resolveDimoNativeEventSeverity,
} from './dimo-native-driving-event-mapper';
import {
  DIMO_NATIVE_DRIVING_EVENT_MAPPING_VERSION,
  DIMO_NATIVE_EVENT_PROVIDER_SOURCE,
} from './dimo-native-driving-event-mapper.types';
import { assessZeroNativeEventsConduct } from './dimo-native-events-assessability';

/** Audit event names from docs/audits/dimo-driving-signals-capability.md §5.2 / §8. */
const AUDIT_BEHAVIOR_EVENT_NAMES = [
  'behavior.harshBraking',
  'behavior.extremeBraking',
  'behavior.harshAcceleration',
  'behavior.extremeAcceleration',
  'behavior.harshCornering',
  'behavior.extremeEmergency',
  'behavior.extremeEmergencyBraking',
  'safety.collision',
] as const;

describe('normalizeDimoNativeEventKey', () => {
  it('normalizes audit names case- and separator-insensitively', () => {
    expect(normalizeDimoNativeEventKey('behavior.harshBraking')).toBe('harshbraking');
    expect(normalizeDimoNativeEventKey('Behavior.HarshBraking')).toBe('harshbraking');
    expect(normalizeDimoNativeEventKey('behavior.harsh_braking')).toBe('harshbraking');
    expect(normalizeDimoNativeEventKey('HarshBraking')).toBe('harshbraking');
    expect(normalizeDimoNativeEventKey('safety.collision')).toBe('collision');
  });
});

describe('mapDimoNativeDrivingEvent — audit names', () => {
  const expectContract = (
    mapping: ReturnType<typeof mapDimoNativeDrivingEvent>,
    expected: {
      canonicalEventType: DrivingEventType;
      classification: 'MODERATE' | 'HARD' | 'EXTREME';
      isKnownMapping: boolean;
    },
  ) => {
    expect(mapping.evidenceSourceType).toBe('PROVIDER_CLASSIFIED_EVENT');
    expect(mapping.providerSource).toBe(DIMO_NATIVE_EVENT_PROVIDER_SOURCE);
    expect(mapping.mappingVersion).toBe(DIMO_NATIVE_DRIVING_EVENT_MAPPING_VERSION);
    expect(mapping.canonicalEventType).toBe(expected.canonicalEventType);
    expect(mapping.classification).toBe(expected.classification);
    expect(mapping.isKnownMapping).toBe(expected.isKnownMapping);
    expect(mapping.providerEventName).toBeTruthy();
    expect(mapping.severity).toBeGreaterThan(0);
  };

  it.each([
    ['behavior.harshBraking', DrivingEventType.HARSH_BRAKING, 'HARD'],
    ['behavior.extremeBraking', DrivingEventType.EXTREME_BRAKING, 'EXTREME'],
    ['behavior.harshAcceleration', DrivingEventType.HARSH_ACCELERATION, 'HARD'],
    ['behavior.extremeAcceleration', DrivingEventType.HARSH_ACCELERATION, 'EXTREME'],
    ['behavior.harshCornering', DrivingEventType.HARSH_CORNERING, 'MODERATE'],
    ['behavior.extremeEmergency', DrivingEventType.EXTREME_BRAKING, 'EXTREME'],
    ['behavior.extremeEmergencyBraking', DrivingEventType.EXTREME_BRAKING, 'EXTREME'],
    ['safety.collision', DrivingEventType.SAFETY_COLLISION, 'EXTREME'],
  ] as const)(
    'maps audit name %s',
    (providerEventName, canonicalEventType, classification) => {
      const mapping = mapDimoNativeDrivingEvent(providerEventName);
      expectContract(mapping, {
        canonicalEventType,
        classification,
        isKnownMapping: true,
      });
      expect(mapping.providerEventName).toBe(providerEventName);
    },
  );

  it('maps segment-style PascalCase names without behavior prefix', () => {
    const mapping = mapDimoNativeDrivingEvent('HarshBraking');
    expect(mapping.canonicalEventType).toBe(DrivingEventType.HARSH_BRAKING);
    expect(mapping.classification).toBe('HARD');
    expect(mapping.isKnownMapping).toBe(true);
  });

  it('maps ExtremeBraking audit variant', () => {
    const mapping = mapDimoNativeDrivingEvent('ExtremeBraking');
    expect(mapping.canonicalEventType).toBe(DrivingEventType.EXTREME_BRAKING);
    expect(mapping.classification).toBe('EXTREME');
  });

  it('covers every documented audit behavior/safety name', () => {
    for (const name of AUDIT_BEHAVIOR_EVENT_NAMES) {
      const mapping = mapDimoNativeDrivingEvent(name);
      expect(mapping.isKnownMapping).toBe(true);
      expect(mapping.canonicalEventType).not.toBe(DrivingEventType.UNMAPPED_PROVIDER_EVENT);
    }
  });

  it('never discards unknown provider names — maps to UNMAPPED_PROVIDER_EVENT', () => {
    for (const raw of ['behavior.someFutureEvent', 'ignition.on', 'behavior.unknownThing', '']) {
      const mapping = mapDimoNativeDrivingEvent(raw);
      expect(mapping.canonicalEventType).toBe(DrivingEventType.UNMAPPED_PROVIDER_EVENT);
      expect(mapping.isKnownMapping).toBe(false);
      expect(mapping.evidenceSourceType).toBe('PROVIDER_CLASSIFIED_EVENT');
      expect(mapping.mappingVersion).toBe(DIMO_NATIVE_DRIVING_EVENT_MAPPING_VERSION);
    }
  });

  it('does not invent synthetic measurement values in the mapping contract', () => {
    const mapping = mapDimoNativeDrivingEvent('behavior.harshBraking');
    expect(Object.keys(mapping).sort()).toEqual(
      [
        'canonicalEventType',
        'classification',
        'evidenceSourceType',
        'isKnownMapping',
        'mappingVersion',
        'providerEventName',
        'providerSource',
        'severity',
      ].sort(),
    );
  });
});

describe('resolveDimoNativeEventSeverity', () => {
  it('elevates extreme acceleration above normal harsh acceleration', () => {
    const harsh = resolveDimoNativeEventSeverity(DrivingEventType.HARSH_ACCELERATION, 'HARD');
    const extreme = resolveDimoNativeEventSeverity(DrivingEventType.HARSH_ACCELERATION, 'EXTREME');
    expect(harsh).toBe(0.6);
    expect(extreme).toBe(0.9);
    expect(extreme).toBeGreaterThan(harsh);
  });

  it('keeps extreme braking at its existing severity', () => {
    expect(resolveDimoNativeEventSeverity(DrivingEventType.EXTREME_BRAKING, 'EXTREME')).toBe(0.9);
  });

  it('rates safety collision above harsh cornering', () => {
    const collision = resolveDimoNativeEventSeverity(DrivingEventType.SAFETY_COLLISION, 'EXTREME');
    const cornering = resolveDimoNativeEventSeverity(DrivingEventType.HARSH_CORNERING, 'MODERATE');
    expect(collision).toBeGreaterThan(cornering);
  });
});

describe('assessZeroNativeEventsConduct', () => {
  it('Tesla/EV without native events must not be rated unremarkable', () => {
    const result = assessZeroNativeEventsConduct({
      nativeBehaviorSupported: false,
      nativeEventAvailable: false,
      isEvPowertrain: true,
      nativeQuerySucceeded: true,
      nativeEventCount: 0,
    });
    expect(result.mayRateUnremarkable).toBe(false);
    expect(result.reason).toBe('ev_no_native_events');
  });

  it('supported ICE vehicle with confirmed zero events is not unremarkable', () => {
    const result = assessZeroNativeEventsConduct({
      nativeBehaviorSupported: true,
      nativeEventAvailable: true,
      isEvPowertrain: false,
      nativeQuerySucceeded: true,
      nativeEventCount: 0,
    });
    expect(result.mayRateUnremarkable).toBe(false);
    expect(result.reason).toBe('supported_but_zero_events');
  });

  it('allows unremarkable only when native events were observed', () => {
    const result = assessZeroNativeEventsConduct({
      nativeBehaviorSupported: true,
      nativeEventAvailable: true,
      isEvPowertrain: false,
      nativeQuerySucceeded: true,
      nativeEventCount: 3,
    });
    expect(result.mayRateUnremarkable).toBe(true);
    expect(result.reason).toBe('has_native_events');
  });
});
