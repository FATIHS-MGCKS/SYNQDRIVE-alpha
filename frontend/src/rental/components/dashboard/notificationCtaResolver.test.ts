import { describe, expect, it } from 'vitest';
import { resolveNotificationCta } from './notificationCtaResolver';
import type { ActionQueueItem } from './dashboardTypes';
import { WOB_VEHICLE_ID } from './notificationEngine.fixtures';

function item(overrides: Partial<ActionQueueItem> = {}): ActionQueueItem {
  return {
    id: 'test-item',
    source: 'derived-operations',
    severity: 'warning',
    category: 'health',
    title: 'Test',
    timeSortMs: 0,
    priority: 0,
    tone: 'watch',
    cta: 'open-rental',
    isOverdue: false,
    ...overrides,
  };
}

describe('notificationCtaResolver', () => {
  it('technical observation opens vehicle complaints module', () => {
    const cta = resolveNotificationCta(
      item({ vehicleId: WOB_VEHICLE_ID, category: 'health' }),
      'technical_observation_active',
    );
    expect(cta.actionType).toBe('open-vehicle-module');
    expect(cta.actionTarget.module).toBe('complaints');
    expect(cta.legacyCta).toBe('open-vehicle');
  });

  it('vehicle health issue does not default to open-rental', () => {
    const cta = resolveNotificationCta(
      item({ vehicleId: WOB_VEHICLE_ID, category: 'health', cta: 'open-rental' }),
      'battery_critical',
    );
    expect(cta.legacyCta).toBe('open-vehicle');
    expect(cta.actionType).not.toBe('open-rental');
  });

  it('station shortage opens station', () => {
    const cta = resolveNotificationCta(
      item({ stationId: 'st-wob', cta: 'open-stations' }),
      'station_shortage',
    );
    expect(cta.actionType).toBe('open-station');
    expect(cta.legacyCta).toBe('open-stations');
  });

  it('overdue handover opens booking instead of starting pickup', () => {
    const pickup: PickupTileItem = {
      time: '10:00',
      vehicle: 'VW Tiguan',
      plate: 'WOB L 7503',
      customer: 'Test',
      station: 'Zentrale',
      done: false,
      vehicleId: 'veh-1',
      needsCleaning: false,
      hasAlert: false,
      hasError: false,
      bookingId: 'bk-1',
      isOverdue: true,
      minutesOverdue: 30,
    };
    const cta = resolveNotificationCta(
      item({
        bookingId: 'bk-1',
        vehicleId: 'veh-1',
        category: 'handover',
        pickupItem: pickup,
        isOverdue: true,
        cta: 'start-handover-pickup',
      }),
      'pickup_overdue',
    );
    expect(cta.actionType).toBe('open-booking');
    expect(cta.legacyCta).toBe('open-booking');
  });

  it('booking handover opens booking', () => {
    const cta = resolveNotificationCta(
      item({ bookingId: 'bk-1', category: 'handover', cta: 'open-booking' }),
      'pickup_overdue',
    );
    expect(cta.actionType).toBe('open-booking');
    expect(cta.legacyCta).toBe('open-booking');
  });
});
