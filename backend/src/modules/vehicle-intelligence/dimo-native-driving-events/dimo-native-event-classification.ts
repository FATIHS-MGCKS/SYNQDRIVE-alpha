import { DrivingEventType } from '@prisma/client';
import type { DimoNativeEventClassification } from './dimo-native-driving-event-mapper.types';

export type NativeDrivingEventCountInput = {
  eventType: DrivingEventType;
  metadataJson?: unknown;
};

export type NativeAccelerationEventCounts = {
  harshAcceleration: number;
  extremeAcceleration: number;
  totalAcceleration: number;
};

const NATIVE_CLASSIFICATIONS = new Set<DimoNativeEventClassification>([
  'MODERATE',
  'HARD',
  'EXTREME',
]);

/**
 * Read provider classification from persisted native event metadata.
 * Falls back to event-type defaults only when metadata is absent.
 */
export function readNativeEventClassification(
  metadataJson: unknown,
  eventType: DrivingEventType,
): DimoNativeEventClassification {
  const meta = (metadataJson as Record<string, unknown> | null) ?? {};
  const stored = meta.classification;
  if (typeof stored === 'string' && NATIVE_CLASSIFICATIONS.has(stored as DimoNativeEventClassification)) {
    return stored as DimoNativeEventClassification;
  }
  switch (eventType) {
    case DrivingEventType.EXTREME_BRAKING:
    case DrivingEventType.SAFETY_COLLISION:
      return 'EXTREME';
    case DrivingEventType.HARSH_BRAKING:
    case DrivingEventType.HARSH_ACCELERATION:
      return 'HARD';
    case DrivingEventType.HARSH_CORNERING:
      return 'MODERATE';
    default:
      return 'MODERATE';
  }
}

export function isNativeExtremeAcceleration(event: NativeDrivingEventCountInput): boolean {
  return (
    event.eventType === DrivingEventType.HARSH_ACCELERATION &&
    readNativeEventClassification(event.metadataJson, event.eventType) === 'EXTREME'
  );
}

export function isNativeHarshAcceleration(event: NativeDrivingEventCountInput): boolean {
  return (
    event.eventType === DrivingEventType.HARSH_ACCELERATION &&
    readNativeEventClassification(event.metadataJson, event.eventType) !== 'EXTREME'
  );
}

/** Split native acceleration events by provider classification. */
export function countNativeAccelerationEvents(
  events: NativeDrivingEventCountInput[],
): NativeAccelerationEventCounts {
  let harshAcceleration = 0;
  let extremeAcceleration = 0;
  for (const event of events) {
    if (event.eventType !== DrivingEventType.HARSH_ACCELERATION) continue;
    if (isNativeExtremeAcceleration(event)) extremeAcceleration += 1;
    else harshAcceleration += 1;
  }
  return {
    harshAcceleration,
    extremeAcceleration,
    totalAcceleration: harshAcceleration + extremeAcceleration,
  };
}
