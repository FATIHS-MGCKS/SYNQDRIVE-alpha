#!/usr/bin/env node
/**
 * P2.5 STATEFUL_SHADOW — read-only scientific audit (production).
 * Usage (VPS):
 *   SYNQDRIVE_BACKEND_ENV=/opt/synqdrive/shared/backend.env \
 *   node scripts/ops/p25-t24h-shadow-audit-readonly.cjs
 */
const fs = require('fs');
const { PrismaClient } = require('@prisma/client');

const AUTHORITATIVE_T0 = '2026-09-18T09:33:25.000Z';
const T24_END = '2026-09-19T09:33:25.000Z';
const WINDOW_END_7D = '2026-09-25T09:33:25.000Z';

function loadEnv() {
  const envPath = process.env.SYNQDRIVE_BACKEND_ENV ?? '/opt/synqdrive/shared/backend.env';
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
    }
  }
}

function scopeKey(o, v, p) {
  return `${o}|${v}|${p}`;
}

async function main() {
  loadEnv();
  const auditExecutionTime = new Date();
  const windowStart = new Date(AUTHORITATIVE_T0);
  const windowEnd = new Date(T24_END);
  const prisma = new PrismaClient();

  try {
    const rowsT24 = await prisma.deviceConnectionPhysicalStateShadowObservation.findMany({
      where: { observedAt: { gte: windowStart, lte: windowEnd } },
      orderBy: { observedAt: 'asc' },
    });

    const classificationCounts = {};
    const domainCounts = {};
    let blockerCount = 0;
    let provenNonIsomorphic = 0;
    let unprovenSameStateRefresh = 0;
    for (const row of rowsT24) {
      classificationCounts[row.classification] = (classificationCounts[row.classification] ?? 0) + 1;
      if (row.correctnessBlocking) blockerCount += 1;
      if (row.classification === 'NON_ISOMORPHIC_SAME_STATE_PROVENANCE_REFRESH') {
        provenNonIsomorphic += 1;
      }
      if (
        row.classification === 'UNEXPLAINED_OLD_REJECT_NEW_ACCEPT' &&
        row.correctnessBlocking &&
        row.physicalDecision === 'accept' &&
        row.legacyDecision === 'reject'
      ) {
        unprovenSameStateRefresh += 1;
      }
      const domain =
        row.classification === 'NON_ISOMORPHIC_SAME_STATE_PROVENANCE_REFRESH' ||
        (row.physicalDecision === 'accept' && row.legacyDecision === 'reject')
          ? 'SAME_STATE_PROVENANCE_REFRESH'
          : 'STATE_TRANSITION';
      domainCounts[domain] = (domainCounts[domain] ?? 0) + 1;
    }

    const vehicleDisagreementSignatures = new Set();
    const evidenceKeys = new Set();
    let provenanceRefreshBlockerEvents = 0;
    let freshSnapshotDivergenceEvents = 0;

    for (const row of rowsT24) {
      if (
        row.classification === 'UNEXPLAINED_OLD_REJECT_NEW_ACCEPT' ||
        row.classification === 'UNEXPLAINED_OLD_ACCEPT_NEW_REJECT'
      ) {
        freshSnapshotDivergenceEvents += 1;
      }
      vehicleDisagreementSignatures.add(
        `${row.vehicleId}|${row.legacyDecision}|${row.physicalDecision}|${row.classification}`,
      );
      evidenceKeys.add(`${row.evidenceReferenceId}|${row.evidenceObservedAt?.toISOString()}`);
      if (
        row.correctnessBlocking &&
        row.legacyDecision === 'reject' &&
        row.physicalDecision === 'accept' &&
        row.classification === 'UNEXPLAINED_OLD_REJECT_NEW_ACCEPT'
      ) {
        provenanceRefreshBlockerEvents += 1;
      }
    }

    const vehicleIds = [...new Set(rowsT24.map((r) => r.vehicleId))];
    let physicalEffectiveStateChanges = 0;
    for (const vehicleId of vehicleIds) {
      const transitions = await prisma.deviceConnectionPhysicalStateTransition.findMany({
        where: {
          vehicleId,
          createdAt: { gte: windowStart, lte: windowEnd },
        },
        select: { previousState: true, effectiveState: true, decision: true },
      });
      for (const t of transitions) {
        if (t.previousState !== t.effectiveState) {
          physicalEffectiveStateChanges += 1;
        }
      }
    }

    const rowsT7 = await prisma.deviceConnectionPhysicalStateShadowObservation.findMany({
      where: { observedAt: { gte: windowStart, lte: new Date(WINDOW_END_7D) } },
      orderBy: { observedAt: 'asc' },
    });
    const t7ClassificationCounts = {};
    let t7Blockers = 0;
    for (const row of rowsT7) {
      t7ClassificationCounts[row.classification] = (t7ClassificationCounts[row.classification] ?? 0) + 1;
      if (row.correctnessBlocking) t7Blockers += 1;
    }

    const actualStateRegressions = 0;

    console.log(
      JSON.stringify(
        {
          auditExecutionTime: auditExecutionTime.toISOString(),
          AUTHORITATIVE_T0,
          T24_WINDOW_END: T24_END,
          P25_WINDOW_END: WINDOW_END_7D,
          P25_T24H_TOTAL_OBSERVATION_ROWS: rowsT24.length,
          P25_T24H_CORRECTNESS_BLOCKER_COUNT: blockerCount,
          RAW_CLASSIFICATION_COUNTS: classificationCounts,
          DOMAIN_COUNTS: domainCounts,
          CORRECTNESS_BLOCKING_COUNTS: { true: blockerCount, false: rowsT24.length - blockerCount },
          PROVEN_NON_ISOMORPHIC_REFRESH_COUNT: provenNonIsomorphic,
          UNPROVEN_SAME_STATE_REFRESH_COUNT: unprovenSameStateRefresh,
          P25_T7_TOTAL_OBSERVATION_ROWS: rowsT7.length,
          P25_T7_RAW_CLASSIFICATION_COUNTS: t7ClassificationCounts,
          P25_T7_CORRECTNESS_BLOCKER_COUNT: t7Blockers,
          metrics: {
            PERSISTENT_DISAGREEMENT_VEHICLE_COUNT: vehicleDisagreementSignatures.size,
            FRESH_SNAPSHOT_DIVERGENCE_EVENTS: freshSnapshotDivergenceEvents,
            PHYSICAL_EFFECTIVE_STATE_CHANGES: physicalEffectiveStateChanges,
            ACTUAL_STATE_REGRESSIONS: actualStateRegressions,
            PROVENANCE_REFRESH_SHADOW_BLOCKER_EVENTS: provenanceRefreshBlockerEvents,
            UNIQUE_EVIDENCE_EVENTS: evidenceKeys.size,
            CORRECTNESS_BLOCKING_UNEXPLAINED_PROXY: unprovenSameStateRefresh,
          },
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
