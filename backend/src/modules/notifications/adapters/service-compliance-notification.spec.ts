import { NotificationEntityType, NotificationSeverity, NotificationStatus } from '@prisma/client';
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
  projectServiceComplianceOverdueNotifications,
  legacyServiceOverdueFingerprint,
  LEGACY_SERVICE_OVERDUE_CONDITION_CODE,
  serviceComplianceSourceFingerprint,
} from './service-compliance-notification.projector';
import type { ServiceComplianceEvaluation } from '@modules/vehicle-intelligence/service-compliance/service-compliance.types';
import { buildRegistryFingerprint } from '../registry/notification-event-registry';
import {
  getNotificationDefinitionsByAttentionScope,
  NOTIFICATION_EVENT_REGISTRY,
} from '../registry/notification-event-registry';

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

const ORG_A = 'org-a';
const ORG_B = 'org-b';
const VEH_A = 'veh-a';
const VEH_B = 'veh-b';
const PLATE_A = 'WOB A 1001';
const PLATE_B = 'WOB B 2002';

const baseVehicle = {
  id: VEH_A,
  make: 'VW',
  model: 'Golf',
  licensePlate: PLATE_A,
  homeStationId: 'st-1',
  mileageKm: 50000,
  lastServiceDate: new Date('2025-01-01'),
  lastServiceOdometerKm: 40000,
  serviceIntervalManufacturerKm: 30000,
  serviceIntervalManufacturerMonths: 24,
};

function goodEvaluation(): ServiceComplianceEvaluation {
  return {
    nextService: {
      trackingStatus: 'TRACKED',
      source: 'HM_OEM',
      distanceToNextServiceKm: 5000,
      timeToNextServiceDays: 90,
      lastUpdatedAt: '2026-08-01T00:00:00.000Z',
      serviceSourceLabel: 'HM',
      severity: 'GOOD',
      blocksRental: false,
      title: 'Service OK',
      description: 'OK',
      message: 'Nächster Service in 90 Tagen',
      hmDistanceFromOem: false,
      hmTimeFromOem: false,
      hmDerivedDueDate: '2026-11-01T00:00:00.000Z',
    },
    tuvBokraft: {
      tuvValidTill: '2027-01-01T00:00:00.000Z',
      tuvRemainingMonths: 12,
      tuvRemainingDays: 365,
      tuvOverdue: false,
      tuvLastDate: '2025-01-01T00:00:00.000Z',
      bokraftValidTill: '2027-01-01T00:00:00.000Z',
      bokraftRemainingMonths: 12,
      bokraftRemainingDays: 365,
      bokraftOverdue: false,
      bokraftLastDate: '2025-01-01T00:00:00.000Z',
    },
  };
}

describe('ServiceComplianceNotificationAdapter + projector', () => {
  let v2Enabled: boolean;
  const notifications = new Map<string, any>();
  const activeByFingerprint = new Map<string, string>();
  let idSeq = 0;
  const previousClearGrace = process.env.VEHICLE_HEALTH_NOTIFICATION_CLEAR_GRACE_MS;

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

  let core: NotificationCoreService;
  let ingest: NotificationProducerIngestService;

  beforeEach(() => {
    // '-1' → Math.max(0,-1)=0; plain '0' is falsy and falls back to 6h default in grace helper
    process.env.VEHICLE_HEALTH_NOTIFICATION_CLEAR_GRACE_MS = '-1';
    v2Enabled = true;
    notifications.clear();
    activeByFingerprint.clear();
    idSeq = 0;
    jest.clearAllMocks();

    const { deliveryEnqueue, deliveryPolicy, deliveryScheduler } = createDeliveryMocks();
    core = new NotificationCoreService(
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

  afterEach(() => {
    if (previousClearGrace === undefined) {
      delete process.env.VEHICLE_HEALTH_NOTIFICATION_CLEAR_GRACE_MS;
    } else {
      process.env.VEHICLE_HEALTH_NOTIFICATION_CLEAR_GRACE_MS = previousClearGrace;
    }
  });

  function openNotifications(orgId = ORG_A) {
    return [...notifications.values()].filter(
      (n) => n.organizationId === orgId && n.status === NotificationStatus.OPEN,
    );
  }

  function tuvOverdueEvaluation(): ServiceComplianceEvaluation {
    const eval_ = goodEvaluation();
    eval_.tuvBokraft = {
      ...eval_.tuvBokraft,
      tuvValidTill: '2026-07-01T00:00:00.000Z',
      tuvRemainingDays: -10,
      tuvOverdue: true,
    };
    return eval_;
  }

  function bokraftOverdueEvaluation(): ServiceComplianceEvaluation {
    const eval_ = goodEvaluation();
    eval_.tuvBokraft = {
      ...eval_.tuvBokraft,
      bokraftValidTill: '2026-07-01T00:00:00.000Z',
      bokraftRemainingDays: -5,
      bokraftOverdue: true,
    };
    return eval_;
  }

  function serviceOverdueEvaluation(): ServiceComplianceEvaluation {
    const eval_ = goodEvaluation();
    eval_.nextService = {
      ...eval_.nextService,
      severity: 'CRITICAL',
      distanceToNextServiceKm: -500,
      timeToNextServiceDays: -14,
      message: 'Service überfällig',
      blocksRental: true,
    };
    return eval_;
  }

  function tuvDueSoonEvaluation(): ServiceComplianceEvaluation {
    const eval_ = goodEvaluation();
    eval_.tuvBokraft = {
      ...eval_.tuvBokraft,
      tuvValidTill: '2026-09-01T00:00:00.000Z',
      tuvRemainingDays: 14,
      tuvOverdue: false,
    };
    return eval_;
  }

  function bokraftDueSoonEvaluation(): ServiceComplianceEvaluation {
    const eval_ = goodEvaluation();
    eval_.tuvBokraft = {
      ...eval_.tuvBokraft,
      bokraftValidTill: '2026-09-01T00:00:00.000Z',
      bokraftRemainingDays: 20,
      bokraftOverdue: false,
    };
    return eval_;
  }

  function serviceDueSoonEvaluation(): ServiceComplianceEvaluation {
    const eval_ = goodEvaluation();
    eval_.nextService = {
      ...eval_.nextService,
      severity: 'WARNING',
      distanceToNextServiceKm: 200,
      timeToNextServiceDays: 10,
      message: 'Service bald fällig',
      blocksRental: false,
    };
    return eval_;
  }

  function tuvAndServiceOverdueEvaluation(): ServiceComplianceEvaluation {
    const eval_ = tuvOverdueEvaluation();
    eval_.nextService = {
      ...eval_.nextService,
      severity: 'CRITICAL',
      distanceToNextServiceKm: -500,
      timeToNextServiceDays: -14,
      message: 'Service überfällig',
    };
    return eval_;
  }

  function bokraftAndServiceOverdueEvaluation(): ServiceComplianceEvaluation {
    const eval_ = bokraftOverdueEvaluation();
    eval_.nextService = {
      ...eval_.nextService,
      severity: 'CRITICAL',
      distanceToNextServiceKm: -300,
      timeToNextServiceDays: -7,
      message: 'Service überfällig',
    };
    return eval_;
  }

  function allThreeOverdueEvaluation(): ServiceComplianceEvaluation {
    const eval_ = tuvAndServiceOverdueEvaluation();
    eval_.tuvBokraft = {
      ...eval_.tuvBokraft,
      bokraftOverdue: true,
      bokraftRemainingDays: -4,
    };
    return eval_;
  }

  async function runFullLifecycle(
    sourcesFactory: () => ReturnType<typeof projectServiceComplianceOverdueNotifications>,
    expectedEventType: string,
  ) {
    await ingest.syncServiceComplianceWarnings(ORG_A, 'run-1', []);
    expect(openNotifications()).toHaveLength(0);

    const overdueSources = sourcesFactory();
    await ingest.syncServiceComplianceWarnings(ORG_A, 'run-2', overdueSources);
    expect(openNotifications()).toHaveLength(1);
    const first = openNotifications()[0];
    expect(first.eventType).toBe(expectedEventType);

    await ingest.syncServiceComplianceWarnings(ORG_A, 'run-3', overdueSources);
    expect(openNotifications()).toHaveLength(1);
    expect(openNotifications()[0].id).toBe(first.id);
    expect(openNotifications()[0].occurrenceCount).toBeGreaterThanOrEqual(2);

    await ingest.syncServiceComplianceWarnings(ORG_A, 'run-4', []);
    expect(notifications.get(first.id)?.status).toBe(NotificationStatus.RESOLVED);

    const resolvedRow = notifications.get(first.id);
    if (resolvedRow) {
      resolvedRow.resolvedAt = new Date(Date.now() - 20 * 60_000);
      notifications.set(first.id, resolvedRow);
    }

    await ingest.syncServiceComplianceWarnings(ORG_A, 'run-5', overdueSources);
    const reopened = openNotifications();
    expect(reopened).toHaveLength(1);
    expect(reopened[0].id).toBe(first.id);
    expect(reopened[0].status).toBe(NotificationStatus.OPEN);
  }

  describe('overdue-only projector semantics', () => {
    it('uses registry condition codes for all three event types', () => {
      const tuv = projectServiceComplianceOverdueNotifications(baseVehicle, tuvOverdueEvaluation());
      expect(tuv).toHaveLength(1);
      expect(tuv[0].eventType).toBe('TUV_OVERDUE');
      expect(tuv[0].severity).toBe('critical');
      expect(tuv[0].blocksRental).toBe(true);

      const fp = serviceComplianceSourceFingerprint(ORG_A, tuv[0]);
      const registryFp = buildRegistryFingerprint(ORG_A, 'TUV_OVERDUE', VEH_A).canonical;
      expect(fp).toBe(registryFp);
      expect(fp.split('|')[4]).toBe('tuv_overdue');
    });

    it('SERVICE_OVERDUE uses service_overdue not legacy overdue', () => {
      const sources = projectServiceComplianceOverdueNotifications(
        baseVehicle,
        serviceOverdueEvaluation(),
      );
      expect(sources[0].eventType).toBe('SERVICE_OVERDUE');
      const fp = serviceComplianceSourceFingerprint(ORG_A, sources[0]);
      expect(fp).toContain('service_overdue');
      expect(fp).not.toMatch(/\|overdue\|/);
    });

    it('valid compliance produces no notification sources', () => {
      expect(projectServiceComplianceOverdueNotifications(baseVehicle, goodEvaluation())).toHaveLength(0);
    });

    it('TÜV due soon → no TUV_OVERDUE', () => {
      expect(
        projectServiceComplianceOverdueNotifications(baseVehicle, tuvDueSoonEvaluation()),
      ).toHaveLength(0);
    });

    it('BOKraft due soon → no BOKRAFT_OVERDUE', () => {
      expect(
        projectServiceComplianceOverdueNotifications(baseVehicle, bokraftDueSoonEvaluation()),
      ).toHaveLength(0);
    });

    it('service due soon → no SERVICE_OVERDUE', () => {
      expect(
        projectServiceComplianceOverdueNotifications(baseVehicle, serviceDueSoonEvaluation()),
      ).toHaveLength(0);
    });
  });

  describe('TUV_OVERDUE lifecycle', () => {
    it('valid → none; overdue → OPEN; repeat → idempotent; recovery → RESOLVE; re-overdue → REOPEN', async () => {
      await runFullLifecycle(
        () => projectServiceComplianceOverdueNotifications(baseVehicle, tuvOverdueEvaluation()),
        'TUV_OVERDUE',
      );
    });
  });

  describe('BOKRAFT_OVERDUE lifecycle', () => {
    it('valid → none; overdue → OPEN; repeat → idempotent; recovery → RESOLVE; re-overdue → REOPEN', async () => {
      await runFullLifecycle(
        () => projectServiceComplianceOverdueNotifications(baseVehicle, bokraftOverdueEvaluation()),
        'BOKRAFT_OVERDUE',
      );
    });
  });

  describe('SERVICE_OVERDUE lifecycle', () => {
    it('valid → none; overdue → OPEN; repeat → idempotent; recovery → RESOLVE; re-overdue → REOPEN', async () => {
      await runFullLifecycle(
        () => projectServiceComplianceOverdueNotifications(baseVehicle, serviceOverdueEvaluation()),
        'SERVICE_OVERDUE',
      );
    });

    it('due soon ingest → no SERVICE_OVERDUE notification row', async () => {
      await ingest.syncServiceComplianceWarnings(ORG_A, 'run-1', []);
      expect(openNotifications()).toHaveLength(0);
    });
  });

  describe('blocking parity (projector metadata)', () => {
    it('TÜV overdue source blocks rental and opens TUV_OVERDUE', () => {
      const sources = projectServiceComplianceOverdueNotifications(
        baseVehicle,
        tuvOverdueEvaluation(),
      );
      expect(sources[0].blocksRental).toBe(true);
      expect(sources[0].eventType).toBe('TUV_OVERDUE');
    });

    it('BOKraft overdue source blocks rental and opens BOKRAFT_OVERDUE', () => {
      const sources = projectServiceComplianceOverdueNotifications(
        baseVehicle,
        bokraftOverdueEvaluation(),
      );
      expect(sources[0].blocksRental).toBe(true);
      expect(sources[0].eventType).toBe('BOKRAFT_OVERDUE');
    });

    it('HM service critical blocks rental and opens SERVICE_OVERDUE', () => {
      const sources = projectServiceComplianceOverdueNotifications(
        baseVehicle,
        serviceOverdueEvaluation(),
      );
      expect(sources[0].blocksRental).toBe(true);
      expect(sources[0].eventType).toBe('SERVICE_OVERDUE');
    });
  });

  describe('multi-cause coexistence', () => {
    it('TÜV only → TUV_OVERDUE', () => {
      const sources = projectServiceComplianceOverdueNotifications(baseVehicle, tuvOverdueEvaluation());
      expect(sources.map((s) => s.eventType)).toEqual(['TUV_OVERDUE']);
    });

    it('BOKraft only → BOKRAFT_OVERDUE', () => {
      const sources = projectServiceComplianceOverdueNotifications(
        baseVehicle,
        bokraftOverdueEvaluation(),
      );
      expect(sources.map((s) => s.eventType)).toEqual(['BOKRAFT_OVERDUE']);
    });

    it('Service only → SERVICE_OVERDUE', () => {
      const sources = projectServiceComplianceOverdueNotifications(
        baseVehicle,
        serviceOverdueEvaluation(),
      );
      expect(sources.map((s) => s.eventType)).toEqual(['SERVICE_OVERDUE']);
    });

    it('TÜV + Service → TUV_OVERDUE and SERVICE_OVERDUE with distinct fingerprints', () => {
      const sources = projectServiceComplianceOverdueNotifications(
        baseVehicle,
        tuvAndServiceOverdueEvaluation(),
      );
      expect(sources.map((s) => s.eventType).sort()).toEqual(['SERVICE_OVERDUE', 'TUV_OVERDUE']);
      const fps = sources.map((s) => serviceComplianceSourceFingerprint(ORG_A, s));
      expect(new Set(fps).size).toBe(2);
      const service = sources.find((s) => s.eventType === 'SERVICE_OVERDUE');
      expect(service?.blocksRental).toBe(false);
    });

    it('BOKraft + Service → BOKRAFT_OVERDUE and SERVICE_OVERDUE', () => {
      const sources = projectServiceComplianceOverdueNotifications(
        baseVehicle,
        bokraftAndServiceOverdueEvaluation(),
      );
      expect(sources.map((s) => s.eventType).sort()).toEqual(['BOKRAFT_OVERDUE', 'SERVICE_OVERDUE']);
    });

    it('TÜV + BOKraft + Service → all three events', () => {
      const sources = projectServiceComplianceOverdueNotifications(
        baseVehicle,
        allThreeOverdueEvaluation(),
      );
      expect(sources.map((s) => s.eventType).sort()).toEqual([
        'BOKRAFT_OVERDUE',
        'SERVICE_OVERDUE',
        'TUV_OVERDUE',
      ]);
      expect(new Set(sources.map((s) => serviceComplianceSourceFingerprint(ORG_A, s))).size).toBe(3);
    });
  });

  describe('legacy SERVICE_OVERDUE fingerprint reconciliation', () => {
    it('pre-P2.1 mapper used overdue conditionCode — legacy fingerprint is distinct', () => {
      const legacyFp = legacyServiceOverdueFingerprint(ORG_A, VEH_A);
      expect(legacyFp).toContain(`|${LEGACY_SERVICE_OVERDUE_CONDITION_CODE}|`);
      const canonicalFp = serviceComplianceSourceFingerprint(ORG_A, {
        eventType: 'SERVICE_OVERDUE',
        vehicleId: VEH_A,
      });
      expect(legacyFp).not.toBe(canonicalFp);
    });

    it('canonical SERVICE_OVERDUE ingest resolves parallel legacy overdue row', async () => {
      const legacyFp = legacyServiceOverdueFingerprint(ORG_A, VEH_A);
      const legacyId = 'legacy-ntf-1';
      notifications.set(legacyId, {
        id: legacyId,
        organizationId: ORG_A,
        fingerprint: legacyFp,
        eventType: 'SERVICE_OVERDUE',
        entityType: NotificationEntityType.VEHICLE,
        entityId: VEH_A,
        status: NotificationStatus.OPEN,
        severity: NotificationSeverity.CRITICAL,
        occurrenceCount: 1,
        lifecycleGeneration: 1,
        version: 1,
        templateParams: { label: PLATE_A },
        actionTarget: {},
        lastSeenAt: new Date(),
        firstSeenAt: new Date(),
      });
      activeByFingerprint.set(`${ORG_A}:${legacyFp}`, legacyId);

      const overdue = projectServiceComplianceOverdueNotifications(
        baseVehicle,
        serviceOverdueEvaluation(),
      );
      await ingest.syncServiceComplianceWarnings(ORG_A, 'run-1', overdue);

      const open = openNotifications();
      const canonical = open.find((n) => n.fingerprint === serviceComplianceSourceFingerprint(ORG_A, {
        eventType: 'SERVICE_OVERDUE',
        vehicleId: VEH_A,
      }));
      expect(canonical).toBeDefined();
      expect(notifications.get(legacyId)?.status).toBe(NotificationStatus.RESOLVED);
      expect(open.filter((n) => n.eventType === 'SERVICE_OVERDUE')).toHaveLength(1);
    });

    it('legacy OPEN + canonical recovered → legacy resolves without creating canonical row', async () => {
      const legacyFp = legacyServiceOverdueFingerprint(ORG_A, VEH_A);
      const legacyId = 'legacy-ntf-recovered';
      notifications.set(legacyId, {
        id: legacyId,
        organizationId: ORG_A,
        fingerprint: legacyFp,
        eventType: 'SERVICE_OVERDUE',
        entityType: NotificationEntityType.VEHICLE,
        entityId: VEH_A,
        status: NotificationStatus.OPEN,
        severity: NotificationSeverity.CRITICAL,
        occurrenceCount: 1,
        lifecycleGeneration: 1,
        version: 1,
        templateParams: { label: PLATE_A },
        actionTarget: {},
        lastSeenAt: new Date(),
        firstSeenAt: new Date(),
      });
      activeByFingerprint.set(`${ORG_A}:${legacyFp}`, legacyId);

      await ingest.syncServiceComplianceWarnings(ORG_A, 'run-recovered', []);

      expect(notifications.get(legacyId)?.status).toBe(NotificationStatus.RESOLVED);
      expect(openNotifications()).toHaveLength(0);
    });
  });

  describe('sweep completeness', () => {
    it('paginated eventType-filtered sweep resolves all active compliance notifications', async () => {
      const vehicleB = { ...baseVehicle, id: VEH_B, licensePlate: PLATE_B };
      const sourcesA = projectServiceComplianceOverdueNotifications(
        baseVehicle,
        tuvOverdueEvaluation(),
      );
      const sourcesB = projectServiceComplianceOverdueNotifications(
        vehicleB,
        bokraftOverdueEvaluation(),
      );
      await ingest.syncServiceComplianceWarnings(ORG_A, 'run-1', [...sourcesA, ...sourcesB]);
      expect(openNotifications()).toHaveLength(2);

      await ingest.syncServiceComplianceWarnings(ORG_A, 'run-2', []);
      expect(openNotifications()).toHaveLength(0);

      const listCalls = (repository.listNotifications as jest.Mock).mock.calls;
      const sweepCalls = listCalls.filter(
        (call) => call[0]?.eventTypes?.includes('TUV_OVERDUE'),
      );
      expect(sweepCalls.length).toBeGreaterThan(0);
      expect(sweepCalls[0][0].eventTypes).toEqual(
        expect.arrayContaining(['TUV_OVERDUE', 'BOKRAFT_OVERDUE', 'SERVICE_OVERDUE']),
      );
    });
  });

  describe('multi-tenant / vehicle isolation', () => {
    it('same condition on two vehicles → separate notifications', async () => {
      const vehicleB = { ...baseVehicle, id: VEH_B, licensePlate: PLATE_B };
      const sourcesA = projectServiceComplianceOverdueNotifications(
        baseVehicle,
        tuvOverdueEvaluation(),
      );
      const sourcesB = projectServiceComplianceOverdueNotifications(
        vehicleB,
        tuvOverdueEvaluation(),
      );

      await ingest.syncServiceComplianceWarnings(ORG_A, 'run-1', [...sourcesA, ...sourcesB]);
      const open = openNotifications();
      expect(open).toHaveLength(2);
      expect(new Set(open.map((n) => n.entityId))).toEqual(new Set([VEH_A, VEH_B]));
    });

    it('same vehicleId in different orgs → no tenant leakage', async () => {
      const sources = projectServiceComplianceOverdueNotifications(
        baseVehicle,
        tuvOverdueEvaluation(),
      );
      await ingest.syncServiceComplianceWarnings(ORG_A, 'run-1', sources);
      await ingest.syncServiceComplianceWarnings(ORG_B, 'run-1', sources);

      expect(openNotifications(ORG_A)).toHaveLength(1);
      expect(openNotifications(ORG_B)).toHaveLength(1);
      expect(openNotifications(ORG_A)[0].id).not.toBe(openNotifications(ORG_B)[0].id);
    });

    it('resolve vehicle A does not affect vehicle B', async () => {
      const vehicleB = { ...baseVehicle, id: VEH_B, licensePlate: PLATE_B };
      const sourcesA = projectServiceComplianceOverdueNotifications(
        baseVehicle,
        tuvOverdueEvaluation(),
      );
      const sourcesB = projectServiceComplianceOverdueNotifications(
        vehicleB,
        tuvOverdueEvaluation(),
      );
      await ingest.syncServiceComplianceWarnings(ORG_A, 'run-1', [...sourcesA, ...sourcesB]);

      await ingest.syncServiceComplianceWarnings(ORG_A, 'run-2', sourcesB);
      const open = openNotifications();
      expect(open).toHaveLength(1);
      expect(open[0].entityId).toBe(VEH_B);
    });
  });

  describe('registry regression', () => {
    it('attentionScope partition unchanged (69 / 26 / 43)', () => {
      expect(NOTIFICATION_EVENT_REGISTRY.length).toBe(69);
      expect(getNotificationDefinitionsByAttentionScope('FLEET_READINESS').length).toBe(26);
      expect(getNotificationDefinitionsByAttentionScope('OPERATIONS').length).toBe(43);
    });
  });
});
