#!/usr/bin/env npx ts-node
/**
 * Operator-only: ensure di_v0_s4_control GLOBAL row exists in KILLED state.
 * Never creates NOT_KILLED. Not invoked from application bootstrap.
 */
import { PrismaClient } from '@prisma/client';
import { initializeDiV0S4GlobalKillRow } from '../../src/modules/vehicle-intelligence/driving-intelligence/s4a-foundation/di-v0-s4-control-kill-initializer';

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const result = await initializeDiV0S4GlobalKillRow(prisma, {
      reason: process.env.DI_S4_KILL_INIT_REASON ?? 'OPERATOR_GLOBAL_KILL_ROW_INIT',
      actor: process.env.DI_S4_KILL_INIT_ACTOR ?? 'di-v0-s4-initialize-global-kill-row',
    });
    console.log(`DI_V0_S4_GLOBAL_KILL_INIT_RESULT=${result.outcome}`);
    if (result.outcome === 'REFUSED_NOT_KILLED' || result.outcome === 'REFUSED_MALFORMED') {
      process.exitCode = 1;
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
