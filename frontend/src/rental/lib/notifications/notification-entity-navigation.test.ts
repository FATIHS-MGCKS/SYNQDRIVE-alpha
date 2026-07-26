import { describe, expect, it, vi } from 'vitest';
import type { ActionQueueItem } from '../../components/dashboard/dashboardTypes';
import type { NotificationQueueModel } from '../../components/dashboard/notificationQueueModel';
import {
  buildNotificationNavigationContext,
  executeNotificationNavigation,
  resolveNotificationNavigationIntent,
} from './notification-entity-navigation';

const ORG_A = 'org-a';
const ORG_B = 'org-b';

function baseQueue(overrides: Partial<NotificationQueueModel> = {}): NotificationQueueModel {
  return {
    severity: 'warning',
    lifecycleStatus: 'open',
    readStatus: 'unread',
    domain: 'vehicle-health',
    source: 'runtime',
    legacySource: 'notifications-v2',
    occurredAt: '2026-07-10T10:00:00.000Z',
    firstSeenAt: '2026-07-10T10:00:00.000Z',
    lastSeenAt: '2026-07-10T10:00:00.000Z',
    resolvedAt: null,
    createdAt: '2026-07-10T10:00:00.000Z',
    entityType: 'vehicle',
    entityId: 'veh-1',
    actionType: 'open-vehicle',
    actionTarget: { type: 'open-vehicle', vehicleId: 'veh-1' },
    semanticKey: 'VEHICLE:veh-1:vehicle-health:ACTIVE_DTC',
    sortMs: 1,
    issueType: 'active_dtc',
    conditionCode: 'ACTIVE_DTC',
    ...overrides,
  };
}

function item(overrides: Partial<ActionQueueItem> = {}): ActionQueueItem {
  return {
    id: 'notif-1',
    semanticKey: 'VEHICLE:veh-1:vehicle-health:ACTIVE_DTC',
    source: 'notifications-v2',
    severity: 'warning',
    category: 'health',
    title: 'Fault code active — WOB L 7503',
    reason: 'Low tread',
    entityLabel: 'WOB L 7503',
    timeSortMs: 1,
    priority: 50,
    tone: 'warning',
    cta: 'open-vehicle',
    isOverdue: false,
    queue: baseQueue(),
    vehicleId: 'veh-1',
    entityAvailable: true,
    ...overrides,
  };
}

describe('notification-entity-navigation', () => {
  it('navigates to vehicle by id', () => {
    const openVehicle = vi.fn();
    const intent = resolveNotificationNavigationIntent(item(), ORG_A);
    expect(intent.kind).toBe('vehicle');
    expect(executeNotificationNavigation(intent, { openVehicleById: openVehicle })).toBe('navigated');
    expect(openVehicle).toHaveBeenCalledWith('veh-1');
  });

  it('navigates to booking', () => {
    const openBooking = vi.fn();
    const bookingItem = item({
      queue: baseQueue({
        entityType: 'booking',
        entityId: 'book-1',
        actionType: 'open-booking',
        actionTarget: { type: 'open-booking', bookingId: 'book-1' },
      }),
      bookingId: 'book-1',
    });
    const intent = resolveNotificationNavigationIntent(bookingItem, ORG_A);
    expect(intent.kind).toBe('booking');
    executeNotificationNavigation(intent, { openBookingById: openBooking });
    expect(openBooking).toHaveBeenCalledWith('book-1');
  });

  it('navigates to customer', () => {
    const openCustomer = vi.fn();
    const customerItem = item({
      queue: baseQueue({
        entityType: 'customer',
        entityId: 'cust-1',
        actionType: 'open-rental',
        actionTarget: { type: 'open-rental', customerId: 'cust-1' },
      }),
      customerId: 'cust-1',
    });
    const intent = resolveNotificationNavigationIntent(customerItem, ORG_A);
    expect(intent.kind).toBe('customer');
    executeNotificationNavigation(intent, { openCustomerById: openCustomer });
    expect(openCustomer).toHaveBeenCalledWith('cust-1');
  });

  it('navigates to invoice', () => {
    const openInvoice = vi.fn();
    const invoiceItem = item({
      queue: baseQueue({
        entityType: 'invoice',
        entityId: 'inv-1',
        domain: 'billing',
        actionType: 'open-billing',
        actionTarget: { type: 'open-billing', invoiceId: 'inv-1' },
      }),
      invoiceId: 'inv-1',
    });
    const intent = resolveNotificationNavigationIntent(invoiceItem, ORG_A);
    expect(intent.kind).toBe('invoice');
    executeNotificationNavigation(intent, { openInvoiceById: openInvoice });
    expect(openInvoice).toHaveBeenCalledWith('inv-1');
  });

  it('navigates to observation via openAlertById', () => {
    const openAlert = vi.fn();
    const obsItem = item({
      queue: baseQueue({
        actionType: 'open-vehicle-module',
        actionTarget: {
          type: 'open-vehicle-module',
          vehicleId: 'veh-1',
          module: 'complaints',
          observationId: 'obs-99',
        },
      }),
    });
    const intent = resolveNotificationNavigationIntent(obsItem, ORG_A);
    expect(intent.kind).toBe('observation');
    executeNotificationNavigation(intent, { openAlertById: openAlert });
    expect(openAlert).toHaveBeenCalledWith('obs-99', { vehicleId: 'veh-1' });
  });

  it('navigates to task via openServiceCaseById', () => {
    const openTask = vi.fn();
    const taskItem = item({
      queue: baseQueue({
        actionType: 'open-rental',
        actionTarget: { type: 'open-rental', taskId: 'task-7', vehicleId: 'veh-1' },
      }),
    });
    const intent = resolveNotificationNavigationIntent(taskItem, ORG_A);
    expect(intent.kind).toBe('task');
    executeNotificationNavigation(intent, { openServiceCaseById: openTask });
    expect(openTask).toHaveBeenCalledWith('task-7', { vehicleId: 'veh-1' });
  });

  it('blocks navigation for deleted entity', () => {
    const onUnavailable = vi.fn();
    const deleted = item({ entityAvailable: false });
    const intent = resolveNotificationNavigationIntent(deleted, ORG_A);
    expect(intent.kind).toBe('unavailable');
    const outcome = executeNotificationNavigation(intent, { onEntityUnavailable: onUnavailable });
    expect(outcome).toBe('entity_unavailable');
    expect(onUnavailable).toHaveBeenCalled();
  });

  it('never routes from title text — only structured target', () => {
    const ctx = buildNotificationNavigationContext(
      item({
        title: 'https://evil.example/route',
        queue: baseQueue({
          actionTarget: { type: 'open-vehicle', vehicleId: 'veh-safe' },
        }),
      }),
      ORG_A,
    );
    expect(ctx.target.vehicleId).toBe('veh-safe');
    expect(ctx.organizationId).toBe(ORG_A);
  });

  it('scopes navigation context to provided organizationId', () => {
    const ctx = buildNotificationNavigationContext(item(), ORG_B);
    expect(ctx.organizationId).toBe(ORG_B);
  });
});
