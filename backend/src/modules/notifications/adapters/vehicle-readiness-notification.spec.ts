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
import { NotificationProducerRouter } from './notification-producer.router';
import { NotificationProducerIngestService } from './notification-producer.ingest.service';
import {
  projectVehicleReadinessAggregate,
  vehicleReadinessSourceFingerprint,
} from './vehicle-readiness-notification.projector';
import { buildRegistryFingerprint } from '../registry/notification-event-registry';

const ORG_A = 'org-a';
const ORG_B = 'org-b';
const VEH_A = 'veh-a';
const VEH_B = 'veh-b';
const LABEL_A = 'WOB A 1001';
const LABEL_B = 'WOB B 2002';

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
    const router = new NotificationProducerRouter(
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
      core,
    );
  });

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
        projectVehicleReadinessAggregate(
          VEH_A,
          LABEL_A,
          health({ rental_blocked: true, rental_readiness: 'not_ready', blocking_reasons: ['tire'] }),
        ),
        'run-cause-1',
      );
      const open = openNotifications();
      expect(open.map((n) => n.eventType).sort()).toEqual(['TIRE_CRITICAL', 'VEHICLE_NOT_READY']);
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

  describe('legacy reconciliation', () => {
    it('resolves active BLOCKED_VEHICLE legacy row', async () => {
      const legacyFp = buildRegistryFingerprint(ORG_A, 'BLOCKED_VEHICLE', VEH_A).canonical;
      notifications.set('legacy-1', {
        id: 'legacy-1',
        organizationId: ORG_A,
        fingerprint: legacyFp,
        status: NotificationStatus.OPEN,
        entityType: NotificationEntityType.VEHICLE,
        eventType: 'BLOCKED_VEHICLE',
        entityId: VEH_A,
        lifecycleGeneration: 1,
        version: 1,
        lastSeenAt: new Date(),
      });
      activeByFingerprint.set(`${ORG_A}:${legacyFp}`, 'legacy-1');

      await syncAggregate([], 'run-legacy');
      expect(notifications.get('legacy-1')?.status).toBe(NotificationStatus.RESOLVED);
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
