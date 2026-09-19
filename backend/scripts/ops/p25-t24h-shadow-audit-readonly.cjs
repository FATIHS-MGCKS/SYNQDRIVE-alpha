#!/usr/bin/env node
/**
 * P2.5 STATEFUL_SHADOW — read-only T+24h scientific audit (production).
 * Usage (VPS):
 *   SYNQDRIVE_BACKEND_ENV=/opt/synqdrive/shared/backend.env \
 *   node scripts/ops/p25-t24h-shadow-audit-readonly.cjs
 */
const fs = require('fs');
const { PrismaClient } = require('@prisma/client');

const AUTHORITATIVE_T0 = '2026-09-18T09:33:25.000Z';
const T24_END = '2026-09-19T09:33:25.000Z';
const WINDOW_END_7D = '2026-09-25T09:33:25.000Z';
const START_SHA = 'ca7bad8826871376a58efaa874f12992b88c4a04';
const ARTEON_ID = '8c850ff1-4201-432b-af2e-2711dbc7ca48';
const ORG_ID = 'faa710c9-6d91-4079-a7d5-91fdccdec14a';
const FAILED_T0 = '2026-09-18T00:02:53.207Z';

const PILOT_SCOPES = [
  { organizationId: ORG_ID, vehicleId: 'a60c0749-a7cd-494e-b5b9-dea3c6b97d63', provider: 'DIMO' },
  { organizationId: ORG_ID, vehicleId: ARTEON_ID, provider: 'DIMO' },
  { organizationId: ORG_ID, vehicleId: '19fedd4b-c4e8-4de8-a125-dab293326e7e', provider: 'DIMO' },
  { organizationId: ORG_ID, vehicleId: 'c10351f8-b6a2-4258-947f-631aeaa6d359', provider: 'DIMO' },
];

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
    const t0File = fs.existsSync('/opt/synqdrive/shared/p25-new-pilot-restart-t0.txt')
      ? fs.readFileSync('/opt/synqdrive/shared/p25-new-pilot-restart-t0.txt', 'utf8').trim()
      : null;

    const rowsT24 = await prisma.deviceConnectionPhysicalStateShadowObservation.findMany({
      where: {
        observedAt: { gte: windowStart, lte: windowEnd },
      },
      orderBy: { observedAt: 'asc' },
    });

    const rowsTail = await prisma.deviceConnectionPhysicalStateShadowObservation.findMany({
      where: {
        observedAt: { gt: windowEnd, lte: auditExecutionTime },
      },
      orderBy: { observedAt: 'asc' },
    });

    const preT0ObsCount = await prisma.deviceConnectionPhysicalStateShadowObservation.count({
      where: {
        observedAt: { lt: windowStart },
      },
    });

    const classificationCounts = {};
    let blockerCount = 0;
    const blockers = [];
    for (const row of rowsT24) {
      classificationCounts[row.classification] = (classificationCounts[row.classification] ?? 0) + 1;
      if (row.correctnessBlocking) {
        blockerCount += 1;
        blockers.push(row);
      }
    }

    const scopesSeen = new Set(rowsT24.map((r) => scopeKey(r.organizationId, r.vehicleId, r.provider)));
    const vehiclesSeen = new Set(rowsT24.map((r) => r.vehicleId));

    const perScope = {};
    for (const s of PILOT_SCOPES) {
      const key = scopeKey(s.organizationId, s.vehicleId, s.provider);
      const scopeRows = rowsT24.filter(
        (r) =>
          r.organizationId === s.organizationId &&
          r.vehicleId === s.vehicleId &&
          r.provider === s.provider,
      );
      const legacy = {};
      const physical = {};
      const cls = {};
      for (const r of scopeRows) {
        legacy[r.legacyDecision] = (legacy[r.legacyDecision] ?? 0) + 1;
        physical[r.physicalDecision] = (physical[r.physicalDecision] ?? 0) + 1;
        cls[r.classification] = (cls[r.classification] ?? 0) + 1;
      }
      perScope[key] = {
        vehicleId: s.vehicleId,
        observationCount: scopeRows.length,
        firstObservationAt: scopeRows[0]?.observedAt?.toISOString() ?? null,
        lastObservationAt: scopeRows[scopeRows.length - 1]?.observedAt?.toISOString() ?? null,
        legacyDecisionCounts: legacy,
        physicalDecisionCounts: physical,
        classificationCounts: cls,
      };
    }

    const preT0EvidencePostT0 = rowsT24.filter(
      (r) => r.evidenceObservedAt && r.evidenceObservedAt < windowStart,
    );

    const arteonPhysical = await prisma.deviceConnectionPhysicalState.findFirst({
      where: { vehicleId: ARTEON_ID, organizationId: ORG_ID, provider: 'DIMO' },
    });
    const arteonTransitions = await prisma.deviceConnectionPhysicalStateTransition.findMany({
      where: {
        vehicleId: ARTEON_ID,
        organizationId: ORG_ID,
        createdAt: { gte: windowStart, lte: windowEnd },
      },
      orderBy: { createdAt: 'asc' },
    });
    const arteonVls = await prisma.vehicleLatestState.findFirst({
      where: { vehicleId: ARTEON_ID },
      select: { sourceTimestamp: true, updatedAt: true, providerFetchedAt: true },
    });
    const arteonPolls = await prisma.dimoPollLog.count({
      where: {
        vehicleId: ARTEON_ID,
        startedAt: { gte: windowStart, lte: windowEnd },
        status: 'SUCCESS',
      },
    });

    const arteonShadowT24 = rowsT24.filter((r) => r.vehicleId === ARTEON_ID);
    const arteonStaleMutations = arteonTransitions.filter((t) => {
      const ev = t.evidenceObservedAt?.getTime();
      const created = t.createdAt.getTime();
      return ev !== null && ev !== undefined && ev <= windowStart.getTime();
    });

    let stateRegressionCount = 0;
    let duplicateTransitionCount = 0;
    let staleRejected = 0;
    let freshEvidence = 0;
    let staleOrEqualEvidence = 0;
    for (const row of rowsT24) {
      if (row.evidenceObservedAt && row.evidenceObservedAt < windowStart) {
        staleOrEqualEvidence += 1;
      } else {
        freshEvidence += 1;
      }
      if (
        row.classification === 'UNEXPLAINED_OLD_ACCEPT_NEW_REJECT' ||
        row.classification === 'UNEXPLAINED_OLD_REJECT_NEW_ACCEPT'
      ) {
        stateRegressionCount += 1;
      }
    }

    const exp021Families = await prisma.exp021MaturationShadowWindowFamily.count({
      where: { createdAt: { gte: windowStart, lte: windowEnd } },
    });
    const exp021Attempts = await prisma.exp021MaturationShadowObservationAttempt.count({
      where: { createdAt: { gte: windowStart, lte: windowEnd } },
    });

    const tailBlockers = rowsTail.filter((r) => r.correctnessBlocking).length;

    const postCheckpointMs = auditExecutionTime.getTime() - windowEnd.getTime();

    console.log(
      JSON.stringify(
        {
          auditExecutionTime: auditExecutionTime.toISOString(),
          POST_CHECKPOINT_TAIL_DURATION_MS: postCheckpointMs,
          T24_WINDOW_EXACT: 'YES',
          AUTHORITATIVE_T0,
          T24_WINDOW_END: T24_END,
          P25_WINDOW_END: WINDOW_END_7D,
          START_SHA,
          sharedT0File: t0File,
          FAILED_T0,
          T0_CHANGED: t0File === AUTHORITATIVE_T0 ? 'NO' : 'YES',
          preT0ObservationRowsTotal: preT0ObsCount,
          P25_T24H_TOTAL_OBSERVATION_ROWS: rowsT24.length,
          P25_T24H_UNIQUE_SCOPES: scopesSeen.size,
          P25_T24H_UNIQUE_VEHICLES: vehiclesSeen.size,
          P25_T24H_CLASSIFICATION_COUNTS: classificationCounts,
          P25_T24H_CORRECTNESS_BLOCKER_COUNT: blockerCount,
          P25_T24H_BLOCKERS: blockers.map((b) => ({
            id: b.id,
            vehicleId: b.vehicleId,
            observedAt: b.observedAt.toISOString(),
            evidenceObservedAt: b.evidenceObservedAt?.toISOString() ?? null,
            legacyDecision: b.legacyDecision,
            physicalDecision: b.physicalDecision,
            classification: b.classification,
            correctnessBlocking: b.correctnessBlocking,
          })),
          perScope,
          PILOT_SCOPE_COUNT: PILOT_SCOPES.length,
          SCOPES_WITH_OBSERVATIONS: Object.values(perScope).filter((s) => s.observationCount > 0).length,
          preT0EvidenceUsedPostT0Count: preT0EvidencePostT0.length,
          preT0EvidenceRows: preT0EvidencePostT0.map((r) => ({
            id: r.id,
            vehicleId: r.vehicleId,
            evidenceObservedAt: r.evidenceObservedAt?.toISOString(),
            observedAt: r.observedAt.toISOString(),
            classification: r.classification,
            correctnessBlocking: r.correctnessBlocking,
          })),
          arteon: {
            physicalState: arteonPhysical?.effectiveState ?? null,
            evidenceObservedAt: arteonPhysical?.evidenceObservedAt?.toISOString() ?? null,
            transitionsInWindow: arteonTransitions.length,
            transitionDetails: arteonTransitions.map((t) => ({
              id: t.id,
              previousState: t.previousState,
              candidateState: t.candidateState,
              effectiveState: t.effectiveState,
              decision: t.decision,
              evidenceObservedAt: t.evidenceObservedAt.toISOString(),
              createdAt: t.createdAt.toISOString(),
            })),
            vlsSourceTimestamp: arteonVls?.sourceTimestamp?.toISOString() ?? null,
            vlsProviderFetchedAt: arteonVls?.providerFetchedAt?.toISOString() ?? null,
            shadowObservationsT24: arteonShadowT24.length,
            snapshotPollsSuccessT24: arteonPolls,
            arteonShadowClassifications: arteonShadowT24.reduce((acc, r) => {
              acc[r.classification] = (acc[r.classification] ?? 0) + 1;
              return acc;
            }, {}),
          },
          freshness: {
            STALE_OR_EQUAL_CONNECTIVITY_EVIDENCE_COUNT: staleOrEqualEvidence,
            FRESH_CONNECTIVITY_EVIDENCE_COUNT: freshEvidence,
            STATE_REGRESSION_COUNT: stateRegressionCount,
          },
          exp021: {
            familiesCreatedInWindow: exp021Families,
            attemptsInWindow: exp021Attempts,
          },
          POST_CHECKPOINT_TAIL_ROWS: rowsTail.length,
          POST_CHECKPOINT_BLOCKERS: tailBlockers,
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
