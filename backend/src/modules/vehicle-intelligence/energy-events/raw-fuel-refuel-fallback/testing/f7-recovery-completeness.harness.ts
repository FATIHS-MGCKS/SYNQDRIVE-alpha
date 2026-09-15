export {
  assertIsolatedDatabaseUrl,
  backdateEnergyEventObservation,
  buildF5Pr3Stack,
  buildF5Pr3StackWithQueue,
  cleanupVehicle,
  countEffectiveQueueJobs,
  countFallbackVee,
  countOperationalEnrichmentOwners,
  countPromoted,
  countReconciliationRows,
  F5_PR3_G2_CUTOVER,
  F5_PR3_SETTLED_OBSERVATION_AT,
  nativeSameSiblingFromCandidate,
  persistReadyCandidate,
  promoteCandidateViaRuntime,
  seedOrgVehicle,
  setFullAuthorizedFlags,
  setRfrfFlags,
  syntheticRiseSamples,
  assertBothForensicRowsRetained,
} from './f5-pr3-g2-handoff.harness';
export {
  createIsolatedTestQueue,
  drainTestQueue,
  probeRedis,
  redisConnectionOptions,
} from '../../testing/physical-refuel-g21d-final-integration.harness';
export { findPhysicalRefuelRecoveryWork } from '../../physical-refuel-recovery.repository';
export { countPhysicalRefuelRecoveryBacklog } from '../../physical-refuel-recovery.repository';

export const RAW_FUEL_REFUEL_F7_INTEGRATION_ENV = 'RAW_FUEL_REFUEL_F7_INTEGRATION';
export const RAW_FUEL_REFUEL_F7_POSTGRES_REQUIRED_ENV = 'RAW_FUEL_REFUEL_F7_POSTGRES_REQUIRED';
export const RAW_FUEL_REFUEL_F7_REDIS_REQUIRED_ENV = 'RAW_FUEL_REFUEL_F7_REDIS_REQUIRED';

export const F7_RECOVERY_AS_OF_MS = Date.parse('2026-09-07T00:00:00.000Z');

export function isF7LiveIntegration(): boolean {
  return process.env[RAW_FUEL_REFUEL_F7_INTEGRATION_ENV] === '1';
}

export function isF7PostgresRequired(): boolean {
  return process.env[RAW_FUEL_REFUEL_F7_POSTGRES_REQUIRED_ENV] === '1';
}

export function isF7RedisRequired(): boolean {
  return process.env[RAW_FUEL_REFUEL_F7_REDIS_REQUIRED_ENV] === '1';
}
