#!/usr/bin/env node
/**
 * Read-only Production T7 unexplained-row export + Option-C replay summary.
 * Run on VPS:
 *   sudo bash -c 'set -a; source /opt/synqdrive/shared/backend.env; set +a; node scripts/ops/p25-t7-option-c-replay-readonly.cjs'
 *
 * Local replay against export:
 *   P25_T7_EXPORT_JSON=/path/to/export.json cd backend && npx ts-node --transpile-only scripts/ops/p25-t7-option-c-replay-local.ts
 */
const fs = require('fs');
const { PrismaClient } = require('@prisma/client');

const T0 = '2026-09-18T09:33:25.000Z';
const T7 = '2026-09-25T09:33:25.000Z';

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

function resolveParent(transitions, row) {
  const t = row.transition;
  if (t.parentStateVersion != null) {
    const parent = transitions.find(
      (x) =>
        x.vehicleId === row.vehicleId &&
        x.bindingKey === row.bindingKey &&
        x.appliedStateVersion === t.parentStateVersion,
    );
    if (parent) {
      return {
        effectiveState: parent.effectiveState,
        evidenceObservedAt: parent.evidenceObservedAt.toISOString(),
        evidenceSource: parent.evidenceSource,
        evidenceReferenceId: parent.evidenceReferenceId,
        stateVersion: parent.appliedStateVersion,
      };
    }
  }
  const prior = transitions
    .filter(
      (x) =>
        x.vehicleId === row.vehicleId &&
        x.bindingKey === row.bindingKey &&
        x.createdAt <= new Date(row.observedAt),
    )
    .sort((a, b) => b.createdAt - a.createdAt)[0];
  if (!prior) return null;
  return {
    effectiveState: prior.effectiveState,
    evidenceObservedAt: prior.evidenceObservedAt.toISOString(),
    evidenceSource: prior.evidenceSource,
    evidenceReferenceId: prior.evidenceReferenceId,
    stateVersion: prior.appliedStateVersion,
  };
}

async function main() {
  loadEnv();
  const prisma = new PrismaClient();
  const windowStart = new Date(T0);
  const windowEnd = new Date(T7);

  try {
    const shadows = await prisma.deviceConnectionPhysicalStateShadowObservation.findMany({
      where: {
        observedAt: { gte: windowStart, lte: windowEnd },
        classification: 'UNEXPLAINED_OLD_REJECT_NEW_ACCEPT',
        legacyDecision: 'reject',
        physicalDecision: 'accept',
      },
      orderBy: { observedAt: 'asc' },
    });

    const vehicleIds = [...new Set(shadows.map((s) => s.vehicleId))];
    const transitions = await prisma.deviceConnectionPhysicalStateTransition.findMany({
      where: { vehicleId: { in: vehicleIds } },
      orderBy: { createdAt: 'asc' },
    });

    const byKey = new Map();
    for (const t of transitions) {
      const k = `${t.vehicleId}|${t.bindingKey}|${t.evidenceReferenceId}|${t.evidenceObservedAt.toISOString()}`;
      byKey.set(k, t);
    }

    const rows = [];
    for (const s of shadows) {
      const k = `${s.vehicleId}|${s.bindingKey}|${s.evidenceReferenceId}|${s.evidenceObservedAt?.toISOString() ?? ''}`;
      const t = byKey.get(k);
      if (!t) continue;
      const draft = {
        shadowId: s.id,
        vehicleId: s.vehicleId,
        bindingKey: s.bindingKey,
        evidenceReferenceId: s.evidenceReferenceId,
        evidenceObservedAt: s.evidenceObservedAt?.toISOString(),
        observedAt: s.observedAt.toISOString(),
        transition: {
          decision: t.decision,
          previousState: t.previousState,
          candidateState: t.candidateState,
          effectiveState: t.effectiveState,
          evidenceSource: t.evidenceSource,
          parentStateVersion: t.parentStateVersion,
          appliedStateVersion: t.appliedStateVersion,
        },
        parentEvidence: null,
      };
      draft.parentEvidence = resolveParent(transitions, draft);
      rows.push(draft);
    }

    const outPath = process.env.P25_T7_EXPORT_PATH ?? '/tmp/p25-t7-unexplained-export.json';
    fs.writeFileSync(
      outPath,
      JSON.stringify({ shadowTotal: shadows.length, matched: rows.length, rows }, null, 0),
    );

    console.log(
      JSON.stringify({
        ACTUAL_T7_ROWS_TOTAL: shadows.length,
        EXPORT_MATCHED: rows.length,
        EXPORT_PATH: outPath,
        PARENT_MISSING: rows.filter((r) => !r.parentEvidence).length,
        note: 'Run backend replay engine locally with P25_T7_EXPORT_JSON for Option-C classification totals',
      }),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
