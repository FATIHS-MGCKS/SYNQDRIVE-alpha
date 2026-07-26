import { NotificationEntityType, NotificationSeverity, NotificationStatus } from '@prisma/client';
import { InsightEntityScope, InsightSeverity, InsightType } from '@modules/business-insights/insight.types';
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
import { VehicleHealthNotificationAdapter } from './vehicle-health-notification.adapter';
import { NotificationProducerRouter } from './notification-producer.router';
import { NotificationProducerIngestService } from './notification-producer.ingest.service';
import { createProducerIngestRepositoryMock } from './notification-producer-ingest.mock-repository';
import { mergeVehicleHealthNotificationSources } from './vehicle-health-source.merge';
import { DEVICE_QUALITY_WORKER_ID } from '@modules/vehicle-intelligence/trips/driving-assessment-device-quality.detector';

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

const ORG = 'org-telemetry';
const VEHICLE_ID = 'veh-1';
const PLATE = 'WOB A 100';
const OBS_ID = 'obs-real-1';
const TRIP_AT = new Date('2026-07-20T14:30:00.000Z');
const DTC_AT = new Date('2026-07-20T15:00:00.000Z');

describe('Vehicle health & telemetry producer migration', () => {
  let v2Enabled: boolean;
  const notifications = new Map<string, any>();
  const activeByFingerprint = new Map<string, string>();
  const idSeq = { value: 0 };
  let repository: ReturnType<typeof createProducerIngestRepositoryMock>;
  let ingest: NotificationProducerIngestService;

  const engineConfig = {
    isV2Enabled: () => v2Enabled,
  } as NotificationEngineConfig;

  let core: NotificationCoreService;

  beforeEach(() => {
    v2Enabled = true;
    notifications.clear();
    activeByFingerprint.clear();
    idSeq.value = 0;
    process.env.VEHICLE_HEALTH_NOTIFICATION_CLEAR_GRACE_MS = '0';
    jest.clearAllMocks();

    repository = createProducerIngestRepositoryMock({ notifications, activeByFingerprint, idSeq });

    const { deliveryEnqueue, deliveryPolicy, deliveryScheduler } = createDeliveryMocks();
    core = new NotificationCoreService(
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
      core,
    );
  });

  it('repeated ACTIVE_DTC ingest updates same row and increments occurrence', async () => {
    const source = {
      eventType: 'ACTIVE_DTC' as const,
      vehicleId: VEHICLE_ID,
      label: PLATE,
      code: 'P0420',
      severity: 'warning' as const,
      occurredAt: DTC_AT,
      sourceEventId: 'dtc:poll:1',
    };

    await ingest.ingestVehicleHealthSources(ORG, 'dtc-poll:1', [source]);
    await ingest.ingestVehicleHealthSources(ORG, 'dtc-poll:2', [
      { ...source, sourceEventId: 'dtc:poll:2' },
    ]);

    const open = [...notifications.values()].filter((n) => n.status === NotificationStatus.OPEN);
    expect(open).toHaveLength(1);
    expect(open[0].eventType).toBe('ACTIVE_DTC');
    expect(open[0].occurrenceCount).toBeGreaterThanOrEqual(2);
  });

  it('ACTIVE_DTC recovery resolves immediately when explicitly cleared', async () => {
    await ingest.ingestVehicleHealthSources(ORG, 'dtc-poll:open', [
      {
        eventType: 'ACTIVE_DTC',
        vehicleId: VEHICLE_ID,
        label: PLATE,
        code: 'P0420',
        severity: 'warning',
        occurredAt: DTC_AT,
      },
    ]);

    await ingest.ingestVehicleHealthSources(ORG, 'dtc-poll:clear', [
      {
        eventType: 'ACTIVE_DTC',
        vehicleId: VEHICLE_ID,
        label: PLATE,
        code: 'P0420',
        cleared: true,
        occurredAt: new Date('2026-07-20T16:00:00.000Z'),
      },
    ]);

    const row = [...notifications.values()].find((n) => n.eventType === 'ACTIVE_DTC');
    expect(row?.status).toBe(NotificationStatus.RESOLVED);
  });

  it('soft-offline escalates to hard-offline with distinct fingerprints', async () => {
    const { ConnectivityAlertService } = await import(
      '@modules/dimo/connectivity-alert/connectivity-alert.service'
    );
    const service = new ConnectivityAlertService(
      { vehicle: { findUnique: jest.fn() } } as any,
      core,
      repository,
    );

    await service.syncRuntimeAlerts({
      organizationId: ORG,
      vehicleId: VEHICLE_ID,
      label: PLATE,
      licensePlate: PLATE,
      provider: 'DIMO',
      observedAt: new Date('2026-07-20T10:00:00.000Z'),
      telemetryFreshness: 'signal_delayed',
      providerLinkState: 'ACTIVE',
      hasProviderLink: true,
      coverageState: 'GOOD',
    });

    const softRow = [...notifications.values()].find(
      (n) => n.eventType === 'TELEMETRY_SOFT_OFFLINE',
    );
    expect(softRow?.status).toBe(NotificationStatus.OPEN);

    await service.syncRuntimeAlerts({
      organizationId: ORG,
      vehicleId: VEHICLE_ID,
      label: PLATE,
      licensePlate: PLATE,
      provider: 'DIMO',
      observedAt: new Date('2026-07-20T11:00:00.000Z'),
      telemetryFreshness: 'offline',
      providerLinkState: 'ACTIVE',
      hasProviderLink: true,
      coverageState: 'GOOD',
    });

    const softAfterEscalation = notifications.get(softRow!.id);
    const hardRow = [...notifications.values()].find(
      (n) => n.eventType === 'TELEMETRY_OFFLINE',
    );

    expect(softAfterEscalation?.status).toBe(NotificationStatus.RESOLVED);
    expect(hardRow?.status).toBe(NotificationStatus.OPEN);
    expect(softRow?.fingerprint).not.toBe(hardRow?.fingerprint);
  });

  it('connectivity recovery resolves telemetry offline', async () => {
    const { ConnectivityAlertService } = await import(
      '@modules/dimo/connectivity-alert/connectivity-alert.service'
    );
    const service = new ConnectivityAlertService(
      { vehicle: { findUnique: jest.fn() } } as any,
      core,
      repository,
    );

    await service.syncRuntimeAlerts({
      organizationId: ORG,
      vehicleId: VEHICLE_ID,
      label: PLATE,
      licensePlate: PLATE,
      provider: 'DIMO',
      observedAt: new Date('2026-07-20T10:00:00.000Z'),
      telemetryFreshness: 'offline',
      providerLinkState: 'ACTIVE',
      hasProviderLink: true,
      coverageState: 'GOOD',
    });

    await service.syncRuntimeAlerts({
      organizationId: ORG,
      vehicleId: VEHICLE_ID,
      label: PLATE,
      licensePlate: PLATE,
      provider: 'DIMO',
      observedAt: new Date('2026-07-20T12:00:00.000Z'),
      telemetryFreshness: 'live',
      providerLinkState: 'ACTIVE',
      hasProviderLink: true,
      coverageState: 'GOOD',
    });

    const offline = [...notifications.values()].find(
      (n) => n.eventType === 'TELEMETRY_OFFLINE',
    );
    expect(offline?.status).toBe(NotificationStatus.RESOLVED);
  });

  it('repeated driving assessment degrades once then recovers', async () => {
    await ingest.syncDrivingAssessmentQuality({
      organizationId: ORG,
      vehicleId: VEHICLE_ID,
      label: PLATE,
      status: 'DEGRADED',
      sourceRef: 'trip-1',
      occurredAt: TRIP_AT,
    });
    await ingest.syncDrivingAssessmentQuality({
      organizationId: ORG,
      vehicleId: VEHICLE_ID,
      label: PLATE,
      status: 'DEGRADED',
      sourceRef: 'trip-2',
      occurredAt: new Date('2026-07-21T10:00:00.000Z'),
    });

    let open = [...notifications.values()].filter(
      (n) => n.eventType === 'DRIVING_ASSESSMENT_DEVICE_QUALITY' && n.status === NotificationStatus.OPEN,
    );
    expect(open).toHaveLength(1);
    expect(open[0].occurrenceCount).toBeGreaterThanOrEqual(2);

    await ingest.syncDrivingAssessmentQuality({
      organizationId: ORG,
      vehicleId: VEHICLE_ID,
      label: PLATE,
      status: 'NORMAL',
      sourceRef: 'trip-3',
      occurredAt: new Date('2026-07-22T10:00:00.000Z'),
    });

    const row = notifications.get(open[0].id);
    expect(row?.status).toBe(NotificationStatus.RESOLVED);
  });

  it('technical observation does not duplicate driving-assessment system observation', async () => {
    await ingest.syncDrivingAssessmentQuality({
      organizationId: ORG,
      vehicleId: VEHICLE_ID,
      label: PLATE,
      status: 'DEGRADED',
      sourceRef: 'trip-1',
      occurredAt: TRIP_AT,
    });

    await ingest.syncTechnicalObservationActive({
      organizationId: ORG,
      vehicleId: VEHICLE_ID,
      observationId: 'obs-device-quality-auto',
      label: PLATE,
      createdByWorkerId: DEVICE_QUALITY_WORKER_ID,
      notes: 'auto',
      occurredAt: TRIP_AT,
    });

    await ingest.syncTechnicalObservationActive({
      organizationId: ORG,
      vehicleId: VEHICLE_ID,
      observationId: OBS_ID,
      label: PLATE,
      createdByWorkerId: 'operator-1',
      notes: 'Klima defekt',
      occurredAt: new Date('2026-07-20T16:00:00.000Z'),
    });

    const open = [...notifications.values()].filter((n) => n.status === NotificationStatus.OPEN);
    expect(open).toHaveLength(2);
    expect(open.map((n) => n.eventType).sort()).toEqual([
      'DRIVING_ASSESSMENT_DEVICE_QUALITY',
      'TECHNICAL_OBSERVATION_ACTIVE',
    ]);
  });

  it('compliance insight sync ingests SERVICE_OVERDUE and resolves when cleared', async () => {
    await ingest.syncComplianceFromInsights(ORG, 'run-1', [
      {
        type: InsightType.SERVICE_OVERDUE,
        severity: InsightSeverity.CRITICAL,
        priority: 85,
        title: 'Service überfällig',
        message: `${PLATE}: Service überfällig`,
        entityScope: InsightEntityScope.VEHICLE,
        entityIds: [VEHICLE_ID],
        metrics: { remainingDays: -3, remainingKm: -120 },
        reasons: [],
        confidence: 1,
        dedupeKey: `service_overdue:${VEHICLE_ID}`,
      },
    ]);

    const open = [...notifications.values()].filter((n) => n.status === NotificationStatus.OPEN);
    expect(open).toHaveLength(1);
    expect(open[0].eventType).toBe('SERVICE_OVERDUE');

    await ingest.syncComplianceFromInsights(ORG, 'run-2', []);

    expect(notifications.get(open[0].id)?.status).toBe(NotificationStatus.RESOLVED);
  });

  it('mergeVehicleHealthNotificationSources prefers alert rows over module aggregate', () => {
    const merged = mergeVehicleHealthNotificationSources(
      [
        {
          eventType: 'TIRE_CRITICAL',
          vehicleId: VEHICLE_ID,
          label: PLATE,
          severity: 'warning',
          reason: 'module',
        },
        {
          eventType: 'BRAKE_CRITICAL',
          vehicleId: VEHICLE_ID,
          label: PLATE,
          severity: 'warning',
        },
      ],
      [
        {
          eventType: 'TIRE_CRITICAL',
          vehicleId: VEHICLE_ID,
          label: PLATE,
          code: 'tpms-fl',
          severity: 'critical',
        },
      ],
      [],
    );

    expect(merged.filter((s) => s.eventType === 'TIRE_CRITICAL')).toHaveLength(1);
    expect(merged.find((s) => s.eventType === 'TIRE_CRITICAL')?.code).toBe('tpms-fl');
    expect(merged.some((s) => s.eventType === 'BRAKE_CRITICAL')).toBe(true);
  });
});
