import { randomUUID } from 'crypto';
import type { PrismaClient } from '@prisma/client';
import type { DiV0S4ControlPlaneConfig } from '../../s4a-foundation/di-v0-s4a-control-plane';
import { DiV0S4WorkItemRepository } from '../../s4a-foundation/di-v0-s4a-work-item.repository';
import { DiV0S4ClaimLoop } from '../../s4b-orchestration/di-v0-s4b-claim-loop';
import { DiV0S4DiscoveryService } from '../../s4b-orchestration/di-v0-s4b-discovery.service';
import { DiV0S4ExecutorRegistry, type DiV0S4ExecutionContext } from '../../s4b-orchestration/di-v0-s4b-executor.port';
import type { buildDiV0S4RuntimePipelineManifest } from '../../s4b-orchestration/di-v0-s4b-pipeline-manifest';
import { DiV0S4cExecutor, DI_V0_S4C_EXECUTOR_ID } from '../../s4c-executor/di-v0-s4c-executor';
import type { DiV0S4cExecutorDeps } from '../../s4c-executor/di-v0-s4c-types';

export function registerS4dCrashOnceExecutor(
  registry: DiV0S4ExecutorRegistry,
  deps: DiV0S4cExecutorDeps,
): { inner: DiV0S4cExecutor } {
  const inner = new DiV0S4cExecutor(deps);
  let crashNextComplete = true;
  registry.register({
    executorId: DI_V0_S4C_EXECUTOR_ID,
    isReady: () => true,
    async execute(ctx: DiV0S4ExecutionContext) {
      const repo = ctx.repository;
      const proxy = Object.assign(Object.create(Object.getPrototypeOf(repo)), repo, {
        completeWithS2: async (...args: Parameters<DiV0S4WorkItemRepository['completeWithS2']>) => {
          if (crashNextComplete) {
            crashNextComplete = false;
            throw new Error('SIMULATED_CRASH_BEFORE_T06');
          }
          return repo.completeWithS2(...args);
        },
      });
      return inner.execute({ ...ctx, repository: proxy });
    },
  });
  return { inner };
}

export async function releaseS4dWorkItemsForRetry(db: PrismaClient, tripId: string): Promise<void> {
  await db.$executeRaw`
    UPDATE di_v0_s4_work_items
    SET status = 'FAILED_RETRYABLE', failure_class = 'RETRYABLE', failure_reason = 'SIMULATED_CRASH',
        lease_owner = NULL, lease_expires_at = NULL, lease_acquired_at = NULL,
        next_attempt_at = clock_timestamp() - interval '1 second'
    WHERE trip_id = ${tripId} AND pinned_snapshot_hash IS NOT NULL AND status <> 'COMPLETED'`;
}

export async function setupS4dTenantRun(
  admin: PrismaClient,
  tenant: { organizationId: string; vehicleId: string; tripId: string },
  config: DiV0S4ControlPlaneConfig,
  pipeline: ReturnType<typeof buildDiV0S4RuntimePipelineManifest>,
  deps: DiV0S4cExecutorDeps,
  runDiscovery = true,
): Promise<{ db: PrismaClient; repo: DiV0S4WorkItemRepository; loop: DiV0S4ClaimLoop }> {
  const db = deps.prisma;
  const repo = new DiV0S4WorkItemRepository(db, config);
  if (runDiscovery) {
    await new DiV0S4DiscoveryService(db, repo, config, pipeline).runDiscoveryPass();
  }
  const registry = new DiV0S4ExecutorRegistry();
  registerS4dCrashOnceExecutor(registry, deps);
  const loop = new DiV0S4ClaimLoop(repo, config, pipeline, registry, {
    leaseOwner: `s4d-${randomUUID().slice(0, 8)}`,
  });
  return { db, repo, loop };
}
