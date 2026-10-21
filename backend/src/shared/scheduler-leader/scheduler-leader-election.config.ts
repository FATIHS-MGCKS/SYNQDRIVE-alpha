import { registerAs } from '@nestjs/config';

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value?.trim()) return fallback;
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') return fallback;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

export interface SchedulerLeaderElectionConfigShape {
  enabled: boolean;
  leaseMs: number;
  renewIntervalMs: number;
  acquireIntervalMs: number;
}

export const SCHEDULER_LEADER_DEFAULTS = {
  enabled: true,
  leaseMs: 30_000,
  renewIntervalMs: 10_000,
  acquireIntervalMs: 5_000,
} as const;

export const SCHEDULER_LEADER_MIN_LEASE_MS = 5_000;

export default registerAs(
  'schedulerLeaderElection',
  (): SchedulerLeaderElectionConfigShape => ({
    enabled: parseBool(
      process.env.SCHEDULER_LEADER_ELECTION_ENABLED,
      SCHEDULER_LEADER_DEFAULTS.enabled,
    ),
    leaseMs: parsePositiveInt(
      process.env.SCHEDULER_LEADER_LEASE_MS,
      SCHEDULER_LEADER_DEFAULTS.leaseMs,
    ),
    renewIntervalMs: parsePositiveInt(
      process.env.SCHEDULER_LEADER_RENEW_INTERVAL_MS,
      SCHEDULER_LEADER_DEFAULTS.renewIntervalMs,
    ),
    acquireIntervalMs: parsePositiveInt(
      process.env.SCHEDULER_LEADER_ACQUIRE_INTERVAL_MS,
      SCHEDULER_LEADER_DEFAULTS.acquireIntervalMs,
    ),
  }),
);

export function validateSchedulerLeaderElectionConfig(
  config: SchedulerLeaderElectionConfigShape,
): string[] {
  const errors: string[] = [];
  if (config.leaseMs < SCHEDULER_LEADER_MIN_LEASE_MS) {
    errors.push(
      `SCHEDULER_LEADER_LEASE_MS must be >= ${SCHEDULER_LEADER_MIN_LEASE_MS}`,
    );
  }
  if (config.renewIntervalMs <= 0) {
    errors.push('SCHEDULER_LEADER_RENEW_INTERVAL_MS must be > 0');
  }
  if (config.acquireIntervalMs <= 0) {
    errors.push('SCHEDULER_LEADER_ACQUIRE_INTERVAL_MS must be > 0');
  }
  if (config.renewIntervalMs >= config.leaseMs) {
    errors.push(
      'SCHEDULER_LEADER_RENEW_INTERVAL_MS must be < SCHEDULER_LEADER_LEASE_MS',
    );
  }
  const safetyMarginMs = config.leaseMs - config.renewIntervalMs;
  if (config.enabled && safetyMarginMs < 2_000) {
    errors.push(
      'SCHEDULER_LEADER lease renew interval must leave at least 2000ms safety margin below lease TTL',
    );
  }
  return errors;
}
