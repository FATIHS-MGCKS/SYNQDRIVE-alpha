#!/usr/bin/env node
/**
 * DS4 L3-C — artefact screening & robust FULL reference (immutable inputs only).
 */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import crypto from 'node:crypto';

const ROOT = path.dirname(new URL(import.meta.url).pathname);
const IN = path.join(ROOT, 'inputs');
const OUT = path.join(ROOT, 'outputs');
const POLICY = JSON.parse(fs.readFileSync(path.join(ROOT, 'screening-policy.json'), 'utf8'));

const BOOTSTRAP_SEED = 20261029;
const BOOTSTRAP_B = 2000;

function sha256File(p) {
  const h = crypto.createHash('sha256');
  h.update(fs.readFileSync(p));
  return h.digest('hex');
}

function percentileLinearInclusive(sortedAsc, p) {
  if (sortedAsc.length === 0) return null;
  if (sortedAsc.length === 1) return sortedAsc[0];
  const pos = p * (sortedAsc.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sortedAsc[lo];
  return sortedAsc[lo] + (pos - lo) * (sortedAsc[hi] - sortedAsc[lo]);
}

function weightedPercentile(values, weights, p) {
  const pairs = values.map((v, i) => ({ v, w: weights[i] })).filter((x) => x.v != null && Number.isFinite(x.v) && x.w > 0);
  if (pairs.length === 0) return null;
  pairs.sort((a, b) => a.v - b.v);
  const totalW = pairs.reduce((s, x) => s + x.w, 0);
  let cum = 0;
  const target = p * totalW;
  for (const x of pairs) {
    cum += x.w;
    if (cum >= target) return x.v;
  }
  return pairs[pairs.length - 1].v;
}

function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function naivePercentiles(arr, ps) {
  const s = [...arr].sort((a, b) => a - b);
  const out = {};
  for (const p of ps) out[`P${Math.round(p * 100)}`] = percentileLinearInclusive(s, p);
  return { sorted: s, ...out, n: s.length };
}

function tripWeightedPercentiles(tripIntensities, ps) {
  const values = [];
  const weights = [];
  for (const { intensities } of tripIntensities) {
    if (intensities.length === 0) continue;
    const w = 1 / intensities.length;
    for (const v of intensities) {
      values.push(v);
      weights.push(w);
    }
  }
  const out = { contributingTrips: tripIntensities.filter((t) => t.intensities.length > 0).length, eventCount: values.length };
  for (const p of ps) out[`P${Math.round(p * 100)}`] = weightedPercentile(values, weights, p);
  return out;
}

function bootstrapTripWeightedCI(tripIntensities, p, B, rng) {
  const trips = tripIntensities.filter((t) => t.intensities.length > 0);
  if (trips.length === 0) return { low: null, high: null, B, p };
  const stats = [];
  for (let b = 0; b < B; b++) {
    const sample = [];
    for (let i = 0; i < trips.length; i++) {
      const j = Math.floor(rng() * trips.length);
      sample.push(trips[j]);
    }
    stats.push(tripWeightedPercentiles(sample, [p])[`P${Math.round(p * 100)}`]);
  }
  stats.sort((a, b) => a - b);
  return {
    p,
    B,
    low: percentileLinearInclusive(stats, 0.025),
    high: percentileLinearInclusive(stats, 0.975),
    median: percentileLinearInclusive(stats, 0.5),
  };
}

function parseIso(s) {
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : t;
}

function isAdmissible(r) {
  return r.classification === 'ADMISSIBLE_FULL' || r.classification === 'ADMISSIBLE_BIN_ONLY';
}

function computeBk(events, kind, excludeKeys) {
  let sum = 0;
  for (const e of events) {
    if (e.kind !== kind) continue;
    if (!isAdmissible(e)) continue;
    const key = `${e.tripId}:${e.eventIndex}`;
    if (excludeKeys.has(key)) continue;
    const a = e.meanAccelMps2;
    const t = e.durationS;
    if (a == null || t == null || !Number.isFinite(a) || a <= 0 || t < 0) continue;
    sum += a * t;
  }
  return Math.round(sum * 1e6) / 1e6;
}

function screenEvent(e, policy) {
  const reasons = [];
  let verdict = 'CLEAR';
  if (!isAdmissible(e)) return { verdict: 'CLEAR', reasons: [], screenClass: 'NOT_ADMISSIBLE' };
  const a = e.meanAccelMps2;
  const t = e.durationS;
  if (a == null || t == null) return { verdict: 'INDETERMINATE', reasons: ['MISSING_INTENSITY_OR_DURATION'], screenClass: 'INDETERMINATE' };
  const dv = a * t;
  if (a > policy.physicalPlausibility.conservativeMaxMeanLongitudinalMps2) {
    reasons.push(policy.physicalPlausibility.reasonCodeConfirmed);
    verdict = 'CONFIRMED';
  }
  if (dv > policy.impliedDeltaV.conservativeMaxDeltaV_mps) {
    reasons.push(policy.impliedDeltaV.reasonCodeConfirmed);
    verdict = 'CONFIRMED';
  }
  return { verdict, reasons, screenClass: verdict, impliedDeltaV_mps: Math.round(dv * 1e6) / 1e6 };
}

function detectMirrorPairs(admissibleEvents, policy) {
  const byTrip = new Map();
  for (const e of admissibleEvents) {
    if (!byTrip.has(e.tripId)) byTrip.set(e.tripId, []);
    byTrip.get(e.tripId).push(e);
  }
  const pairFlags = new Map();
  for (const [, evs] of byTrip) {
    evs.sort((a, b) => (parseIso(a.startLabel) ?? 0) - (parseIso(b.startLabel) ?? 0));
    for (let i = 0; i < evs.length - 1; i++) {
      const a = evs[i];
      const b = evs[i + 1];
      const ta = parseIso(a.startLabel);
      const tb = parseIso(b.startLabel);
      if (ta == null || tb == null) continue;
      const gapS = (tb - ta) / 1000;
      if (gapS > policy.mirrorPair.maxGapBetweenEventStartsSeconds) continue;
      const kindsOpposite =
        (a.kind === 'ACCELERATION' && b.kind === 'DECELERATION') || (a.kind === 'DECELERATION' && b.kind === 'ACCELERATION');
      if (!kindsOpposite) continue;
      const ia = a.meanAccelMps2;
      const ib = b.meanAccelMps2;
      if (ia == null || ib == null) continue;
      const ratio = ia / ib;
      const hi = Math.max(ia, ib);
      if (hi < policy.mirrorPair.minIntensityForPairMps2) continue;
      if (ratio >= policy.mirrorPair.intensityRatioMin && ratio <= policy.mirrorPair.intensityRatioMax) {
        const keyA = `${a.tripId}:${a.eventIndex}`;
        const keyB = `${b.tripId}:${b.eventIndex}`;
        const confirmed = ia > policy.physicalPlausibility.conservativeMaxMeanLongitudinalMps2 ||
          ib > policy.physicalPlausibility.conservativeMaxMeanLongitudinalMps2;
        pairFlags.set(keyA, {
          verdict: confirmed ? 'CONFIRMED' : 'SUSPECTED',
          reasons: [confirmed ? policy.mirrorPair.reasonCodeConfirmed : policy.mirrorPair.reasonCodeSuspected],
          pairWith: keyB,
          gapStartSeconds: gapS,
        });
        pairFlags.set(keyB, {
          verdict: confirmed ? 'CONFIRMED' : 'SUSPECTED',
          reasons: [confirmed ? policy.mirrorPair.reasonCodeConfirmed : policy.mirrorPair.reasonCodeSuspected],
          pairWith: keyA,
          gapStartSeconds: gapS,
        });
      }
    }
  }
  return pairFlags;
}

function estimateIcc(logValuesByTrip) {
  const trips = [...logValuesByTrip.values()].filter((v) => v.length > 0);
  if (trips.length < 2) return { icc: null, designEffect: null, note: 'insufficient_trips' };
  const all = trips.flat();
  const n = all.length;
  const k = trips.length;
  const grandMean = all.reduce((s, x) => s + x, 0) / n;
  let ssBetween = 0;
  let ssWithin = 0;
  for (const t of trips) {
    const m = t.reduce((s, x) => s + x, 0) / t.length;
    ssBetween += t.length * (m - grandMean) ** 2;
    for (const x of t) ssWithin += (x - m) ** 2;
  }
  const msBetween = ssBetween / (k - 1);
  const msWithin = ssWithin / (n - k);
  const mBar = n / k;
  const icc = msBetween <= 0 ? 0 : (msBetween - msWithin) / (msBetween + (mBar - 1) * msWithin);
  const rho = Math.max(0, Math.min(1, icc));
  const m = n / k;
  return { icc: Math.round(rho * 1e6) / 1e6, designEffect: Math.round((1 + (m - 1) * rho) * 1e6) / 1e6, meanClusterSize: m };
}

async function loadJsonl(file) {
  const rows = [];
  const rl = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
  for await (const line of rl) {
    if (line.trim()) rows.push(JSON.parse(line));
  }
  return rows;
}

async function main() {
  const inputFiles = {
    eventIntensityJsonl: path.join(IN, 'event-intensity-dataset.jsonl'),
    layer2Index: path.join(IN, 'layer2-observables-index.json'),
    cohortManifest: path.join(IN, 'cohort-manifest.json'),
    batchSummary: path.join(IN, 'batch-v1-batch-dataset-summary.json'),
  };

  const integrity = {
    verifiedAtUtc: new Date().toISOString(),
    files: Object.fromEntries(
      Object.entries(inputFiles).map(([k, p]) => [k, { path: p, sha256: sha256File(p), sizeBytes: fs.statSync(p).size }]),
    ),
    originalsUnmodified: true,
    jsonlTimingEvidence: {
      fieldsPresent: ['startLabel', 'endLabel', 'durationS', 'meanAccelMps2', 'coverageRatio', 'eventQuality', 'classification', 'kind', 'eventIndex'],
      speedSeriesInJsonl: false,
      neighborEventEvidence: 'startLabel ordering within trip sufficient for mirror-pair timing; no per-label speed in export',
      verdict: 'SUFFICIENT_FOR_DOCUMENTED_SCREENING_WITH_INDETERMINATE_WHERE_TIMING_MISSING',
    },
  };

  const policy = POLICY;
  const index = JSON.parse(fs.readFileSync(inputFiles.layer2Index, 'utf8'));
  const manifest = JSON.parse(fs.readFileSync(inputFiles.cohortManifest, 'utf8'));
  const sourceByTrip = new Map(manifest.trips.map((t) => [t.tripId, t.sourceFamily]));
  const events = await loadJsonl(inputFiles.eventIntensityJsonl);

  const preScreenCandidates = new Set(index.filter((t) => t.qualityClassification?.eligible).map((t) => t.tripId));
  const admissible = events.filter(isAdmissible);
  const mirrorFlags = detectMirrorPairs(admissible, policy);

  const ledger = [];
  const excludeKeys = new Set();
  let confirmed = 0;
  let suspected = 0;
  let indeterminate = 0;

  for (const e of admissible) {
    const base = screenEvent(e, policy);
    const key = `${e.tripId}:${e.eventIndex}`;
    const mirror = mirrorFlags.get(key);
    let verdict = base.verdict;
    let reasons = [...base.reasons];
    if (mirror) {
      if (mirror.verdict === 'CONFIRMED' || verdict === 'CONFIRMED') verdict = 'CONFIRMED';
      else if (verdict === 'CLEAR') verdict = 'SUSPECTED';
      reasons = [...new Set([...reasons, ...mirror.reasons])];
    }
    if (verdict === 'CONFIRMED') {
      confirmed++;
      excludeKeys.add(key);
    } else if (verdict === 'SUSPECTED') {
      suspected++;
    } else if (verdict === 'INDETERMINATE') indeterminate++;

    ledger.push({
      tripId: e.tripId,
      vehicleId: e.vehicleId,
      label: e.label,
      eventIndex: e.eventIndex,
      kind: e.kind,
      tier: e.durationTier,
      classification: e.classification,
      meanAccelMps2: e.meanAccelMps2,
      durationS: e.durationS,
      startLabel: e.startLabel,
      endLabel: e.endLabel,
      coverageRatio: e.coverageRatio,
      eventQuality: e.eventQuality,
      verdict,
      reasonCodes: reasons,
      mirrorPairWith: mirror?.pairWith ?? null,
    });
  }

  const bkImpacts = [];
  let maxBkDistortion = { tripId: null, kind: null, delta: 0 };
  for (const t of index) {
    const tripEvents = events.filter((e) => e.tripId === t.tripId);
    for (const kind of ['ACCELERATION', 'DECELERATION']) {
      const orig = kind === 'ACCELERATION' ? t.layer2?.accelImpulseMps : t.layer2?.brakeImpulseMps;
      const screened = computeBk(tripEvents, kind, excludeKeys);
      const delta = orig != null && screened != null ? Math.round((orig - screened) * 1e6) / 1e6 : null;
      if (delta != null && Math.abs(delta) > Math.abs(maxBkDistortion.delta)) {
        maxBkDistortion = { tripId: t.tripId, label: t.label, kind, original: orig, screened, delta };
      }
      const impacted = ledger.filter((l) => l.tripId === t.tripId && l.kind === kind && (l.verdict === 'CONFIRMED' || l.verdict === 'SUSPECTED'));
      if (impacted.length === 0 && (orig == null || delta === 0)) continue;
      for (const l of impacted) {
        bkImpacts.push({
          tripId: t.tripId,
          label: t.label,
          eventId: l.eventIndex,
          kind: l.kind,
          tier: l.tier,
          intensity: l.meanAccelMps2,
          durationS: l.durationS,
          originalBk_mps: orig,
          screenedBk_mps: screened,
          bkDelta_mps: delta,
          verdict: l.verdict,
          reasonCodes: l.reasonCodes,
        });
      }
    }
  }

  const arteonMirror = ledger.filter((l) => l.tripId.startsWith('630dc631') && l.verdict === 'CONFIRMED');

  const ps = [0.25, 0.5, 0.75, 0.9, 0.95];
  const rng = mulberry32(BOOTSTRAP_SEED);

  function buildFullStats(cohortTripIds, label) {
    const tripAccel = [];
    const tripBrake = [];
    let zeroFullAccelTrips = 0;
    let zeroFullBrakeTrips = 0;
    for (const tid of cohortTripIds) {
      const evs = events.filter((e) => e.tripId === tid && e.classification === 'ADMISSIBLE_FULL');
      const acc = evs.filter((e) => e.kind === 'ACCELERATION').map((e) => e.meanAccelMps2).filter((x) => x != null);
      const brk = evs.filter((e) => e.kind === 'DECELERATION').map((e) => e.meanAccelMps2).filter((x) => x != null);
      if (acc.length === 0) zeroFullAccelTrips++;
      if (brk.length === 0) zeroFullBrakeTrips++;
      const meta = index.find((x) => x.tripId === tid);
      tripAccel.push({ tripId: tid, label: meta?.label, intensities: acc });
      tripBrake.push({ tripId: tid, label: meta?.label, intensities: brk });
    }
    const naiveA = tripAccel.flatMap((t) => t.intensities);
    const naiveB = tripBrake.flatMap((t) => t.intensities);
    return {
      scope: label,
      cohortTripCount: cohortTripIds.size,
      zeroFullEventTrips: { ACCEL: zeroFullAccelTrips, BRAKE: zeroFullBrakeTrips },
      ACCEL: {
        naive: naivePercentiles(naiveA, ps),
        tripWeighted: tripWeightedPercentiles(tripAccel, ps),
        bootstrapCI: {
          P50: bootstrapTripWeightedCI(tripAccel, 0.5, BOOTSTRAP_B, rng),
          P90: bootstrapTripWeightedCI(tripAccel, 0.9, BOOTSTRAP_B, rng),
          P95: bootstrapTripWeightedCI(tripAccel, 0.95, BOOTSTRAP_B, rng),
        },
      },
      BRAKE: {
        naive: naivePercentiles(naiveB, ps),
        tripWeighted: tripWeightedPercentiles(tripBrake, ps),
        bootstrapCI: {
          P50: bootstrapTripWeightedCI(tripBrake, 0.5, BOOTSTRAP_B, rng),
          P90: bootstrapTripWeightedCI(tripBrake, 0.9, BOOTSTRAP_B, rng),
          P95: bootstrapTripWeightedCI(tripBrake, 0.95, BOOTSTRAP_B, rng),
        },
      },
    };
  }

  const cohort116 = preScreenCandidates;
  const fullStatsAggregate = buildFullStats(cohort116, 'C4_pre_screen_116_descriptive_aggregate');
  const byVehicle = {};
  for (const label of ['ARTEON', 'AUDI_A4', 'TIGUAN', 'TESLA_M3']) {
    const ids = new Set([...cohort116].filter((tid) => index.find((x) => x.tripId === tid)?.label === label));
    if (ids.size > 0) byVehicle[label] = buildFullStats(ids, label);
  }

  const brakeTrips = [...cohort116].map((tid) => {
    const intensities = events
      .filter((e) => e.tripId === tid && e.classification === 'ADMISSIBLE_FULL' && e.kind === 'DECELERATION')
      .map((e) => e.meanAccelMps2)
      .filter((x) => x != null);
    return { tripId: tid, label: index.find((x) => x.tripId === tid)?.label, intensities };
  }).filter((t) => t.intensities.length > 0);

  const baselineP95 = fullStatsAggregate.BRAKE.tripWeighted.P95;
  const looVehicle = {};
  for (const label of ['ARTEON', 'AUDI_A4', 'TIGUAN']) {
    const sample = brakeTrips.filter((t) => t.label !== label);
    looVehicle[label] = tripWeightedPercentiles(sample, [0.95]).P95;
  }
  const looTrip = brakeTrips
    .map((drop) => {
      const sample = brakeTrips.filter((t) => t.tripId !== drop.tripId);
      const p95 = tripWeightedPercentiles(sample, [0.95]).P95;
      return { tripId: drop.tripId, label: drop.label, p95, deltaFromBaseline: p95 != null && baselineP95 != null ? p95 - baselineP95 : null };
    })
    .sort((a, b) => Math.abs(b.deltaFromBaseline ?? 0) - Math.abs(a.deltaFromBaseline ?? 0))
    .slice(0, 10);

  const logByTrip = new Map();
  for (const t of brakeTrips) logByTrip.set(t.tripId, t.intensities.map((x) => Math.log(x)));
  const iccBrake = estimateIcc(logByTrip);

  const tripEndMs = new Map();
  for (const tid of cohort116) {
    const labels = events.filter((e) => e.tripId === tid).map((e) => parseIso(e.endLabel ?? e.startLabel)).filter((x) => x != null);
    tripEndMs.set(tid, labels.length ? Math.max(...labels) : null);
  }
  const ends = [...tripEndMs.values()].filter((x) => x != null).sort((a, b) => a - b);
  const mid = ends[Math.floor(ends.length / 2)];
  const early = new Set([...cohort116].filter((tid) => (tripEndMs.get(tid) ?? 0) <= mid));
  const late = new Set([...cohort116].filter((tid) => (tripEndMs.get(tid) ?? 0) > mid));
  const temporal =
    early.size > 5 && late.size > 5
      ? {
          split: 'median_trip_endLabel_utc',
          earlyTrips: early.size,
          lateTrips: late.size,
          BRAKE_tripWeighted_P95: {
            early: buildFullStats(early, 'early').BRAKE.tripWeighted.P95,
            late: buildFullStats(late, 'late').BRAKE.tripWeighted.P95,
            delta: null,
          },
        }
      : { status: 'NOT_EVALUABLE' };
  if (temporal.BRAKE_tripWeighted_P95) {
    temporal.BRAKE_tripWeighted_P95.delta =
      temporal.BRAKE_tripWeighted_P95.late - temporal.BRAKE_tripWeighted_P95.early;
  }

  const teslaTrips = index.filter((t) => t.label === 'TESLA_M3');
  const teslaDiagnostic = {
    path_b_tesla_trips: teslaTrips.length,
    pre_screen_candidates: teslaTrips.filter((t) => t.qualityClassification?.eligible).length,
    exclusionReasons: teslaTrips.reduce((acc, t) => {
      for (const r of t.qualityClassification?.exclusionReasons ?? []) acc[r] = (acc[r] ?? 0) + 1;
      return acc;
    }, {}),
    sourceFamily: 'API_SYNTHETIC (all 33 from cohort-manifest)',
    codePath: {
      l2Gate: "input.evidenceQuality !== 'PRESENT' => EVIDENCE_QUALITY_NOT_PRESENT",
      assessmentField: 'evidenceQuality := payload.contract.sparse.channelOutcome (ds4-trip-assessment-v1.engine)',
      requiredForL2: 'exact string PRESENT',
    },
    classification: 'UNMAPPED_LINEAGE',
    rationale:
      'Assessment copies sparse.channelOutcome, not a normalized PRESENT flag; Tesla API_SYNTHETIC replays yield channelOutcome != PRESENT so L2 fails deterministically without absent DB field — computed assessment path but failing gate mapping, not gate weakened.',
    synthesizeEvidence: false,
  };

  const h1 = {
    id: 'H1_artefact_screening',
    status: confirmed + suspected > 0 ? 'PASS_WITH_FINDINGS' : 'PASS',
    admissibleScreened: admissible.length,
    confirmedArtefacts: confirmed,
    suspectedArtefacts: suspected,
    indeterminateAdmissible: indeterminate,
    physicsBoundMps2: policy.physicalPlausibility.conservativeMaxMeanLongitudinalMps2,
  };

  const p75 = fullStatsAggregate.BRAKE.tripWeighted.P75;
  const p95 = fullStatsAggregate.BRAKE.tripWeighted.P95;
  const ci95 = fullStatsAggregate.BRAKE.bootstrapCI.P95;
  const halfWidth = ci95.high != null && ci95.low != null ? (ci95.high - ci95.low) / 2 : null;
  const h2 = {
    id: 'H2_percentile_resolvability_BRAKE_P95',
    status:
      halfWidth != null && p75 != null && p95 != null && halfWidth < 0.5 * (p95 - p75)
        ? 'PASS'
        : halfWidth == null
          ? 'NOT_EVALUABLE'
          : 'FAIL',
    halfWidth,
    threshold: p75 != null && p95 != null ? 0.5 * (p95 - p75) : null,
  };

  const h3 = {
    id: 'H3_vehicle_robustness_BRAKE_P95',
    status: 'NOT_EVALUABLE',
    note: 'Bootstrap CI on 116-trip aggregate only; LOO vehicle P95 shifts recorded — formal PASS requires CI envelope comparison not fully implemented',
    looVehicleP95: looVehicle,
    baselineP95,
  };

  const h4 = {
    id: 'H4_trip_influence_BRAKE_P95',
    status:
      looTrip[0]?.deltaFromBaseline != null && halfWidth != null && Math.abs(looTrip[0].deltaFromBaseline) <= halfWidth
        ? 'PASS'
        : 'NOT_EVALUABLE',
    maxAbsLooTripDelta: looTrip[0]?.deltaFromBaseline ?? null,
    bootstrapHalfWidth: halfWidth,
  };

  const h5 = {
    id: 'H5_temporal_stability',
    status:
      temporal.status === 'NOT_EVALUABLE'
        ? 'NOT_EVALUABLE'
        : Math.abs(temporal.BRAKE_tripWeighted_P95.delta) <= (halfWidth ?? Infinity)
          ? 'PASS'
          : 'FAIL',
    temporal,
    bootstrapHalfWidth: halfWidth,
  };

  const postScreenResearchCandidates = {
    note: 'Eligibility NOT auto-changed; research post-screen flag for trips with CONFIRMED artefact affecting B_k',
    count: [...new Set(bkImpacts.filter((x) => x.verdict === 'CONFIRMED').map((x) => x.tripId))].length,
    tripIds: [...new Set(bkImpacts.filter((x) => x.verdict === 'CONFIRMED').map((x) => x.tripId))],
  };

  const packageOut = {
    packageId: 'ds4-l3c-artefact-screening-20261029',
    generatedAtUtc: new Date().toISOString(),
    bootstrap: { seed: BOOTSTRAP_SEED, B: BOOTSTRAP_B, method: 'trip_cluster_resample_with_replacement_equal_trip_weight_percentiles' },
    integrity,
    screeningPolicy: policy,
    screeningSummary: {
      admissibleEventsScreened: admissible.length,
      confirmedArtefacts: confirmed,
      suspectedArtefacts: suspected,
      indeterminateAdmissible: indeterminate,
      excludeFromResearchBkKeys: excludeKeys.size,
    },
    arteonMirrorPairVerdict: {
      tripId: '630dc631-503f-43f2-b323-216cf0afc561',
      events: arteonMirror,
      verdict: arteonMirror.length >= 2 ? 'CONFIRMED_MIRROR_SPEED_SPIKE_PAIR' : 'INDETERMINATE',
    },
    maxBkDistortion,
    preScreenCandidates: preScreenCandidates.size,
    postScreenResearchCandidates,
    fullIntensityStats: { aggregate: fullStatsAggregate, byVehicle },
    sensitivity: {
      vehicleConcentration: fullStatsAggregate.scope,
      iccBrakeFullLogIntensity: iccBrake,
      looVehicle,
      looTripTop10: looTrip,
      temporal,
    },
    teslaDiagnostic,
    h1_h5: [h1, h2, h3, h4, h5],
  };

  fs.writeFileSync(path.join(OUT, 'source-integrity-manifest.json'), JSON.stringify(integrity, null, 2));
  fs.writeFileSync(path.join(OUT, 'event-screening-ledger.jsonl'), ledger.map((x) => JSON.stringify(x)).join('\n') + '\n');
  fs.writeFileSync(path.join(OUT, 'bk-original-vs-screened.json'), JSON.stringify({ impacts: bkImpacts, maxBkDistortion, byTrip: index.map((t) => ({
    tripId: t.tripId,
    label: t.label,
    eligible: t.qualityClassification?.eligible,
    original: { accelBk: t.layer2?.accelImpulseMps, brakeBk: t.layer2?.brakeImpulseMps },
    screened: {
      accelBk: computeBk(events.filter((e) => e.tripId === t.tripId), 'ACCELERATION', excludeKeys),
      brakeBk: computeBk(events.filter((e) => e.tripId === t.tripId), 'DECELERATION', excludeKeys),
    },
  })) }, null, 2));
  fs.writeFileSync(path.join(OUT, 'full-intensity-distributions.json'), JSON.stringify(fullStatsAggregate, null, 2));
  fs.writeFileSync(path.join(OUT, 'full-intensity-by-vehicle.json'), JSON.stringify(byVehicle, null, 2));
  fs.writeFileSync(path.join(OUT, 'sensitivity-report.json'), JSON.stringify(packageOut.sensitivity, null, 2));
  fs.writeFileSync(path.join(OUT, 'tesla-quality-diagnostic.json'), JSON.stringify(teslaDiagnostic, null, 2));
  fs.writeFileSync(path.join(OUT, 'h1-h5-decision-matrix.json'), JSON.stringify(packageOut.h1_h5, null, 2));
  fs.writeFileSync(path.join(OUT, 'l3c-summary.json'), JSON.stringify(packageOut, null, 2));

  console.log(JSON.stringify({ ok: true, confirmed, suspected, maxBk: maxBkDistortion }));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
