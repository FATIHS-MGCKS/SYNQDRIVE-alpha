import { NotificationEntityType, NotificationSeverity, NotificationStatus } from '@prisma/client';
import { NotificationEngineConfig } from '../notification-engine.config';
import { NotificationCoreService } from '../notification-core.service';
import { NotificationRepository } from '../notification.repository';
import { NotificationDeliveryPolicyService } from '../delivery/notification-delivery-policy.service';
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
  projectVehicleDamageBlockingNotifications,
  vehicleDamageBlockingSourceFingerprint,
  VEHICLE_DAMAGE_BLOCKING_EVENT_TYPE,
} from './vehicle-damage-notification.projector';

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
    },
    deliveryPolicy: new NotificationDeliveryPolicyService(),
    deliveryScheduler: { scheduleOutboxIds: jest.fn().mockResolvedValue(undefined) },
  };
}

describe('VehicleDamageNotificationAdapter + lifecycle (P2.5)', () => {
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

  let ingest: NotificationProducerIngestService;

  beforeEach(() => {
    process.env.VEHICLE_HEALTH_NOTIFICATION_CLEAR_GRACE_MS = '-1';
    v2Enabled = true;
    notifications.clear();
    activeByFingerprint.clear();
    idSeq = 0;
    jest.clearAllMocks();

    const { deliveryEnqueue, deliveryPolicy, deliveryScheduler } = createDeliveryMocks();
    const core = new NotificationCoreService(
      repository,
      engineConfig,
      deliveryEnqueue as any,
      deliveryPolicy,
      deliveryScheduler as any,
    );
    const ingestObservability = { recordCandidate: jest.fn(), recordCandidateRejected: jest.fn() };
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

  function damageSources(
    vehicleId: string,
    label: string,
    damages: Array<{ id: string; rentalImpact: 'BLOCK_RENTAL' | 'SAFETY_CRITICAL'; description?: string | null }>,
  ) {
    return projectVehicleDamageBlockingNotifications(
      vehicleId,
      label,
      damages.map((d) => ({ ...d, description: d.description ?? null })),
    );
  }

  function querySuccessMap(vehicleIds: string[]): Map<string, boolean> {
    return new Map(vehicleIds.map((id) => [id, true]));
  }

  it('OPEN → repeat idempotent → RESOLVE → REOPEN lifecycle', async () => {
    const sources = damageSources(VEH_A, LABEL_A, [
      { id: 'dmg-1', rentalImpact: 'BLOCK_RENTAL', description: 'Bumper' },
    ]);
    await ingest.syncVehicleDamageBlockingWarnings(ORG_A, 'run-1', sources, querySuccessMap([VEH_A]));
    expect(openNotifications()).toHaveLength(1);
    const first = openNotifications()[0];
    expect(first.eventType).toBe(VEHICLE_DAMAGE_BLOCKING_EVENT_TYPE);
    expect(first.severity).toBe(NotificationSeverity.WARNING);

    await ingest.syncVehicleDamageBlockingWarnings(ORG_A, 'run-2', sources, querySuccessMap([VEH_A]));
    expect(openNotifications()[0].id).toBe(first.id);
    expect(openNotifications()[0].occurrenceCount).toBeGreaterThanOrEqual(2);

    await ingest.syncVehicleDamageBlockingWarnings(ORG_A, 'run-3', [], querySuccessMap([VEH_A]));
    expect(notifications.get(first.id)?.status).toBe(NotificationStatus.RESOLVED);

    const resolvedRow = notifications.get(first.id);
    if (resolvedRow) {
      resolvedRow.resolvedAt = new Date(Date.now() - 20 * 60_000);
      notifications.set(first.id, resolvedRow);
    }

    await ingest.syncVehicleDamageBlockingWarnings(ORG_A, 'run-4', sources, querySuccessMap([VEH_A]));
    expect(openNotifications()[0].id).toBe(first.id);
    expect(openNotifications()[0].status).toBe(NotificationStatus.OPEN);
  });

  it('BLOCK_RENTAL → warning, SAFETY_CRITICAL → critical', async () => {
    const sources = damageSources(VEH_A, LABEL_A, [
      { id: 'dmg-w', rentalImpact: 'BLOCK_RENTAL' },
      { id: 'dmg-c', rentalImpact: 'SAFETY_CRITICAL' },
    ]);
    await ingest.syncVehicleDamageBlockingWarnings(ORG_A, 'run-1', sources, querySuccessMap([VEH_A]));
    const open = openNotifications();
    expect(open).toHaveLength(2);
    const warning = open.find((n) => n.fingerprint.includes('dmg-w'));
    const critical = open.find((n) => n.fingerprint.includes('dmg-c'));
    expect(warning?.severity).toBe(NotificationSeverity.WARNING);
    expect(critical?.severity).toBe(NotificationSeverity.CRITICAL);
  });

  it('two blocking damages → separate cause lifecycles; A recovers, B stays open', async () => {
    const both = damageSources(VEH_A, LABEL_A, [
      { id: 'dmg-a', rentalImpact: 'BLOCK_RENTAL' },
      { id: 'dmg-b', rentalImpact: 'SAFETY_CRITICAL' },
    ]);
    await ingest.syncVehicleDamageBlockingWarnings(ORG_A, 'run-1', both, querySuccessMap([VEH_A]));
    expect(openNotifications()).toHaveLength(2);

    const onlyB = damageSources(VEH_A, LABEL_A, [
      { id: 'dmg-b', rentalImpact: 'SAFETY_CRITICAL' },
    ]);
    await ingest.syncVehicleDamageBlockingWarnings(ORG_A, 'run-2', onlyB, querySuccessMap([VEH_A]));

    const open = openNotifications();
    expect(open).toHaveLength(1);
    expect(open[0].fingerprint).toContain('dmg-b');
    expect([...notifications.values()].filter((n) => n.fingerprint.includes('dmg-a'))[0]?.status).toBe(
      NotificationStatus.RESOLVED,
    );
  });

  it('vehicle A recovery does not affect vehicle B', async () => {
    const sourcesA = damageSources(VEH_A, LABEL_A, [{ id: 'dmg-a1', rentalImpact: 'BLOCK_RENTAL' }]);
    const sourcesB = damageSources(VEH_B, LABEL_B, [{ id: 'dmg-b1', rentalImpact: 'BLOCK_RENTAL' }]);
    await ingest.syncVehicleDamageBlockingWarnings(
      ORG_A,
      'run-1',
      [...sourcesA, ...sourcesB],
      querySuccessMap([VEH_A, VEH_B]),
    );
    expect(openNotifications()).toHaveLength(2);

    await ingest.syncVehicleDamageBlockingWarnings(ORG_A, 'run-2', sourcesB, querySuccessMap([VEH_A, VEH_B]));
    const open = openNotifications();
    expect(open).toHaveLength(1);
    expect(open[0].entityId).toBe(VEH_B);
  });

  it('tenant isolation — org B unaffected by org A recovery', async () => {
    const sources = damageSources(VEH_A, LABEL_A, [{ id: 'dmg-1', rentalImpact: 'BLOCK_RENTAL' }]);
    await ingest.syncVehicleDamageBlockingWarnings(ORG_A, 'run-1', sources, querySuccessMap([VEH_A]));
    await ingest.syncVehicleDamageBlockingWarnings(ORG_B, 'run-1', sources, querySuccessMap([VEH_A]));

    await ingest.syncVehicleDamageBlockingWarnings(ORG_A, 'run-2', [], querySuccessMap([VEH_A]));

    expect(openNotifications(ORG_A)).toHaveLength(0);
    expect(openNotifications(ORG_B)).toHaveLength(1);
  });

  it('query failure (false) preserves OPEN damage notification', async () => {
    const sources = damageSources(VEH_A, LABEL_A, [{ id: 'dmg-1', rentalImpact: 'BLOCK_RENTAL' }]);
    await ingest.syncVehicleDamageBlockingWarnings(ORG_A, 'run-1', sources, querySuccessMap([VEH_A]));
    const id = openNotifications()[0]!.id;

    await ingest.syncVehicleDamageBlockingWarnings(ORG_A, 'run-2', [], new Map([[VEH_A, false]]));

    expect(notifications.get(id)?.status).toBe(NotificationStatus.OPEN);
  });

  it('no query success entry (undefined) preserves OPEN damage notification', async () => {
    const sources = damageSources(VEH_A, LABEL_A, [{ id: 'dmg-1', rentalImpact: 'BLOCK_RENTAL' }]);
    await ingest.syncVehicleDamageBlockingWarnings(ORG_A, 'run-1', sources, querySuccessMap([VEH_A]));
    const id = openNotifications()[0]!.id;

    await ingest.syncVehicleDamageBlockingWarnings(ORG_A, 'run-2', [], new Map());

    expect(notifications.get(id)?.status).toBe(NotificationStatus.OPEN);
  });

  it('paginated sweep resolves page-2 target when query succeeded', async () => {
    const pageSize = 500;
    const targetVehicleId = 'veh-page2-target';
    const targetDamageId = 'dmg-page2';
    const targetFp = vehicleDamageBlockingSourceFingerprint(ORG_A, {
      vehicleId: targetVehicleId,
      damageId: targetDamageId,
    });

    for (let i = 0; i < pageSize; i++) {
      const fp = vehicleDamageBlockingSourceFingerprint(ORG_A, {
        vehicleId: `veh-filler-${i}`,
        damageId: `dmg-filler-${i}`,
      });
      const id = `ntf-filler-${i}`;
      notifications.set(id, {
        id,
        organizationId: ORG_A,
        fingerprint: fp,
        eventType: VEHICLE_DAMAGE_BLOCKING_EVENT_TYPE,
        entityType: NotificationEntityType.VEHICLE,
        entityId: `veh-filler-${i}`,
        status: NotificationStatus.OPEN,
        severity: NotificationSeverity.WARNING,
        occurrenceCount: 1,
        lifecycleGeneration: 1,
        version: 1,
        templateParams: { label: `FILLER ${i}` },
        actionTarget: {},
        lastSeenAt: new Date(),
        firstSeenAt: new Date(),
      });
      activeByFingerprint.set(`${ORG_A}:${fp}`, id);
    }

    const targetId = 'ntf-page2-target';
    notifications.set(targetId, {
      id: targetId,
      organizationId: ORG_A,
      fingerprint: targetFp,
      eventType: VEHICLE_DAMAGE_BLOCKING_EVENT_TYPE,
      entityType: NotificationEntityType.VEHICLE,
      entityId: targetVehicleId,
      status: NotificationStatus.OPEN,
      severity: NotificationSeverity.WARNING,
      occurrenceCount: 1,
      lifecycleGeneration: 1,
      version: 1,
      templateParams: { label: 'TARGET' },
      actionTarget: {},
      lastSeenAt: new Date(),
      firstSeenAt: new Date(),
    });
    activeByFingerprint.set(`${ORG_A}:${targetFp}`, targetId);

    await ingest.syncVehicleDamageBlockingWarnings(ORG_A, 'run-sweep', [], querySuccessMap([targetVehicleId]));

    expect(notifications.get(targetId)?.status).toBe(NotificationStatus.RESOLVED);
    expect(openNotifications().length).toBe(pageSize);
  });

  it('paginated sweep preserves page-2 target when query not explicitly true', async () => {
    const pageSize = 500;
    const targetVehicleId = 'veh-page2-preserve';
    const targetFp = vehicleDamageBlockingSourceFingerprint(ORG_A, {
      vehicleId: targetVehicleId,
      damageId: 'dmg-preserve',
    });

    for (let i = 0; i < pageSize; i++) {
      const fp = vehicleDamageBlockingSourceFingerprint(ORG_A, {
        vehicleId: `veh-pf-${i}`,
        damageId: `dmg-pf-${i}`,
      });
      const id = `ntf-pf-${i}`;
      notifications.set(id, {
        id,
        organizationId: ORG_A,
        fingerprint: fp,
        eventType: VEHICLE_DAMAGE_BLOCKING_EVENT_TYPE,
        entityType: NotificationEntityType.VEHICLE,
        entityId: `veh-pf-${i}`,
        status: NotificationStatus.OPEN,
        severity: NotificationSeverity.WARNING,
        occurrenceCount: 1,
        lifecycleGeneration: 1,
        version: 1,
        templateParams: {},
        actionTarget: {},
        lastSeenAt: new Date(),
        firstSeenAt: new Date(),
      });
      activeByFingerprint.set(`${ORG_A}:${fp}`, id);
    }

    const targetId = 'ntf-preserve-target';
    notifications.set(targetId, {
      id: targetId,
      organizationId: ORG_A,
      fingerprint: targetFp,
      eventType: VEHICLE_DAMAGE_BLOCKING_EVENT_TYPE,
      entityType: NotificationEntityType.VEHICLE,
      entityId: targetVehicleId,
      status: NotificationStatus.OPEN,
      severity: NotificationSeverity.WARNING,
      occurrenceCount: 1,
      lifecycleGeneration: 1,
      version: 1,
      templateParams: {},
      actionTarget: {},
      lastSeenAt: new Date(),
      firstSeenAt: new Date(),
    });
    activeByFingerprint.set(`${ORG_A}:${targetFp}`, targetId);

    await ingest.syncVehicleDamageBlockingWarnings(ORG_A, 'run-preserve', [], new Map());

    expect(notifications.get(targetId)?.status).toBe(NotificationStatus.OPEN);
  });
});
