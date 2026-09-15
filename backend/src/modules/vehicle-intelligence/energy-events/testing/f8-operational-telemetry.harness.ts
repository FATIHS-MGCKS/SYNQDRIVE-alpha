export {
  assertIsolatedDatabaseUrl,
  buildF5Pr3Stack,
  cleanupVehicle,
  countPhysicalRefuelRecoveryBacklog,
  F5_PR3_G2_CUTOVER,
  F5_PR3_SETTLED_OBSERVATION_AT,
  findPhysicalRefuelRecoveryWork,
  F7_RECOVERY_AS_OF_MS,
  promoteCandidateViaRuntime,
  seedOrgVehicle,
  setFullAuthorizedFlags,
  setRfrfFlags,
  syntheticRiseSamples,
} from '../raw-fuel-refuel-fallback/testing/f7-recovery-completeness.harness';
export { createPhysicalRefuelConfig } from './physical-refuel-g21d-final-integration.harness';

import { PrismaClient } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { TripMetricsService } from '@modules/observability/trip-metrics.service';
import { PhysicalRefuelReconciliationMetricsService } from '../physical-refuel-reconciliation-metrics.service';
import { PhysicalRefuelReconciliationRuntimeService } from '../physical-refuel-reconciliation-runtime.service';
import { PhysicalRefuelReconciliationRecoveryScheduler } from '@workers/schedulers/physical-refuel-reconciliation-recovery.scheduler';
import {
  buildF5Pr3Stack,
  F5_PR3_G2_CUTOVER,
  type F5Pr3Stack,
} from '../raw-fuel-refuel-fallback/testing/f5-pr3-g2-handoff.harness';
import { createPhysicalRefuelConfig } from './physical-refuel-g21d-final-integration.harness';

export const RAW_FUEL_REFUEL_F8_INTEGRATION_ENV = 'RAW_FUEL_REFUEL_F8_INTEGRATION';
export const RAW_FUEL_REFUEL_F8_POSTGRES_REQUIRED_ENV = 'RAW_FUEL_REFUEL_F8_POSTGRES_REQUIRED';

export function isF8LiveIntegration(): boolean {
  return process.env[RAW_FUEL_REFUEL_F8_INTEGRATION_ENV] === '1';
}

export function isF8PostgresRequired(): boolean {
  return process.env[RAW_FUEL_REFUEL_F8_POSTGRES_REQUIRED_ENV] === '1';
}

export interface F8ObservabilityStack {
  stack: F5Pr3Stack;
  tripMetrics: TripMetricsService;
  physicalRefuelMetrics: PhysicalRefuelReconciliationMetricsService;
  g2Runtime: PhysicalRefuelReconciliationRuntimeService;
}

export function buildF8ObservabilityStack(
  prisma: PrismaClient,
  fetchFuelLevelSamples: jest.Mock,
): F8ObservabilityStack {
  const tripMetrics = new TripMetricsService();
  const physicalRefuelMetrics = new PhysicalRefuelReconciliationMetricsService(tripMetrics);
  const g2Runtime = new PhysicalRefuelReconciliationRuntimeService(
    prisma as unknown as PrismaService,
    createPhysicalRefuelConfig() as never,
    { cutoverAt: new Date(F5_PR3_G2_CUTOVER), enabled: true } as never,
    undefined,
    undefined,
    physicalRefuelMetrics,
  );
  const stack = buildF5Pr3Stack(prisma, fetchFuelLevelSamples, { g2Runtime });
  return { stack, tripMetrics, physicalRefuelMetrics, g2Runtime: stack.g2Runtime };
}

export function buildF8RecoveryScheduler(
  runtime: PhysicalRefuelReconciliationRuntimeService,
  metrics: PhysicalRefuelReconciliationMetricsService,
  config?: Partial<ReturnType<typeof createPhysicalRefuelConfig>>,
): PhysicalRefuelReconciliationRecoveryScheduler {
  return new PhysicalRefuelReconciliationRecoveryScheduler(
    { ...createPhysicalRefuelConfig(), ...config } as never,
    runtime,
    metrics,
  );
}

export async function readGaugeValue(
  tripMetrics: TripMetricsService,
  name: string,
  labels: Record<string, string>,
): Promise<number> {
  const metricsJson = await tripMetrics.registry.getMetricsAsJSON();
  const metric = metricsJson.find((m) => m.name === name);
  const sample = metric?.values.find((v) =>
    Object.entries(labels).every(([k, val]) => v.labels?.[k] === val),
  );
  return sample?.value ?? 0;
}

export async function readCounterValue(
  tripMetrics: TripMetricsService,
  name: string,
  labels: Record<string, string>,
): Promise<number> {
  return readGaugeValue(tripMetrics, name, labels);
}

export async function assertMetricsExportContainsF8(tripMetrics: TripMetricsService): Promise<void> {
  const text = await tripMetrics.getMetrics();
  expect(text).toContain('synqdrive_physical_refuel_recovery_backlog');
  expect(text).toContain('synqdrive_physical_refuel_recovery_enabled');
  expect(text).toContain('synqdrive_physical_refuel_recovery_runs_total');
  expect(text).toContain('synqdrive_physical_refuel_recovery_last_success_unixtime');
}
