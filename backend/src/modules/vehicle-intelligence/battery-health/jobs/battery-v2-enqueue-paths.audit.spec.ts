/**
 * Battery V2 enqueue path audit (Phase 1 / Prompt 8).
 *
 * Canonical job id builder: `buildBatteryV2JobId` (battery-v2-job-queue.util.ts)
 * Canonical BullMQ write: `BatteryV2JobProducerService.addIdempotent` → `queue.add`
 * Queue: `battery.v2` (`QUEUE_NAMES.BATTERY_V2`) — no addBulk, no repeat options.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { RuntimeStatusRegistry } from '@modules/observability/runtime-status.registry';
import { BatteryCapabilityRefreshService } from '../capability-preflight/battery-capability-refresh.service';
import { BatteryCapabilityRefreshTrigger } from '../capability-preflight/battery-capability-lifecycle.policy';
import { HvCapacityShadowProducerService } from '../hv-capacity-shadow/hv-capacity-shadow-producer.service';
import { HV_M2_CAPACITY_METHOD, HV_M2_MODEL_VERSION } from '../hv-capacity-shadow/hv-capacity-m2.types';
import { HvRechargeSessionReconcileProducerService } from '../hv-charge-session/hv-recharge-session-reconcile-producer.service';
import { HvRechargeSessionReconcileTrigger } from '../hv-charge-session/hv-recharge-session-reconcile.trigger';
import { buildHvRechargeVehicleReconcileIdempotencyKey } from '../hv-charge-session/hv-recharge-session-reconcile.policy';
import { BatteryV2JobProducerService } from './battery-v2-job-producer.service';
import {
  buildAssessmentJobIdempotencyKey,
  buildBatteryRestTargetJobIdempotencyKey,
  buildCapabilityRefreshJobIdempotencyKey,
  buildHvCapacityJobIdempotencyKey,
  buildPublicationJobIdempotencyKey,
  buildStartProxyJobIdempotencyKey,
} from './battery-v2-job-idempotency.policy';
import {
  assertBatteryV2BullMqJobId,
  buildBatteryV2JobId,
  isDeterministicBatteryV2JobId,
} from './battery-v2-job-queue.util';
import { BATTERY_V2_JOB_TYPES, type BatteryV2JobType } from './battery-v2-job.types';
import { BatteryV2RestTargetProducer } from './battery-v2-rest-target.producer';
import { BatteryV2TripStartProducer } from './battery-v2-trip-start.producer';
import { BatteryV2ReconciliationScheduler } from '@workers/schedulers/battery-v2-reconciliation.scheduler';
import { QUEUE_NAMES } from '@workers/queues/queue-names';

jest.mock('@config/battery-health-v2.config', () => {
  const actual = jest.requireActual('@config/battery-health-v2.config');
  return {
    ...actual,
    isBatteryV2HvCapacityShadowEnabled: jest.fn().mockReturnValue(true),
    isBatteryV2RestShadowEnabled: jest.fn().mockReturnValue(true),
    isStartWindowCollectionEnabled: jest.fn().mockReturnValue(true),
  };
});

const ORG = 'clorg1234567890123456789012';
const VEH = 'clveh1234567890123456789012';
const TRIP = 'cltrip123456789012345678901';
const SESSION = 'clsess123456789012345678901';
const ASSESSMENT = 'clasm1234567890123456789012';
const CHARGE_SESSION = 'clchg1234567890123456789012';
const REST_WINDOW_ID = `lv-rest:${VEH}:1721124000000`;
const FIXED_AT = '2026-07-16T12:00:00.000Z';

/** Documented enqueue wrappers — all must reach BatteryV2JobProducerService.enqueue. */
export const BATTERY_V2_ENQUEUE_ENTRY_POINTS = [
  { path: 'producer.direct', service: 'BatteryV2JobProducerService', method: 'enqueue' },
  { path: 'observation.classifyAndEnqueue', service: 'BatteryV2SnapshotObservationProducer', method: 'classifyAndEnqueue' },
  { path: 'rest-target.scheduleTarget', service: 'BatteryV2RestTargetProducer', method: 'scheduleTarget' },
  { path: 'trip-start.enqueueStartProxy', service: 'BatteryV2TripStartProducer', method: 'enqueueStartProxy' },
  { path: 'snapshot-ingestion.assessment', service: 'BatteryV2SnapshotIngestionService', method: 'enqueueLvAssessmentRecompute' },
  { path: 'reconciliation.reconcileAll', service: 'BatteryV2ReconciliationService', method: 'reconcileAll' },
  { path: 'scheduler.reconcileBatteryV2Pipeline', service: 'BatteryV2ReconciliationScheduler', method: 'reconcileBatteryV2Pipeline' },
  { path: 'capability.enqueue', service: 'BatteryCapabilityRefreshService', method: 'enqueue' },
  { path: 'hv-recharge.enqueue', service: 'HvRechargeSessionReconcileProducerService', method: 'enqueue' },
  { path: 'hv-capacity.enqueueForSession', service: 'HvCapacityShadowProducerService', method: 'enqueueForSession' },
  { path: 'admin.manualRefresh', service: 'PlatformAdminController', method: 'refreshBatteryCapability' },
] as const;

type CapturedBatteryV2Enqueue = {
  jobType: BatteryV2JobType;
  jobId: string;
  idempotencyKey: string;
};

function mockDeadLetters() {
  return { isDeadLetter: jest.fn().mockResolvedValue(false) };
}

function createCapturingProducer() {
  const captured: CapturedBatteryV2Enqueue[] = [];
  const queue = {
    getJob: jest.fn().mockResolvedValue(null),
    add: jest.fn().mockImplementation((jobType: BatteryV2JobType, payload, opts: { jobId: string }) => {
      captured.push({
        jobType,
        jobId: opts.jobId,
        idempotencyKey: payload.idempotencyKey,
      });
      return Promise.resolve({ id: opts.jobId });
    }),
  };
  const producer = new BatteryV2JobProducerService(queue as never, mockDeadLetters() as never);
  return { producer, queue, captured };
}

function expectSanitizedBatteryV2JobId(
  captured: CapturedBatteryV2Enqueue[],
  jobType: BatteryV2JobType,
  idempotencyKey: string,
) {
  const row = captured.find((entry) => entry.jobType === jobType);
  expect(row).toBeDefined();
  expect(row!.idempotencyKey).toBe(idempotencyKey);
  expect(row!.jobId).toBe(buildBatteryV2JobId(idempotencyKey));
  expect(row!.jobId).not.toContain(':');
  expect(isDeterministicBatteryV2JobId(idempotencyKey, row!.jobId)).toBe(true);
  expect(() => assertBatteryV2BullMqJobId(row!.jobId)).not.toThrow();
}

function directEnqueueInput(jobType: BatteryV2JobType, idempotencyKey: string) {
  const base = {
    organizationId: ORG,
    vehicleId: VEH,
    idempotencyKey,
    requestedAt: FIXED_AT,
    correlationId: '00000000-0000-4000-8000-000000000001',
  };

  switch (jobType) {
    case 'BATTERY_REST_TARGET_EVALUATE':
      return {
        ...base,
        restWindowId: REST_WINDOW_ID,
        restTargetType: 'REST_60M' as const,
        restWindowStartedAt: FIXED_AT,
      };
    case 'BATTERY_START_PROXY_EXTRACT':
      return {
        ...base,
        tripId: TRIP,
        tripStartedAt: FIXED_AT,
        sourceEntityId: TRIP,
      };
    case 'HV_CAPABILITY_REFRESH':
      return {
        ...base,
        providerSource: 'DIMO',
        signalScope: 'all',
        refreshTrigger: BatteryCapabilityRefreshTrigger.MANUAL_ADMIN,
      };
    case 'HV_RECHARGE_SESSION_RECONCILE':
      return {
        ...base,
        segmentFingerprint: 'seg-fp-1',
        reconcileTrigger: HvRechargeSessionReconcileTrigger.PERIODIC,
      };
    case 'HV_CAPACITY_SHADOW_RECOMPUTE':
      return {
        ...base,
        chargeSessionId: CHARGE_SESSION,
        method: HV_M2_CAPACITY_METHOD,
        capacityModelVersion: String(HV_M2_MODEL_VERSION),
      };
    default:
      return base;
  }
}

const JOB_TYPE_IDEMPOTENCY_KEYS: Record<BatteryV2JobType, string> = {
  BATTERY_OBSERVATION_CLASSIFY: 'hv-snap:2026-07-16T12:00:00.000Z:72',
  BATTERY_REST_TARGET_EVALUATE: buildBatteryRestTargetJobIdempotencyKey({
    vehicleId: VEH,
    restWindowId: REST_WINDOW_ID,
    targetSuffix: '60m',
  }),
  BATTERY_START_PROXY_EXTRACT: buildStartProxyJobIdempotencyKey({
    tripId: TRIP,
    modelVersion: '1.0.0',
  }),
  BATTERY_ASSESSMENT_RECOMPUTE: buildAssessmentJobIdempotencyKey({
    vehicleId: VEH,
    assessmentType: 'LV_CRANK',
    inputVersion: 3,
  }),
  BATTERY_PUBLICATION_UPDATE: buildPublicationJobIdempotencyKey({
    assessmentId: ASSESSMENT,
    publicationVersion: 1,
  }),
  HV_CAPABILITY_REFRESH: buildCapabilityRefreshJobIdempotencyKey({
    vehicleId: VEH,
    providerSource: 'DIMO',
    signalScope: 'all',
    trigger: 'MANUAL_ADMIN',
    nonce: 'admin-1',
  }),
  HV_RECHARGE_SESSION_RECONCILE: buildHvRechargeVehicleReconcileIdempotencyKey({
    vehicleId: VEH,
    trigger: HvRechargeSessionReconcileTrigger.PERIODIC,
    nonce: 'periodic-1',
  }),
  HV_CAPACITY_SHADOW_RECOMPUTE: buildHvCapacityJobIdempotencyKey({
    chargeSessionId: CHARGE_SESSION,
    method: HV_M2_CAPACITY_METHOD,
    modelVersion: HV_M2_MODEL_VERSION,
  }),
};

describe('battery-v2 enqueue path audit', () => {
  beforeEach(() => {
    jest.spyOn(RuntimeStatusRegistry, 'getWorkersEnabled').mockReturnValue(true);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('documents all known enqueue entry points', () => {
    expect(BATTERY_V2_ENQUEUE_ENTRY_POINTS.map((entry) => entry.path)).toEqual([
      'producer.direct',
      'observation.classifyAndEnqueue',
      'rest-target.scheduleTarget',
      'trip-start.enqueueStartProxy',
      'snapshot-ingestion.assessment',
      'reconciliation.reconcileAll',
      'scheduler.reconcileBatteryV2Pipeline',
      'capability.enqueue',
      'hv-recharge.enqueue',
      'hv-capacity.enqueueForSession',
      'admin.manualRefresh',
    ]);
  });

  it('uses battery.v2 queue name constant', () => {
    expect(QUEUE_NAMES.BATTERY_V2).toBe('battery.v2');
  });

  it('has a single BullMQ queue.add site under battery-health jobs', () => {
    const producerSource = readFileSync(
      join(__dirname, 'battery-v2-job-producer.service.ts'),
      'utf8',
    );
    expect(producerSource.match(/queue\.add/g)?.length ?? 0).toBe(1);
    expect(producerSource).toContain('buildBatteryV2JobId');
    expect(producerSource).toContain('assertBatteryV2BullMqJobId');
  });

  describe('producer.direct — all job types', () => {
    it.each(BATTERY_V2_JOB_TYPES)('%s uses buildBatteryV2JobId at BullMQ boundary', async (jobType) => {
      const { producer, captured } = createCapturingProducer();
      const idempotencyKey = JOB_TYPE_IDEMPOTENCY_KEYS[jobType];

      await producer.enqueue(jobType, directEnqueueInput(jobType, idempotencyKey) as never);

      expectSanitizedBatteryV2JobId(captured, jobType, idempotencyKey);
    });
  });

  describe('wrapper producers', () => {
    it('rest-target.scheduleTarget (delayed repeat-safe dedup)', async () => {
      const { producer, captured } = createCapturingProducer();
      const restProducer = new BatteryV2RestTargetProducer(producer);
      const idempotencyKey = buildBatteryRestTargetJobIdempotencyKey({
        vehicleId: VEH,
        restWindowId: REST_WINDOW_ID,
        targetSuffix: '60m',
      });

      await restProducer.scheduleRest60m({
        organizationId: ORG,
        vehicleId: VEH,
        sessionId: SESSION,
        restWindowId: REST_WINDOW_ID,
        restWindowStartedAt: new Date(FIXED_AT),
        now: new Date('2026-07-16T10:30:00.000Z'),
      });

      expectSanitizedBatteryV2JobId(captured, 'BATTERY_REST_TARGET_EVALUATE', idempotencyKey);
    });

    it('trip-start.enqueueStartProxy (delayed)', async () => {
      const { producer, captured } = createCapturingProducer();
      const policyProfiles = {
        resolveForVehicle: jest.fn().mockResolvedValue({ startProxyAllowed: true }),
      };
      const tripProducer = new BatteryV2TripStartProducer(producer, policyProfiles as never);
      const idempotencyKey = buildStartProxyJobIdempotencyKey({
        tripId: TRIP,
        modelVersion: '1.0.0',
      });

      await tripProducer.enqueueStartProxy({
        organizationId: ORG,
        vehicleId: VEH,
        tripId: TRIP,
        tripStartedAt: new Date(FIXED_AT),
      });

      expectSanitizedBatteryV2JobId(captured, 'BATTERY_START_PROXY_EXTRACT', idempotencyKey);
    });

    it('capability.enqueue (manual admin / reconciliation)', async () => {
      const { producer, captured } = createCapturingProducer();
      const capability = new BatteryCapabilityRefreshService({} as never, producer);

      await capability.enqueue({
        organizationId: ORG,
        vehicleId: VEH,
        trigger: BatteryCapabilityRefreshTrigger.MANUAL_ADMIN,
        correlationId: '00000000-0000-4000-8000-000000000002',
      });

      expect(captured).toHaveLength(1);
      expect(captured[0].jobType).toBe('HV_CAPABILITY_REFRESH');
      expect(captured[0].idempotencyKey).toContain('cap-refresh:');
      expectSanitizedBatteryV2JobId(captured, 'HV_CAPABILITY_REFRESH', captured[0].idempotencyKey);
    });

    it('hv-recharge.enqueue (reconciliation segment)', async () => {
      const { producer, captured } = createCapturingProducer();
      const hvRecharge = new HvRechargeSessionReconcileProducerService(
        {} as never,
        producer,
        mockDeadLetters() as never,
      );
      const idempotencyKey = buildHvRechargeVehicleReconcileIdempotencyKey({
        vehicleId: VEH,
        trigger: HvRechargeSessionReconcileTrigger.CHARGING_STATE,
        nonce: 'seg-fp-1',
      });

      await hvRecharge.enqueue({
        organizationId: ORG,
        vehicleId: VEH,
        trigger: HvRechargeSessionReconcileTrigger.CHARGING_STATE,
        segmentFingerprint: 'seg-fp-1',
      });

      expectSanitizedBatteryV2JobId(captured, 'HV_RECHARGE_SESSION_RECONCILE', idempotencyKey);
    });

    it('hv-capacity.enqueueForSession', async () => {
      const { producer, captured } = createCapturingProducer();
      const hvCapacity = new HvCapacityShadowProducerService(producer, mockDeadLetters() as never);
      const idempotencyKey = buildHvCapacityJobIdempotencyKey({
        chargeSessionId: CHARGE_SESSION,
        method: HV_M2_CAPACITY_METHOD,
        modelVersion: HV_M2_MODEL_VERSION,
      });

      await hvCapacity.enqueueForSession({
        organizationId: ORG,
        vehicleId: VEH,
        chargeSessionId: CHARGE_SESSION,
      });

      expectSanitizedBatteryV2JobId(captured, 'HV_CAPACITY_SHADOW_RECOMPUTE', idempotencyKey);
    });
  });

  describe('non-enqueue paths', () => {
    it('retention scheduler/service does not call BatteryV2JobProducerService', () => {
      const retentionSource = readFileSync(
        join(__dirname, '../retention/battery-v2-retention.service.ts'),
        'utf8',
      );
      expect(retentionSource).not.toContain('BatteryV2JobProducerService');
      expect(retentionSource).not.toContain('queue.add');
    });

    it('reconciliation scheduler delegates to service only', async () => {
      const reconciliation = { reconcileAll: jest.fn().mockResolvedValue({}) };
      const observability = { setDeadLetterBacklog: jest.fn() };
      const deadLetters = { countBacklog: jest.fn().mockResolvedValue(0) };
      const scheduler = new BatteryV2ReconciliationScheduler(
        reconciliation as never,
        observability as never,
        deadLetters as never,
      );

      const config = await import('@config/battery-health-v2.config');
      jest.spyOn(config, 'isBatteryV2ReconciliationEnabled').mockReturnValue(true);

      await scheduler.reconcileBatteryV2Pipeline();

      expect(reconciliation.reconcileAll).toHaveBeenCalledTimes(1);
    });
  });

  describe('deduplication with sanitized ids', () => {
    it('suppresses duplicate enqueue for the same idempotency key', async () => {
      let seenJobId: string | null = null;
      const idempotencyKey = JOB_TYPE_IDEMPOTENCY_KEYS.BATTERY_REST_TARGET_EVALUATE;
      const expectedJobId = buildBatteryV2JobId(idempotencyKey);
      const queue = {
        getJob: jest.fn().mockImplementation(async (jobId: string) => {
          if (jobId === seenJobId) {
            return { getState: async () => 'waiting' };
          }
          seenJobId = jobId;
          return null;
        }),
        add: jest.fn().mockResolvedValue({ id: expectedJobId }),
      };
      const producer = new BatteryV2JobProducerService(queue as never, mockDeadLetters() as never);
      const input = directEnqueueInput('BATTERY_REST_TARGET_EVALUATE', idempotencyKey);

      const first = await producer.enqueue('BATTERY_REST_TARGET_EVALUATE', input as never);
      const second = await producer.enqueue('BATTERY_REST_TARGET_EVALUATE', input as never);

      expect(first).toBe(expectedJobId);
      expect(second).toBe(expectedJobId);
      expect(queue.add).toHaveBeenCalledTimes(1);
      expect(queue.getJob).toHaveBeenCalledWith(expectedJobId);
    });
  });
});
