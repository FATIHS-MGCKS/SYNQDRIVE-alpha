import type { PrismaClient } from '@prisma/client';
import type { DiV0S4ControlPlaneConfig } from '../s4a-foundation/di-v0-s4a-control-plane';
import { DiV0S4ExecutorRegistry } from '../s4b-orchestration/di-v0-s4b-executor.port';
import { DiV0S4cExecutor } from './di-v0-s4c-executor';
import type { DiV0S4cAcquisitionPorts } from './di-v0-s4c-types';

/** Composition helper only — not wired into AppModule (dormant runtime). */
export function registerDiV0S4cExecutor(
  registry: DiV0S4ExecutorRegistry,
  deps: { prisma: PrismaClient; controlPlane: DiV0S4ControlPlaneConfig; ports: DiV0S4cAcquisitionPorts },
): DiV0S4cExecutor {
  const executor = new DiV0S4cExecutor(deps);
  registry.register(executor);
  return executor;
}
