import { NotificationEntityType, NotificationSeverity, NotificationStatus } from '@prisma/client';
import { InsightSeverity } from '@modules/business-insights/insight.types';
import { NotificationEngineConfig } from '../notification-engine.config';
import { NotificationCoreService } from '../notification-core.service';
import { NotificationRepository } from '../notification.repository';
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
import {
  DEVICE_QUALITY_OBSERVATION_MARKER,
  DEVICE_QUALITY_WORKER_ID,
} from '@modules/vehicle-intelligence/trips/driving-assessment-device-quality.detector';

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

const ORG = 'org-obs';
const VEHICLE_ID = 'veh-obs-1';
const PLATE = 'B-OB 1001';
const OBS_ID = 'obs-manual-1';
const BOOKING_ID = 'booking-handover-1';

describe('NotificationProducerIngestService — technical observation lifecycle', () => {
  let v2Enabled: boolean;
  const notifications = new Map<string, any>();
  const activeByFingerprint = new Map<string, string>();
  const idSeq = { value: 0 };

  const engineConfig = {
    isV2Enabled: () => v2Enabled,
  } as NotificationEngineConfig;

  let ingest: NotificationProducerIngestService;
  let repository: NotificationRepository;

  beforeEach(() => {
    v2Enabled = true;
    notifications.clear();
    activeByFingerprint.clear();
    idSeq.value = 0;
    jest.clearAllMocks();

    repository = createProducerIngestRepositoryMock({
      notifications,
      activeByFingerprint,
      idSeq,
    }) as unknown as NotificationRepository;

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
    );
  });

  it('ingests manual observation with observation reference in metadata', async () => {
    await ingest.syncTechnicalObservationActive({
      organizationId: ORG,
      vehicleId: VEHICLE_ID,
      observationId: OBS_ID,
      label: PLATE,
      createdByWorkerId: 'operator-1',
      notes: 'Klimaanlage kühlt nicht',
      severity: InsightSeverity.WARNING,
      sourceEventId: OBS_ID,
    });

    const open = [...notifications.values()].filter((n) => n.status === NotificationStatus.OPEN);
    expect(open).toHaveLength(1);
    expect(open[0].eventType).toBe('TECHNICAL_OBSERVATION_ACTIVE');
    expect(open[0].entityType).toBe(NotificationEntityType.VEHICLE);
    expect(open[0].entityId).toBe(VEHICLE_ID);
    expect(open[0].fingerprint).toBe(
      ingest.technicalObservationFingerprint(ORG, VEHICLE_ID, OBS_ID),
    );
    const occurrenceInput = (repository.createOccurrence as jest.Mock).mock.calls[0][0];
    expect(occurrenceInput.payload).toMatchObject({
      observationId: OBS_ID,
      complaintId: OBS_ID,
    });
  });

  it('ingests handover-context observation with booking correlationId', async () => {
    await ingest.syncTechnicalObservationActive({
      organizationId: ORG,
      vehicleId: VEHICLE_ID,
      observationId: 'obs-handover-1',
      label: PLATE,
      correlationId: BOOKING_ID,
      causationId: 'handover-protocol-1',
      sourceEventId: 'obs-handover-1',
      severity: InsightSeverity.WARNING,
    });

    const occurrenceInput = (repository.createOccurrence as jest.Mock).mock.calls[0][0];
    expect(occurrenceInput.correlationId).toBe(BOOKING_ID);
    expect(occurrenceInput.causationId).toBe('handover-protocol-1');
  });

  it('re-ingest escalates severity on same fingerprint', async () => {
    await ingest.syncTechnicalObservationActive({
      organizationId: ORG,
      vehicleId: VEHICLE_ID,
      observationId: OBS_ID,
      label: PLATE,
      severity: InsightSeverity.WARNING,
      sourceEventId: OBS_ID,
    });
    const firstId = [...notifications.values()][0].id;

    await ingest.syncTechnicalObservationActive({
      organizationId: ORG,
      vehicleId: VEHICLE_ID,
      observationId: OBS_ID,
      label: PLATE,
      severity: InsightSeverity.CRITICAL,
      sourceEventId: `${OBS_ID}:severity`,
    });

    const open = [...notifications.values()].filter((n) => n.status === NotificationStatus.OPEN);
    expect(open).toHaveLength(1);
    expect(open[0].id).toBe(firstId);
    expect(open[0].severity).toBe(NotificationSeverity.CRITICAL);
  });

  it('resolve clears active notification for observation', async () => {
    await ingest.syncTechnicalObservationActive({
      organizationId: ORG,
      vehicleId: VEHICLE_ID,
      observationId: OBS_ID,
      label: PLATE,
      sourceEventId: OBS_ID,
    });

    await ingest.syncTechnicalObservationResolved({
      organizationId: ORG,
      vehicleId: VEHICLE_ID,
      observationId: OBS_ID,
      label: PLATE,
      sourceEventId: `${OBS_ID}:resolved`,
    });

    const row = [...notifications.values()][0];
    expect(row.status).toBe(NotificationStatus.RESOLVED);
    expect(
      [...notifications.values()].filter(
        (n) => n.status === NotificationStatus.OPEN && n.eventType === 'TECHNICAL_OBSERVATION_ACTIVE',
      ),
    ).toHaveLength(0);
  });

  it('reopen after resolve creates active notification again on same fingerprint', async () => {
    await ingest.syncTechnicalObservationActive({
      organizationId: ORG,
      vehicleId: VEHICLE_ID,
      observationId: OBS_ID,
      label: PLATE,
      sourceEventId: OBS_ID,
    });

    await ingest.syncTechnicalObservationResolved({
      organizationId: ORG,
      vehicleId: VEHICLE_ID,
      observationId: OBS_ID,
      label: PLATE,
      sourceEventId: `${OBS_ID}:resolved`,
    });

    const resolved = [...notifications.values()][0];
    notifications.set(resolved.id, {
      ...resolved,
      resolvedAt: new Date(Date.now() - 20 * 60_000),
    });

    await ingest.syncTechnicalObservationActive({
      organizationId: ORG,
      vehicleId: VEHICLE_ID,
      observationId: OBS_ID,
      label: PLATE,
      sourceEventId: `${OBS_ID}:reopen`,
      severity: InsightSeverity.WARNING,
    });

    const open = [...notifications.values()].filter(
      (n) => n.status === NotificationStatus.OPEN && n.eventType === 'TECHNICAL_OBSERVATION_ACTIVE',
    );
    expect(open).toHaveLength(1);
    expect(open[0].fingerprint).toBe(
      ingest.technicalObservationFingerprint(ORG, VEHICLE_ID, OBS_ID),
    );
  });

  it('service-case link updates correlationId on re-ingest', async () => {
    await ingest.syncTechnicalObservationActive({
      organizationId: ORG,
      vehicleId: VEHICLE_ID,
      observationId: OBS_ID,
      label: PLATE,
      sourceEventId: OBS_ID,
    });

    await ingest.syncTechnicalObservationActive({
      organizationId: ORG,
      vehicleId: VEHICLE_ID,
      observationId: OBS_ID,
      label: PLATE,
      correlationId: 'service-case-99',
      sourceEventId: `${OBS_ID}:linked-service`,
    });

    const calls = (repository.createOccurrence as jest.Mock).mock.calls;
    const linkedOccurrence = calls[calls.length - 1][0];
    expect(linkedOccurrence.correlationId).toBe('service-case-99');
  });

  it('does not duplicate driving-assessment device-quality auto observation', async () => {
    await ingest.syncDrivingAssessmentQuality({
      organizationId: ORG,
      vehicleId: VEHICLE_ID,
      label: PLATE,
      status: 'DEGRADED',
      sourceRef: 'trip-1',
    });

    await ingest.syncTechnicalObservationActive({
      organizationId: ORG,
      vehicleId: VEHICLE_ID,
      observationId: 'obs-dq-auto',
      label: PLATE,
      createdByWorkerId: DEVICE_QUALITY_WORKER_ID,
      notes: DEVICE_QUALITY_OBSERVATION_MARKER,
    });

    await ingest.syncTechnicalObservationActive({
      organizationId: ORG,
      vehicleId: VEHICLE_ID,
      observationId: OBS_ID,
      label: PLATE,
      notes: 'Echter Mangel',
    });

    const open = [...notifications.values()].filter((n) => n.status === NotificationStatus.OPEN);
    expect(open).toHaveLength(2);
    expect(open.map((n) => n.eventType).sort()).toEqual([
      'DRIVING_ASSESSMENT_DEVICE_QUALITY',
      'TECHNICAL_OBSERVATION_ACTIVE',
    ]);
  });
});
