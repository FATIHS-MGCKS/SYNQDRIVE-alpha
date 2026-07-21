/**
 * Battery V2 BullMQ custom job id — regression guard for prod error
 * "Custom Id cannot contain :".
 *
 * All enqueue paths flow through `buildBatteryV2JobId` in `battery-v2-job-queue.util.ts`
 * (regular enqueue, reconciliation, schedulers, HV/LV producers, deduped retries).
 */
import { RuntimeStatusRegistry } from '@modules/observability/runtime-status.registry';
import {
  buildAssessmentJobIdempotencyKey,
  buildBatteryRestTargetJobIdempotencyKey,
  buildStartProxyJobIdempotencyKey,
} from './battery-v2-job-idempotency.policy';
import {
  buildBatteryV2JobId,
  isBatteryV2BullMqJobId,
  isDeterministicBatteryV2JobId,
} from './battery-v2-job-queue.util';
import { BatteryV2JobProducerService } from './battery-v2-job-producer.service';
import { isBullMqCompatibleJobId } from '@shared/queue/bullmq-job-id.sanitizer';

const ORG = 'clorg1234567890123456789012';
const VEH = 'clveh1234567890123456789012';
const TRIP = 'cltrip123456789012345678901';
const FIXED_REQUESTED_AT = '2026-07-16T12:00:00.000Z';
const FIXED_CORRELATION_ID = '00000000-0000-4000-8000-000000000001';
const REST_WINDOW_ID = `lv-rest:${VEH}:1721124000000`;

/** Pre-sanitizer prod format — documented for migration context; not emitted anymore. */
const LEGACY_INVALID_BATTERY_REST_JOB_ID = `battery-v2:battery-rest:${VEH}:${REST_WINDOW_ID}:60m`;

/** Mirrors BullMQ `Job.validateOptions` custom-id colon rule — no Redis / no queue. */
function assertBullMqAcceptsCustomJobId(jobId: string): void {
  if (`${parseInt(jobId, 10)}` === jobId) {
    throw new Error('Custom Id cannot be integers');
  }
  if (jobId.includes(':') && jobId.split(':').length !== 3) {
    throw new Error('Custom Id cannot contain :');
  }
}

function mockDeadLetters() {
  return { isDeadLetter: jest.fn().mockResolvedValue(false) };
}

describe('battery-v2 BullMQ custom job id', () => {
  beforeEach(() => {
    jest.spyOn(RuntimeStatusRegistry, 'getWorkersEnabled').mockReturnValue(true);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('legacy prod-invalid format (documented, not migrated)', () => {
    it('records the historical invalid rest-target job id shape', () => {
      expect(LEGACY_INVALID_BATTERY_REST_JOB_ID).toContain(':');
      expect(() => assertBullMqAcceptsCustomJobId(LEGACY_INVALID_BATTERY_REST_JOB_ID)).toThrow(
        'Custom Id cannot contain :',
      );
    });
  });

  describe('sanitized buildBatteryV2JobId', () => {
    it.each([
      {
        label: 'battery-rest target (FHS reconciliation path)',
        idempotencyKey: buildBatteryRestTargetJobIdempotencyKey({
          vehicleId: VEH,
          restWindowId: REST_WINDOW_ID,
          targetSuffix: '60m',
        }),
      },
      {
        label: 'battery-start-proxy trip job',
        idempotencyKey: buildStartProxyJobIdempotencyKey({
          tripId: TRIP,
          modelVersion: '1.0.0',
        }),
      },
      {
        label: 'assessment recompute',
        idempotencyKey: buildAssessmentJobIdempotencyKey({
          vehicleId: VEH,
          assessmentType: 'LV_CRANK',
          inputVersion: 3,
        }),
      },
    ])('$label — emits BullMQ-compatible ids', ({ idempotencyKey }) => {
      const jobId = buildBatteryV2JobId(idempotencyKey);

      expect(jobId).not.toContain(':');
      expect(jobId.startsWith('battery-v2_')).toBe(true);
      expect(isBatteryV2BullMqJobId(jobId)).toBe(true);
      expect(isDeterministicBatteryV2JobId(idempotencyKey, jobId)).toBe(true);
      expect(() => assertBullMqAcceptsCustomJobId(jobId)).not.toThrow();
    });

    it('differs from the legacy colon-bearing job id for rest-target enqueue', () => {
      const idempotencyKey = buildBatteryRestTargetJobIdempotencyKey({
        vehicleId: VEH,
        restWindowId: REST_WINDOW_ID,
        targetSuffix: '60m',
      });
      const jobId = buildBatteryV2JobId(idempotencyKey);

      expect(jobId).not.toBe(LEGACY_INVALID_BATTERY_REST_JOB_ID);
      expect(isBullMqCompatibleJobId(jobId)).toBe(true);
    });
  });

  describe('BatteryV2JobProducerService enqueue', () => {
    it('enqueues rest-target jobs with sanitized jobId', async () => {
      const idempotencyKey = buildBatteryRestTargetJobIdempotencyKey({
        vehicleId: VEH,
        restWindowId: REST_WINDOW_ID,
        targetSuffix: '60m',
      });
      const expectedJobId = buildBatteryV2JobId(idempotencyKey);

      const queue = {
        getJob: jest.fn().mockResolvedValue(null),
        add: jest.fn().mockImplementation((_name, _data, opts: { jobId: string }) => {
          assertBullMqAcceptsCustomJobId(opts.jobId);
          return Promise.resolve({ id: opts.jobId });
        }),
      };

      const producer = new BatteryV2JobProducerService(
        queue as never,
        mockDeadLetters() as never,
      );

      const jobId = await producer.enqueue('BATTERY_REST_TARGET_EVALUATE', {
        organizationId: ORG,
        vehicleId: VEH,
        idempotencyKey,
        restWindowId: REST_WINDOW_ID,
        restTargetType: 'REST_60M',
        restWindowStartedAt: FIXED_REQUESTED_AT,
        requestedAt: FIXED_REQUESTED_AT,
        correlationId: FIXED_CORRELATION_ID,
      });

      expect(jobId).toBe(expectedJobId);
      expect(queue.add).toHaveBeenCalledWith(
        'BATTERY_REST_TARGET_EVALUATE',
        expect.objectContaining({ idempotencyKey }),
        expect.objectContaining({ jobId: expectedJobId }),
      );
    });
  });
});
