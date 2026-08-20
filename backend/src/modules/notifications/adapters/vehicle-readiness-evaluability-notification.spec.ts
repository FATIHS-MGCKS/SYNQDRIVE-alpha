import { NotificationEntityType, NotificationSeverity, NotificationStatus } from '@prisma/client';
import type { VehicleHealth } from '@modules/rental-health/rental-health.types';
import { buildDegradedVehicleHealth } from '@modules/rental-health/rental-health.types';
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
  projectVehicleReadinessEvaluability,
  vehicleReadinessEvaluabilitySourceFingerprint,
} from './vehicle-readiness-evaluability-notification.projector';
import {
  projectVehicleReadinessAggregate,
} from './vehicle-readiness-notification.projector';
import {
  getNotificationDefinitionsByAttentionScope,
  NOTIFICATION_EVENT_REGISTRY,
  buildRegistryFingerprint,
} from '../registry/notification-event-registry';

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

function unevaluableHealth(overrides: Partial<VehicleHealth> = {}): VehicleHealth {
  return health({
    availability: 'partial',
    rental_blocked: null,
    rental_readiness: 'unevaluable',
    ...overrides,
  });
}

function blockedHealth() {
  return health({ rental_blocked: true, rental_readiness: 'not_ready', blocking_reasons: ['x'] });
}

describe('VehicleReadinessEvaluabilityNotificationAdapter + lifecycle (P2.4)', () => {
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

  function openNotifications(orgId = ORG_A) {
    return [...notifications.values()].filter(
      (n) => n.organizationId === orgId && n.status === NotificationStatus.OPEN,
    );
  }

  async function syncEvaluability(
    sources: ReturnType<typeof projectVehicleReadinessEvaluability>,
    runId: string,
  ) {
    await ingest.syncVehicleReadinessEvaluabilityAggregate(ORG_A, runId, sources);
  }

  async function syncNotReady(
    sources: ReturnType<typeof projectVehicleReadinessAggregate>,
    runId: string,
  ) {
    await ingest.syncVehicleReadinessAggregate(ORG_A, runId, sources);
  }

  function seedCause(eventType: string, vehicleId = VEH_A) {
    const fp = buildRegistryFingerprint(ORG_A, eventType, vehicleId).canonical;
    const id = `cause-${eventType}-${vehicleId}`;
    notifications.set(id, {
      id,
      organizationId: ORG_A,
      fingerprint: fp,
      status: NotificationStatus.OPEN,
      entityType: NotificationEntityType.VEHICLE,
      eventType,
      entityId: vehicleId,
      lifecycleGeneration: 1,
      version: 1,
      lastSeenAt: new Date(),
    });
    activeByFingerprint.set(`${ORG_A}:${fp}`, id);
  }

  describe('UNEVALUABLE lifecycle', () => {
    it('first EVALUABLE is a no-op', async () => {
      await syncEvaluability(projectVehicleReadinessEvaluability(VEH_A, LABEL_A, health()), 'run-1');
      expect(openNotifications()).toHaveLength(0);
    });

    it('UNEVALUABLE opens aggregate notification', async () => {
      await syncEvaluability(
        projectVehicleReadinessEvaluability(VEH_A, LABEL_A, unevaluableHealth()),
        'run-2',
      );
      expect(openNotifications()).toHaveLength(1);
      expect(openNotifications()[0].eventType).toBe('VEHICLE_READINESS_UNEVALUABLE');
      expect(openNotifications()[0].severity).toBe(NotificationSeverity.WARNING);
    });

    it('repeated UNEVALUABLE keeps same notification id', async () => {
      const sources = projectVehicleReadinessEvaluability(VEH_A, LABEL_A, unevaluableHealth());
      await syncEvaluability(sources, 'run-3a');
      const first = openNotifications()[0];
      await syncEvaluability(sources, 'run-3b');
      expect(openNotifications()[0].id).toBe(first.id);
    });

    it('UNEVALUABLE → EVALUABLE (READY) resolves', async () => {
      await syncEvaluability(
        projectVehicleReadinessEvaluability(VEH_A, LABEL_A, unevaluableHealth()),
        'run-4a',
      );
      const first = openNotifications()[0];
      await syncEvaluability(projectVehicleReadinessEvaluability(VEH_A, LABEL_A, health()), 'run-4b');
      expect(notifications.get(first.id)?.status).toBe(NotificationStatus.RESOLVED);
    });

    it('UNEVALUABLE → EVALUABLE → UNEVALUABLE reopens same lifecycle', async () => {
      const uneval = projectVehicleReadinessEvaluability(VEH_A, LABEL_A, unevaluableHealth());
      await syncEvaluability(uneval, 'run-reopen-1');
      const first = openNotifications()[0];
      await syncEvaluability(projectVehicleReadinessEvaluability(VEH_A, LABEL_A, health()), 'run-reopen-2');
      const resolvedRow = notifications.get(first.id);
      if (resolvedRow) {
        resolvedRow.resolvedAt = new Date(Date.now() - 20 * 60_000);
        notifications.set(first.id, resolvedRow);
      }
      await syncEvaluability(uneval, 'run-reopen-3');
      expect(openNotifications()[0].id).toBe(first.id);
    });
  });

  describe('missing rental_readiness (NO_ASSERTION)', () => {
    function healthWithoutReadiness(overrides: Partial<VehicleHealth> = {}): VehicleHealth {
      const full = health(overrides);
      const { rental_readiness: _omit, ...rest } = full;
      return rest as VehicleHealth;
    }

    it('B: no existing aggregate + missing rental_readiness creates no notification', async () => {
      await syncEvaluability(
        projectVehicleReadinessEvaluability(VEH_A, LABEL_A, healthWithoutReadiness()),
        'no-assert-1',
      );
      expect(openNotifications()).toHaveLength(0);
    });

    it('C: existing OPEN UNEVALUABLE preserved when snapshot lacks rental_readiness', async () => {
      await syncEvaluability(
        projectVehicleReadinessEvaluability(VEH_A, LABEL_A, unevaluableHealth()),
        'preserve-1',
      );
      const openRow = openNotifications()[0];
      await syncEvaluability(
        projectVehicleReadinessEvaluability(VEH_A, LABEL_A, healthWithoutReadiness()),
        'preserve-2',
      );
      expect(openNotifications()).toHaveLength(1);
      expect(openNotifications()[0].id).toBe(openRow.id);
      expect(openNotifications()[0].status).toBe(NotificationStatus.OPEN);
    });

    it('missing rental_readiness with availability unavailable does not resolve OPEN UNEVALUABLE', async () => {
      await syncEvaluability(
        projectVehicleReadinessEvaluability(VEH_A, LABEL_A, unevaluableHealth()),
        'unavail-1',
      );
      const openRow = openNotifications()[0];
      await syncEvaluability(
        projectVehicleReadinessEvaluability(
          VEH_A,
          LABEL_A,
          healthWithoutReadiness({ availability: 'unavailable', rental_blocked: null }),
        ),
        'unavail-2',
      );
      expect(notifications.get(openRow.id)?.status).toBe(NotificationStatus.OPEN);
    });

    it('buildDegradedVehicleHealth through ingest creates no notification', async () => {
      const degraded = buildDegradedVehicleHealth({
        vehicle_id: VEH_A,
        organization_id: ORG_A,
        availability: 'unavailable',
      });
      await syncEvaluability(
        projectVehicleReadinessEvaluability(VEH_A, LABEL_A, degraded),
        'degraded-1',
      );
      expect(openNotifications()).toHaveLength(0);
    });
  });

  describe('transitions with VEHICLE_NOT_READY', () => {
    it('READY → UNEVALUABLE opens UNEVALUABLE only', async () => {
      await syncEvaluability(projectVehicleReadinessEvaluability(VEH_A, LABEL_A, unevaluableHealth()), 't1');
      expect(openNotifications().map((n) => n.eventType)).toEqual(['VEHICLE_READINESS_UNEVALUABLE']);
    });

    it('NOT_READY → UNEVALUABLE keeps VEHICLE_NOT_READY OPEN and opens UNEVALUABLE', async () => {
      await syncNotReady(projectVehicleReadinessAggregate(VEH_A, LABEL_A, blockedHealth()), 't2a');
      await syncEvaluability(
        projectVehicleReadinessEvaluability(VEH_A, LABEL_A, unevaluableHealth()),
        't2b',
      );
      const open = openNotifications();
      expect(open.map((n) => n.eventType).sort()).toEqual([
        'VEHICLE_NOT_READY',
        'VEHICLE_READINESS_UNEVALUABLE',
      ]);
    });

    it('UNEVALUABLE → NOT_READY resolves UNEVALUABLE and opens NOT_READY', async () => {
      await syncEvaluability(
        projectVehicleReadinessEvaluability(VEH_A, LABEL_A, unevaluableHealth()),
        't3a',
      );
      const unevalRow = openNotifications().find((n) => n.eventType === 'VEHICLE_READINESS_UNEVALUABLE');
      await syncEvaluability(
        projectVehicleReadinessEvaluability(VEH_A, LABEL_A, blockedHealth()),
        't3b',
      );
      await syncNotReady(projectVehicleReadinessAggregate(VEH_A, LABEL_A, blockedHealth()), 't3c');
      expect(notifications.get(unevalRow!.id)?.status).toBe(NotificationStatus.RESOLVED);
      expect(openNotifications().some((n) => n.eventType === 'VEHICLE_NOT_READY')).toBe(true);
    });

    it('NOT_READY → UNEVALUABLE → READY resolves UNEVALUABLE first, NOT_READY on READY', async () => {
      await syncNotReady(projectVehicleReadinessAggregate(VEH_A, LABEL_A, blockedHealth()), 't4a');
      const notReadyRow = openNotifications().find((n) => n.eventType === 'VEHICLE_NOT_READY');
      await syncEvaluability(
        projectVehicleReadinessEvaluability(VEH_A, LABEL_A, unevaluableHealth()),
        't4b',
      );
      const unevalRow = openNotifications().find((n) => n.eventType === 'VEHICLE_READINESS_UNEVALUABLE');
      await syncEvaluability(projectVehicleReadinessEvaluability(VEH_A, LABEL_A, health()), 't4c');
      expect(notifications.get(unevalRow!.id)?.status).toBe(NotificationStatus.RESOLVED);
      expect(notifications.get(notReadyRow!.id)?.status).toBe(NotificationStatus.OPEN);
      await syncNotReady(projectVehicleReadinessAggregate(VEH_A, LABEL_A, health()), 't4d');
      expect(notifications.get(notReadyRow!.id)?.status).toBe(NotificationStatus.RESOLVED);
    });
  });

  describe('cause + aggregate coexistence', () => {
    const causeTypes = [
      'TELEMETRY_OFFLINE',
      'DATA_SOURCE_DISCONNECTED',
      'AUTHORIZATION_REQUIRED',
      'CONNECTIVITY_STATE_UNKNOWN',
    ] as const;

    for (const causeType of causeTypes) {
      it(`${causeType} + VEHICLE_READINESS_UNEVALUABLE coexist`, async () => {
        seedCause(causeType);
        await syncEvaluability(
          projectVehicleReadinessEvaluability(VEH_A, LABEL_A, unevaluableHealth()),
          `cause-${causeType}`,
        );
        const open = openNotifications();
        expect(open.map((n) => n.eventType).sort()).toEqual(
          [causeType, 'VEHICLE_READINESS_UNEVALUABLE'].sort(),
        );
      });
    }
  });

  describe('isolation', () => {
    it('same org: vehicle A evaluable does not resolve vehicle B UNEVALUABLE', async () => {
      await syncEvaluability(
        projectVehicleReadinessEvaluability(VEH_A, LABEL_A, unevaluableHealth()),
        'iso-1',
      );
      await syncEvaluability(
        projectVehicleReadinessEvaluability(VEH_B, LABEL_B, {
          ...unevaluableHealth(),
          vehicle_id: VEH_B,
        }),
        'iso-1',
      );
      await syncEvaluability(
        projectVehicleReadinessEvaluability(VEH_A, LABEL_A, health({ vehicle_id: VEH_A })),
        'iso-2',
      );
      const openB = openNotifications().filter((n) => n.entityId === VEH_B);
      expect(openB).toHaveLength(1);
      expect(openB[0].eventType).toBe('VEHICLE_READINESS_UNEVALUABLE');
    });

    it('tenant isolation: org A resolve does not affect org B', async () => {
      await syncEvaluability(
        projectVehicleReadinessEvaluability(VEH_A, LABEL_A, unevaluableHealth()),
        'tenant-1',
      );
      await ingest.syncVehicleReadinessEvaluabilityAggregate(
        ORG_B,
        'tenant-1',
        projectVehicleReadinessEvaluability(VEH_A, LABEL_A, {
          ...unevaluableHealth(),
          organization_id: ORG_B,
        }),
      );
      await syncEvaluability(projectVehicleReadinessEvaluability(VEH_A, LABEL_A, health()), 'tenant-2');
      const openB = [...notifications.values()].filter(
        (n) => n.organizationId === ORG_B && n.status === NotificationStatus.OPEN,
      );
      expect(openB).toHaveLength(1);
    });
  });

  describe('active fingerprint pagination', () => {
    it('resolves paginated UNEVALUABLE row on page 2 when evaluable', async () => {
      const targetFingerprint = vehicleReadinessEvaluabilitySourceFingerprint(ORG_A, {
        vehicleId: VEH_A,
      });
      const pagedRows = Array.from({ length: 500 }, (_, index) => ({
        id: `ntf-page-${index}`,
        organizationId: ORG_A,
        fingerprint: `org-a|VEHICLE_READINESS_UNEVALUABLE|VEHICLE|veh-filler-${index}|vehicle_readiness_unevaluable|v1`,
        status: NotificationStatus.OPEN,
        entityType: NotificationEntityType.VEHICLE,
        eventType: 'VEHICLE_READINESS_UNEVALUABLE',
        entityId: `veh-filler-${index}`,
        lifecycleGeneration: 1,
        version: 1,
        lastSeenAt: new Date(),
      }));
      pagedRows.push({
        id: 'ntf-target',
        organizationId: ORG_A,
        fingerprint: targetFingerprint,
        status: NotificationStatus.OPEN,
        entityType: NotificationEntityType.VEHICLE,
        eventType: 'VEHICLE_READINESS_UNEVALUABLE',
        entityId: VEH_A,
        lifecycleGeneration: 1,
        version: 1,
        lastSeenAt: new Date(),
      } as any);
      activeByFingerprint.set(`${ORG_A}:${targetFingerprint}`, 'ntf-target');
      notifications.set('ntf-target', pagedRows[500]);

      (repository.listNotifications as jest.Mock).mockImplementation(
        async (filter: { offset?: number; limit?: number; eventTypes?: string[] }) => {
          if (!filter.eventTypes?.includes('VEHICLE_READINESS_UNEVALUABLE')) {
            return [];
          }
          const offset = filter.offset ?? 0;
          const limit = filter.limit ?? pagedRows.length;
          return pagedRows.slice(offset, offset + limit);
        },
      );

      await syncEvaluability(projectVehicleReadinessEvaluability(VEH_A, LABEL_A, health()), 'page-run');

      expect((repository.listNotifications as jest.Mock).mock.calls.length).toBeGreaterThanOrEqual(2);
      expect(notifications.get('ntf-target')?.status).toBe(NotificationStatus.RESOLVED);
    });
  });

  describe('registry regression', () => {
    it('adds exactly +2 FLEET_READINESS events since P2.3 baseline (71 / 28 / 43)', () => {
      expect(NOTIFICATION_EVENT_REGISTRY.length).toBe(71);
      expect(getNotificationDefinitionsByAttentionScope('FLEET_READINESS').length).toBe(28);
      expect(getNotificationDefinitionsByAttentionScope('OPERATIONS').length).toBe(43);
    });

    it('golden fingerprint for VEHICLE_READINESS_UNEVALUABLE', () => {
      const fp = vehicleReadinessEvaluabilitySourceFingerprint(ORG_A, { vehicleId: VEH_A });
      expect(fp).toBe(
        `org-a|VEHICLE_READINESS_UNEVALUABLE|VEHICLE|veh-a|vehicle_readiness_unevaluable|v1`,
      );
    });
  });
});
