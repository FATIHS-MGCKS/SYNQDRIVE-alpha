import { describe, expect, it } from 'vitest';
import type { ActionQueueItem } from '../dashboardTypes';
import type { PickupTileItem } from '../../StatInlineDetail';
import {
  buildNotificationDetailViewModel,
} from './notification-task-bridge';
import {
  buildNotificationHeadlineTitle,
  buildNotificationSummaryFromItem,
} from './notification-summary-view-model';
import {
  buildOverdueHandoverDetailFields,
  buildOverdueHandoverIssueHeadline,
  isOverdueHandoverNotification,
  resolveOverdueHandoverEyebrow,
} from './notification-handover-copy';

const pickupTile: PickupTileItem = {
  time: '10:00',
  vehicle: 'Mercedes-Benz C 63 AMG 2018',
  plate: 'WOB L 7503',
  customer: 'Kübra Serin',
  station: 'Zentrale',
  customerId: 'cust-1',
  bookingNumber: 'BK-FAEF3A',
  done: false,
  vehicleId: 'veh-1',
  needsCleaning: false,
  hasAlert: false,
  hasError: false,
  bookingId: 'bk-faef3a',
  startDate: '2026-07-13T08:00:00.000Z',
  isOverdue: true,
  minutesOverdue: 130,
};

function overduePickupItem(overrides: Partial<ActionQueueItem> = {}): ActionQueueItem {
  return {
    id: 'pickup-bk-faef3a',
    source: 'booking',
    severity: 'critical',
    category: 'handover',
    title: 'Abholung überfällig · WOB L 7503',
    reason: 'Kübra Serin · Zentrale',
    entityLabel: 'WOB L 7503',
    timeSortMs: Date.parse('2026-07-13T08:00:00.000Z'),
    priority: 100,
    tone: 'critical',
    cta: 'open-booking',
    bookingId: 'bk-faef3a',
    vehicleId: 'veh-1',
    pickupItem: pickupTile,
    isOverdue: true,
    issueType: 'pickup_overdue',
    entityContextParams: {
      plate: 'WOB L 7503',
      make: 'Mercedes-Benz',
      model: 'C 63 AMG',
      year: 2018,
    },
    queue: {
      severity: 'critical',
      lifecycleStatus: 'open',
      readStatus: 'unread',
      domain: 'handovers',
      source: 'booking-tile',
      legacySource: 'booking',
      occurredAt: '2026-07-13T08:00:00.000Z',
      firstSeenAt: '2026-07-13T08:00:00.000Z',
      lastSeenAt: '2026-07-13T18:00:00.000Z',
      resolvedAt: null,
      createdAt: '2026-07-13T08:00:00.000Z',
      entityType: 'booking',
      entityId: 'bk-faef3a',
      actionType: 'open-booking',
      actionTarget: { type: 'open-booking', bookingId: 'bk-faef3a', vehicleId: 'veh-1' },
      semanticKey: 'booking:bk-faef3a:booking:pickup_overdue',
      sortMs: Date.parse('2026-07-13T08:00:00.000Z'),
      issueType: 'pickup_overdue',
      conditionCode: 'pickup_overdue',
    },
    ...overrides,
  };
}

describe('notification-handover-copy', () => {
  it('detects overdue handover notifications', () => {
    expect(isOverdueHandoverNotification(overduePickupItem())).toBe(true);
  });

  it('formats overdue pickup headline with duration', () => {
    const headline = buildOverdueHandoverIssueHeadline(
      overduePickupItem(),
      'de',
      Date.parse('2026-07-13T10:10:00.000Z'),
    );
    expect(headline).toBe('Abholung überfällig seit 2 Std. 10 Min.');
  });

  it('builds structured detail fields', () => {
    const fields = buildOverdueHandoverDetailFields(overduePickupItem(), 'de');
    expect(fields).toEqual([
      { label: 'BNR', value: 'BK-FAEF3A' },
      { label: 'Kunde', value: 'Kübra Serin' },
      { label: 'Station', value: 'Zentrale' },
      { label: 'Abhol-Termin', value: expect.any(String) },
    ]);
  });
});

describe('overdue handover notification presentation', () => {
  const referenceNowMs = Date.parse('2026-07-13T10:10:00.000Z');

  it('uses custom eyebrow and plate · make model year headline', () => {
    const summary = buildNotificationSummaryFromItem(overduePickupItem(), 'de', referenceNowMs);
    expect(summary?.eyebrowLabel).toBe(resolveOverdueHandoverEyebrow('de'));
    expect(buildNotificationHeadlineTitle(overduePickupItem())).toBe(
      'WOB L 7503 · Mercedes-Benz C 63 AMG 2018',
    );
    expect(summary?.headlineTitle).toBe('WOB L 7503 · Mercedes-Benz C 63 AMG 2018');
  });

  it('exposes booking + contact CTAs in detail view model', () => {
    const detail = buildNotificationDetailViewModel(overduePickupItem(), 'de', referenceNowMs);
    expect(detail.issueTitle).toBe('Abholung überfällig seit 2 Std. 10 Min.');
    expect(detail.issueDescription).toBe('');
    expect(detail.detailFields?.length).toBe(4);
    expect(detail.ctaPrimaryLabel).toBe('Buchung öffnen');
    expect(detail.ctaSecondaryLabel).toBe('Kunde kontaktieren');
    expect(detail.showContactCustomer).toBe(true);
  });
});
