import { DrivingEventType } from '@prisma/client';
import {
  LteR1BehaviorEnrichmentService,
  mapDimoEventName,
  resolveNativeSeverity,
} from './lte-r1-behavior-enrichment.service';
import type { DimoVehicleEventRecord } from '../../dimo/dimo-segments.service';

describe('mapDimoEventName', () => {
  it('maps harsh acceleration to HARSH_ACCELERATION / HARD', () => {
    expect(mapDimoEventName('behavior.harshAcceleration')).toEqual({
      eventType: DrivingEventType.HARSH_ACCELERATION,
      classification: 'HARD',
    });
  });

  it('does NOT ignore extreme acceleration — maps it to HARSH_ACCELERATION / EXTREME', () => {
    expect(mapDimoEventName('behavior.extremeAcceleration')).toEqual({
      eventType: DrivingEventType.HARSH_ACCELERATION,
      classification: 'EXTREME',
    });
  });

  it('keeps extreme braking working', () => {
    expect(mapDimoEventName('behavior.extremeBraking')).toEqual({
      eventType: DrivingEventType.EXTREME_BRAKING,
      classification: 'EXTREME',
    });
  });

  it('maps the emergency braking variants to EXTREME_BRAKING', () => {
    expect(mapDimoEventName('behavior.extremeEmergency')?.eventType).toBe(DrivingEventType.EXTREME_BRAKING);
    expect(mapDimoEventName('behavior.extremeEmergencyBraking')?.eventType).toBe(DrivingEventType.EXTREME_BRAKING);
  });

  it('maps harsh braking and cornering with their existing classifications', () => {
    expect(mapDimoEventName('behavior.harshBraking')).toEqual({
      eventType: DrivingEventType.HARSH_BRAKING,
      classification: 'HARD',
    });
    expect(mapDimoEventName('behavior.harshCornering')).toEqual({
      eventType: DrivingEventType.HARSH_CORNERING,
      classification: 'MODERATE',
    });
  });

  it('is case-insensitive and separator-tolerant for extreme acceleration', () => {
    for (const raw of [
      'Behavior.ExtremeAcceleration',
      'behavior.extreme_acceleration',
      'behavior.extreme-acceleration',
      '  behavior.extremeAcceleration  ',
    ]) {
      expect(mapDimoEventName(raw)).toEqual({
        eventType: DrivingEventType.HARSH_ACCELERATION,
        classification: 'EXTREME',
      });
    }
  });

  it('safely ignores unknown DIMO event names', () => {
    expect(mapDimoEventName('behavior.someFutureEvent')).toBeNull();
    expect(mapDimoEventName('ignition.on')).toBeNull();
    expect(mapDimoEventName('')).toBeNull();
  });
});

describe('resolveNativeSeverity', () => {
  it('elevates extreme acceleration above normal harsh acceleration', () => {
    const harsh = resolveNativeSeverity(DrivingEventType.HARSH_ACCELERATION, 'HARD');
    const extreme = resolveNativeSeverity(DrivingEventType.HARSH_ACCELERATION, 'EXTREME');
    expect(harsh).toBe(0.6);
    expect(extreme).toBe(0.9);
    expect(extreme).toBeGreaterThan(harsh);
  });

  it('keeps extreme braking at its existing severity', () => {
    expect(resolveNativeSeverity(DrivingEventType.EXTREME_BRAKING, 'EXTREME')).toBe(0.9);
  });
});

describe('LteR1BehaviorEnrichmentService.mapToNormalizedEvents', () => {
  const service = new LteR1BehaviorEnrichmentService({} as any, {} as any);

  const sample = (name: string, metadata: string | null = '{"counterValue":1}'): DimoVehicleEventRecord => ({
    timestamp: '2026-01-01T12:00:00.000Z',
    name,
    source: '0xDEVICEWALLET',
    durationNs: 0,
    metadata,
  });

  function mapSamples(samples: DimoVehicleEventRecord[]): any[] {
    return (service as any).mapToNormalizedEvents(samples, 'veh-1', 'org-1', 'trip-1', new Map());
  }

  it('preserves the original DIMO event name and tags extreme acceleration distinctly', () => {
    const [event] = mapSamples([sample('behavior.extremeAcceleration')]);
    expect(event.eventType).toBe(DrivingEventType.HARSH_ACCELERATION);
    expect(event.classification).toBe('EXTREME');
    expect(event.severity).toBe(0.9);
    expect(event.rawName).toBe('behavior.extremeAcceleration');
    expect(event.counterValue).toBe(1);
  });

  it('keeps normal harsh acceleration at HARD / 0.6', () => {
    const [event] = mapSamples([sample('behavior.harshAcceleration')]);
    expect(event.eventType).toBe(DrivingEventType.HARSH_ACCELERATION);
    expect(event.classification).toBe('HARD');
    expect(event.severity).toBe(0.6);
  });

  it('drops unknown event names but keeps mappable ones', () => {
    const events = mapSamples([
      sample('behavior.harshBraking'),
      sample('behavior.unknownThing'),
      sample('behavior.extremeAcceleration'),
    ]);
    expect(events).toHaveLength(2);
    expect(events.map((e) => e.eventType)).toEqual([
      DrivingEventType.HARSH_BRAKING,
      DrivingEventType.HARSH_ACCELERATION,
    ]);
  });
});
