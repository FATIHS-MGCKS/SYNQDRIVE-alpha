#!/usr/bin/env ts-node
/**
 * EXP021 P2.1 — V1 vs V2 speed QC on one pinned trip (read-only DB, in-memory only).
 */
import { PrismaClient } from '@prisma/client';
import { loadP21ForensicContextInReadOnlyTransaction } from '../../src/modules/vehicle-intelligence/driving-intelligence/trip-speed-quality/di-v0-p21-r3-forensic-loader';
import { runP21V1V2PolicyCompareOnLoadedContext } from './exp021-p21-p1-v2-policy-compare.lib';

const ORG = process.env.EXP021_P21_ORG_ID;
const TRIP = process.env.EXP021_P21_TRIP_ID;
const WI = process.env.EXP021_P21_WORK_ITEM_ID;

function req(name: string, v: string | undefined): string {
  if (!v) throw new Error(`missing env ${name}`);
  return v;
}

async function main(): Promise<void> {
  const organizationId = req('EXP021_P21_ORG_ID', ORG);
  const tripId = req('EXP021_P21_TRIP_ID', TRIP);
  const workItemId = req('EXP021_P21_WORK_ITEM_ID', WI);

  const prisma = new PrismaClient();
  try {
    const ctx = await loadP21ForensicContextInReadOnlyTransaction(prisma, {
      organizationId,
      tripId,
      workItemId,
    });

    const compared = runP21V1V2PolicyCompareOnLoadedContext(ctx);

    const out = {
      schema: 'EXP021_P21_P1_V2_POLICY_COMPARE_V1',
      diagnosisBaseSha: process.env.EXP021_DIAGNOSIS_BASE_SHA ?? null,
      executionMode: 'LIVE_READONLY_DB',
      dbSession: {
        transactionReadOnly: ctx.dbTransactionReadOnly,
        transactionIsolation: ctx.dbTransactionIsolation,
      },
      tripCompare: compared,
      stationaryCandidatesTotal: compared.stationaryCandidates,
      v2StationaryAccepted: compared.v2StationaryAccepted,
      v2StationaryWithheld: compared.v2StationaryWithheld,
      withheldReasonBreakdown: compared.withheldReasonBreakdown,
      changedIntervalsOutsideStationaryCandidates: compared.changesOutsideAllowedPath,
      regressionPass: compared.regressionPass,
    };

    process.stdout.write(JSON.stringify(out, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
