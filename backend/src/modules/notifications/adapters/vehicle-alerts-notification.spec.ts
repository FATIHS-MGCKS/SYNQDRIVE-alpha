import { NotificationEntityType, NotificationSeverity, NotificationStatus } from '@prisma/client';
import type { DashboardWarningLight } from '@modules/vehicle-intelligence/dashboard-warning-lights/dashboard-warning-lights.types';
import { buildVehicleAlertsTestEnvelope } from '@modules/vehicle-intelligence/dashboard-warning-lights/vehicle-alerts-rental-health.projector';
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
  projectVehicleAlertNotifications,
  vehicleAlertsSourceFingerprint,
} from './vehicle-alerts-notification.projector';
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
const TS = '2026-06-16T12:00:00.000Z';

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

function oilHighActive(): DashboardWarningLight {
  return {
    key: 'engine_oil_level',
    label: 'Motorölstand',
    state: 'active',
    severity: 'warning',
    supported: true,
    observedAt: TS,
    sourceSignal: 'diagnostics.get.engine_oil_level',
    sourceTimestamp: TS,
    reason: 'Motoröl über Maximum',
    action: 'Öl prüfen',
    rentalImpact: 'inspect_before_next_rental',
    isCurrentActive: true,
    freshness: 'fresh',
  };
}

function quietLimp(): DashboardWarningLight {
  return {
    ...limpActive(),
    state: 'off_confirmed',
    severity: 'info',
    rentalImpact: 'none',
    isCurrentActive: false,
    reason: 'Notlauf aus',
  };
}

function quietOil(): DashboardWarningLight {
  return {
    ...oilLowActive(),
    state: 'off_confirmed',
    severity: 'info',
    rentalImpact: 'none',
    isCurrentActive: false,
    reason: 'Ölstand OK',
  };
}

function sourcesFromEnvelope(lights: DashboardWarningLight[], overrides = {}) {
  return projectVehicleAlertNotifications(
    VEH_A,
    LABEL_A,
    buildVehicleAlertsTestEnvelope(lights, overrides),
  );
}

describe('VehicleAlertsNotificationAdapter + lifecycle (P2.2B)', () => {
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

  async function sync(sources: ReturnType<typeof projectVehicleAlertNotifications>, runId: string) {
    await ingest.syncVehicleAlertsWarnings(ORG_A, runId, sources);
  }

  describe('LIMP_MODE_ACTIVE lifecycle', () => {
    it('OPEN → idempotent → RESOLVE → REOPEN', async () => {
      const active = sourcesFromEnvelope([limpActive(), quietOil()]);
      await sync(active, 'run-2');
      expect(openNotifications()).toHaveLength(1);
      const first = openNotifications()[0];
      expect(first.eventType).toBe('LIMP_MODE_ACTIVE');
      expect(first.severity).toBe(NotificationSeverity.CRITICAL);

      await sync(active, 'run-3');
      expect(openNotifications()[0].id).toBe(first.id);

      const cleared = sourcesFromEnvelope([quietLimp(), quietOil()]);
      await sync(cleared, 'run-4');
      expect(notifications.get(first.id)?.status).toBe(NotificationStatus.RESOLVED);

      const resolvedRow = notifications.get(first.id);
      if (resolvedRow) {
        resolvedRow.resolvedAt = new Date(Date.now() - 20 * 60_000);
        notifications.set(first.id, resolvedRow);
      }

      await sync(active, 'run-5');
      expect(openNotifications()).toHaveLength(1);
      expect(openNotifications()[0].id).toBe(first.id);
    });
  });

  describe('healthy CLEARED no-op', () => {
    it('first evaluation on healthy vehicle creates no notifications', async () => {
      const healthy = sourcesFromEnvelope([quietLimp(), quietOil()]);
      await sync(healthy, 'run-healthy-1');
      expect(openNotifications()).toHaveLength(0);
      expect((repository.createNotification as jest.Mock).mock.calls).toHaveLength(0);
    });

    it('repeated healthy evaluation stays clean', async () => {
      const healthy = sourcesFromEnvelope([quietLimp(), quietOil()]);
      await sync(healthy, 'run-healthy-2a');
      await sync(healthy, 'run-healthy-2b');
      expect(openNotifications()).toHaveLength(0);
    });

    it('prior LIMP active + explicit OFF resolves only limp', async () => {
      await sync(sourcesFromEnvelope([limpActive(), quietOil()]), 'run-limp-on');
      const limp = openNotifications().find((n) => n.eventType === 'LIMP_MODE_ACTIVE');
      expect(limp).toBeDefined();

      await sync(sourcesFromEnvelope([quietLimp(), quietOil()]), 'run-limp-off');
      expect(notifications.get(limp!.id)?.status).toBe(NotificationStatus.RESOLVED);
    });
  });

  describe('ENGINE_OIL_LEVEL_LOW lifecycle', () => {
    it('OPEN → idempotent → RESOLVE → REOPEN', async () => {
      const active = sourcesFromEnvelope([quietLimp(), oilLowActive()]);
      await sync(active, 'run-low-1');
      const first = openNotifications().find((n) => n.eventType === 'ENGINE_OIL_LEVEL_LOW');
      expect(first).toBeDefined();

      await sync(active, 'run-low-2');
      expect(
        openNotifications().find((n) => n.eventType === 'ENGINE_OIL_LEVEL_LOW')?.id,
      ).toBe(first!.id);

      await sync(sourcesFromEnvelope([quietLimp(), quietOil()]), 'run-low-3');
      expect(notifications.get(first!.id)?.status).toBe(NotificationStatus.RESOLVED);

      const resolvedRow = notifications.get(first!.id);
      if (resolvedRow) {
        resolvedRow.resolvedAt = new Date(Date.now() - 20 * 60_000);
        notifications.set(first!.id, resolvedRow);
      }

      await sync(active, 'run-low-4');
      expect(openNotifications().find((n) => n.eventType === 'ENGINE_OIL_LEVEL_LOW')?.id).toBe(
        first!.id,
      );
    });
  });

  describe('ENGINE_OIL_LEVEL_HIGH lifecycle', () => {
    it('OPEN → idempotent → RESOLVE → REOPEN', async () => {
      const active = sourcesFromEnvelope([quietLimp(), oilHighActive()]);
      await sync(active, 'run-high-1');
      const first = openNotifications().find((n) => n.eventType === 'ENGINE_OIL_LEVEL_HIGH');
      expect(first).toBeDefined();

      await sync(active, 'run-high-2');
      expect(
        openNotifications().find((n) => n.eventType === 'ENGINE_OIL_LEVEL_HIGH')?.id,
      ).toBe(first!.id);

      await sync(sourcesFromEnvelope([quietLimp(), quietOil()]), 'run-high-3');
      expect(notifications.get(first!.id)?.status).toBe(NotificationStatus.RESOLVED);

      const resolvedRow = notifications.get(first!.id);
      if (resolvedRow) {
        resolvedRow.resolvedAt = new Date(Date.now() - 20 * 60_000);
        notifications.set(first!.id, resolvedRow);
      }

      await sync(active, 'run-high-4');
      expect(openNotifications().find((n) => n.eventType === 'ENGINE_OIL_LEVEL_HIGH')?.id).toBe(
        first!.id,
      );
    });
  });

  describe('preservation on UNEVALUABLE', () => {
    it('active limp → provider_error preserves OPEN notification', async () => {
      await sync(sourcesFromEnvelope([limpActive(), quietOil()]), 'run-1');
      const first = openNotifications()[0];

      await sync([], 'run-2');
      expect(notifications.get(first.id)?.status).toBe(NotificationStatus.OPEN);
    });

    it('active limp → stale preserves OPEN notification', async () => {
      await sync(sourcesFromEnvelope([limpActive(), quietOil()]), 'run-1');
      const first = openNotifications()[0];

      await sync(
        sourcesFromEnvelope([
          { ...limpActive(), state: 'stale', isCurrentActive: false, freshness: 'stale' },
          quietOil(),
        ]),
        'run-2',
      );
      expect(notifications.get(first.id)?.status).toBe(NotificationStatus.OPEN);
    });

    it('oil LOW active → empty sync (unevaluable) preserves OPEN', async () => {
      await sync(sourcesFromEnvelope([quietLimp(), oilLowActive()]), 'run-1');
      const low = openNotifications().find((n) => n.eventType === 'ENGINE_OIL_LEVEL_LOW');
      expect(low).toBeDefined();

      await sync([], 'run-2');
      expect(notifications.get(low!.id)?.status).toBe(NotificationStatus.OPEN);
    });

    it('oil LOW active → provider_error preserves OPEN (projected unevaluable)', async () => {
      await sync(sourcesFromEnvelope([quietLimp(), oilLowActive()]), 'run-1');
      const low = openNotifications().find((n) => n.eventType === 'ENGINE_OIL_LEVEL_LOW');
      const unevaluable = projectVehicleAlertNotifications(
        VEH_A,
        LABEL_A,
        buildVehicleAlertsTestEnvelope([quietLimp(), oilLowActive()], {
          connectionStatus: 'provider_error',
          freshness: 'error',
        }),
      );
      expect(unevaluable).toHaveLength(0);
      await sync(unevaluable, 'run-2');
      expect(notifications.get(low!.id)?.status).toBe(NotificationStatus.OPEN);
    });

    it('oil LOW active → stale preserves OPEN (projected unevaluable)', async () => {
      await sync(sourcesFromEnvelope([quietLimp(), oilLowActive()]), 'run-1');
      const low = openNotifications().find((n) => n.eventType === 'ENGINE_OIL_LEVEL_LOW');
      const unevaluable = projectVehicleAlertNotifications(
        VEH_A,
        LABEL_A,
        buildVehicleAlertsTestEnvelope([
          { ...limpActive(), state: 'stale', isCurrentActive: false, freshness: 'stale' },
          { ...oilLowActive(), state: 'stale', isCurrentActive: false, freshness: 'stale' },
        ]),
      );
      expect(unevaluable).toHaveLength(0);
      await sync(unevaluable, 'run-2');
      expect(notifications.get(low!.id)?.status).toBe(NotificationStatus.OPEN);
    });

    it('oil HIGH active → provider_error preserves OPEN (projected unevaluable)', async () => {
      await sync(sourcesFromEnvelope([quietLimp(), oilHighActive()]), 'run-1');
      const high = openNotifications().find((n) => n.eventType === 'ENGINE_OIL_LEVEL_HIGH');
      await sync(
        projectVehicleAlertNotifications(
          VEH_A,
          LABEL_A,
          buildVehicleAlertsTestEnvelope([quietLimp(), oilHighActive()], {
            connectionStatus: 'provider_error',
            freshness: 'error',
          }),
        ),
        'run-2',
      );
      expect(notifications.get(high!.id)?.status).toBe(NotificationStatus.OPEN);
    });

    it('oil HIGH active → stale preserves OPEN (projected unevaluable)', async () => {
      await sync(sourcesFromEnvelope([quietLimp(), oilHighActive()]), 'run-1');
      const high = openNotifications().find((n) => n.eventType === 'ENGINE_OIL_LEVEL_HIGH');
      await sync(
        projectVehicleAlertNotifications(
          VEH_A,
          LABEL_A,
          buildVehicleAlertsTestEnvelope([
            quietLimp(),
            { ...oilHighActive(), state: 'stale', isCurrentActive: false, freshness: 'stale' },
          ]),
        ),
        'run-2',
      );
      expect(notifications.get(high!.id)?.status).toBe(NotificationStatus.OPEN);
    });

    it('not_connected does not resolve existing limp cause', async () => {
      await sync(sourcesFromEnvelope([limpActive(), quietOil()]), 'run-1');
      const limp = openNotifications()[0];
      await sync(
        projectVehicleAlertNotifications(
          VEH_A,
          LABEL_A,
          buildVehicleAlertsTestEnvelope([limpActive(), quietOil()], {
            connectionStatus: 'not_connected',
            supportStatus: 'not_connected',
          }),
        ),
        'run-2',
      );
      expect(notifications.get(limp.id)?.status).toBe(NotificationStatus.OPEN);
    });
  });

  describe('LOW ↔ HIGH transitions', () => {
    it('LOW → HIGH resolves LOW and opens HIGH with distinct fingerprints', async () => {
      await sync(sourcesFromEnvelope([quietLimp(), oilLowActive()]), 'run-1');
      const lowFp = vehicleAlertsSourceFingerprint(ORG_A, {
        eventType: 'ENGINE_OIL_LEVEL_LOW',
        vehicleId: VEH_A,
      });
      const lowRow = openNotifications().find((n) => n.fingerprint === lowFp);
      expect(lowRow).toBeDefined();

      await sync(sourcesFromEnvelope([quietLimp(), oilHighActive()]), 'run-2');
      expect(notifications.get(lowRow!.id)?.status).toBe(NotificationStatus.RESOLVED);

      const highFp = vehicleAlertsSourceFingerprint(ORG_A, {
        eventType: 'ENGINE_OIL_LEVEL_HIGH',
        vehicleId: VEH_A,
      });
      const highRow = openNotifications().find((n) => n.fingerprint === highFp);
      expect(highRow).toBeDefined();
      expect(highRow!.id).not.toBe(lowRow!.id);
    });

    it('HIGH → LOW resolves HIGH and opens LOW', async () => {
      await sync(sourcesFromEnvelope([quietLimp(), oilHighActive()]), 'run-1');
      const highFp = vehicleAlertsSourceFingerprint(ORG_A, {
        eventType: 'ENGINE_OIL_LEVEL_HIGH',
        vehicleId: VEH_A,
      });
      const highRow = openNotifications().find((n) => n.fingerprint === highFp);

      await sync(sourcesFromEnvelope([quietLimp(), oilLowActive()]), 'run-2');
      expect(notifications.get(highRow!.id)?.status).toBe(NotificationStatus.RESOLVED);
      expect(
        openNotifications().some((n) => n.eventType === 'ENGINE_OIL_LEVEL_LOW'),
      ).toBe(true);
    });
  });

  describe('multi-cause', () => {
    it('limp + oil LOW produce two OPEN notifications', async () => {
      await sync(sourcesFromEnvelope([limpActive(), oilLowActive()]), 'run-1');
      const open = openNotifications();
      expect(open).toHaveLength(2);
      expect(open.map((n) => n.eventType).sort()).toEqual([
        'ENGINE_OIL_LEVEL_LOW',
        'LIMP_MODE_ACTIVE',
      ]);
    });

    it('limp + oil HIGH produce two OPEN notifications', async () => {
      await sync(sourcesFromEnvelope([limpActive(), oilHighActive()]), 'run-1');
      const open = openNotifications();
      expect(open).toHaveLength(2);
      expect(open.map((n) => n.eventType).sort()).toEqual([
        'ENGINE_OIL_LEVEL_HIGH',
        'LIMP_MODE_ACTIVE',
      ]);
    });
  });

  describe('tenant isolation', () => {
    it('org A resolve does not affect org B', async () => {
      const sourcesA = projectVehicleAlertNotifications(
        VEH_A,
        LABEL_A,
        buildVehicleAlertsTestEnvelope([limpActive(), quietOil()]),
      );
      const sourcesB = projectVehicleAlertNotifications(
        VEH_B,
        LABEL_B,
        buildVehicleAlertsTestEnvelope([limpActive(), quietOil()]),
      );
      await ingest.syncVehicleAlertsWarnings(ORG_A, 'run-1', sourcesA);
      await ingest.syncVehicleAlertsWarnings(ORG_B, 'run-1', sourcesB);

      const clearedA = projectVehicleAlertNotifications(
        VEH_A,
        LABEL_A,
        buildVehicleAlertsTestEnvelope([quietLimp(), quietOil()]),
      );
      await ingest.syncVehicleAlertsWarnings(ORG_A, 'run-2', clearedA);

      const openB = [...notifications.values()].filter(
        (n) => n.organizationId === ORG_B && n.status === NotificationStatus.OPEN,
      );
      expect(openB).toHaveLength(1);
      expect(openB[0].entityId).toBe(VEH_B);
    });

    it('same org: vehicle A resolve does not affect vehicle B limp', async () => {
      await sync(
        projectVehicleAlertNotifications(
          VEH_A,
          LABEL_A,
          buildVehicleAlertsTestEnvelope([limpActive(), quietOil()]),
        ),
        'run-1',
      );
      await sync(
        projectVehicleAlertNotifications(
          VEH_B,
          LABEL_B,
          buildVehicleAlertsTestEnvelope([limpActive(), quietOil()]),
        ),
        'run-1',
      );

      await sync(
        projectVehicleAlertNotifications(
          VEH_A,
          LABEL_A,
          buildVehicleAlertsTestEnvelope([quietLimp(), quietOil()]),
        ),
        'run-2',
      );

      const openB = [...notifications.values()].filter(
        (n) =>
          n.organizationId === ORG_A &&
          n.entityId === VEH_B &&
          n.status === NotificationStatus.OPEN,
      );
      expect(openB).toHaveLength(1);
      expect(openB[0].eventType).toBe('LIMP_MODE_ACTIVE');
    });
  });

  describe('active fingerprint pagination', () => {
    it('considers all paginated active fingerprints before CLEARED ingest', async () => {
      const targetFingerprint = vehicleAlertsSourceFingerprint(ORG_A, {
        eventType: 'LIMP_MODE_ACTIVE',
        vehicleId: VEH_A,
      });

      const pagedRows = Array.from({ length: 500 }, (_, index) => ({
        id: `ntf-page-${index}`,
        organizationId: ORG_A,
        fingerprint: `org-a|OTHER|VEHICLE|veh-x-${index}|other|v1`,
        status: NotificationStatus.OPEN,
        entityType: NotificationEntityType.VEHICLE,
        eventType: 'ENGINE_OIL_LEVEL_LOW',
        entityId: `veh-x-${index}`,
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
        eventType: 'LIMP_MODE_ACTIVE',
        entityId: VEH_A,
        lifecycleGeneration: 1,
        version: 1,
        lastSeenAt: new Date(),
      } as any);
      activeByFingerprint.set(`${ORG_A}:${targetFingerprint}`, 'ntf-target');
      notifications.set('ntf-target', pagedRows[500]);

      (repository.listNotifications as jest.Mock).mockImplementation(
        async (filter: { offset?: number; limit?: number }) => {
          const offset = filter.offset ?? 0;
          const limit = filter.limit ?? pagedRows.length;
          return pagedRows.slice(offset, offset + limit);
        },
      );

      await sync(sourcesFromEnvelope([quietLimp(), quietOil()]), 'run-page');

      expect((repository.listNotifications as jest.Mock).mock.calls.length).toBeGreaterThanOrEqual(
        2,
      );
      expect(notifications.get('ntf-target')?.status).toBe(NotificationStatus.RESOLVED);
    });
  });

  describe('registry regression', () => {
    it('adds exactly +3 FLEET_READINESS events (69 / 26 / 43)', () => {
      expect(NOTIFICATION_EVENT_REGISTRY.length).toBe(69);
      expect(getNotificationDefinitionsByAttentionScope('FLEET_READINESS').length).toBe(26);
      expect(getNotificationDefinitionsByAttentionScope('OPERATIONS').length).toBe(43);
    });

    it('golden fingerprints for vehicle alert events', () => {
      for (const [eventType, code] of [
        ['LIMP_MODE_ACTIVE', 'limp_mode_active'],
        ['ENGINE_OIL_LEVEL_LOW', 'engine_oil_level_low'],
        ['ENGINE_OIL_LEVEL_HIGH', 'engine_oil_level_high'],
      ] as const) {
        const canonical = buildRegistryFingerprint('org-golden', eventType, 'veh-golden-1').canonical;
        expect(canonical).toBe(
          `org-golden|${eventType}|VEHICLE|veh-golden-1|${code}|v1`,
        );
        expect(canonical).not.toContain('FLEET_READINESS');
      }
    });
  });
});
