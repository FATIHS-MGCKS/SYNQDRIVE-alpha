import type { BatteryV2JobType } from './battery-v2-job.types';
import { BATTERY_V2_JOB_IDENTITY_PREFIX } from './battery-v2-job-idempotency.policy';
import { BatteryV2JobValidationError } from './battery-v2-job.validation';

const OBSERVATION_PREFIXES = [
  `${BATTERY_V2_JOB_IDENTITY_PREFIX.observation}:`,
  `${BATTERY_V2_JOB_IDENTITY_PREFIX.hvSnapshot}:`,
] as const;

export function validateBatteryV2JobIdempotencyKey(
  jobType: BatteryV2JobType,
  idempotencyKey: string,
): void {
  if (!idempotencyKey || idempotencyKey.trim().length === 0) {
    throw new BatteryV2JobValidationError('idempotencyKey is required', 'idempotencyKey');
  }

  const key = idempotencyKey.trim();

  switch (jobType) {
    case 'BATTERY_OBSERVATION_CLASSIFY':
      if (!OBSERVATION_PREFIXES.some((prefix) => key.startsWith(prefix))) {
        throw new BatteryV2JobValidationError(
          `idempotencyKey must start with ${OBSERVATION_PREFIXES.join(' or ')}`,
          'idempotencyKey',
        );
      }
      return;
    case 'BATTERY_REST_TARGET_EVALUATE': {
      const restPrefixes = [
        `${BATTERY_V2_JOB_IDENTITY_PREFIX.restTarget}:`,
        `${BATTERY_V2_JOB_IDENTITY_PREFIX.batteryRest}:`,
      ];
      if (!restPrefixes.some((prefix) => key.startsWith(prefix))) {
        throw new BatteryV2JobValidationError(
          `idempotencyKey must start with ${restPrefixes.join(' or ')}`,
          'idempotencyKey',
        );
      }
      return;
    }
    case 'BATTERY_START_PROXY_EXTRACT':
      if (!key.startsWith(`${BATTERY_V2_JOB_IDENTITY_PREFIX.startProxy}:`)) {
        throw new BatteryV2JobValidationError(
          `idempotencyKey must start with ${BATTERY_V2_JOB_IDENTITY_PREFIX.startProxy}:`,
          'idempotencyKey',
        );
      }
      return;
    case 'BATTERY_ASSESSMENT_RECOMPUTE':
      if (!key.startsWith(`${BATTERY_V2_JOB_IDENTITY_PREFIX.assessment}:`)) {
        throw new BatteryV2JobValidationError(
          `idempotencyKey must start with ${BATTERY_V2_JOB_IDENTITY_PREFIX.assessment}:`,
          'idempotencyKey',
        );
      }
      return;
    case 'BATTERY_PUBLICATION_UPDATE':
      if (!key.startsWith(`${BATTERY_V2_JOB_IDENTITY_PREFIX.publication}:`)) {
        throw new BatteryV2JobValidationError(
          `idempotencyKey must start with ${BATTERY_V2_JOB_IDENTITY_PREFIX.publication}:`,
          'idempotencyKey',
        );
      }
      return;
    case 'HV_RECHARGE_SESSION_RECONCILE':
      if (!key.startsWith(`${BATTERY_V2_JOB_IDENTITY_PREFIX.hvSession}:`)) {
        throw new BatteryV2JobValidationError(
          `idempotencyKey must start with ${BATTERY_V2_JOB_IDENTITY_PREFIX.hvSession}:`,
          'idempotencyKey',
        );
      }
      return;
    case 'HV_CAPACITY_SHADOW_RECOMPUTE':
      if (!key.startsWith(`${BATTERY_V2_JOB_IDENTITY_PREFIX.hvCapacity}:`)) {
        throw new BatteryV2JobValidationError(
          `idempotencyKey must start with ${BATTERY_V2_JOB_IDENTITY_PREFIX.hvCapacity}:`,
          'idempotencyKey',
        );
      }
      return;
    case 'HV_CAPABILITY_REFRESH':
      if (!key.startsWith(`${BATTERY_V2_JOB_IDENTITY_PREFIX.capability}:`)) {
        throw new BatteryV2JobValidationError(
          `idempotencyKey must start with ${BATTERY_V2_JOB_IDENTITY_PREFIX.capability}:`,
          'idempotencyKey',
        );
      }
      return;
    default:
      return;
  }
}
