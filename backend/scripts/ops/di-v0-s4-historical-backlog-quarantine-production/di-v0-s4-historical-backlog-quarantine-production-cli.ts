#!/usr/bin/env ts-node
/**
 * EXP021-S4P9B — Historical PENDING backlog quarantine (operator-only; no provider calls).
 */
import { PrismaClient } from '@prisma/client';
import {
  DI_S4_HISTORICAL_BACKLOG_QUARANTINE_ACK_ENV,
  applyHistoricalBacklogQuarantine,
  evaluateHistoricalBacklogQuarantinePreflight,
  evaluateHistoricalBacklogSafetyProof,
  loadAllWorkItemSnapshots,
  loadScopedWorkItemSnapshots,
  parseHistoricalBacklogManifestFromEnv,
  readGlobalKillStateForQuarantine,
} from './di-v0-s4-historical-backlog-quarantine-production.lib';

function auditFromEnv(): { reason: string; actor: string } {
  return {
    reason: (process.env.DI_S4_HISTORICAL_BACKLOG_OPERATOR_REASON ?? '').trim(),
    actor: (process.env.DI_S4_HISTORICAL_BACKLOG_OPERATOR_ACTOR ?? '').trim(),
  };
}

async function main(): Promise<void> {
  const [cmd] = process.argv.slice(2);
  const manifest = parseHistoricalBacklogManifestFromEnv(process.env);
  if (!manifest) {
    console.log('MANIFEST_INVALID=YES');
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    switch (cmd) {
      case 'preflight':
      case 'safety-proof': {
        const globalKillState = await readGlobalKillStateForQuarantine(prisma);
        const globalRows = await loadAllWorkItemSnapshots(prisma);
        const scopedRows = await loadScopedWorkItemSnapshots(prisma, manifest);
        if (cmd === 'preflight') {
          const r = evaluateHistoricalBacklogQuarantinePreflight({
            ack: process.env[DI_S4_HISTORICAL_BACKLOG_QUARANTINE_ACK_ENV],
            globalKillState,
            manifest,
            globalRows,
            scopedRows,
          });
          if (!r.ok) {
            console.log(`QUARANTINE_PREFLIGHT_FAILURES=${r.failures.join(',')}`);
            process.exit(1);
          }
          console.log('QUARANTINE_PREFLIGHT_OK=YES');
          console.log(`QUARANTINE_PENDING_COUNT=${manifest.quarantineWorkItemIds.length}`);
          break;
        }
        const safety = evaluateHistoricalBacklogSafetyProof({ manifest, globalRows, scopedRows });
        console.log(`BACKLOG_CLAIMABLE_COUNT=${safety.claimableCount}`);
        if (!safety.ok) {
          console.log(`BACKLOG_SAFETY_FAILURES=${safety.failures.join(',')}`);
          process.exit(1);
        }
        console.log('BACKLOG_SAFETY_OK=YES');
        break;
      }
      case 'apply': {
        const audit = auditFromEnv();
        if (!audit.actor || !audit.reason) {
          console.log('AUDIT_FIELDS_MISSING=YES');
          process.exit(1);
        }
        if (process.env.DI_S4_HISTORICAL_BACKLOG_FIXTURE_MODE === '1') {
          console.log('QUARANTINE_OUTCOME=FIXTURE_NO_DB_MUTATION');
          process.exit(0);
        }
        const result = await applyHistoricalBacklogQuarantine(prisma, manifest, audit, {
          ack: process.env[DI_S4_HISTORICAL_BACKLOG_QUARANTINE_ACK_ENV],
        });
        if (result.outcome === 'REFUSED') {
          console.log(`QUARANTINE_FAILURES=${result.failures.join(',')}`);
          process.exit(1);
        }
        console.log('QUARANTINE_OUTCOME=QUARANTINED');
        console.log(`SUPERSEDED_COUNT=${result.supersededIds.length}`);
        console.log(`ALREADY_SUPERSEDED_COUNT=${result.alreadySupersededIds.length}`);
        break;
      }
      default:
        console.log('USAGE=preflight|safety-proof|apply');
        process.exit(1);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
