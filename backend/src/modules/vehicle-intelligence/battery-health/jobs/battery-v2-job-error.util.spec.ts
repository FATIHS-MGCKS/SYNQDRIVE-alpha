import {
  BATTERY_V2_JOB_ERROR_CODES,
  BatteryV2JobProcessingError,
  BatteryV2ProviderError,
} from './battery-v2-job.errors';
import { classifyBatteryV2JobError, sanitizeBatteryV2LogMessage } from './battery-v2-job-error.util';
import { BatteryV2VehicleLockContendedError } from './battery-v2-vehicle-lock.service';

describe('battery-v2-job-error.util', () => {
  it('redacts bearer tokens from log messages', () => {
    const sanitized = sanitizeBatteryV2LogMessage('failed Bearer eyJhbGciOiJIUzI1NiJ9.abc.def');
    expect(sanitized).not.toContain('eyJ');
    expect(sanitized).toContain('[redacted-token]');
  });

  it('classifies provider errors as retryable', () => {
    const result = classifyBatteryV2JobError(
      new BatteryV2ProviderError('DIMO GraphQL 503 unavailable'),
    );
    expect(result.code).toBe(BATTERY_V2_JOB_ERROR_CODES.PROVIDER_UNAVAILABLE);
    expect(result.retryable).toBe(true);
  });

  it('classifies lock contention as retryable transient', () => {
    const result = classifyBatteryV2JobError(
      new BatteryV2VehicleLockContendedError('veh-1', 'ingest'),
    );
    expect(result.code).toBe(BATTERY_V2_JOB_ERROR_CODES.LOCK_CONTENTION);
    expect(result.retryable).toBe(true);
  });

  it('classifies permanent config errors as non-retryable', () => {
    const result = classifyBatteryV2JobError(
      new BatteryV2JobProcessingError({
        code: BATTERY_V2_JOB_ERROR_CODES.PERMANENT_CONFIG,
        message: 'missing dimoTokenId for vehicle',
        retryable: false,
      }),
    );
    expect(result.retryable).toBe(false);
  });

  it('does not treat provider failures as empty data', () => {
    const result = classifyBatteryV2JobError(new Error('DIMO GraphQL 503 service unavailable'));
    expect(result.code).toBe(BATTERY_V2_JOB_ERROR_CODES.PROVIDER_UNAVAILABLE);
    expect(result.retryable).toBe(true);
  });
});
