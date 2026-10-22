/**
 * Read-only export: di_v0_shadow_intervals for EXP021 Tesla two-trip Phase B2.
 * Run on VPS: cd /opt/synqdrive/current/backend && sudo -E bash -lc 'set -a; source /opt/synqdrive/shared/backend.env; node scripts/research/exp021-tesla-shadow-intervals-export-production.cjs'
 */
const { PrismaClient } = require('@prisma/client');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const VEHICLE_ID = '68868291-5478-42cd-b0c4-cc77b2a78e21';
const TRIPS = [
  { key: 'TRIP_1', tripId: '11f5a645-752e-4b8a-b20a-9f1fc3a6673e', expectedIntervals: 798 },
  { key: 'TRIP_2', tripId: '0f8d2f76-9b09-4aba-8c56-fa7e2ce1c5a8', expectedIntervals: 899 },
];

const OUT =
  process.env.TESLA_SHADOW_EXPORT_DIR || '/home/synqdrive-admin/exp021-tesla-shadow-export';

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function iso(d) {
  if (!d) return null;
  return d instanceof Date ? d.toISOString() : String(d);
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const prisma = new PrismaClient();
  const manifest = {
    productionSha: 'ec4de21ff195e29925b05abf8e499e0ab91c4240',
    exportedAtUtc: new Date().toISOString(),
    vehicleId: VEHICLE_ID,
    outDir: OUT,
    trips: [],
  };

  for (const t of TRIPS) {
    const wi = await prisma.$queryRawUnsafe(
      `SELECT id::text, shadow_run_id::text, pinned_snapshot_hash, status::text, completed_at
       FROM di_v0_s4_work_items
       WHERE trip_id::text = $1 AND run_purpose = 'PRIMARY' AND status <> 'SUPERSEDED'
       ORDER BY boundary_occurrence DESC, created_at DESC LIMIT 1`,
      t.tripId,
    );
    const workItem = wi[0];
    if (!workItem?.shadow_run_id) throw new Error(`No shadow_run_id for ${t.tripId}`);

    const run = await prisma.$queryRawUnsafe(
      `SELECT id::text, organization_id::text, vehicle_id::text, trip_id::text, source_family::text,
              structural_version, estimator_version, calibration_version, source_family_policy_version,
              input_evidence_version, status::text, interval_count, started_at, completed_at
       FROM di_v0_shadow_runs WHERE id::text = $1`,
      workItem.shadow_run_id,
    );
    const shadowRun = run[0];
    if (!shadowRun) throw new Error(`Shadow run missing ${workItem.shadow_run_id}`);
    if (shadowRun.vehicle_id !== VEHICLE_ID) throw new Error(`Vehicle mismatch ${shadowRun.vehicle_id}`);

    const intervals = await prisma.$queryRawUnsafe(
      `SELECT id::text, interval_start, interval_end, reference_time,
              motion_state, position_state, causal_position_state,
              estimated_speed_kmh, speed_range_min_kmh, speed_range_max_kmh, speed_evidence_state,
              temporal_confidence, value_confidence, source_relation, claim_level, abstention_reason,
              evidence_sources, source_quality_flags,
              support_interval_start, support_interval_end,
              derivation_method, derivation_version, structural_version, estimator_version,
              calibration_version, source_family_policy_version, provenance, legacy_comparison
       FROM di_v0_shadow_intervals
       WHERE shadow_run_id::text = $1 AND trip_id::text = $2
       ORDER BY interval_start ASC`,
      workItem.shadow_run_id,
      t.tripId,
    );

    const normalized = intervals.map((row) => ({
      id: row.id,
      intervalStart: iso(row.interval_start),
      intervalEnd: iso(row.interval_end),
      referenceTime: iso(row.reference_time),
      motionState: row.motion_state,
      positionState: row.position_state,
      causalPositionState: row.causal_position_state,
      estimatedSpeedKmh: row.estimated_speed_kmh,
      speedRangeMinKmh: row.speed_range_min_kmh,
      speedRangeMaxKmh: row.speed_range_max_kmh,
      speedEvidenceState: row.speed_evidence_state,
      temporalConfidence: row.temporal_confidence,
      valueConfidence: row.value_confidence,
      sourceRelation: row.source_relation,
      claimLevel: row.claim_level,
      abstentionReason: row.abstention_reason,
      evidenceSources: row.evidence_sources,
      sourceQualityFlags: row.source_quality_flags,
      supportIntervalStart: iso(row.support_interval_start),
      supportIntervalEnd: iso(row.support_interval_end),
      derivationMethod: row.derivation_method,
      derivationVersion: row.derivation_version,
      structuralVersion: row.structural_version,
      estimatorVersion: row.estimator_version,
      calibrationVersion: row.calibration_version,
      sourceFamilyPolicyVersion: row.source_family_policy_version,
      provenance: row.provenance,
      legacyComparison: row.legacy_comparison,
    }));

    const jsonl = normalized.map((r) => JSON.stringify(r)).join('\n');
    const jsonlPath = path.join(OUT, `${t.key}_shadow_intervals.jsonl`);
    fs.writeFileSync(jsonlPath, jsonl + '\n');
    const jsonlSha = sha256(Buffer.from(jsonl + '\n'));

    const meta = {
      tripKey: t.key,
      tripId: t.tripId,
      vehicleId: VEHICLE_ID,
      workItem,
      shadowRun: {
        ...shadowRun,
        started_at: iso(shadowRun.started_at),
        completed_at: iso(shadowRun.completed_at),
      },
      intervalCount: normalized.length,
      expectedIntervalCount: t.expectedIntervals,
      orderingVerified: true,
      fieldNullStats: summarizeNulls(normalized),
      versionFingerprint: versionFingerprint(normalized[0], shadowRun),
      jsonlPath,
      jsonlSha256: jsonlSha,
    };
    const metaPath = path.join(OUT, `${t.key}_shadow_manifest.json`);
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));

    manifest.trips.push({
      key: t.key,
      tripId: t.tripId,
      intervalCount: normalized.length,
      expected: t.expectedIntervals,
      jsonlSha256: jsonlSha,
      metaPath,
    });
  }

  const manifestPath = path.join(OUT, 'shadow_export_manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(JSON.stringify(manifest, null, 2));
  await prisma.$disconnect();
}

function summarizeNulls(rows) {
  const keys = [
    'estimatedSpeedKmh',
    'speedEvidenceState',
    'abstentionReason',
    'supportIntervalStart',
    'supportIntervalEnd',
  ];
  const out = {};
  for (const k of keys) {
    out[k] = rows.filter((r) => r[k] == null).length;
  }
  out.motionStateCounts = countBy(rows, 'motionState');
  out.positionStateCounts = countBy(rows, 'positionState');
  out.valueConfidenceCounts = countBy(rows, 'valueConfidence');
  return out;
}

function countBy(rows, field) {
  const m = {};
  for (const r of rows) {
    const v = r[field] ?? 'NULL';
    m[v] = (m[v] ?? 0) + 1;
  }
  return m;
}

function versionFingerprint(interval, run) {
  if (!interval) return null;
  return {
    runStructuralVersion: run.structural_version,
    runEstimatorVersion: run.estimator_version,
    runCalibrationVersion: run.calibration_version,
    runInputEvidenceVersion: run.input_evidence_version,
    intervalDerivationVersion: interval.derivationVersion,
    intervalStructuralVersion: interval.structuralVersion,
    intervalEstimatorVersion: interval.estimatorVersion,
  };
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
