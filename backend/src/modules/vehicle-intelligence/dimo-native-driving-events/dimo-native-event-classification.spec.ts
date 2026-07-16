import { DrivingEventType } from '@prisma/client';
import {
  countNativeAccelerationEvents,
  isNativeExtremeAcceleration,
  isNativeHarshAcceleration,
  readNativeEventClassification,
} from './dimo-native-event-classification';

describe('readNativeEventClassification', () => {
  it('preserves provider EXTREME on HARSH_ACCELERATION', () => {
    expect(
      readNativeEventClassification(
        { classification: 'EXTREME', dimoEventName: 'behavior.extremeAcceleration' },
        DrivingEventType.HARSH_ACCELERATION,
      ),
    ).toBe('EXTREME');
  });

  it('falls back to HARD for harsh acceleration without metadata', () => {
    expect(readNativeEventClassification(null, DrivingEventType.HARSH_ACCELERATION)).toBe('HARD');
  });
});

describe('countNativeAccelerationEvents', () => {
  it('counts harshAcceleration only for HARD classification', () => {
    const counts = countNativeAccelerationEvents([
      {
        eventType: DrivingEventType.HARSH_ACCELERATION,
        metadataJson: { classification: 'HARD', dimoEventName: 'behavior.harshAcceleration' },
      },
      {
        eventType: DrivingEventType.HARSH_ACCELERATION,
        metadataJson: { classification: 'HARD', dimoEventName: 'behavior.harshAcceleration' },
      },
    ]);
    expect(counts).toEqual({
      harshAcceleration: 2,
      extremeAcceleration: 0,
      totalAcceleration: 2,
    });
  });

  it('counts extremeAcceleration for provider EXTREME on HARSH_ACCELERATION', () => {
    const counts = countNativeAccelerationEvents([
      {
        eventType: DrivingEventType.HARSH_ACCELERATION,
        metadataJson: { classification: 'EXTREME', dimoEventName: 'behavior.extremeAcceleration' },
      },
    ]);
    expect(counts.extremeAcceleration).toBe(1);
    expect(counts.harshAcceleration).toBe(0);
    expect(isNativeExtremeAcceleration({
      eventType: DrivingEventType.HARSH_ACCELERATION,
      metadataJson: { classification: 'EXTREME' },
    })).toBe(true);
    expect(isNativeHarshAcceleration({
      eventType: DrivingEventType.HARSH_ACCELERATION,
      metadataJson: { classification: 'EXTREME' },
    })).toBe(false);
  });

  it('separates mixed harsh and extreme acceleration on one trip', () => {
    const counts = countNativeAccelerationEvents([
      {
        eventType: DrivingEventType.HARSH_ACCELERATION,
        metadataJson: { classification: 'HARD', dimoEventName: 'behavior.harshAcceleration' },
      },
      {
        eventType: DrivingEventType.HARSH_ACCELERATION,
        metadataJson: { classification: 'EXTREME', dimoEventName: 'behavior.extremeAcceleration' },
      },
      {
        eventType: DrivingEventType.HARSH_ACCELERATION,
        metadataJson: { classification: 'EXTREME', dimoEventName: 'behavior.extremeAcceleration' },
      },
      { eventType: DrivingEventType.EXTREME_BRAKING, metadataJson: { classification: 'EXTREME' } },
    ]);
    expect(counts).toEqual({
      harshAcceleration: 1,
      extremeAcceleration: 2,
      totalAcceleration: 3,
    });
  });
});
