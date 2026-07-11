import { NotificationEntityType, NotificationSeverity, NotificationStatus } from '@prisma/client';
import { InsightEntityScope, InsightSeverity, InsightType } from '@modules/business-insights/insight.types';
import { NotificationEngineConfig } from '../notification-engine.config';
import { NotificationCoreService } from '../notification-core.service';
import { NotificationRepository } from '../notification.repository';
import { DrivingAssessmentNotificationAdapter } from './driving-assessment-notification.adapter';
import { TechnicalObservationNotificationAdapter } from './technical-observation-notification.adapter';
import { StationShortageNotificationAdapter } from './station-shortage-notification.adapter';
import { NotificationProducerRouter } from './notification-producer.router';
import { NotificationProducerIngestService } from './notification-producer.ingest.service';
import { DEVICE_QUALITY_OBSERVATION_MARKER, DEVICE_QUALITY_WORKER_ID } from '@modules/vehicle-intelligence/trips/driving-assessment-device-quality.detector';

const ORG = 'org-wob';
const WOB_VEHICLE_ID = 'veh-wob-l-7503';
const WOB_PLATE = 'WOB L 7503';
const REAL_OBS_ID = 'obs-wob-real-1';
const STATION_ID = 'st-wob';

describe('NotificationProducerIngestService — phase 1 migration', () => {
  let v2Enabled: boolean;
  const notifications = new Map<string, any>();
  const activeByFingerprint = new Map<string, string>();
  let idSeq = 0;

  const engineConfig = {
    isV2Enabled: () => v2Enabled,
  } as NotificationEngineConfig;

  function fingerprintFrom(candidate: {
    organizationId: string;
    eventType: string;
    entityType: string;
    entityId: string;
    conditionCode: string;
    scopeVersion?: number;
  }) {
    return [
      candidate.organizationId,
      candidate.eventType,
      candidate.entityType,
      candidate.entityId,
      candidate.conditionCode,
      `v${candidate.scopeVersion ?? 1}`,
    ].join('|');
  }

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
    }) => {
      return [...notifications.values()].filter((n) => {
        if (n.organizationId !== filter.organizationId) return false;
        if (filter.status?.length && !filter.status.includes(n.status)) return false;
        if (filter.entityType && n.entityType !== filter.entityType) return false;
        return true;
      });
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
      const updated = { ...existing };
      for (const [k, v] of Object.entries(data)) {
        if (k === 'occurrenceCount' && typeof v === 'number') {
          updated.occurrenceCount = v;
        } else {
          (updated as any)[k] = v;
        }
      }
      if (data.occurrenceCount === undefined && existing.occurrenceCount) {
        // increment path handled by caller passing explicit value
      }
      updated.version = (existing.version ?? 1) + 1;
      notifications.set(id, updated);
      if (![NotificationStatus.OPEN, NotificationStatus.ACKNOWLEDGED, NotificationStatus.SNOOZED].includes(updated.status)) {
        activeByFingerprint.delete(`${existing.organizationId}:${existing.fingerprint}`);
      }
      return updated;
    }),
    createOccurrence: jest.fn(async () => ({ id: `occ-${++idSeq}` })),
  } as unknown as NotificationRepository;

  let core: NotificationCoreService;
  let ingest: NotificationProducerIngestService;

  beforeEach(() => {
    v2Enabled = true;
    notifications.clear();
    activeByFingerprint.clear();
    idSeq = 0;
    jest.clearAllMocks();

    core = new NotificationCoreService(repository, engineConfig);
    const router = new NotificationProducerRouter(
      core,
      engineConfig,
      new DrivingAssessmentNotificationAdapter(),
      new TechnicalObservationNotificationAdapter(),
      new StationShortageNotificationAdapter(),
    );
    ingest = new NotificationProducerIngestService(
      router,
      repository,
      new DrivingAssessmentNotificationAdapter(),
      new TechnicalObservationNotificationAdapter(),
      new StationShortageNotificationAdapter(),
    );
  });

  describe('WOB L 7503 regression', () => {
    it('degraded driving assessment + real technical observation — two distinct open notifications', async () => {
      await ingest.syncDrivingAssessmentQuality({
        organizationId: ORG,
        vehicleId: WOB_VEHICLE_ID,
        label: WOB_PLATE,
        status: 'DEGRADED',
        sourceRef: 'trip-1',
      });

      await ingest.syncTechnicalObservationActive({
        organizationId: ORG,
        vehicleId: WOB_VEHICLE_ID,
        observationId: REAL_OBS_ID,
        label: WOB_PLATE,
        createdByWorkerId: 'operator-handover',
        notes: 'Klimaanlage kühlt nicht',
      });

      const open = [...notifications.values()].filter((n) => n.status === NotificationStatus.OPEN);
      expect(open).toHaveLength(2);

      const drivingFp = ingest.drivingAssessmentFingerprint(ORG, WOB_VEHICLE_ID);
      const obsFp = ingest.technicalObservationFingerprint(ORG, WOB_VEHICLE_ID, REAL_OBS_ID);

      expect(open.map((n) => n.fingerprint).sort()).toEqual([drivingFp, obsFp].sort());
      expect(open.find((n) => n.eventType === 'DRIVING_ASSESSMENT_DEVICE_QUALITY')?.titleKey).toBe(
        'notification.title.drivingAssessmentDegraded',
      );
      expect(open.find((n) => n.eventType === 'TECHNICAL_OBSERVATION_ACTIVE')?.titleKey).toBe(
        'notification.title.technicalObservation',
      );
    });

    it('skips device-quality system observation — no third notification', async () => {
      await ingest.syncDrivingAssessmentQuality({
        organizationId: ORG,
        vehicleId: WOB_VEHICLE_ID,
        label: WOB_PLATE,
        status: 'DEGRADED',
        sourceRef: 'trip-1',
      });

      await ingest.syncTechnicalObservationActive({
        organizationId: ORG,
        vehicleId: WOB_VEHICLE_ID,
        observationId: 'obs-dq-auto',
        label: WOB_PLATE,
        createdByWorkerId: DEVICE_QUALITY_WORKER_ID,
        notes: DEVICE_QUALITY_OBSERVATION_MARKER,
      });

      await ingest.syncTechnicalObservationActive({
        organizationId: ORG,
        vehicleId: WOB_VEHICLE_ID,
        observationId: REAL_OBS_ID,
        label: WOB_PLATE,
      });

      expect([...notifications.values()].filter((n) => n.status === NotificationStatus.OPEN)).toHaveLength(2);
    });

    it('re-ingest degraded updates same fingerprint — stable id', async () => {
      await ingest.syncDrivingAssessmentQuality({
        organizationId: ORG,
        vehicleId: WOB_VEHICLE_ID,
        label: WOB_PLATE,
        status: 'DEGRADED',
        sourceRef: 'trip-1',
      });
      const firstId = [...notifications.values()][0].id;

      await ingest.syncDrivingAssessmentQuality({
        organizationId: ORG,
        vehicleId: WOB_VEHICLE_ID,
        label: WOB_PLATE,
        status: 'DEGRADED',
        sourceRef: 'trip-2',
      });

      const open = [...notifications.values()].filter((n) => n.status === NotificationStatus.OPEN);
      expect(open).toHaveLength(1);
      expect(open[0].id).toBe(firstId);
      expect(open[0].occurrenceCount).toBeGreaterThanOrEqual(2);
    });

    it('normalization resolves driving assessment — no new warning', async () => {
      await ingest.syncDrivingAssessmentQuality({
        organizationId: ORG,
        vehicleId: WOB_VEHICLE_ID,
        label: WOB_PLATE,
        status: 'DEGRADED',
        sourceRef: 'trip-1',
      });

      await ingest.syncDrivingAssessmentQuality({
        organizationId: ORG,
        vehicleId: WOB_VEHICLE_ID,
        label: WOB_PLATE,
        status: 'NORMAL',
        sourceRef: 'trip-5',
      });

      const driving = [...notifications.values()].find(
        (n) => n.eventType === 'DRIVING_ASSESSMENT_DEVICE_QUALITY',
      );
      expect(driving?.status).toBe(NotificationStatus.RESOLVED);
      expect(
        [...notifications.values()].filter(
          (n) => n.status === NotificationStatus.OPEN && n.eventType === 'DRIVING_ASSESSMENT_DEVICE_QUALITY',
        ),
      ).toHaveLength(0);
    });
  });

  describe('station shortage', () => {
    it('ingests shortage with German template params and resolves when cleared', async () => {
      await ingest.syncStationShortagesFromInsights(
        ORG,
        'run-1',
        [
          {
            type: InsightType.STATION_SHORTAGE,
            severity: InsightSeverity.WARNING,
            priority: 75,
            title: 'Station Shortage',
            message: 'WOB Hauptbahnhof has only 1 vehicle available.',
            actionLabel: 'View station',
            actionType: 'navigate_station',
            entityScope: InsightEntityScope.STATION,
            entityIds: [STATION_ID],
            metrics: { totalVehicles: 5, bookedOut: 4, available: 1, stationName: 'WOB Hauptbahnhof' },
            reasons: [],
            confidence: 1,
            dedupeKey: `station_shortage:${STATION_ID}`,
          },
        ],
        1,
      );

      const open = [...notifications.values()].filter((n) => n.status === NotificationStatus.OPEN);
      expect(open).toHaveLength(1);
      expect(open[0].eventType).toBe('STATION_SHORTAGE');
      expect(open[0].entityType).toBe(NotificationEntityType.STATION);
      expect(open[0].templateParams).toMatchObject({
        stationName: 'WOB Hauptbahnhof',
        available: 1,
        totalVehicles: 5,
      });
      expect(open[0].fingerprint).toBe(ingest.stationShortageFingerprint(ORG, STATION_ID));

      await ingest.syncStationShortagesFromInsights(ORG, 'run-2', [], 1);

      const row = notifications.get(open[0].id);
      expect(row?.status).toBe(NotificationStatus.RESOLVED);
    });
  });

  describe('shadow mode flag off', () => {
    it('does not persist when NOTIFICATIONS_V2 is disabled', async () => {
      v2Enabled = false;
      await ingest.syncDrivingAssessmentQuality({
        organizationId: ORG,
        vehicleId: WOB_VEHICLE_ID,
        label: WOB_PLATE,
        status: 'DEGRADED',
        sourceRef: 'trip-1',
      });
      expect(notifications.size).toBe(0);
    });
  });
});

describe('Notification shadow adapters — fingerprints', () => {
  const technical = new TechnicalObservationNotificationAdapter();
  const ctx = {
    organizationId: 'org-1',
    sourceRef: 'run-1',
    occurredAt: new Date('2026-07-11T10:00:00.000Z'),
  };

  it('technical observation uses per-observation conditionCode', () => {
    const a = technical.toCandidate(
      { vehicleId: 'veh-1', label: 'WOB L 7503', complaintId: 'obs-a' },
      ctx,
    );
    const b = technical.toCandidate(
      { vehicleId: 'veh-1', label: 'WOB L 7503', complaintId: 'obs-b' },
      ctx,
    );
    expect(a?.conditionCode).toBe('technical_observation_active:obs-a');
    expect(b?.conditionCode).toBe('technical_observation_active:obs-b');
    expect(a?.conditionCode).not.toBe(b?.conditionCode);
  });
});
