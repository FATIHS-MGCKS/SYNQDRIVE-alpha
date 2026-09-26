#!/usr/bin/env node
/**
 * Establish shared P2.5 post-fix + LTE_R1 cadence baseline epoch (read-only gates).
 * Writes append-only manifest under shared evidence dir on VPS.
 *
 * --corrected-restart  Abort prior short epoch (observer accounting defect) and bootstrap poll cursors.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
const {
  bootstrapPollCursorAtLatest,
  emptyVehiclePollState,
} = require('./p25-lte-r1-passive-cadence-observer.poll-accounting.lib.cjs');

const DEPLOYED_SHA = '8a1d9c6586cbddc41bb6c94870f9d51226d71aa2';
const PRE_FIX_T0 = '2026-09-18T09:33:25.000Z';
const PRE_FIX_T7 = '2026-09-25T09:33:25.000Z';
const ABORTED_SHORT_T0 = '2026-09-25T21:39:17.621Z';
const EPOCH_SECONDS = 604800;

const EVIDENCE_DIR =
  process.env.P25_LTE_R1_EVIDENCE_DIR ??
  '/opt/synqdrive/shared/evidence/p25-post-fix-lte-r1-epoch';
const DERIVED_STATE_JSON = path.join(EVIDENCE_DIR, 'lte-r1-cadence-derived-state.json');

function loadEnvFile() {
  const envPath = process.env.SYNQDRIVE_BACKEND_ENV ?? '/opt/synqdrive/shared/backend.env';
  if (!fs.existsSync(envPath)) throw new Error(`missing env file: ${envPath}`);
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
    }
  }
}

function envLine(name) {
  return process.env[name] ?? null;
}

async function countBlockingAt(prisma, at) {
  return prisma.deviceConnectionPhysicalStateShadowObservation.count({
    where: { observedAt: { gte: at }, correctnessBlocking: true },
  });
}

async function bootstrapDerivedStateAtEpoch(prisma, epochT0, epochId) {
  const vehicles = await prisma.vehicle.findMany({
    where: {
      hardwareType: 'LTE_R1',
      dataSourceLinks: { some: { provider: 'DIMO', isActive: true } },
    },
    select: { id: true },
  });
  const derived = { vehicles: {}, globalEpochT0: epochT0, globalEpochId: epochId };
  for (const v of vehicles) {
    const latest = await prisma.dimoPollLog.findFirst({
      where: { vehicleId: v.id, jobType: 'SNAPSHOT', startedAt: { lte: new Date(epochT0) } },
      orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
      select: { id: true, startedAt: true, status: true },
    });
    derived.vehicles[v.id] = bootstrapPollCursorAtLatest(
      { ...emptyVehiclePollState(), signals: {} },
      latest,
    );
  }
  fs.writeFileSync(DERIVED_STATE_JSON, `${JSON.stringify(derived, null, 2)}\n`);
  return derived;
}

async function main() {
  const correctedRestart = process.argv.includes('--corrected-restart');
  loadEnvFile();
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });

  const attestedSha = envLine('CONNECTIVITY_PHYSICAL_STATE_CUTOVER_CAPABLE_BUILD_ID');
  const runtimeBuild = envLine('SYNQDRIVE_BUILD_ID');
  if (attestedSha !== DEPLOYED_SHA) {
    throw new Error(
      `attestation mismatch: CONNECTIVITY_PHYSICAL_STATE_CUTOVER_CAPABLE_BUILD_ID=${attestedSha} expected ${DEPLOYED_SHA}`,
    );
  }
  if (runtimeBuild !== DEPLOYED_SHA) {
    throw new Error(`runtime build mismatch: SYNQDRIVE_BUILD_ID=${runtimeBuild}`);
  }

  const newT0 = new Date();
  const newT7 = new Date(newT0.getTime() + EPOCH_SECONDS * 1000);
  const epochId = correctedRestart
    ? `p25-post-fix-corrected-${newT0.toISOString()}`
    : `p25-post-fix-${newT0.toISOString()}`;

  const prisma = new PrismaClient();
  let correctnessBlockingAtT0 = 0;
  try {
    correctnessBlockingAtT0 = await countBlockingAt(prisma, newT0);
    if (correctedRestart) {
      await bootstrapDerivedStateAtEpoch(prisma, newT0.toISOString(), epochId);
    }
  } finally {
    await prisma.$disconnect();
  }

  const observerScript = path.join(
    process.env.P25_LTE_R1_OBSERVER_SCRIPT ??
      '/opt/synqdrive/shared/ops/p25-lte-r1-passive-cadence-observer.cjs',
  );
  const observerHash = fs.existsSync(observerScript)
    ? crypto.createHash('sha256').update(fs.readFileSync(observerScript)).digest('hex')
    : null;

  const manifest = {
    schemaVersion: correctedRestart
      ? 'p25-post-fix-lte-r1-epoch-manifest-v2-corrected'
      : 'p25-post-fix-lte-r1-epoch-manifest-v1',
    establishedAt: newT0.toISOString(),
    NEW_T0: newT0.toISOString(),
    NEW_T7: newT7.toISOString(),
    NEW_T0_CORRECTED: correctedRestart ? newT0.toISOString() : null,
    NEW_T7_CORRECTED: correctedRestart ? newT7.toISOString() : null,
    P25_POST_FIX_EPOCH_T0: newT0.toISOString(),
    LTE_R1_CADENCE_BASELINE_T0: newT0.toISOString(),
    DEPLOYED_SHA,
    ATTESTED_SHA: attestedSha,
    SYNQDRIVE_BUILD_ID_AT_T0: runtimeBuild,
    PRE_FIX_EPOCH: {
      T0: PRE_FIX_T0,
      T7: PRE_FIX_T7,
      CLASS: 'PRE_FIX_VALIDATION',
    },
    supersededEpochs: correctedRestart
      ? [
          {
            T0: ABORTED_SHORT_T0,
            status: 'ABORTED_OBSERVER_ACCOUNTING_DEFECT',
            reason:
              'P2.5 runtime remained valid; LTE_R1 cadence poll counters were observer-sample counters, not distinct dimo_poll_logs rows.',
          },
        ]
      : [],
    pollingConfigurationAtT0: {
      note: '30-second baseline unchanged — observer does not alter poll timers',
      LTE_R1_OBSERVER_INTERVAL_MS: process.env.LTE_R1_OBSERVER_INTERVAL_MS ?? '30000',
      pollAccountingModel: 'DISTINCT_DIMO_POLL_LOG_ROWS_v1.1.0',
    },
    p25OperationalStateAtT0: {
      P25_AUTHORITY_MODE: 'LEGACY',
      P25_SIDE_EFFECTS_ENABLED: 'OFF',
      P25_SHADOW_COMPARE_ENABLED: envLine('CONNECTIVITY_PHYSICAL_STATE_SHADOW_COMPARE_ENABLED'),
      P25_PROJECTION_WRITE_ENABLED: envLine('CONNECTIVITY_PHYSICAL_STATE_PROJECTION_WRITE_ENABLED'),
      CONNECTIVITY_PHYSICAL_STATE_RECONCILIATION_ENABLED: envLine(
        'CONNECTIVITY_PHYSICAL_STATE_RECONCILIATION_ENABLED',
      ),
      pilotScopesJson: envLine('CONNECTIVITY_PHYSICAL_STATE_SHADOW_PILOT_SCOPES_JSON'),
    },
    providerTopologyChanged: false,
    canaryTopologyChanged: false,
    pollingCadenceChanged: false,
    observer: {
      scriptPath: observerScript,
      scriptSha256: observerHash,
      evidenceDir: EVIDENCE_DIR,
      observationsNdjson: path.join(EVIDENCE_DIR, 'lte-r1-cadence-observations.ndjson'),
      observationsNdjsonCorrected: correctedRestart
        ? path.join(EVIDENCE_DIR, 'lte-r1-cadence-observations-corrected.ndjson')
        : null,
    },
    CORRECTNESS_BLOCKING_AT_T0: correctnessBlockingAtT0,
    checkpoints: {
      T24: new Date(newT0.getTime() + 24 * 3600 * 1000).toISOString(),
      T72: new Date(newT0.getTime() + 72 * 3600 * 1000).toISOString(),
      T7: newT7.toISOString(),
    },
    freezeConditions: [
      'No P2.5 comparator semantic changes',
      'No physical-state policy changes',
      'No pilot allowlist changes',
      'No 30s baseline polling changes',
      'No LTE_R1 poll cadence changes',
      'No provider topology changes',
      'No PLUG canary topology changes',
      'No build attestation changes',
      'No authority cutover / side effects enablement',
    ],
  };

  const manifestPath = path.join(EVIDENCE_DIR, 'P25_LTE_R1_EPOCH_MANIFEST.json');
  const priorPath = path.join(EVIDENCE_DIR, 'P25_LTE_R1_EPOCH_MANIFEST.json');
  if (fs.existsSync(priorPath)) {
    const archiveName = `P25_LTE_R1_EPOCH_MANIFEST.${Date.now()}.json`;
    fs.copyFileSync(priorPath, path.join(EVIDENCE_DIR, archiveName));
  }
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  const ledgerPath = path.join(EVIDENCE_DIR, 'P25_LTE_R1_EPOCH_MANIFEST_LEDGER.ndjson');
  if (correctedRestart) {
    fs.appendFileSync(
      ledgerPath,
      `${JSON.stringify({
        event: 'EPOCH_ABORTED',
        at: new Date().toISOString(),
        abortedT0: ABORTED_SHORT_T0,
        status: 'ABORTED_OBSERVER_ACCOUNTING_DEFECT',
      })}\n`,
    );
  }
  fs.appendFileSync(
    ledgerPath,
    `${JSON.stringify({
      event: correctedRestart ? 'EPOCH_ESTABLISHED_CORRECTED' : 'EPOCH_ESTABLISHED',
      at: newT0.toISOString(),
      manifestPath,
      epochId,
    })}\n`,
  );

  // eslint-disable-next-line no-console
  console.log(JSON.stringify(manifest, null, 2));
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
