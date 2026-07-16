import {
  buildBullJobId,
  validateDrivingIntelligenceJobPayload,
  validateEnqueueDrivingIntelligenceJobInput,
} from './driving-intelligence-jobs.contract';
import { DRIVING_INTELLIGENCE_JOB_TYPES } from './driving-intelligence-jobs.types';

function validPayload() {
  return {
    organizationId: 'org-1',
    vehicleId: 'vehicle-1',
    tripId: 'trip-1',
    analysisRunId: 'run-1',
    modelVersion: 'di-v1',
    idempotencyKey: 'idem-1',
    correlationId: 'corr-1',
    requestedAt: '2026-07-16T10:00:00.000Z',
  };
}

describe('driving-intelligence-jobs.contract', () => {
  it('accepts a valid payload envelope', () => {
    const result = validateDrivingIntelligenceJobPayload(validPayload());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.normalized.organizationId).toBe('org-1');
      expect(result.normalized.tripId).toBe('trip-1');
      expect(result.normalized.bookingId).toBeNull();
      expect(result.normalized.requestedAt.toISOString()).toBe('2026-07-16T10:00:00.000Z');
    }
  });

  it('rejects missing required fields', () => {
    const result = validateDrivingIntelligenceJobPayload({
      ...validPayload(),
      idempotencyKey: '',
      correlationId: ' ',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.map((i) => i.code)).toEqual(
        expect.arrayContaining(['MISSING_IDEMPOTENCY_KEY', 'MISSING_CORRELATION_ID']),
      );
    }
  });

  it('validates enqueue input job type against canonical list', () => {
    const ok = validateEnqueueDrivingIntelligenceJobInput({
      ...validPayload(),
      jobType: 'DRIVING_ROUTE_ENRICH',
    });
    expect(ok.ok).toBe(true);

    const bad = validateEnqueueDrivingIntelligenceJobInput({
      ...validPayload(),
      jobType: 'NOT_A_REAL_JOB' as any,
    });
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.issues[0]?.code).toBe('INVALID_JOB_TYPE');
    }
  });

  it('covers all 11 canonical job types', () => {
    expect(DRIVING_INTELLIGENCE_JOB_TYPES).toHaveLength(11);
    for (const jobType of DRIVING_INTELLIGENCE_JOB_TYPES) {
      const result = validateEnqueueDrivingIntelligenceJobInput({
        ...validPayload(),
        jobType,
      });
      expect(result.ok).toBe(true);
    }
  });

  it('builds deterministic bull job ids from persistent row id', () => {
    expect(buildBullJobId('abc-123')).toBe('di-abc-123');
  });
});
