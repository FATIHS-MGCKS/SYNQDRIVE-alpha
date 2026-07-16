import {
  applyCapabilityLifecycle,
  BatteryCapabilityRefreshTrigger,
  DEFAULT_CAPABILITY_LIFECYCLE_POLICY,
  isCapabilityMeasurementEnabled,
} from './battery-capability-lifecycle.policy';
import { BatteryCapabilityPreflightStatus } from './battery-capability-preflight.types';
import { BatteryCapabilityStatus } from '../battery-v2-domain';

describe('battery-capability-lifecycle.policy', () => {
  const checkedAt = new Date('2026-07-16T12:00:00.000Z');

  it('creates new capability from healthy preflight', () => {
    const result = applyCapabilityLifecycle(
      null,
      BatteryCapabilityPreflightStatus.AVAILABLE_WITH_DATA,
      checkedAt,
    );

    expect(result.status).toBe(BatteryCapabilityStatus.AVAILABLE);
    expect(result.capabilityVersion).toBe(1);
    expect(result.consecutiveLossCount).toBe(0);
    expect(result.lifecycleReason).toBe('initial_preflight');
  });

  it('keeps version when healthy preflight is unchanged', () => {
    const result = applyCapabilityLifecycle(
      {
        status: BatteryCapabilityStatus.AVAILABLE,
        capabilityVersion: 2,
        consecutiveLossCount: 0,
        degradedAt: null,
        lastValue: 72,
      },
      BatteryCapabilityPreflightStatus.AVAILABLE_WITH_DATA,
      checkedAt,
    );

    expect(result.status).toBe(BatteryCapabilityStatus.AVAILABLE);
    expect(result.capabilityVersion).toBe(2);
    expect(result.statusChanged).toBe(false);
  });

  it('marks operational signal loss as DEGRADED first', () => {
    const result = applyCapabilityLifecycle(
      {
        status: BatteryCapabilityStatus.AVAILABLE,
        capabilityVersion: 3,
        consecutiveLossCount: 0,
        degradedAt: null,
        lastValue: 72,
      },
      BatteryCapabilityPreflightStatus.NOT_LISTED,
      checkedAt,
    );

    expect(result.status).toBe(BatteryCapabilityStatus.DEGRADED);
    expect(result.capabilityVersion).toBe(4);
    expect(result.consecutiveLossCount).toBe(1);
    expect(result.degradedAt).toEqual(checkedAt);
    expect(isCapabilityMeasurementEnabled(result.status)).toBe(false);
  });

  it('escalates repeated signal loss to UNAVAILABLE', () => {
    const degradedAt = new Date('2026-07-16T11:00:00.000Z');
    const result = applyCapabilityLifecycle(
      {
        status: BatteryCapabilityStatus.DEGRADED,
        capabilityVersion: 5,
        consecutiveLossCount: 2,
        degradedAt,
        lastValue: 72,
      },
      BatteryCapabilityPreflightStatus.NOT_LISTED,
      checkedAt,
    );

    expect(result.status).toBe(BatteryCapabilityStatus.UNAVAILABLE);
    expect(result.capabilityVersion).toBe(6);
    expect(result.consecutiveLossCount).toBe(3);
    expect(result.lifecycleReason).toBe('signal_loss_threshold');
  });

  it('recovers returning signal from DEGRADED to AVAILABLE', () => {
    const result = applyCapabilityLifecycle(
      {
        status: BatteryCapabilityStatus.DEGRADED,
        capabilityVersion: 4,
        consecutiveLossCount: 2,
        degradedAt: new Date('2026-07-15T12:00:00.000Z'),
        lastValue: 72,
      },
      BatteryCapabilityPreflightStatus.AVAILABLE_WITH_DATA,
      checkedAt,
    );

    expect(result.status).toBe(BatteryCapabilityStatus.AVAILABLE);
    expect(result.capabilityVersion).toBe(5);
    expect(result.consecutiveLossCount).toBe(0);
    expect(result.degradedAt).toBeNull();
    expect(result.lifecycleReason).toBe('signal_recovered');
    expect(isCapabilityMeasurementEnabled(result.status)).toBe(true);
  });

  it('preserves QUERY_ERROR without treating as NOT_LISTED loss', () => {
    const result = applyCapabilityLifecycle(
      {
        status: BatteryCapabilityStatus.AVAILABLE,
        capabilityVersion: 2,
        consecutiveLossCount: 0,
        degradedAt: null,
        lastValue: 12.4,
      },
      BatteryCapabilityPreflightStatus.QUERY_ERROR,
      checkedAt,
    );

    expect(result.status).toBe(BatteryCapabilityStatus.QUERY_ERROR);
    expect(result.capabilityVersion).toBe(2);
    expect(result.consecutiveLossCount).toBe(0);
  });

  it('exports refresh trigger constants', () => {
    expect(BatteryCapabilityRefreshTrigger.PERIODIC).toBe('PERIODIC');
    expect(BatteryCapabilityRefreshTrigger.MANUAL_ADMIN).toBe('MANUAL_ADMIN');
  });
});
