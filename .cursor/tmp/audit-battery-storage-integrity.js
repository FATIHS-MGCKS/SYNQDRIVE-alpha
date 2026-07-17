/* READ-ONLY Prompt 5/8 — battery storage integrity */
const fs = require('fs');
const { PrismaClient } = require('@prisma/client');
const { execSync } = require('child_process');

const DAYS = 30;
const since = new Date(Date.now() - DAYS * 24 * 3600 * 1000);

function loadEnv() {
  const envPath = '/opt/synqdrive/shared/backend.env';
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
  }
}

function label(v) {
  if (!v) return 'unknown';
  return v.licensePlate === 'KS FH 660E' ? 'KS FH 660E' : `veh-${v.id.slice(0, 8)}`;
}

function isIce(ft) {
  const f = (ft || '').toUpperCase();
  return f !== 'ELECTRIC' && f !== 'EV' && f !== 'BEV';
}

function classifyRestV(v) {
  if (v == null) return null;
  if (v > 13.2) return 'SUSPECT';
  if (v < 9 || v > 16) return 'INVALID';
  return 'VALID';
}

(async () => {
  loadEnv();
  const p = new PrismaClient();
  const findings = [];
  const counts = {
    VALID: 0,
    SUSPECT: 0,
    INVALID: 0,
    LEGACY_UNVERIFIABLE: 0,
    PARTIAL_WRITE: 0,
    SEMANTICALLY_MISLABELED: 0,
    DUPLICATE: 0,
    UNSUPPORTED_PROFILE: 0,
  };
  const add = (cls, category, detail) => {
    counts[cls] = (counts[cls] || 0) + 1;
    findings.push({ cls, category, ...detail });
  };

  const vehicles = await p.vehicle.findMany({
    where: { dimoVehicleId: { not: null } },
    select: { id: true, licensePlate: true, fuelType: true, make: true, model: true },
  });
  const vehMap = new Map(vehicles.map((v) => [v.id, v]));

  const [features, snaps, evidence, hvSnaps, hvCurrent, specs, vlsAll] = await Promise.all([
    p.batteryFeatures.findMany(),
    p.batteryHealthSnapshot.findMany({ where: { recordedAt: { gte: since } } }),
    p.batteryEvidence.findMany({ where: { observedAt: { gte: since } } }),
    p.hvBatteryHealthSnapshot.findMany({ where: { recordedAt: { gte: since } } }),
    p.hvBatteryHealthCurrent.findMany(),
    p.vehicleBatterySpec.findMany(),
    p.vehicleLatestState.findMany({
      where: { vehicleId: { in: vehicles.map((v) => v.id) } },
      select: {
        vehicleId: true,
        lvBatteryVoltage: true,
        sourceTimestamp: true,
        providerFetchedAt: true,
        evSoc: true,
        tractionBatteryIsCharging: true,
      },
    }),
  ]);

  const specMap = new Map(specs.map((s) => [s.vehicleId, s]));
  const vlsMap = new Map(vlsAll.map((v) => [v.vehicleId, v]));

  const totals = {
    vehicles: vehicles.length,
    iceVehicles: vehicles.filter((v) => isIce(v.fuelType)).length,
    bevVehicles: vehicles.filter((v) => !isIce(v.fuelType)).length,
    batteryFeatures: features.length,
    healthSnapshots: snaps.length,
    evidenceRows: evidence.length,
    hvSnapshots: hvSnaps.length,
    hvCurrent: hvCurrent.length,
    batterySpecs: specs.length,
  };

  // ── 1. Rest voltage problems in features ──
  for (const f of features) {
    const v = vehMap.get(f.vehicleId);
    const lbl = label(v);
    const ice = isIce(v?.fuelType);
    if (!ice && (f.vOff60m != null || f.rest60mCapturedAt)) {
      add('UNSUPPORTED_PROFILE', 'rest_lv_on_bev', { vehicle: lbl, vOff60m: f.vOff60m });
    }
    for (const [field, v] of [
      ['vOff60m', f.vOff60m],
      ['vOff6h', f.vOff6h],
    ]) {
      const c = classifyRestV(v);
      if (c === 'SUSPECT') add('SUSPECT', 'rest_gt_13_2_features', { vehicle: lbl, field, value: v });
      if (c === 'INVALID') add('INVALID', 'rest_out_of_range_features', { vehicle: lbl, field, value: v });
    }
    if (
      f.rest60mCapturedAt &&
      f.rest6hCapturedAt &&
      f.rest60mCapturedAt.getTime() === f.rest6hCapturedAt.getTime()
    ) {
      add('SUSPECT', 'rest_60m_6h_identical_ts', {
        vehicle: lbl,
        at: f.rest60mCapturedAt.toISOString(),
        v60: f.vOff60m,
        v6h: f.vOff6h,
      });
    }
    if (f.vOff60m != null && f.vOff6h != null && f.vOff60m === f.vOff6h && f.rest60mCapturedAt?.getTime() !== f.rest6hCapturedAt?.getTime()) {
      add('SUSPECT', 'rest_identical_voltage', { vehicle: lbl, v: f.vOff60m });
    }
  }

  // Rest snapshots
  let restGt132 = 0;
  let restInvalid = 0;
  let restValid = 0;
  for (const s of snaps) {
    const v = s.restingVoltage ?? s.voltageV;
    const lbl = label(vehMap.get(s.vehicleId));
    const c = classifyRestV(v);
    if (c === 'SUSPECT') {
      restGt132++;
      add('SUSPECT', 'rest_gt_13_2_snapshot', { vehicle: lbl, recordedAt: s.recordedAt, v });
    } else if (c === 'INVALID') {
      restInvalid++;
      add('INVALID', 'rest_out_of_range_snapshot', { vehicle: lbl, v });
    } else restValid++;
    if (s.engineRunning) add('SEMANTICALLY_MISLABELED', 'rest_engine_running_true', { vehicle: lbl });
  }

  // Rest near trip start
  const trips = await p.vehicleTrip.findMany({
    where: { startTime: { gte: since } },
    select: { id: true, vehicleId: true, startTime: true },
  });
  for (const s of snaps.filter((x) => x.restingVoltage != null)) {
    const near = trips.find(
      (t) =>
        t.vehicleId === s.vehicleId &&
        Math.abs(new Date(s.recordedAt).getTime() - t.startTime.getTime()) < 15 * 60_000,
    );
    if (near) {
      add('SUSPECT', 'rest_near_trip_start', {
        vehicle: label(vehMap.get(s.vehicleId)),
        recordedAt: s.recordedAt,
        tripStart: near.startTime,
      });
    }
  }

  // ── 2. Crank problems ──
  let crankLogs = 0;
  let crankWithDrop = 0;
  try {
    const raw = execSync('grep -h "Crank features captured" /root/.pm2/logs/synqdrive-out*.log 2>/dev/null || true', {
      encoding: 'utf8',
      maxBuffer: 20 * 1024 * 1024,
    });
    const tripIds = new Set();
    for (const line of raw.split('\n')) {
      if (!line.includes('Crank features captured')) continue;
      crankLogs++;
      const trip = line.match(/trip=([a-f0-9-]+)/)?.[1];
      if (trip) tripIds.add(trip);
      if (!line.includes('drop=—V')) crankWithDrop++;
    }
    for (const f of features) {
      if (f.crankObservationCount > tripIds.size && f.crankObservationCount > 0) {
        add('SUSPECT', 'crank_count_exceeds_unique_trips', {
          vehicle: label(vehMap.get(f.vehicleId)),
          crankObservationCount: f.crankObservationCount,
          uniqueTripsInLogs: tripIds.size,
        });
      }
    }
  } catch (_) {}

  for (const f of features) {
    const v = vehMap.get(f.vehicleId);
    const lbl = label(v);
    if (!isIce(v?.fuelType) && f.crankTripId) {
      add('UNSUPPORTED_PROFILE', 'ice_crank_on_bev', { vehicle: lbl, crankTripId: f.crankTripId });
    }
    if (f.vRecovery5s != null && f.vRecovery30s != null && f.vRecovery5s === f.vRecovery30s) {
      add('SUSPECT', 'recovery_5s_eq_30s', { vehicle: lbl, v: f.vRecovery5s });
    }
    if (f.crankDrop != null && f.crankDrop < 0.1 && f.crankObservationCount > 0) {
      add('SUSPECT', 'crank_drop_negligible', { vehicle: lbl, crankDrop: f.crankDrop });
    }
    if (f.crankAt && f.rest60mCapturedAt && Math.abs(f.crankAt.getTime() - f.rest60mCapturedAt.getTime()) < 5000) {
      add('SUSPECT', 'crank_rest_same_timestamp', { vehicle: lbl });
    }
    if (f.crankDrop == null && f.vRecovery5s != null && f.crankObservationCount === 0 && f.vRecovery5s) {
      add('SUSPECT', 'recovery_without_crank_drop', { vehicle: lbl });
    }
  }

  // ── 3. Lifecycle mix ──
  for (const f of features) {
    const lbl = label(vehMap.get(f.vehicleId));
    if (f.crankAt && f.rest60mCapturedAt) {
      const days = Math.abs(f.rest60mCapturedAt.getTime() - f.crankAt.getTime()) / 86400_000;
      if (days > 14) {
        add('SUSPECT', 'lifecycle_crank_rest_gap', { vehicle: lbl, daysApart: +days.toFixed(1) });
      }
    }
    if (f.scoredAt && f.firstUsableMeasurementAt) {
      const scoreAge = (f.scoredAt.getTime() - f.firstUsableMeasurementAt.getTime()) / 86400_000;
      if (f.publicationState === 'STABLE' && scoreAge < 5) {
        add('SUSPECT', 'stable_too_fast', { vehicle: lbl, daysSinceFirst: +scoreAge.toFixed(1) });
      }
    }
  }

  // ── 4. Evidence semantics ──
  const evByKey = new Map();
  let sohSemanticWrong = 0;
  let duplicateEvidence = 0;
  for (const e of evidence) {
    const key = `${e.vehicleId}|${e.scope}|${e.valueType}|${e.sourceType}|${e.observedAt.toISOString()}`;
    if (evByKey.has(key)) {
      duplicateEvidence++;
      add('DUPLICATE', 'evidence_dedup_collision', {
        vehicle: label(vehMap.get(e.vehicleId)),
        valueType: e.valueType,
        sourceType: e.sourceType,
      });
    }
    evByKey.set(key, e);

    if (
      e.valueType === 'SOH_PERCENT' &&
      (e.sourceType === 'MODEL_DERIVED' || e.sourceType === 'TELEMETRY_DERIVED') &&
      e.provider === 'SynqDrive'
    ) {
      sohSemanticWrong++;
      add('SEMANTICALLY_MISLABELED', 'lv_behavior_as_soh_evidence', {
        vehicle: label(vehMap.get(e.vehicleId)),
        sourceType: e.sourceType,
        value: e.numericValue,
        observedAt: e.observedAt,
      });
    }
  }

  // Snapshots without evidence
  const restEv = evidence.filter((e) => e.valueType === 'RESTING_VOLTAGE_V');
  for (const s of snaps.filter((x) => x.restingVoltage != null)) {
    const match = restEv.some(
      (e) =>
        e.vehicleId === s.vehicleId &&
        Math.abs(e.observedAt.getTime() - new Date(s.recordedAt).getTime()) < 1000 &&
        Math.abs(e.numericValue - (s.restingVoltage ?? 0)) < 0.01,
    );
    if (!match) add('PARTIAL_WRITE', 'snapshot_without_evidence', {
      vehicle: label(vehMap.get(s.vehicleId)),
      recordedAt: s.recordedAt,
    });
  }

  // ── 5. Partial writes in features ──
  for (const f of features) {
    const lbl = label(vehMap.get(f.vehicleId));
    if (f.scoredAt && f.rawSohPct == null && f.estimatedSohPct == null) {
      add('PARTIAL_WRITE', 'scored_without_soh', { vehicle: lbl });
    }
    if (f.publishedSohPct != null && f.rawSohPct == null) {
      add('PARTIAL_WRITE', 'published_without_raw', { vehicle: lbl });
    }
    if ((f.rest60mCapturedAt || f.crankAt) && !f.scoredAt) {
      add('PARTIAL_WRITE', 'features_without_score', { vehicle: lbl });
    }
  }

  // HV evidence gap
  const hvEv = evidence.filter((e) => e.scope === 'HV');
  if (hvSnaps.length > 0 && hvEv.length === 0) {
    add('PARTIAL_WRITE', 'hv_snapshots_no_evidence', { hvSnapshots: hvSnaps.length });
  }

  // ── 6. Publication problems ──
  for (const f of features) {
    const lbl = label(vehMap.get(f.vehicleId));
    const spec = specMap.get(f.vehicleId);
    if (f.publicationState === 'STABLE' || f.publicationState === 'STABILIZING') {
      if (f.qualifiedEventCount < 3) {
        add('INVALID', 'published_insufficient_events', {
          vehicle: lbl,
          state: f.publicationState,
          qualifiedEventCount: f.qualifiedEventCount,
        });
      }
      if (!f.vOff60m && !f.vOff6h) {
        add('SUSPECT', 'published_without_rest_voltage', { vehicle: lbl, state: f.publicationState });
      }
      if (f.crankObservationCount === 0 && f.publicationState === 'STABLE') {
        add('SUSPECT', 'stable_without_crank', { vehicle: lbl });
      }
      if (!spec?.batteryType) {
        add('SUSPECT', 'published_without_battery_spec', { vehicle: lbl });
      }
    }
    if (f.publishedSohPct != null && f.publicationState === 'INITIAL_CALIBRATION') {
      add('INVALID', 'published_during_calibration', { vehicle: lbl, publishedSohPct: f.publishedSohPct });
    }
    if (f.restObservationCount > 50 && f.publicationState === 'INITIAL_CALIBRATION') {
      add('SUSPECT', 'long_calibration_many_rest', {
        vehicle: lbl,
        restObservationCount: f.restObservationCount,
      });
    }
  }

  for (const h of hvCurrent) {
    const lbl = label(h.vehicle);
    if (h.publicationState === 'STABLE' && h.validEstimateCount < 6) {
      add('SUSPECT', 'hv_stable_low_estimates', { vehicle: lbl, validEstimateCount: h.validEstimateCount });
    }
    if (h.publishedSohPct != null && h.publicationState === 'INITIAL_CALIBRATION') {
      add('INVALID', 'hv_published_during_calibration', { vehicle: lbl });
    }
  }

  // ── 7. VLS freshness vs scores ──
  for (const f of features) {
    const vls = vlsMap.get(f.vehicleId);
    if (!vls?.sourceTimestamp || !vls.providerFetchedAt) continue;
    const staleH = (vls.providerFetchedAt.getTime() - vls.sourceTimestamp.getTime()) / 3600_000;
    if (staleH > 1 && f.publishedSohPct != null) {
      add('SUSPECT', 'published_with_stale_lv_source', {
        vehicle: label(vehMap.get(f.vehicleId)),
        staleHours: +staleH.toFixed(1),
      });
    }
  }

  // ── 8. PM2 partial write logs ──
  let snapshotFail = 0;
  let crankFail = 0;
  try {
    snapshotFail = parseInt(
      execSync('grep -hc "Battery V2 onSnapshot failed" /root/.pm2/logs/synqdrive-out*.log 2>/dev/null || echo 0', {
        encoding: 'utf8',
      }).trim(),
      10,
    );
    crankFail = parseInt(
      execSync('grep -hc "Battery V2 crank capture failed" /root/.pm2/logs/synqdrive-out*.log 2>/dev/null || echo 0', {
        encoding: 'utf8',
      }).trim(),
      10,
    );
  } catch (_) {}

  // Distribution stats
  const drops = features.map((f) => f.crankDrop).filter((x) => x != null);
  const restVs = snaps.map((s) => s.restingVoltage ?? s.voltageV).filter((x) => x != null);
  const publishedScores = features.map((f) => f.publishedSohPct).filter((x) => x != null);

  const out = {
    generatedAt: new Date().toISOString(),
    since: since.toISOString(),
    totals,
    findingCounts: counts,
    findingCountTotal: findings.length,
    categorySummary: findings.reduce((a, f) => {
      a[f.category] = (a[f.category] || 0) + 1;
      return a;
    }, {}),
    restSnapshotStats: { restGt132, restInvalid, restValid, total: snaps.length },
    crankStats: { crankLogs, crankWithDrop, unreliable: crankLogs - crankWithDrop },
    sohSemanticEvidenceRows: sohSemanticWrong,
    duplicateEvidence,
    pm2Errors: { snapshotFail, crankFail },
    distributions: {
      restVoltage: restVs.length
        ? { min: Math.min(...restVs), max: Math.max(...restVs), median: restVs.sort((a, b) => a - b)[Math.floor(restVs.length / 2)] }
        : null,
      crankDrop: drops.length ? { min: Math.min(...drops), max: Math.max(...drops), values: drops } : null,
      publishedSoh: publishedScores,
    },
    features: features.map((f) => ({
      vehicle: label(vehMap.get(f.vehicleId)),
      ice: isIce(vehMap.get(f.vehicleId)?.fuelType),
      publicationState: f.publicationState,
      publishedSohPct: f.publishedSohPct,
      rawSohPct: f.rawSohPct,
      qualifiedEventCount: f.qualifiedEventCount,
      restObservationCount: f.restObservationCount,
      crankObservationCount: f.crankObservationCount,
      vOff60m: f.vOff60m,
      vOff6h: f.vOff6h,
      crankDrop: f.crankDrop,
      rest60mCapturedAt: f.rest60mCapturedAt,
      rest6hCapturedAt: f.rest6hCapturedAt,
      crankAt: f.crankAt,
      scoredAt: f.scoredAt,
      batteryType: specMap.get(f.vehicleId)?.batteryType ?? null,
    })),
    hvCurrent: hvCurrent.map((h) => ({
      vehicle: label(vehMap.get(h.vehicleId)),
      publicationState: h.publicationState,
      publishedSohPct: h.publishedSohPct,
      validEstimateCount: h.validEstimateCount,
    })),
    examples: findings.slice(0, 40),
    evidenceByType: evidence.reduce((a, e) => {
      const k = `${e.scope}|${e.valueType}|${e.sourceType}`;
      a[k] = (a[k] || 0) + 1;
      return a;
    }, {}),
  };

  await p.$disconnect();
  const json = JSON.stringify(out, null, 2);
  fs.writeFileSync('/tmp/battery-storage-integrity.json', json);
  console.log('WROTE /tmp/battery-storage-integrity.json');
  console.log('findings', out.findingCountTotal, 'rest>13.2', restGt132, 'sohSemantic', sohSemanticWrong);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
