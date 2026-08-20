import { NotificationEntityType, NotificationSeverity, NotificationStatus } from '@prisma/client';
import type { VehicleHealth } from '@modules/rental-health/rental-health.types';
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
import { VehicleHealthNotificationAdapter } from './vehicle-health-notification.adapter';
import { ServiceComplianceNotificationAdapter } from './service-compliance-notification.adapter';
import { VehicleAlertsNotificationAdapter } from './vehicle-alerts-notification.adapter';
import { VehicleReadinessNotificationAdapter } from './vehicle-readiness-notification.adapter';
import { VehicleReadinessEvaluabilityNotificationAdapter } from './vehicle-readiness-evaluability-notification.adapter';
import { VehicleDamageNotificationAdapter } from './vehicle-damage-notification.adapter';
import { NotificationProducerRouter } from './notification-producer.router';
import { NotificationProducerIngestService } from './notification-producer.ingest.service';
import {
  projectVehicleReadinessAggregate,
  vehicleReadinessSourceFingerprint,
} from './vehicle-readiness-notification.projector';
import {
  projectVehicleAlertNotifications,
  vehicleAlertsSourceFingerprint,
} from './vehicle-alerts-notification.projector';
import { buildVehicleAlertsTestEnvelope } from '@modules/vehicle-intelligence/dashboard-warning-lights/vehicle-alerts-rental-health.projector';
import type { DashboardWarningLight } from '@modules/vehicle-intelligence/dashboard-warning-lights/dashboard-warning-lights.types';
import { buildRegistryFingerprint } from '../registry/notification-event-registry';

const ORG_A = 'org-a';
const ORG_B = 'org-b';
const VEH_A = 'veh-a';
const VEH_B = 'veh-b';
const LABEL_A = 'WOB A 1001';
const LABEL_B = 'WOB B 2002';
const TS = '2026-06-16T12:00:00.000Z';

function limpActive(): DashboardWarningLight {
  return {
    key: 'engine_limp_mode',
    label: 'Motorwarnung / Notlauf',
    state: 'active',
    severity: 'critical',
    supported: true,
    observedAt: TS,
    sourceSignal: 'engine.get.limp_mode',
    sourceTimestamp: TS,
    reason: 'Notlauf aktiv',
    action: 'Nicht vermieten',
    rentalImpact: 'block_rental',
    isCurrentActive: true,
    freshness: 'fresh',
  };
}

function oilLowActive(): DashboardWarningLight {
  return {
    key: 'engine_oil_level',
    label: 'Motorölstand',
    state: 'active',
    severity: 'critical',
    supported: true,
    observedAt: TS,
    sourceSignal: 'diagnostics.get.engine_oil_level',
    sourceTimestamp: TS,
    reason: 'Motorölstand niedrig',
    action: 'Öl prüfen',
    rentalImpact: 'block_rental',
    isCurrentActive: true,
    freshness: 'fresh',
  };
}

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

function health(overrides: Partial<VehicleHealth> = {}): VehicleHealth {
  const module = {
    state: 'good' as const,
    reason: '',
    last_updated_at: null,
    data_stale: false,
    pipeline_available: true,
  };
  return {
    vehicle_id: VEH_A,
    organization_id: ORG_A,
    overall_state: 'good',
    availability: 'ready',
    rental_blocked: false,
    rental_readiness: 'ready',
    blocking_reasons: [],
    modules: {
      battery: module,
      tires: module,
      brakes: module,
      error_codes: module,
      service_compliance: module,
      complaints: module,
      vehicle_alerts: module,
    },
    generated_at: '2026-06-16T12:00:00.000Z',
    ...overrides,
  };
}

describe('VehicleReadinessNotificationAdapter + lifecycle (P2.3)', () => {
  let v2Enabled: boolean;
  const notifications = new Map<string, any>();
  const activeByFingerprint = new Map<string, string>();
  let idSeq = 0;
  let ingest: NotificationProducerIngestService;
  let router: NotificationProducerRouter;

  const engineConfig = {
    isV2Enabled: () => v2Enabled,
    isV2EnabledForOrg: () => v2Enabled,
  } as unknown as NotificationEngineConfig;

  const repository = {
    findAnyActiveByFingerprint: jest.fn(async (orgId: string, fp: string) => {
      const id = activeByFingerprint.get(`${orgId}:${fp}`);
      return id ? notifications.get(id) : null;
    }),
    findLatestByFingerprint: jest.fn(async (orgId: string, fp: string) => {
      const matches = [...notifications.values()].filter(
        (n) => n.organizationId === orgId && n.fingerprint === fp,
      );
      return matches.sort((a, b) => b.lifecycleGeneration - a.lifecycleGeneration)[0] ?? null;
    }),
    findById: jest.fn(async (id: string, orgId: string) => {
      const row = notifications.get(id);
      return row?.organizationId === orgId ? row : null;
    }),
    listNotifications: jest.fn(async (filter: {
      organizationId: string;
      status?: NotificationStatus[];
      entityType?: string;
      eventTypes?: string[];
      limit?: number;
      offset?: number;
    }) => {
      const matches = [...notifications.values()].filter((n) => {
        if (n.organizationId !== filter.organizationId) return false;
        if (filter.status?.length && !filter.status.includes(n.status)) return false;
        if (filter.entityType && n.entityType !== filter.entityType) return false;
        if (filter.eventTypes?.length && !filter.eventTypes.includes(n.eventType)) return false;
        return true;
      });
      const offset = filter.offset ?? 0;
      const limit = filter.limit ?? matches.length;
      return matches.slice(offset, offset + limit);
    }),
    runTransaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({})),
    createNotification: jest.fn(async (data: any) => {
      const id = `ntf-${++idSeq}`;
      const row = {
        id,
        ...data,
        status: NotificationStatus.OPEN,
        occurrenceCount: 1,
        lifecycleGeneration: data.lifecycleGeneration ?? 1,
        version: 1,
        templateParams: data.templateParams ?? {},
        actionTarget: data.actionTarget ?? {},
        lastSeenAt: data.lastSeenAt ?? data.firstSeenAt,
      };
      notifications.set(id, row);
      activeByFingerprint.set(`${data.organizationId}:${data.fingerprint}`, id);
      return row;
    }),
    updateNotification: jest.fn(async (id: string, data: any, version?: number) => {
      const existing = notifications.get(id);
      if (!existing) throw new Error('not found');
      if (version != null && existing.version !== version) throw new Error('version conflict');
      const updated = { ...existing, ...data, version: (existing.version ?? 1) + 1 };
      notifications.set(id, updated);
      if (
        ![NotificationStatus.OPEN, NotificationStatus.ACKNOWLEDGED, NotificationStatus.SNOOZED].includes(
          updated.status,
        )
      ) {
        activeByFingerprint.delete(`${existing.organizationId}:${existing.fingerprint}`);
      }
      return updated;
    }),
    createOccurrence: jest.fn(async () => ({ id: `occ-${++idSeq}` })),
  } as unknown as NotificationRepository;

  beforeEach(() => {
    v2Enabled = true;
    notifications.clear();
    activeByFingerprint.clear();
    idSeq = 0;
    jest.clearAllMocks();

    const { deliveryEnqueue, deliveryPolicy, deliveryScheduler } = createDeliveryMocks();
    const core = new NotificationCoreService(
      repository,
      engineConfig,
      deliveryEnqueue,
      deliveryPolicy,
      deliveryScheduler,
    );
    const ingestObservability = {
      recordCandidate: jest.fn(),
      recordCandidateRejected: jest.fn(),
    };
    router = new NotificationProducerRouter(
      core,
      engineConfig,
      ingestObservability as any,
      new DrivingAssessmentNotificationAdapter(),
      new TechnicalObservationNotificationAdapter(),
      new StationShortageNotificationAdapter(),
      new VehicleHealthNotificationAdapter(),
      new ServiceComplianceNotificationAdapter(),
      new VehicleAlertsNotificationAdapter(),
      new VehicleReadinessNotificationAdapter(),
      new VehicleReadinessEvaluabilityNotificationAdapter(),
      new VehicleDamageNotificationAdapter(),
    );
    ingest = new NotificationProducerIngestService(
      router,
      repository,
      new DrivingAssessmentNotificationAdapter(),
      new TechnicalObservationNotificationAdapter(),
      new StationShortageNotificationAdapter(),
      new LowUtilizationNotificationAdapter(),
      new VehicleHealthNotificationAdapter(),
      new ServiceComplianceNotificationAdapter(),
      new VehicleAlertsNotificationAdapter(),
      new VehicleReadinessNotificationAdapter(),
      new VehicleReadinessEvaluabilityNotificationAdapter(),
      new VehicleDamageNotificationAdapter(),
      core,
    );
  });

  function seedLegacyRow(
    eventType: 'BLOCKED_VEHICLE' | 'MAINTENANCE_REQUIRED',
    vehicleId = VEH_A,
    id?: string,
  ) {
    const rowId = id ?? `legacy-${eventType}-${vehicleId}`;
    const legacyFp = buildRegistryFingerprint(ORG_A, eventType, vehicleId).canonical;
    notifications.set(rowId, {
      id: rowId,
      organizationId: ORG_A,
      fingerprint: legacyFp,
      status: NotificationStatus.OPEN,
      entityType: NotificationEntityType.VEHICLE,
      eventType,
      entityId: vehicleId,
      lifecycleGeneration: 1,
      version: 1,
      lastSeenAt: new Date(),
    });
    activeByFingerprint.set(`${ORG_A}:${legacyFp}`, rowId);
    return rowId;
  }

  const blockedHealth = () =>
    health({ rental_blocked: true, rental_readiness: 'not_ready', blocking_reasons: ['x'] });

  function openNotifications(orgId = ORG_A) {
    return [...notifications.values()].filter(
      (n) => n.organizationId === orgId && n.status === NotificationStatus.OPEN,
    );
  }

  async function syncAggregate(sources: ReturnType<typeof projectVehicleReadinessAggregate>, runId: string) {
    await ingest.syncVehicleReadinessAggregate(ORG_A, runId, sources);
  }

  describe('VEHICLE_NOT_READY lifecycle', () => {
    it('READY first evaluation is a no-op', async () => {
      await syncAggregate(projectVehicleReadinessAggregate(VEH_A, LABEL_A, health()), 'run-ready-1');
      expect(openNotifications()).toHaveLength(0);
      expect((repository.createNotification as jest.Mock).mock.calls).toHaveLength(0);
    });

    it('NOT_READY opens aggregate notification', async () => {
      await syncAggregate(
        projectVehicleReadinessAggregate(
          VEH_A,
          LABEL_A,
          health({ rental_blocked: true, rental_readiness: 'not_ready', blocking_reasons: ['x'] }),
        ),
        'run-block-1',
      );
      expect(openNotifications()).toHaveLength(1);
      expect(openNotifications()[0].eventType).toBe('VEHICLE_NOT_READY');
      expect(openNotifications()[0].severity).toBe(NotificationSeverity.WARNING);
    });

    it('NOT_READY from telemetry hard-offline blocking reason opens VEHICLE_NOT_READY', async () => {
      await syncAggregate(
        projectVehicleReadinessAggregate(
          VEH_A,
          LABEL_A,
          health({
            rental_blocked: true,
            rental_readiness: 'not_ready',
            blocking_reasons: ['Telemetrie: Kein Signal innerhalb der letzten 48 Stunden'],
          }),
        ),
        'run-telemetry-offline-1',
      );
      expect(openNotifications()).toHaveLength(1);
      expect(openNotifications()[0].eventType).toBe('VEHICLE_NOT_READY');
    });

    it('NOT_READY repeated keeps same notification id', async () => {
      const blocked = projectVehicleReadinessAggregate(
        VEH_A,
        LABEL_A,
        health({ rental_blocked: true, rental_readiness: 'not_ready', blocking_reasons: ['x'] }),
      );
      await syncAggregate(blocked, 'run-block-2a');
      const first = openNotifications()[0];
      await syncAggregate(blocked, 'run-block-2b');
      expect(openNotifications()[0].id).toBe(first.id);
    });

    it('NOT_READY → READY resolves', async () => {
      await syncAggregate(
        projectVehicleReadinessAggregate(
          VEH_A,
          LABEL_A,
          health({ rental_blocked: true, rental_readiness: 'not_ready', blocking_reasons: ['x'] }),
        ),
        'run-block-3a',
      );
      const first = openNotifications()[0];
      await syncAggregate(projectVehicleReadinessAggregate(VEH_A, LABEL_A, health()), 'run-block-3b');
      expect(notifications.get(first.id)?.status).toBe(NotificationStatus.RESOLVED);
    });

    it('NOT_READY → READY → NOT_READY reopens same lifecycle identity', async () => {
      const blocked = projectVehicleReadinessAggregate(
        VEH_A,
        LABEL_A,
        health({ rental_blocked: true, rental_readiness: 'not_ready', blocking_reasons: ['x'] }),
      );
      await syncAggregate(blocked, 'run-reopen-1');
      const first = openNotifications()[0];
      await syncAggregate(projectVehicleReadinessAggregate(VEH_A, LABEL_A, health()), 'run-reopen-2');
      const resolvedRow = notifications.get(first.id);
      if (resolvedRow) {
        resolvedRow.resolvedAt = new Date(Date.now() - 20 * 60_000);
        notifications.set(first.id, resolvedRow);
      }
      await syncAggregate(blocked, 'run-reopen-3');
      expect(openNotifications()[0].id).toBe(first.id);
    });
  });

  describe('UNEVALUABLE preservation', () => {
    it('NOT_READY → UNEVALUABLE preserves OPEN', async () => {
      await syncAggregate(
        projectVehicleReadinessAggregate(
          VEH_A,
          LABEL_A,
          health({ rental_blocked: true, rental_readiness: 'not_ready', blocking_reasons: ['x'] }),
        ),
        'run-uneval-1',
      );
      const first = openNotifications()[0];
      await syncAggregate([], 'run-uneval-2');
      expect(notifications.get(first.id)?.status).toBe(NotificationStatus.OPEN);
    });

    it('UNEVALUABLE first does not open aggregate', async () => {
      await syncAggregate([], 'run-uneval-first');
      expect(openNotifications()).toHaveLength(0);
    });

    it('UNEVALUABLE → READY stays no-op', async () => {
      await syncAggregate(projectVehicleReadinessAggregate(VEH_A, LABEL_A, health()), 'run-uneval-ready');
      expect(openNotifications()).toHaveLength(0);
    });

    it('UNEVALUABLE → NOT_READY opens aggregate', async () => {
      await syncAggregate([], 'run-uneval-block-1');
      await syncAggregate(
        projectVehicleReadinessAggregate(
          VEH_A,
          LABEL_A,
          health({ rental_blocked: true, rental_readiness: 'not_ready', blocking_reasons: ['x'] }),
        ),
        'run-uneval-block-2',
      );
      expect(openNotifications()).toHaveLength(1);
    });
  });

  describe('cause + aggregate coexistence', () => {
    it('TIRE_CRITICAL + VEHICLE_NOT_READY coexist', async () => {
      await ingest.syncVehicleHealthWarnings(ORG_A, 'run-cause-1', [
        {
          eventType: 'TIRE_CRITICAL',
          vehicleId: VEH_A,
          label: LABEL_A,
          severity: 'critical',
        },
      ]);
      await syncAggregate(
        projectVehicleReadinessAggregate(VEH_A, LABEL_A, blockedHealth()),
        'run-cause-1',
      );
      const open = openNotifications();
      expect(open.map((n) => n.eventType).sort()).toEqual(['TIRE_CRITICAL', 'VEHICLE_NOT_READY']);
    });

    it('SERVICE_OVERDUE + VEHICLE_NOT_READY coexist', async () => {
      await ingest.syncServiceComplianceWarnings(ORG_A, 'run-cause-2', [
        {
          eventType: 'SERVICE_OVERDUE',
          vehicleId: VEH_A,
          label: LABEL_A,
          cleared: false,
          severity: 'critical',
          blocksRental: true,
        },
      ]);
      await syncAggregate(
        projectVehicleReadinessAggregate(VEH_A, LABEL_A, blockedHealth()),
        'run-cause-2',
      );
      const open = openNotifications();
      expect(open.map((n) => n.eventType).sort()).toEqual(['SERVICE_OVERDUE', 'VEHICLE_NOT_READY']);
    });

    it('LIMP_MODE_ACTIVE + VEHICLE_NOT_READY coexist', async () => {
      const alertSources = projectVehicleAlertNotifications(
        VEH_A,
        LABEL_A,
        buildVehicleAlertsTestEnvelope([limpActive()]),
      );
      await ingest.syncVehicleAlertsWarnings(ORG_A, 'run-cause-3', alertSources);
      await syncAggregate(
        projectVehicleReadinessAggregate(VEH_A, LABEL_A, blockedHealth()),
        'run-cause-3',
      );
      const open = openNotifications();
      expect(open.map((n) => n.eventType).sort()).toEqual(['LIMP_MODE_ACTIVE', 'VEHICLE_NOT_READY']);
    });

    it('LIMP_MODE_ACTIVE + ENGINE_OIL_LEVEL_LOW + VEHICLE_NOT_READY — three lifecycles', async () => {
      const alertSources = projectVehicleAlertNotifications(
        VEH_A,
        LABEL_A,
        buildVehicleAlertsTestEnvelope([limpActive(), oilLowActive()]),
      );
      await ingest.syncVehicleAlertsWarnings(ORG_A, 'run-cause-4', alertSources);
      await syncAggregate(
        projectVehicleReadinessAggregate(VEH_A, LABEL_A, blockedHealth()),
        'run-cause-4',
      );
      const open = openNotifications();
      expect(open.map((n) => n.eventType).sort()).toEqual([
        'ENGINE_OIL_LEVEL_LOW',
        'LIMP_MODE_ACTIVE',
        'VEHICLE_NOT_READY',
      ]);
    });
  });

  describe('no legacy aggregate producers', () => {
    it('not_ready projection never emits BLOCKED_VEHICLE or MAINTENANCE_REQUIRED', async () => {
      const sources = projectVehicleReadinessAggregate(
        VEH_A,
        LABEL_A,
        health({ rental_blocked: true, rental_readiness: 'not_ready', blocking_reasons: ['x'] }),
      );
      expect(sources.every((s) => s.eventType === 'VEHICLE_NOT_READY')).toBe(true);
    });
  });

  describe('legacy reconciliation (vehicle-scoped fail-safe)', () => {
    it('BLOCKED_VEHICLE + NOT_READY + canonical ingest success → legacy RESOLVED', async () => {
      const legacyId = seedLegacyRow('BLOCKED_VEHICLE');
      await syncAggregate(
        projectVehicleReadinessAggregate(VEH_A, LABEL_A, blockedHealth()),
        'run-legacy-success',
      );
      expect(notifications.get(legacyId)?.status).toBe(NotificationStatus.RESOLVED);
      expect(openNotifications().some((n) => n.eventType === 'VEHICLE_NOT_READY')).toBe(true);
    });

    it('BLOCKED_VEHICLE + NOT_READY + canonical ingest failure → legacy STAYS OPEN', async () => {
      const legacyId = seedLegacyRow('BLOCKED_VEHICLE');
      jest.spyOn(router, 'ingestFromAdapter').mockRejectedValueOnce(new Error('ingest failed'));
      await syncAggregate(
        projectVehicleReadinessAggregate(VEH_A, LABEL_A, blockedHealth()),
        'run-legacy-fail',
      );
      expect(notifications.get(legacyId)?.status).toBe(NotificationStatus.OPEN);
    });

    it('BLOCKED_VEHICLE + READY → legacy RESOLVED', async () => {
      const legacyId = seedLegacyRow('BLOCKED_VEHICLE');
      await syncAggregate(projectVehicleReadinessAggregate(VEH_A, LABEL_A, health()), 'run-legacy-ready');
      expect(notifications.get(legacyId)?.status).toBe(NotificationStatus.RESOLVED);
    });

    it('BLOCKED_VEHICLE + UNEVALUABLE (no source) → legacy STAYS OPEN', async () => {
      const legacyId = seedLegacyRow('BLOCKED_VEHICLE');
      await syncAggregate([], 'run-legacy-uneval');
      expect(notifications.get(legacyId)?.status).toBe(NotificationStatus.OPEN);
    });

    it('MAINTENANCE_REQUIRED + NOT_READY success → legacy RESOLVED', async () => {
      const legacyId = seedLegacyRow('MAINTENANCE_REQUIRED');
      await syncAggregate(
        projectVehicleReadinessAggregate(VEH_A, LABEL_A, blockedHealth()),
        'run-maint-success',
      );
      expect(notifications.get(legacyId)?.status).toBe(NotificationStatus.RESOLVED);
    });

    it('MAINTENANCE_REQUIRED + UNEVALUABLE → legacy STAYS OPEN', async () => {
      const legacyId = seedLegacyRow('MAINTENANCE_REQUIRED');
      await syncAggregate([], 'run-maint-uneval');
      expect(notifications.get(legacyId)?.status).toBe(NotificationStatus.OPEN);
    });

    it('both legacy types for same vehicle reconcile together on READY', async () => {
      const blockedId = seedLegacyRow('BLOCKED_VEHICLE');
      const maintId = seedLegacyRow('MAINTENANCE_REQUIRED');
      await syncAggregate(projectVehicleReadinessAggregate(VEH_A, LABEL_A, health()), 'run-both-legacy');
      expect(notifications.get(blockedId)?.status).toBe(NotificationStatus.RESOLVED);
      expect(notifications.get(maintId)?.status).toBe(NotificationStatus.RESOLVED);
    });

    it('UNEVALUABLE sync does not resolve legacy on another evaluated vehicle', async () => {
      const legacyA = seedLegacyRow('BLOCKED_VEHICLE', VEH_A);
      const legacyB = seedLegacyRow('BLOCKED_VEHICLE', VEH_B, 'legacy-b');
      await syncAggregate(
        projectVehicleReadinessAggregate(VEH_B, LABEL_B, health({ vehicle_id: VEH_B })),
        'run-legacy-partial',
      );
      expect(notifications.get(legacyA)?.status).toBe(NotificationStatus.OPEN);
      expect(notifications.get(legacyB)?.status).toBe(NotificationStatus.RESOLVED);
    });
  });

  describe('legacy + canonical pagination', () => {
    it('resolves legacy row on page 2 when vehicle is reconcilable', async () => {
      const targetVehicleId = 'veh-page-target';
      const targetLegacyId = seedLegacyRow('BLOCKED_VEHICLE', targetVehicleId);

      const pagedRows = Array.from({ length: 500 }, (_, index) => ({
        id: `legacy-page-${index}`,
        organizationId: ORG_A,
        fingerprint: `org-a|BLOCKED_VEHICLE|VEHICLE|veh-filler-${index}|blocked_vehicle|v1`,
        status: NotificationStatus.OPEN,
        entityType: NotificationEntityType.VEHICLE,
        eventType: 'BLOCKED_VEHICLE',
        entityId: `veh-filler-${index}`,
        lifecycleGeneration: 1,
        version: 1,
        lastSeenAt: new Date(),
      }));
      const targetFp = buildRegistryFingerprint(ORG_A, 'BLOCKED_VEHICLE', targetVehicleId).canonical;
      pagedRows.push({
        id: targetLegacyId,
        organizationId: ORG_A,
        fingerprint: targetFp,
        status: NotificationStatus.OPEN,
        entityType: NotificationEntityType.VEHICLE,
        eventType: 'BLOCKED_VEHICLE',
        entityId: targetVehicleId,
        lifecycleGeneration: 1,
        version: 1,
        lastSeenAt: new Date(),
      } as any);
      activeByFingerprint.set(`${ORG_A}:${targetFp}`, targetLegacyId);

      (repository.listNotifications as jest.Mock).mockImplementation(
        async (filter: {
          organizationId: string;
          status?: NotificationStatus[];
          entityType?: string;
          eventTypes?: string[];
          offset?: number;
          limit?: number;
        }) => {
          const matches = pagedRows.filter((n) => {
            if (n.organizationId !== filter.organizationId) return false;
            if (filter.status?.length && !filter.status.includes(n.status)) return false;
            if (filter.entityType && n.entityType !== filter.entityType) return false;
            if (filter.eventTypes?.length && !filter.eventTypes.includes(n.eventType)) return false;
            return true;
          });
          const offset = filter.offset ?? 0;
          const limit = filter.limit ?? matches.length;
          return matches.slice(offset, offset + limit);
        },
      );

      await syncAggregate(
        projectVehicleReadinessAggregate(
          targetVehicleId,
          'TARGET',
          health({
            vehicle_id: targetVehicleId,
            rental_blocked: true,
            rental_readiness: 'not_ready',
            blocking_reasons: ['x'],
          }),
        ),
        'run-legacy-page',
      );

      expect((repository.listNotifications as jest.Mock).mock.calls.length).toBeGreaterThanOrEqual(2);
      expect(notifications.get(targetLegacyId)?.status).toBe(NotificationStatus.RESOLVED);
    });

    it('paginated active VEHICLE_NOT_READY fingerprint lookup before READY ingest', async () => {
      const targetFingerprint = vehicleReadinessSourceFingerprint(ORG_A, { vehicleId: VEH_A });
      const pagedRows = Array.from({ length: 500 }, (_, index) => ({
        id: `canonical-page-${index}`,
        organizationId: ORG_A,
        fingerprint: `org-a|VEHICLE_NOT_READY|VEHICLE|veh-filler-${index}|vehicle_not_ready|v1`,
        status: NotificationStatus.OPEN,
        entityType: NotificationEntityType.VEHICLE,
        eventType: 'VEHICLE_NOT_READY',
        entityId: `veh-filler-${index}`,
        lifecycleGeneration: 1,
        version: 1,
        lastSeenAt: new Date(),
      }));
      pagedRows.push({
        id: 'canonical-target',
        organizationId: ORG_A,
        fingerprint: targetFingerprint,
        status: NotificationStatus.OPEN,
        entityType: NotificationEntityType.VEHICLE,
        eventType: 'VEHICLE_NOT_READY',
        entityId: VEH_A,
        lifecycleGeneration: 1,
        version: 1,
        lastSeenAt: new Date(),
      } as any);
      activeByFingerprint.set(`${ORG_A}:${targetFingerprint}`, 'canonical-target');
      notifications.set('canonical-target', pagedRows[500]);

      (repository.listNotifications as jest.Mock).mockImplementation(
        async (filter: {
          organizationId: string;
          status?: NotificationStatus[];
          entityType?: string;
          eventTypes?: string[];
          offset?: number;
          limit?: number;
        }) => {
          const sourceRows =
            filter.eventTypes?.includes('VEHICLE_NOT_READY') ||
            filter.eventTypes?.includes('BLOCKED_VEHICLE') ||
            filter.eventTypes?.includes('MAINTENANCE_REQUIRED')
              ? pagedRows
              : [...notifications.values()].filter((n) => n.organizationId === filter.organizationId);
          const matches = sourceRows.filter((n) => {
            if (n.organizationId !== filter.organizationId) return false;
            if (filter.status?.length && !filter.status.includes(n.status)) return false;
            if (filter.entityType && n.entityType !== filter.entityType) return false;
            if (filter.eventTypes?.length && !filter.eventTypes.includes(n.eventType)) return false;
            return true;
          });
          const offset = filter.offset ?? 0;
          const limit = filter.limit ?? matches.length;
          return matches.slice(offset, offset + limit);
        },
      );

      await syncAggregate(projectVehicleReadinessAggregate(VEH_A, LABEL_A, health()), 'run-canonical-page');

      expect((repository.listNotifications as jest.Mock).mock.calls.length).toBeGreaterThanOrEqual(2);
      expect(notifications.get('canonical-target')?.status).toBe(NotificationStatus.RESOLVED);
    });
  });

  describe('isolation', () => {
    it('same org: vehicle A resolve does not affect vehicle B', async () => {
      const blocked = health({ rental_blocked: true, rental_readiness: 'not_ready', blocking_reasons: ['x'] });
      await ingest.syncVehicleReadinessAggregate(
        ORG_A,
        'run-iso-1',
        projectVehicleReadinessAggregate(VEH_A, LABEL_A, { ...blocked, vehicle_id: VEH_A }),
      );
      await ingest.syncVehicleReadinessAggregate(
        ORG_A,
        'run-iso-1',
        projectVehicleReadinessAggregate(VEH_B, LABEL_B, {
          ...blocked,
          vehicle_id: VEH_B,
          organization_id: ORG_A,
        }),
      );
      await ingest.syncVehicleReadinessAggregate(
        ORG_A,
        'run-iso-2',
        projectVehicleReadinessAggregate(VEH_A, LABEL_A, health({ vehicle_id: VEH_A })),
      );
      const openB = [...notifications.values()].filter(
        (n) =>
          n.organizationId === ORG_A &&
          n.entityId === VEH_B &&
          n.status === NotificationStatus.OPEN,
      );
      expect(openB).toHaveLength(1);
    });

    it('tenant isolation: org A resolve does not affect org B', async () => {
      const blocked = health({ rental_blocked: true, rental_readiness: 'not_ready', blocking_reasons: ['x'] });
      await ingest.syncVehicleReadinessAggregate(
        ORG_A,
        'run-tenant-1',
        projectVehicleReadinessAggregate(VEH_A, LABEL_A, blocked),
      );
      await ingest.syncVehicleReadinessAggregate(
        ORG_B,
        'run-tenant-1',
        projectVehicleReadinessAggregate(VEH_A, LABEL_A, {
          ...blocked,
          organization_id: ORG_B,
        }),
      );
      await ingest.syncVehicleReadinessAggregate(
        ORG_A,
        'run-tenant-2',
        projectVehicleReadinessAggregate(VEH_A, LABEL_A, health()),
      );
      const openB = [...notifications.values()].filter(
        (n) => n.organizationId === ORG_B && n.status === NotificationStatus.OPEN,
      );
      expect(openB).toHaveLength(1);
    });
  });

  describe('registry regression', () => {
    it('golden fingerprint for VEHICLE_NOT_READY', () => {
      const fp = vehicleReadinessSourceFingerprint(ORG_A, { vehicleId: VEH_A });
      expect(fp).toBe(`org-a|VEHICLE_NOT_READY|VEHICLE|veh-a|vehicle_not_ready|v1`);
    });
  });
});
