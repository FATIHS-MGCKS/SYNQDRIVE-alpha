/**
 * Repro: Battery V2 → BullMQ custom job id colon rejection (prod: "Custom Id cannot contain :").
 *
 * Call-site inventory (no queue / no prod data):
 * - Job id builder: `buildBatteryV2JobId` in `battery-v2-job-queue.util.ts`
 * - Sole BullMQ enqueue: `BatteryV2JobProducerService.addIdempotent` → `queue.add(..., { jobId })`
 * - Idempotency keys (colon-separated): `battery-v2-job-idempotency.policy.ts`,
 *   `battery-provider-observation.policy.ts`, LV/HV producers → all flow through `enqueue`.
 *
 * BullMQ rule (bullmq Job.validateOptions, job.js ~1036–1038): custom jobId may contain `:`
 * only when `jobId.split(':').length === 3` (repeatable-job legacy). Our ids are `battery-v2:<key>`
 * where `<key>` itself contains `:`, so segment count is always > 3.
 */
import { RuntimeStatusRegistry } from '@modules/observability/runtime-status.registry';
import {
  buildAssessmentJobIdempotencyKey,
  buildBatteryRestTargetJobIdempotencyKey,
  buildStartProxyJobIdempotencyKey,
} from './battery-v2-job-idempotency.policy';
import { buildBatteryV2JobId } from './battery-v2-job-queue.util';
import { BatteryV2JobProducerService } from './battery-v2-job-producer.service';
import {
  isBullMqCompatibleJobId,
  sanitizeBullMqJobId,
} from '@shared/queue/bullmq-job-id.sanitizer';

const ORG = 'clorg1234567890123456789012';
const VEH = 'clveh1234567890123456789012';
const TRIP = 'cltrip123456789012345678901';
const FIXED_REQUESTED_AT = '2026-07-16T12:00:00.000Z';
const FIXED_CORRELATION_ID = '00000000-0000-4000-8000-000000000001';
const REST_WINDOW_ID = `lv-rest:${VEH}:1721124000000`;

const INVALID_BATTERY_REST_JOB_ID = `battery-v2:battery-rest:${VEH}:${REST_WINDOW_ID}:60m`;

/** Mirrors BullMQ `Job.validateOptions` custom-id colon rule — no Redis / no queue.start. */
function assertBullMqAcceptsCustomJobId(jobId: string): void {
  if (jobId.includes(':') && jobId.split(':').length !== 3) {
    throw new Error('Custom Id cannot contain :');
  }
}

function mockDeadLetters() {
  return { isDeadLetter: jest.fn().mockResolvedValue(false) };
}

describe('battery-v2 BullMQ custom job id repro', () => {
  beforeEach(() => {
    jest.spyOn(RuntimeStatusRegistry, 'getWorkersEnabled').mockReturnValue(true);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('current broken mapping (passes until fix — documents invalid ids)', () => {
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
    ])('$label — buildBatteryV2JobId adds colons BullMQ rejects', ({ idempotencyKey }) => {
      const jobId = buildBatteryV2JobId(idempotencyKey);

      expect(jobId).toContain(':');
      expect(jobId.startsWith('battery-v2:')).toBe(true);
      expect(jobId.split(':').length).toBeGreaterThan(3);

      expect(() => assertBullMqAcceptsCustomJobId(jobId)).toThrow(
        'Custom Id cannot contain :',
      );
    });

    it('deterministically reproduces the prod-invalid job id for a rest-target enqueue', () => {
      const idempotencyKey = buildBatteryRestTargetJobIdempotencyKey({
        vehicleId: VEH,
        restWindowId: REST_WINDOW_ID,
        targetSuffix: '60m',
      });
      const invalidJobId = buildBatteryV2JobId(idempotencyKey);

      expect(invalidJobId).toBe(INVALID_BATTERY_REST_JOB_ID);

      expect(() => assertBullMqAcceptsCustomJobId(invalidJobId)).toThrow(
        'Custom Id cannot contain :',
      );
    });

    it('BatteryV2JobProducerService propagates BullMQ rejection from queue.add', async () => {
      const invalidJobId = buildBatteryV2JobId(
        buildBatteryRestTargetJobIdempotencyKey({
          vehicleId: VEH,
          restWindowId: REST_WINDOW_ID,
          targetSuffix: '60m',
        }),
      );

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

      await expect(
        producer.enqueue('BATTERY_REST_TARGET_EVALUATE', {
          organizationId: ORG,
          vehicleId: VEH,
          idempotencyKey: buildBatteryRestTargetJobIdempotencyKey({
            vehicleId: VEH,
            restWindowId: REST_WINDOW_ID,
            targetSuffix: '60m',
          }),
          restWindowId: REST_WINDOW_ID,
          restTargetType: 'REST_60M',
          restWindowStartedAt: FIXED_REQUESTED_AT,
          requestedAt: FIXED_REQUESTED_AT,
          correlationId: FIXED_CORRELATION_ID,
        }),
      ).rejects.toThrow('Custom Id cannot contain :');

      expect(queue.add).toHaveBeenCalledWith(
        'BATTERY_REST_TARGET_EVALUATE',
        expect.any(Object),
        expect.objectContaining({ jobId: invalidJobId }),
      );
    });
  });

  describe('sanitizer preview (not wired to producer yet)', () => {
    it('would produce a BullMQ-compatible id for the documented invalid rest-target key', () => {
      const idempotencyKey = buildBatteryRestTargetJobIdempotencyKey({
        vehicleId: VEH,
        restWindowId: REST_WINDOW_ID,
        targetSuffix: '60m',
      });
      const sanitized = sanitizeBullMqJobId({
        namespace: 'battery-v2',
        key: idempotencyKey,
      });

      expect(sanitized).not.toBe(INVALID_BATTERY_REST_JOB_ID);
      expect(sanitized).not.toContain(':');
      expect(isBullMqCompatibleJobId(sanitized)).toBe(true);
      expect(() => assertBullMqAcceptsCustomJobId(sanitized)).not.toThrow();
    });
  });

  describe('acceptance gate (fails before fix — passes after Prompt 16 sanitization)', () => {
    it.each([
      {
        label: 'battery-rest target',
        idempotencyKey: buildBatteryRestTargetJobIdempotencyKey({
          vehicleId: VEH,
          restWindowId: REST_WINDOW_ID,
          targetSuffix: '60m',
        }),
      },
      {
        label: 'start-proxy',
        idempotencyKey: buildStartProxyJobIdempotencyKey({
          tripId: TRIP,
          modelVersion: '1.0.0',
        }),
      },
    ])('$label — buildBatteryV2JobId must be BullMQ-compatible', ({ idempotencyKey }) => {
      const jobId = buildBatteryV2JobId(idempotencyKey);
      expect(() => assertBullMqAcceptsCustomJobId(jobId)).not.toThrow();
    });
  });
});
