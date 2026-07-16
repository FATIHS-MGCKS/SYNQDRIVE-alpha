import {
  DRIVING_INTELLIGENCE_JOB_ERROR_CODES,
  DrivingIntelligenceJobPermanentError,
  DrivingIntelligenceJobRetryableError,
  classifyDrivingIntelligenceJobError,
} from './driving-intelligence-jobs.errors';

describe('driving-intelligence-jobs.errors', () => {
  it('classifies provider timeout as retryable PROVIDER_TRANSIENT', () => {
    const result = classifyDrivingIntelligenceJobError(new Error('DIMO request timeout after 30s'));
    expect(result.code).toBe(DRIVING_INTELLIGENCE_JOB_ERROR_CODES.PROVIDER_TRANSIENT);
    expect(result.retryable).toBe(true);
  });

  it('does not classify provider timeout as INSUFFICIENT_DATA', () => {
    const result = classifyDrivingIntelligenceJobError(new Error('provider unavailable: 503'));
    expect(result.code).not.toBe(DRIVING_INTELLIGENCE_JOB_ERROR_CODES.INSUFFICIENT_DATA);
  });

  it('classifies validation errors as permanent', () => {
    const result = classifyDrivingIntelligenceJobError(
      new DrivingIntelligenceJobPermanentError(
        DRIVING_INTELLIGENCE_JOB_ERROR_CODES.VALIDATION_FAILED,
        'invalid payload',
      ),
    );
    expect(result.retryable).toBe(false);
    expect(result.code).toBe(DRIVING_INTELLIGENCE_JOB_ERROR_CODES.VALIDATION_FAILED);
  });

  it('preserves explicit retryable error codes', () => {
    const result = classifyDrivingIntelligenceJobError(
      new DrivingIntelligenceJobRetryableError(
        DRIVING_INTELLIGENCE_JOB_ERROR_CODES.PROVIDER_RATE_LIMITED,
        '429',
      ),
    );
    expect(result.retryable).toBe(true);
    expect(result.code).toBe(DRIVING_INTELLIGENCE_JOB_ERROR_CODES.PROVIDER_RATE_LIMITED);
  });

  it('classifies genuine missing data separately from provider failures', () => {
    const result = classifyDrivingIntelligenceJobError(new Error('insufficient native events for trip'));
    expect(result.code).toBe(DRIVING_INTELLIGENCE_JOB_ERROR_CODES.INSUFFICIENT_DATA);
    expect(result.retryable).toBe(false);
  });
});
