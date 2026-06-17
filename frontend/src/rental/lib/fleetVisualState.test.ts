import { describe, expect, it } from 'vitest';
import { deriveFleetVisualState } from './fleetVisualState';
import type { FleetVisualStateVehicle } from './fleetVisualState';

function base(overrides: Partial<FleetVisualStateVehicle> = {}): FleetVisualStateVehicle {
  return {
    status: 'Available',
    lat: 51.31,
    lng: 9.48,
    healthStatus: 'Good Health',
    onlineStatus: 'ONLINE',
    lastSignal: new Date().toISOString(),
    isFresh: true,
    activeBookingId: null,
    reservedBookingId: null,
    activeIsOverdue: false,
    reservedIsOverdue: false,
    maintenanceUrgency: null,
    maintenanceReasonCode: null,
    ...overrides,
  };
}

describe('deriveFleetVisualState', () => {
  it('available + online + not blocked => ready', () => {
    const state = deriveFleetVisualState(base());
    expect(state.visualStatus).toBe('ready');
    expect(state.rentalStatus).toBe('available');
    expect(state.readiness).toBe('ready');
    expect(state.isReady).toBe(true);
    expect(state.mapTone).toBe('ready');
    expect(state.chipTone).toBe('success');
    expect(state.attentionLevel).toBe('none');
  });

  it('available + offline => offline / not ready', () => {
    const state = deriveFleetVisualState(
      base({ onlineStatus: 'OFFLINE', isFresh: false }),
    );
    expect(state.visualStatus).toBe('offline');
    expect(state.readiness).toBe('offline');
    expect(state.isReady).toBe(false);
    expect(state.isOffline).toBe(true);
    expect(state.mapTone).toBe('offline');
    expect(state.attentionLevel).toBe('warning');
  });

  it('available + rentalBlocked => blocked / critical', () => {
    const state = deriveFleetVisualState(base(), {
      rentalHealth: {
        rental_blocked: true,
        overall_state: 'warning',
        blocking_reasons: ['Critical DTC'],
      },
    });
    expect(state.visualStatus).toBe('blocked');
    expect(state.isBlocked).toBe(true);
    expect(state.readiness).toBe('blocked');
    expect(state.attentionLevel).toBe('critical');
    expect(state.mapTone).toBe('blocked');
    expect(state.reason).toContain('Critical DTC');
  });

  it('active booking => active', () => {
    const state = deriveFleetVisualState(
      base({
        status: 'Active Rented',
        activeBookingId: 'bk-1',
      }),
    );
    expect(state.visualStatus).toBe('active');
    expect(state.rentalStatus).toBe('active_rented');
    expect(state.mapTone).toBe('active');
    expect(state.chipTone).toBe('info');
  });

  it('reserved booking => reserved', () => {
    const state = deriveFleetVisualState(
      base({
        status: 'Reserved',
        reservedBookingId: 'bk-2',
      }),
    );
    expect(state.visualStatus).toBe('reserved');
    expect(state.rentalStatus).toBe('reserved');
    expect(state.attentionLevel).toBe('info');
    expect(state.mapTone).toBe('reserved');
  });

  it('maintenance / critical health => maintenance or blocked', () => {
    const maintenance = deriveFleetVisualState(
      base({ status: 'Maintenance', maintenanceUrgency: 'urgent' }),
    );
    expect(maintenance.visualStatus).toBe('maintenance');
    expect(maintenance.mapTone).toBe('maintenance');

    const critical = deriveFleetVisualState(
      base({ healthStatus: 'Critical' }),
      {
        rentalHealth: {
          rental_blocked: false,
          overall_state: 'critical',
          blocking_reasons: [],
        },
      },
    );
    expect(critical.visualStatus).toBe('blocked');
  });

  it('missing location => no_location when required', () => {
    const state = deriveFleetVisualState(base({ lat: undefined, lng: undefined }), {
      requireLocation: true,
    });
    expect(state.hasLocation).toBe(false);
    expect(state.visualStatus).toBe('no_location');
    expect(state.readiness).toBe('not_ready');
    expect(state.mapTone).toBe('unknown');
  });

  it('stale telemetry => stale / warning', () => {
    const state = deriveFleetVisualState(
      base({
        onlineStatus: 'STANDBY',
        isFresh: false,
        lastSignal: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      }),
    );
    expect(state.visualStatus).toBe('stale');
    expect(state.isStale).toBe(true);
    expect(state.readiness).toBe('stale');
    expect(state.mapTone).toBe('stale');
    expect(state.attentionLevel).toBe('warning');
  });

  it('ghost active without booking id demotes rental status to available', () => {
    const state = deriveFleetVisualState(
      base({ status: 'Active Rented', activeBookingId: null }),
    );
    expect(state.rentalStatus).toBe('available');
    expect(state.visualStatus).toBe('ready');
  });

  it('active overdue elevates attention to critical', () => {
    const state = deriveFleetVisualState(
      base({
        status: 'Active Rented',
        activeBookingId: 'bk-1',
        activeIsOverdue: true,
      }),
    );
    expect(state.visualStatus).toBe('active');
    expect(state.attentionLevel).toBe('critical');
    expect(state.reason).toBe('Return overdue');
  });
});
