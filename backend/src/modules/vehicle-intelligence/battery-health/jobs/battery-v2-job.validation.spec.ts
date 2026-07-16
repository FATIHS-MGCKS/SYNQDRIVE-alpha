import {
  BATTERY_V2_JOB_TYPES,
  BATTERY_V2_JOB_MODEL_VERSION_DEFAULT,
} from './battery-v2-job.types';
import {
  BatteryV2JobValidationError,
  buildBatteryV2AttemptContext,
  isBatteryV2JobType,
  validateBatteryV2JobPayload,
} from './battery-v2-job.validation';

const ORG_ID = 'clorg1234567890123456789012';
const VEHICLE_ID = 'clveh1234567890123456789012';
const SOURCE_ID = '550e8400-e29b-41d4-a716-446655440000';

function validBase(overrides: Record<string, unknown> = {}) {
  return {
    organizationId: ORG_ID,
    vehicleId: VEHICLE_ID,
    idempotencyKey: 'obs:2026-07-16T12:00:00Z',
    sourceEntityId: SOURCE_ID,
    requestedAt: '2026-07-16T12:00:00.000Z',
    modelVersion: BATTERY_V2_JOB_MODEL_VERSION_DEFAULT,
    correlationId: 'corr-abc-123',
    attemptContext: buildBatteryV2AttemptContext({ maxAttempts: 3 }),
    ...overrides,
  };
}

describe('battery-v2-job.validation', () => {
  describe('isBatteryV2JobType', () => {
    it.each(BATTERY_V2_JOB_TYPES)('accepts %s', (jobType) => {
      expect(isBatteryV2JobType(jobType)).toBe(true);
    });

    it('rejects unknown types', () => {
      expect(isBatteryV2JobType('BATTERY_UNKNOWN')).toBe(false);
    });
  });

  describe('validateBatteryV2JobPayload — base fields', () => {
    it.each(BATTERY_V2_JOB_TYPES)('validates base payload for %s', (jobType) => {
      const payload = validateBatteryV2JobPayload(jobType, validBase());
      expect(payload.organizationId).toBe(ORG_ID);
      expect(payload.vehicleId).toBe(VEHICLE_ID);
      expect(payload.idempotencyKey).toBe('obs:2026-07-16T12:00:00Z');
      expect(payload.modelVersion).toBe(BATTERY_V2_JOB_MODEL_VERSION_DEFAULT);
    });

    it('rejects missing organizationId', () => {
      expect(() =>
        validateBatteryV2JobPayload(
          'BATTERY_OBSERVATION_CLASSIFY',
          validBase({ organizationId: '' }),
        ),
      ).toThrow(BatteryV2JobValidationError);
    });

    it('rejects invalid modelVersion', () => {
      expect(() =>
        validateBatteryV2JobPayload(
          'BATTERY_OBSERVATION_CLASSIFY',
          validBase({ modelVersion: '9.9.9' }),
        ),
      ).toThrow(/modelVersion/);
    });

    it('rejects forbidden PII keys', () => {
      expect(() =>
        validateBatteryV2JobPayload('BATTERY_OBSERVATION_CLASSIFY', {
          ...validBase(),
          email: 'user@example.com',
        }),
      ).toThrow(/PII/);
    });

    it('rejects nested forbidden keys', () => {
      expect(() =>
        validateBatteryV2JobPayload('BATTERY_OBSERVATION_CLASSIFY', {
          ...validBase(),
          meta: { driverName: 'Alice' },
        }),
      ).toThrow(/PII/);
    });

    it('allows null sourceEntityId', () => {
      const payload = validateBatteryV2JobPayload(
        'BATTERY_OBSERVATION_CLASSIFY',
        validBase({ sourceEntityId: null }),
      );
      expect(payload.sourceEntityId).toBeNull();
    });

    it('rejects attemptNumber > maxAttempts', () => {
      expect(() =>
        validateBatteryV2JobPayload(
          'BATTERY_OBSERVATION_CLASSIFY',
          validBase({
            attemptContext: buildBatteryV2AttemptContext({
              attemptNumber: 5,
              maxAttempts: 3,
            }),
          }),
        ),
      ).toThrow(/attemptNumber cannot exceed/);
    });
  });

  describe('validateBatteryV2JobPayload — type-specific fields', () => {
    it('validates restWindowStartedAt for BATTERY_REST_TARGET_EVALUATE', () => {
      const payload = validateBatteryV2JobPayload(
        'BATTERY_REST_TARGET_EVALUATE',
        validBase({ restWindowStartedAt: '2026-07-16T10:00:00.000Z' }),
      );
      expect(payload).toMatchObject({
        restWindowStartedAt: '2026-07-16T10:00:00.000Z',
      });
    });

    it('rejects invalid restWindowStartedAt', () => {
      expect(() =>
        validateBatteryV2JobPayload(
          'BATTERY_REST_TARGET_EVALUATE',
          validBase({ restWindowStartedAt: 'not-a-date' }),
        ),
      ).toThrow(/restWindowStartedAt/);
    });

    it('validates tripId for BATTERY_START_PROXY_EXTRACT', () => {
      const tripId = 'cltrip123456789012345678901';
      const payload = validateBatteryV2JobPayload(
        'BATTERY_START_PROXY_EXTRACT',
        validBase({ tripId }),
      );
      expect(payload).toMatchObject({ tripId });
    });

    it('rejects invalid tripId', () => {
      expect(() =>
        validateBatteryV2JobPayload(
          'BATTERY_START_PROXY_EXTRACT',
          validBase({ tripId: 'x' }),
        ),
      ).toThrow(/tripId/);
    });
  });

  describe('buildBatteryV2AttemptContext', () => {
    it('defaults attemptNumber to 1', () => {
      const ctx = buildBatteryV2AttemptContext({ maxAttempts: 3 });
      expect(ctx.attemptNumber).toBe(1);
      expect(ctx.maxAttempts).toBe(3);
      expect(ctx.previousFailureCode).toBeNull();
      expect(new Date(ctx.enqueuedAt).getTime()).not.toBeNaN();
    });
  });
});
