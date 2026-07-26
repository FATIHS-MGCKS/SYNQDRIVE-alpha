import { NotificationEntityType, NotificationStatus } from '@prisma/client';
import {
  InsightEntityScope,
  InsightSeverity,
  InsightType,
} from '@modules/business-insights/insight.types';
import { NotificationEngineConfig } from '../notification-engine.config';
import { NotificationCoreService } from '../notification-core.service';
import { NotificationDeliveryEnqueueService } from '../delivery/notification-delivery-enqueue.service';
import { NotificationDeliveryPolicyService } from '../delivery/notification-delivery-policy.service';
import { NotificationDeliverySchedulerService } from '../delivery/notification-delivery-scheduler.service';
import { DrivingAssessmentNotificationAdapter } from './driving-assessment-notification.adapter';
import { TechnicalObservationNotificationAdapter } from './technical-observation-notification.adapter';
import { StationShortageNotificationAdapter } from './station-shortage-notification.adapter';
import { LowUtilizationNotificationAdapter } from './low-utilization-notification.adapter';
import { ComplianceOperationalNotificationAdapter } from './compliance-operational-notification.adapter';
import { BookingHandoverNotificationAdapter } from './booking-handover-notification.adapter';
import { VehicleHealthNotificationAdapter } from './vehicle-health-notification.adapter';
import { NotificationProducerRouter } from './notification-producer.router';
import { NotificationProducerIngestService } from './notification-producer.ingest.service';
import { createProducerIngestRepositoryMock } from './notification-producer-ingest.mock-repository';
import { formatBookingRef } from './booking-handover-source.mapper';

function createDeliveryMocks() {
  return {
    deliveryEnqueue: {
      isDeliveryEnabled: () => false,
      enqueueInTransaction: jest.fn().mockResolvedValue([]),
    } as unknown as NotificationDeliveryEnqueueService,
    deliveryPolicy: new NotificationDeliveryPolicyService(),
    deliveryScheduler: {
      scheduleOutboxIds: jest.fn().mockResolvedValue(undefined),
    } as unknown as NotificationDeliverySchedulerService,
  };
}

const ORG_A = 'org-booking-a';
const ORG_B = 'org-booking-b';
const BOOKING_1 = 'booking-aaaa-1111-aaaa-1111aaaaaaaa';
const BOOKING_2 = 'booking-bbbb-2222-bbbb-222222222222';
const VEHICLE_1 = 'veh-booking-1';
const VEHICLE_2 = 'veh-booking-2';
const PLATE = 'M-AB 100';
const PICKUP_AT = new Date('2026-07-20T10:00:00.000Z');
const RETURN_AT = new Date('2026-07-25T18:00:00.000Z');

describe('Booking handover notification producers', () => {
  let v2Enabled: boolean;
  const notifications = new Map<string, any>();
  const activeByFingerprint = new Map<string, string>();
  const idSeq = { value: 0 };
  let repository: ReturnType<typeof createProducerIngestRepositoryMock>;
  let ingest: NotificationProducerIngestService;
  let prisma: { booking: { findMany: jest.Mock } };

  const engineConfig = {
    isV2Enabled: () => v2Enabled,
  } as NotificationEngineConfig;

  beforeEach(() => {
    v2Enabled = true;
    notifications.clear();
    activeByFingerprint.clear();
    idSeq.value = 0;
    prisma = { booking: { findMany: jest.fn().mockResolvedValue([]) } };
    repository = createProducerIngestRepositoryMock({ notifications, activeByFingerprint, idSeq });

    const { deliveryEnqueue, deliveryPolicy, deliveryScheduler } = createDeliveryMocks();
    const core = new NotificationCoreService(
      repository,
      engineConfig,
      deliveryEnqueue,
      deliveryPolicy,
      deliveryScheduler,
    );
    const router = new NotificationProducerRouter(
      core,
      engineConfig,
      new DrivingAssessmentNotificationAdapter(),
      new TechnicalObservationNotificationAdapter(),
      new StationShortageNotificationAdapter(),
      new VehicleHealthNotificationAdapter(),
    );
    ingest = new NotificationProducerIngestService(
      router,
      repository,
      new DrivingAssessmentNotificationAdapter(),
      new TechnicalObservationNotificationAdapter(),
      new StationShortageNotificationAdapter(),
      new LowUtilizationNotificationAdapter(),
      new ComplianceOperationalNotificationAdapter(),
      new VehicleHealthNotificationAdapter(),
      new BookingHandoverNotificationAdapter(),
      core,
      prisma as any,
    );
  });

  function pickupOverdueInsight(bookingId: string, orgVehicleId = VEHICLE_1) {
    return {
      type: InsightType.PICKUP_OVERDUE,
      severity: InsightSeverity.WARNING,
      priority: 72,
      title: 'Pickup überfällig',
      message: `${PLATE} · Kunde — geplanter Pickup überfällig.`,
      entityScope: InsightEntityScope.VEHICLE,
      entityIds: [orgVehicleId],
      timeContext: { pickupAt: PICKUP_AT.toISOString() },
      metrics: {
        bookingId,
        minutesOverdue: 120,
        scheduledStartAt: PICKUP_AT.toISOString(),
        vehicleLicense: PLATE,
      },
      reasons: [],
      confidence: 0.99,
      dedupeKey: `pickup_overdue:${bookingId}`,
    };
  }

  it('repeated cron run updates same PICKUP_OVERDUE row', async () => {
    const insight = pickupOverdueInsight(BOOKING_1);

    await ingest.syncBookingHandoverFromInsights(ORG_A, 'run-1', [insight]);
    await ingest.syncBookingHandoverFromInsights(ORG_A, 'run-2', [insight]);

    const open = [...notifications.values()].filter((n) => n.status === NotificationStatus.OPEN);
    expect(open).toHaveLength(1);
    expect(open[0].eventType).toBe('PICKUP_OVERDUE');
    expect(open[0].entityType).toBe(NotificationEntityType.BOOKING);
    expect(open[0].entityId).toBe(BOOKING_1);
    expect(open[0].occurrenceCount).toBeGreaterThanOrEqual(2);
  });

  it('resolves PICKUP_OVERDUE when booking drops from detector output', async () => {
    await ingest.syncBookingHandoverFromInsights(ORG_A, 'run-1', [
      pickupOverdueInsight(BOOKING_1),
    ]);

    await ingest.syncBookingHandoverFromInsights(ORG_A, 'run-2', []);

    const row = [...notifications.values()].find((n) => n.eventType === 'PICKUP_OVERDUE');
    expect(row?.status).toBe(NotificationStatus.RESOLVED);
  });

  it('escalates severity on status change without new notification row', async () => {
    await ingest.syncBookingHandoverFromInsights(ORG_A, 'run-1', [
      {
        ...pickupOverdueInsight(BOOKING_1),
        severity: InsightSeverity.INFO,
      },
    ]);

    await ingest.syncBookingHandoverFromInsights(ORG_A, 'run-2', [
      {
        ...pickupOverdueInsight(BOOKING_1),
        severity: InsightSeverity.CRITICAL,
        metrics: {
          ...pickupOverdueInsight(BOOKING_1).metrics,
          minutesOverdue: 24 * 60 + 5,
        },
      },
    ]);

    const open = [...notifications.values()].filter(
      (n) => n.eventType === 'PICKUP_OVERDUE' && n.status === NotificationStatus.OPEN,
    );
    expect(open).toHaveLength(1);
    expect(open[0].severity).toBe('CRITICAL');
  });

  it('keeps two bookings on same vehicle as distinct notifications', async () => {
    await ingest.syncBookingHandoverFromInsights(ORG_A, 'run-1', [
      pickupOverdueInsight(BOOKING_1),
      pickupOverdueInsight(BOOKING_2),
    ]);

    const open = [...notifications.values()].filter((n) => n.status === NotificationStatus.OPEN);
    expect(open).toHaveLength(2);
    expect(open.map((n) => n.entityId).sort()).toEqual([BOOKING_1, BOOKING_2].sort());
  });

  it('isolates organizations', async () => {
    await ingest.syncBookingHandoverFromInsights(ORG_A, 'run-1', [
      pickupOverdueInsight(BOOKING_1),
    ]);
    await ingest.syncBookingHandoverFromInsights(ORG_B, 'run-1', [
      pickupOverdueInsight(BOOKING_2, VEHICLE_2),
    ]);

    const orgA = [...notifications.values()].filter((n) => n.organizationId === ORG_A);
    const orgB = [...notifications.values()].filter((n) => n.organizationId === ORG_B);
    expect(orgA).toHaveLength(1);
    expect(orgB).toHaveLength(1);
    expect(orgA[0].entityId).toBe(BOOKING_1);
    expect(orgB[0].entityId).toBe(BOOKING_2);
  });

  it('RETURN_OVERDUE cron twice dedupes on booking fingerprint', async () => {
    const endDate = new Date('2026-07-20T12:00:00.000Z');
    prisma.booking.findMany.mockResolvedValue([
      {
        id: BOOKING_1,
        endDate,
        vehicleId: VEHICLE_1,
        customerId: 'cust-1',
        vehicle: { licensePlate: PLATE, make: 'VW', model: 'Golf' },
        customer: { firstName: 'Max', lastName: 'Muster' },
      },
    ]);

    const refNow = new Date('2026-07-20T14:00:00.000Z');
    await ingest.syncReturnOverdueNotifications(ORG_A, 'run-1', refNow);
    await ingest.syncReturnOverdueNotifications(ORG_A, 'run-2', refNow);

    const open = [...notifications.values()].filter(
      (n) => n.eventType === 'RETURN_OVERDUE' && n.status === NotificationStatus.OPEN,
    );
    expect(open).toHaveLength(1);
    expect(open[0].entityId).toBe(BOOKING_1);
    expect(open[0].templateParams.bookingRef).toBe(formatBookingRef(BOOKING_1));
    expect(open[0].occurrenceCount).toBeGreaterThanOrEqual(2);
  });

  it('resolves RETURN_OVERDUE when return completes (booking absent from query)', async () => {
    const endDate = new Date('2026-07-20T12:00:00.000Z');
    prisma.booking.findMany.mockResolvedValueOnce([
      {
        id: BOOKING_1,
        endDate,
        vehicleId: VEHICLE_1,
        customerId: 'cust-1',
        vehicle: { licensePlate: PLATE, make: 'VW', model: 'Golf' },
        customer: { firstName: 'Max', lastName: 'Muster' },
      },
    ]);

    const refNow = new Date('2026-07-20T14:00:00.000Z');
    await ingest.syncReturnOverdueNotifications(ORG_A, 'run-1', refNow);

    prisma.booking.findMany.mockResolvedValueOnce([]);
    await ingest.syncReturnOverdueNotifications(ORG_A, 'run-2', refNow);

    const row = [...notifications.values()].find((n) => n.eventType === 'RETURN_OVERDUE');
    expect(row?.status).toBe(NotificationStatus.RESOLVED);
  });

  it('TIGHT_HANDOVER uses booking pair condition key', async () => {
    await ingest.syncBookingHandoverFromInsights(ORG_A, 'run-1', [
      {
        type: InsightType.TIGHT_HANDOVER,
        severity: InsightSeverity.WARNING,
        priority: 80,
        title: 'Tight Handover',
        message: `${PLATE}: only 15 min between return and next pickup.`,
        entityScope: InsightEntityScope.VEHICLE,
        entityIds: [VEHICLE_1],
        timeContext: {
          returnAt: RETURN_AT.toISOString(),
          nextPickupAt: new Date('2026-07-25T19:00:00.000Z').toISOString(),
        },
        metrics: { gapMinutes: 15, bufferRequired: 60 },
        reasons: [],
        confidence: 1,
        dedupeKey: `tight_handover:${VEHICLE_1}:${BOOKING_1}:${BOOKING_2}`,
      },
    ]);

    const row = [...notifications.values()].find((n) => n.eventType === 'TIGHT_HANDOVER');
    expect(row?.entityId).toBe(BOOKING_2);
    expect(row?.fingerprint).toContain('tight_handover:');
    expect(row?.fingerprint).toContain(`${BOOKING_1}:${BOOKING_2}`);
  });
});
