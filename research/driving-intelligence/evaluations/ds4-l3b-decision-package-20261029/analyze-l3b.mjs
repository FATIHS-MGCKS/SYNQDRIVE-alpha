#!/usr/bin/env node
/**
 * DS4 L3-B offline statistics — reads immutable batch v1 exports only (no motion replay).
 */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

const ROOT = path.dirname(new URL(import.meta.url).pathname);
const IN = path.join(ROOT, 'inputs');
const OUT = path.join(ROOT, 'outputs');

function percentileLinearInclusive(sortedAsc, p) {
  if (sortedAsc.length === 0) return null;
  if (sortedAsc.length === 1) return sortedAsc[0];
  const pos = p * (sortedAsc.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sortedAsc[lo];
  return sortedAsc[lo] + (pos - lo) * (sortedAsc[hi] - sortedAsc[lo]);
}

function median(sortedAsc) {
  if (sortedAsc.length === 0) return null;
  const mid = Math.floor(sortedAsc.length / 2);
  if (sortedAsc.length % 2 === 1) return sortedAsc[mid];
  return (sortedAsc[mid - 1] + sortedAsc[mid]) / 2;
}

function distStats(values) {
  const v = [...values].filter((x) => x != null && Number.isFinite(x)).sort((a, b) => a - b);
  if (v.length === 0) {
    return { n: 0, min: null, p10: null, p25: null, p50: null, p75: null, p90: null, p95: null, p99: null, max: null, mean: null };
  }
  const mean = v.reduce((s, x) => s + x, 0) / v.length;
  return {
    n: v.length,
    min: v[0],
    p10: percentileLinearInclusive(v, 0.1),
    p25: percentileLinearInclusive(v, 0.25),
    p50: percentileLinearInclusive(v, 0.5),
    p75: percentileLinearInclusive(v, 0.75),
    p90: percentileLinearInclusive(v, 0.9),
    p95: percentileLinearInclusive(v, 0.95),
    p99: percentileLinearInclusive(v, 0.99),
    max: v[v.length - 1],
    mean: Math.round(mean * 1e6) / 1e6,
  };
}

function tripIntensityKindMetrics(records, kind, exposureSeconds) {
  const adm = records.filter(
    (r) =>
      r.kind === kind &&
      (r.classification === 'ADMISSIBLE_FULL' || r.classification === 'ADMISSIBLE_BIN_ONLY') &&
      r.meanAccelMps2 != null &&
      Number.isFinite(r.meanAccelMps2),
  );
  const full = adm.filter((r) => r.classification === 'ADMISSIBLE_FULL').map((r) => r.meanAccelMps2);
  full.sort((a, b) => a - b);
  const all = adm.map((r) => r.meanAccelMps2).sort((a, b) => a - b);
  let impulseSum = 0;
  let durSum = 0;
  let impulseOk = true;
  for (const r of adm) {
    const a = r.meanAccelMps2;
    const t = r.durationS;
    if (a == null || t == null || !Number.isFinite(a) || !Number.isFinite(t) || a <= 0 || t < 0) {
      impulseOk = false;
      break;
    }
    impulseSum += a * t;
    durSum += t;
  }
  const n = adm.length;
  const nFull = full.length;
  const b = impulseOk && n > 0 ? Math.round(impulseSum * 1e6) / 1e6 : null;
  const e = exposureSeconds != null && exposureSeconds > 0 ? exposureSeconds : null;
  return {
    admissibleEventCount: n,
    fullEventCount: nFull,
    binOnlyEventCount: n - nFull,
    B_k_specificLongitudinalImpulseMps: b,
    I_k_normalizedMeanAccelMps2: b != null && e != null ? Math.round((b / e) * 1e6) / 1e6 : null,
    Phi_k_eventsPerMinute: e != null && n > 0 ? Math.round(((60 * n) / e) * 1e6) / 1e6 : null,
    Phi_d_k_eventsPerKm: null,
    S_k_maneuverTimeShare: e != null && impulseOk ? Math.round((durSum / e) * 1e6) / 1e6 : null,
    a50_intensityMedianFullMps2: nFull >= 3 ? median(full) : null,
    a90_intensityP90FullMps2: nFull >= 10 ? percentileLinearInclusive(full, 0.9) : null,
    amax_intensityMaxAdmissibleMps2: all.length > 0 ? all[all.length - 1] : null,
  };
}

async function loadEventsByTrip() {
  const byTrip = new Map();
  const rl = readline.createInterface({
    input: fs.createReadStream(path.join(IN, 'event-intensity-dataset.jsonl')),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    if (!line.trim()) continue;
    const rec = JSON.parse(line);
    if (!byTrip.has(rec.tripId)) byTrip.set(rec.tripId, []);
    byTrip.get(rec.tripId).push(rec);
  }
  return byTrip;
}

function main() {
  const index = JSON.parse(fs.readFileSync(path.join(IN, 'layer2-observables-index.json'), 'utf8'));
  const summary = JSON.parse(fs.readFileSync(path.join(IN, 'batch-dataset-summary.json'), 'utf8'));

  const candidates = index.filter((t) => t.qualityClassification?.eligible === true);
  const excluded = index.filter((t) => !t.qualityClassification?.eligible);

  const labels = ['ARTEON', 'AUDI_A4', 'TIGUAN', 'TESLA_M3'];

  return loadEventsByTrip().then((eventsByTrip) => {
    const population157 = { totalTrips: index.length, candidates: candidates.length, excluded: excluded.length };

    function vehicleSlice(trips) {
      const out = {};
      for (const label of labels) {
        const subset = trips.filter((t) => t.label === label);
        let accelEv = 0;
        let brakeEv = 0;
        let full = 0;
        let binOnly = 0;
        let bAccelNull = 0;
        let bBrakeNull = 0;
        for (const t of subset) {
          const evs = eventsByTrip.get(t.tripId) ?? [];
          for (const e of evs) {
            if (e.kind === 'ACCELERATION') accelEv++;
            if (e.kind === 'DECELERATION') brakeEv++;
            if (e.durationTier === 'FULL_ELIGIBLE' || e.classification === 'ADMISSIBLE_FULL') full++;
            if (e.durationTier === 'BIN_ONLY' || e.classification === 'ADMISSIBLE_BIN_ONLY') binOnly++;
          }
          if (t.layer2?.accelImpulseMps == null) bAccelNull++;
          if (t.layer2?.brakeImpulseMps == null) bBrakeNull++;
        }
        out[label] = {
          tripCount: subset.length,
          accelAdmissibleEvents: accelEv,
          brakeAdmissibleEvents: brakeEv,
          fullEvents: full,
          binOnlyEvents: binOnly,
          layer2_accelImpulseNullTrips: bAccelNull,
          layer2_brakeImpulseNullTrips: bBrakeNull,
          exclusionReasonCounts: Object.fromEntries(
            [...new Set(subset.flatMap((t) => t.qualityClassification?.exclusionReasons ?? []))].map((r) => [
              r,
              subset.filter((x) => (x.qualityClassification?.exclusionReasons ?? []).includes(r)).length,
            ]),
          ),
        };
      }
      return out;
    }

    const partA116 = vehicleSlice(candidates);
    const partA157 = vehicleSlice(index);

    // Part B — FULL intensity pooled (candidate trips only)
    const accelFull = [];
    const brakeFull = [];
    const accelFullTrips = new Set();
    const brakeFullTrips = new Set();
    const accelFullVehicles = new Set();
    const brakeFullVehicles = new Set();
    let binOnlyAccel = 0;
    let binOnlyBrake = 0;

    for (const t of candidates) {
      const evs = eventsByTrip.get(t.tripId) ?? [];
      for (const e of evs) {
        if (e.classification === 'ADMISSIBLE_BIN_ONLY') {
          if (e.kind === 'ACCELERATION') binOnlyAccel++;
          if (e.kind === 'DECELERATION') binOnlyBrake++;
        }
        if (e.classification !== 'ADMISSIBLE_FULL') continue;
        if (e.meanAccelMps2 == null || !Number.isFinite(e.meanAccelMps2)) continue;
        if (e.kind === 'ACCELERATION') {
          accelFull.push(e.meanAccelMps2);
          accelFullTrips.add(t.tripId);
          accelFullVehicles.add(t.label);
        }
        if (e.kind === 'DECELERATION') {
          brakeFull.push(e.meanAccelMps2);
          brakeFullTrips.add(t.tripId);
          brakeFullVehicles.add(t.label);
        }
      }
    }

    const intensityDefinition =
      'Event-level mean longitudinal acceleration magnitude meanAccelMps2 (m/s²) from DS4 event intensity eligibility records; ACCELERATION and DECELERATION kinds analyzed separately; FULL = classification ADMISSIBLE_FULL / durationTier FULL_ELIGIBLE only (≥3 s eligible steps in motion event detector policy).';

    const partB = {
      intensityDefinition,
      units: 'm/s² (meanAccelMps2)',
      ACCEL_FULL: {
        ...distStats(accelFull),
        eventCount: accelFull.length,
        tripCount: accelFullTrips.size,
        vehicleCount: accelFullVehicles.size,
      },
      BRAKE_FULL: {
        ...distStats(brakeFull),
        eventCount: brakeFull.length,
        tripCount: brakeFullTrips.size,
        vehicleCount: brakeFullVehicles.size,
      },
      BIN_ONLY_counts: { ACCEL: binOnlyAccel, BRAKE: binOnlyBrake, total: binOnlyAccel + binOnlyBrake },
    };

    // Part C — trip-level L2 from published index (B_k) + event-derived intensity fields; I/Phi/S need exposureSeconds (not in v1 export)
    const tripObs = [];
    for (const t of candidates) {
      const evs = eventsByTrip.get(t.tripId) ?? [];
      const accel = tripIntensityKindMetrics(evs, 'ACCELERATION', null);
      const brake = tripIntensityKindMetrics(evs, 'DECELERATION', null);
      tripObs.push({
        tripId: t.tripId,
        label: t.label,
        publishedLayer2: {
          B_k_accel_mps: t.layer2?.accelImpulseMps ?? null,
          B_k_brake_mps: t.layer2?.brakeImpulseMps ?? null,
          exposureGate: t.layer2?.exposureGate ?? null,
          reasonCodes: t.layer2?.reasonCodes ?? [],
        },
        eventDerivedSameAsL2IntensityFields: {
          ACCEL: {
            a50: accel.a50_intensityMedianFullMps2,
            a90: accel.a90_intensityP90FullMps2,
            amax: accel.amax_intensityMaxAdmissibleMps2,
            B_k_fromEvents: accel.B_k_specificLongitudinalImpulseMps,
          },
          BRAKE: {
            a50: brake.a50_intensityMedianFullMps2,
            a90: brake.a90_intensityP90FullMps2,
            amax: brake.amax_intensityMaxAdmissibleMps2,
            B_k_fromEvents: brake.B_k_specificLongitudinalImpulseMps,
          },
        },
        I_k_Phi_k_S_k: {
          note: 'exposureSeconds not present in batch v1 layer2-observables-index; I_k, Phi_k, Phi_d_k, S_k not reconstructed (would require motion-derived driving exposure or full per-trip l2 JSON).',
          ACCEL: {
            I_k: null,
            Phi_k: null,
            Phi_d_k: null,
            S_k: null,
          },
          BRAKE: {
            I_k: null,
            Phi_k: null,
            Phi_d_k: null,
            S_k: null,
          },
        },
      });
    }

    const pick = (arr) => arr.filter((x) => x != null && Number.isFinite(x));
    const partC = {
      modelVersion: 'DS4_LOAD_OBSERVABLES_V1',
      exposureGate: 'UNCALIBRATED',
      published_B_k_distributions: {
        ACCEL: distStats(candidates.map((t) => t.layer2?.accelImpulseMps)),
        BRAKE: distStats(candidates.map((t) => t.layer2?.brakeImpulseMps)),
      },
      tripLevel_a50_a90_amax_fromEvents_candidatesOnly: {
        ACCEL_a50: distStats(tripObs.map((t) => t.eventDerivedSameAsL2IntensityFields.ACCEL.a50)),
        ACCEL_a90: distStats(tripObs.map((t) => t.eventDerivedSameAsL2IntensityFields.ACCEL.a90)),
        ACCEL_amax: distStats(tripObs.map((t) => t.eventDerivedSameAsL2IntensityFields.ACCEL.amax)),
        BRAKE_a50: distStats(tripObs.map((t) => t.eventDerivedSameAsL2IntensityFields.BRAKE.a50)),
        BRAKE_a90: distStats(tripObs.map((t) => t.eventDerivedSameAsL2IntensityFields.BRAKE.a90)),
        BRAKE_amax: distStats(tripObs.map((t) => t.eventDerivedSameAsL2IntensityFields.BRAKE.amax)),
      },
      nullSemantics: {
        accelImpulseNullTrips_all157: index.filter((t) => t.layer2?.accelImpulseMps == null).length,
        brakeImpulseNullTrips_all157: index.filter((t) => t.layer2?.brakeImpulseMps == null).length,
        a90_nullReason: 'L2 sets intensityP90FullMps2 null unless fullEventCount>=10 per kind per trip',
        a50_nullReason: 'L2 sets intensityMedianFullMps2 null unless fullEventCount>=3 per kind per trip',
      },
    };

    // Part D
    const eventsPerTrip = (tripId) => (eventsByTrip.get(tripId) ?? []).length;
    const candEvents = candidates.map((t) => eventsPerTrip(t.tripId));
    const exclEvents = excluded.map((t) => eventsPerTrip(t.tripId));

    function leaveOneVehicleOutP95(values, getLabel) {
      const res = {};
      for (const label of labels) {
        const filtered = values.filter((v) => getLabel(v) !== label);
        res[label] = distStats(filtered.map((x) => x.intensity)).p95;
      }
      return res;
    }

    const brakeFullRecords = [];
    for (const t of candidates) {
      for (const e of eventsByTrip.get(t.tripId) ?? []) {
        if (e.classification === 'ADMISSIBLE_FULL' && e.kind === 'DECELERATION' && e.meanAccelMps2 != null) {
          brakeFullRecords.push({ intensity: e.meanAccelMps2, label: t.label, tripId: t.tripId });
        }
      }
    }
    const baselineP95Brake = distStats(brakeFullRecords.map((r) => r.intensity)).p95;
    const looVehicleP95 = leaveOneVehicleOutP95(brakeFullRecords, (r) => r.label);

    const tripP95Brake = [];
    for (const t of candidates) {
      const ints = (eventsByTrip.get(t.tripId) ?? [])
        .filter((e) => e.classification === 'ADMISSIBLE_FULL' && e.kind === 'DECELERATION')
        .map((e) => e.meanAccelMps2)
        .filter((x) => x != null);
      tripP95Brake.push({ tripId: t.tripId, label: t.label, p95: distStats(ints).p95 });
    }
    const looTrip = [];
    for (const drop of tripP95Brake) {
      const pool = brakeFullRecords.filter((r) => r.tripId !== drop.tripId).map((r) => r.intensity);
      looTrip.push({ droppedTripId: drop.tripId, p95BrakeFull: distStats(pool).p95 });
    }
    const looTripDelta = looTrip.map((x) => ({
      droppedTripId: x.droppedTripId,
      deltaFromBaseline: x.p95BrakeFull == null || baselineP95Brake == null ? null : x.p95BrakeFull - baselineP95Brake,
    }));
    looTripDelta.sort((a, b) => Math.abs(b.deltaFromBaseline ?? 0) - Math.abs(a.deltaFromBaseline ?? 0));

    const partD = {
      vehicleConcentration_candidates: Object.fromEntries(
        labels.map((l) => [l, candidates.filter((t) => t.label === l).length / candidates.length]),
      ),
      eventDependenceNote:
        'Events are nested within trips and vehicles; pooled event percentiles treat events as i.i.d. (optimistic precision).',
      selectionBias_excluded41: {
        tripCount: excluded.length,
        meanAdmissibleEventsPerTrip: exclEvents.length ? exclEvents.reduce((a, b) => a + b, 0) / exclEvents.length : 0,
        zeroEventTrips: excluded.filter((t) => eventsPerTrip(t.tripId) === 0).length,
        exclusionReasonCounts: summary.summary?.qualityExclusions ?? {},
        byVehicle: vehicleSlice(excluded),
      },
      selectionBias_candidates116: {
        meanAdmissibleEventsPerTrip: candEvents.reduce((a, b) => a + b, 0) / candEvents.length,
      },
      tailStability_BRAKE_FULL_p95: {
        baseline: baselineP95Brake,
        leaveOneVehicleOut_p95: looVehicleP95,
        maxAbsDelta_leaveOneVehicle:
          Math.max(...Object.values(looVehicleP95).map((p) => (p == null || baselineP95Brake == null ? 0 : Math.abs(p - baselineP95Brake)))) ||
          null,
        top5_leaveOneTrip_absDelta: looTripDelta.slice(0, 5),
      },
      disclaimer: 'LOO checks are descriptive sensitivity only; not fleet generalizability proof.',
    };

    const pkg = {
      packageId: 'ds4-l3b-decision-package-20261029',
      generatedAtUtc: new Date().toISOString(),
      upstreamBatchId: summary.batchId,
      productionSha: summary.productionSha,
      immutableSources: [
        'inputs/batch-dataset-summary.json',
        'inputs/layer2-observables-index.json',
        'inputs/event-intensity-dataset.jsonl',
        'inputs/quality-exclusion-report.json',
        'inputs/cohort-manifest.json',
      ],
      population157,
      partA: { primary116: partA116, full157: partA157 },
      partB,
      partC,
      partD,
    };

    fs.writeFileSync(path.join(OUT, 'l3b-statistics.json'), JSON.stringify(pkg, null, 2));
    fs.writeFileSync(path.join(OUT, 'trip-layer2-partial-index.json'), JSON.stringify(tripObs, null, 2));
    console.log(JSON.stringify({ ok: true, candidates: candidates.length, out: OUT }));
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
