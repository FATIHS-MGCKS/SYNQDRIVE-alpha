import {
  BatteryChemistry,
  BatteryDriveProfile,
  LvRestWindowEventType,
  LvRestWindowState,
} from '../battery-v2-domain';
import { resolveBatteryPolicy } from '../../battery-policy-profile/battery-policy-profile.resolver';
import { buildLvRestWindowPolicyContext } from './lv-rest-window.policy';
import { reduceLvRestWindow } from './lv-rest-window.state-machine';
import type {
  LvRestWindowEvent,
  LvRestWindowPolicyContext,
  LvRestWindowRecord,
  LvRestWindowSignalContext,
} from './lv-rest-window.types';

const VEHICLE_ID = 'veh-ice-1';
const TRIP_END = new Date('2026-07-16T10:00:00.000Z');
const SNAPSHOT_1 = new Date('2026-07-16T10:02:00.000Z');
const SNAPSHOT_STABLE = new Date('2026-07-16T10:07:00.000Z');

function icePolicy(): LvRestWindowPolicyContext {
  return buildLvRestWindowPolicyContext(
    resolveBatteryPolicy({
      driveProfile: BatteryDriveProfile.ICE,
      chemistry: BatteryChemistry.LEAD_ACID,
      lvSignalPresent: true,
    }),
  );
}

function bevPolicy(): LvRestWindowPolicyContext {
  return buildLvRestWindowPolicyContext(
    resolveBatteryPolicy({
      driveProfile: BatteryDriveProfile.BEV,
      chemistry: BatteryChemistry.LEAD_ACID,
      lvSignalPresent: true,
    }),
  );
}

function baseSignal(
  overrides: Partial<LvRestWindowSignalContext> = {},
): LvRestWindowSignalContext {
  return {
    observedAt: SNAPSHOT_1,
    providerObservedAt: SNAPSHOT_1,
    providerError: false,
    speedKmh: 0,
    ignitionOn: false,
    engineRunning: false,
    hasActiveTrip: false,
    isLvCharging: false,
    isHvCharging: false,
    lvVoltage: 12.5,
    lastActivityAt: TRIP_END,
    tripEndAt: TRIP_END,
    tripId: 'trip-1',
    ...overrides,
  };
}

function tripEndedEvent(
  overrides: Partial<LvRestWindowSignalContext> = {},
): LvRestWindowEvent {
  return {
    type: LvRestWindowEventType.TRIP_ENDED,
    at: TRIP_END,
    signal: baseSignal({ observedAt: TRIP_END, ...overrides }),
  };
}

describe('lv-rest-window.state-machine', () => {
  it('opens CANDIDATE on trip end with reliable anchor', () => {
    const result = reduceLvRestWindow(
      VEHICLE_ID,
      null,
      tripEndedEvent(),
      icePolicy(),
    );

    expect(result.changed).toBe(true);
    expect(result.current?.state).toBe(LvRestWindowState.CANDIDATE);
    expect(result.current?.anchorAt).toEqual(TRIP_END);
    expect(result.current?.windowId).toBe(`lv-rest:${VEHICLE_ID}:${TRIP_END.getTime()}`);
  });

  it('rejects trip end for unsupported LV profile', () => {
    const result = reduceLvRestWindow(
      VEHICLE_ID,
      null,
      tripEndedEvent(),
      bevPolicy(),
    );

    expect(result.changed).toBe(false);
    expect(result.current).toBeNull();
    expect(result.reason).toBe('lv_rest_not_supported_for_profile');
  });

  it('does not open rest on provider error', () => {
    const result = reduceLvRestWindow(
      VEHICLE_ID,
      null,
      tripEndedEvent({ providerError: true, providerObservedAt: null }),
      icePolicy(),
    );

    expect(result.changed).toBe(false);
    expect(result.reason).toBe('provider_error');
  });

  it('ignores duplicate trip end for same anchor', () => {
    const first = reduceLvRestWindow(
      VEHICLE_ID,
      null,
      tripEndedEvent(),
      icePolicy(),
    );
    const second = reduceLvRestWindow(
      VEHICLE_ID,
      first.current,
      tripEndedEvent(),
      icePolicy(),
    );

    expect(second.changed).toBe(false);
    expect(second.reason).toBe('duplicate_trip_end_event');
  });

  it('promotes CANDIDATE to RESTING on valid rest snapshot', () => {
    const opened = reduceLvRestWindow(
      VEHICLE_ID,
      null,
      tripEndedEvent(),
      icePolicy(),
    );

    const resting = reduceLvRestWindow(
      VEHICLE_ID,
      opened.current,
      {
        type: LvRestWindowEventType.REST_SNAPSHOT,
        at: SNAPSHOT_1,
        signal: baseSignal(),
      },
      icePolicy(),
    );

    expect(resting.changed).toBe(true);
    expect(resting.current?.state).toBe(LvRestWindowState.RESTING);
    expect(resting.current?.confirmedRestingAt).toEqual(SNAPSHOT_1);
  });

  it('does not start rest window from wake snapshot alone', () => {
    const result = reduceLvRestWindow(
      VEHICLE_ID,
      null,
      {
        type: LvRestWindowEventType.REST_SNAPSHOT,
        at: SNAPSHOT_1,
        signal: baseSignal({ lvVoltage: 14.1 }),
      },
      icePolicy(),
    );

    expect(result.changed).toBe(false);
    expect(result.current).toBeNull();
  });

  it('invalidates candidate on wake voltage snapshot', () => {
    const opened = reduceLvRestWindow(
      VEHICLE_ID,
      null,
      tripEndedEvent(),
      icePolicy(),
    );

    const invalidated = reduceLvRestWindow(
      VEHICLE_ID,
      opened.current,
      {
        type: LvRestWindowEventType.REST_SNAPSHOT,
        at: SNAPSHOT_1,
        signal: baseSignal({ lvVoltage: 14.2 }),
      },
      icePolicy(),
    );

    expect(invalidated.current?.state).toBe(LvRestWindowState.INVALIDATED);
    expect(invalidated.current?.invalidatedReason).toBe('wake_voltage');
  });

  it('invalidates resting window on charging context', () => {
    const opened = reduceLvRestWindow(
      VEHICLE_ID,
      null,
      tripEndedEvent(),
      icePolicy(),
    );
    const resting = reduceLvRestWindow(
      VEHICLE_ID,
      opened.current,
      {
        type: LvRestWindowEventType.REST_SNAPSHOT,
        at: SNAPSHOT_1,
        signal: baseSignal(),
      },
      icePolicy(),
    );

    const invalidated = reduceLvRestWindow(
      VEHICLE_ID,
      resting.current,
      {
        type: LvRestWindowEventType.CHARGING_DETECTED,
        at: new Date('2026-07-16T10:05:00.000Z'),
        signal: baseSignal({ isLvCharging: true, lvVoltage: 13.9 }),
      },
      icePolicy(),
    );

    expect(invalidated.current?.state).toBe(LvRestWindowState.INVALIDATED);
    expect(invalidated.current?.invalidatedReason).toBe('charging_detected');
  });

  it('invalidates resting window on new trip start', () => {
    const opened = reduceLvRestWindow(
      VEHICLE_ID,
      null,
      tripEndedEvent(),
      icePolicy(),
    );
    const resting = reduceLvRestWindow(
      VEHICLE_ID,
      opened.current,
      {
        type: LvRestWindowEventType.REST_SNAPSHOT,
        at: SNAPSHOT_1,
        signal: baseSignal(),
      },
      icePolicy(),
    );

    const invalidated = reduceLvRestWindow(
      VEHICLE_ID,
      resting.current,
      {
        type: LvRestWindowEventType.NEW_TRIP_STARTED,
        at: new Date('2026-07-16T10:20:00.000Z'),
        signal: baseSignal({ hasActiveTrip: true, speedKmh: 12 }),
      },
      icePolicy(),
    );

    expect(invalidated.current?.state).toBe(LvRestWindowState.INVALIDATED);
  });

  it('invalidates resting window on explicit wake event', () => {
    let current: LvRestWindowRecord | null = null;
    current = reduceLvRestWindow(
      VEHICLE_ID,
      current,
      tripEndedEvent(),
      icePolicy(),
    ).current;
    current = reduceLvRestWindow(
      VEHICLE_ID,
      current,
      {
        type: LvRestWindowEventType.REST_SNAPSHOT,
        at: SNAPSHOT_1,
        signal: baseSignal(),
      },
      icePolicy(),
    ).current;

    const invalidated = reduceLvRestWindow(
      VEHICLE_ID,
      current,
      {
        type: LvRestWindowEventType.WAKE_DETECTED,
        at: new Date('2026-07-16T10:08:00.000Z'),
        signal: baseSignal({ lvVoltage: 14.0 }),
      },
      icePolicy(),
    );

    expect(invalidated.current?.state).toBe(LvRestWindowState.INVALIDATED);
    expect(invalidated.current?.invalidatedReason).toBe('wake_detected');
  });

  it('rejects rest snapshot with missing provider observedAt', () => {
    const opened = reduceLvRestWindow(
      VEHICLE_ID,
      null,
      tripEndedEvent(),
      icePolicy(),
    );

    const result = reduceLvRestWindow(
      VEHICLE_ID,
      opened.current,
      {
        type: LvRestWindowEventType.REST_SNAPSHOT,
        at: SNAPSHOT_1,
        signal: baseSignal({ providerObservedAt: null }),
      },
      icePolicy(),
    );

    expect(result.changed).toBe(false);
    expect(result.reason).toBe('missing_provider_observed_at');
  });

  it('completes resting window after stability dwell without 60m/6h jobs', () => {
    let current: LvRestWindowRecord | null = null;
    current = reduceLvRestWindow(
      VEHICLE_ID,
      current,
      tripEndedEvent(),
      icePolicy(),
    ).current;
    current = reduceLvRestWindow(
      VEHICLE_ID,
      current,
      {
        type: LvRestWindowEventType.REST_SNAPSHOT,
        at: SNAPSHOT_1,
        signal: baseSignal({ observedAt: SNAPSHOT_1, providerObservedAt: SNAPSHOT_1 }),
      },
      icePolicy(),
    ).current;

    const completed = reduceLvRestWindow(
      VEHICLE_ID,
      current,
      {
        type: LvRestWindowEventType.REST_SNAPSHOT,
        at: SNAPSHOT_STABLE,
        signal: baseSignal({
          observedAt: SNAPSHOT_STABLE,
          providerObservedAt: SNAPSHOT_STABLE,
        }),
      },
      icePolicy(),
    );

    expect(completed.current?.state).toBe(LvRestWindowState.COMPLETED);
    expect(completed.reason).toBe('rest_window_stability_completed');
  });

  it('deduplicates identical rest snapshot timestamps', () => {
    let current = reduceLvRestWindow(
      VEHICLE_ID,
      null,
      tripEndedEvent(),
      icePolicy(),
    ).current;
    current = reduceLvRestWindow(
      VEHICLE_ID,
      current,
      {
        type: LvRestWindowEventType.REST_SNAPSHOT,
        at: SNAPSHOT_1,
        signal: baseSignal(),
      },
      icePolicy(),
    ).current;

    const duplicate = reduceLvRestWindow(
      VEHICLE_ID,
      current,
      {
        type: LvRestWindowEventType.REST_SNAPSHOT,
        at: SNAPSHOT_1,
        signal: baseSignal(),
      },
      icePolicy(),
    );

    expect(duplicate.changed).toBe(false);
    expect(duplicate.reason).toBe('duplicate_rest_snapshot');
  });
});
