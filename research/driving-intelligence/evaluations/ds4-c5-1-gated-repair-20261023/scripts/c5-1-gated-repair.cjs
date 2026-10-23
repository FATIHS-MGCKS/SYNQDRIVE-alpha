'use strict';
/**
 * C5.1 gated local repair — offline research layer on frozen C4 replay.
 * Spec: ds4-c5-1-gated-repair-design-20261023/ELIGIBILITY_AND_REPAIR_SPEC.md
 */
const path = require('node:path');
const E = require('../../ds4-accel-brake-video-reference-20261023/scripts/event_eval_lib.cjs');

const MOTION_CORE_SPEED_C5_1_VERSION = 'MOTION_CORE_SPEED_C5_1_GATED_REPAIR_V1_1_SAFETY_HARDENED';
const HARDENING_TAG = 'C5_1_SAFETY_HARDENING_V1';
const F2_MAX_NUMERIC_KMH = 250;

const FROZEN = Object.freeze({
  aAttrMps2: 6,
  crossTrackMaxM: 6,
  maxSupportHalfS: 4,
  minSupportTotal: 5,
  minSupportPerSide: 2,
  maxNeighborGapS: 3,
  stationaryChordMps: 3,
  headingRejectDegPerS: 25,
  maxWindowLabels: 15,
});

const R_E = 6371008.8;

function loadCore(codeRoot) {
  const repo = codeRoot || path.resolve(__dirname, '../../../../..');
  const DI = 'backend/src/modules/vehicle-intelligence/driving-intelligence';
  require(path.join(repo, 'backend/node_modules/ts-node')).register({
    transpileOnly: true,
    project: path.join(repo, 'backend/tsconfig.json'),
  });
  return require(path.join(repo, DI, 'core/index.ts'));
}

function secOf(label) {
  return Date.parse(label) / 1000;
}

function labelOf(sec) {
  return new Date(sec * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function enu(ref, p) {
  const lat0 = (ref.latitude * Math.PI) / 180;
  return [
    ((p.longitude - ref.longitude) * Math.PI / 180) * Math.cos(lat0) * R_E,
    ((p.latitude - ref.latitude) * Math.PI / 180) * R_E,
  ];
}

function crossTrackM(A, B, P) {
  const [bx, by] = enu(A, B);
  const [px, py] = enu(A, P);
  const L = Math.hypot(bx, by);
  if (L < 1e-6) return Math.hypot(px, py);
  return Math.abs(-px * (by / L) + py * (bx / L));
}

function bearingDeg(A, B) {
  const lat1 = (A.latitude * Math.PI) / 180;
  const lat2 = (B.latitude * Math.PI) / 180;
  const dLon = ((B.longitude - A.longitude) * Math.PI) / 180;
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return (Math.atan2(y, x) * 180) / Math.PI;
}

function angleDiffDeg(a, b) {
  let d = Math.abs(a - b) % 360;
  if (d > 180) d = 360 - d;
  return d;
}

function legSpeedKmhBetween(pm, dist, secA, secB) {
  const a = pm.get(labelOf(secA));
  const b = pm.get(labelOf(secB));
  if (!a || !b) return null;
  const dt = secB - secA;
  if (dt <= 0) return null;
  return (dist(a, b) / dt) * 3.6;
}

function median(v) {
  if (!v.length) return null;
  const s = [...v].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function aPlausMps2(vehicleClass) {
  const p = E.EVENT_RULES.plausibility[vehicleClass] || E.EVENT_RULES.plausibility.TESLA;
  return Math.max(p.ACCELERATION, p.DECELERATION);
}

function legSpeedMps(a, b, distFn) {
  const dt = secOf(b.bucketLabelUtc) - secOf(a.bucketLabelUtc);
  if (dt <= 0) return null;
  return distFn(a, b) / dt;
}

function computeGlobalAttributions(presentPts, distFn) {
  const ptByLab = new Map(presentPts.map((p) => [p.lab, p]));
  const vOf = (X, Y) => legSpeedMps(X.b, Y.b, distFn);

  for (let i = 1; i + 1 < presentPts.length; i++) {
    const A = presentPts[i - 1];
    const P = presentPts[i];
    const B = presentPts[i + 1];
    if (A.hardRejected || P.hardRejected || B.hardRejected) continue;
    const dtAP = P.t - A.t;
    const dtPB = B.t - P.t;
    if (dtAP > FROZEN.maxNeighborGapS || dtPB > FROZEN.maxNeighborGapS) continue;
    const v1 = vOf(A, P);
    const v2 = vOf(P, B);
    const vAB = vOf(A, B);
    if (v1 == null || v2 == null || vAB == null) continue;
    if (vAB < FROZEN.stationaryChordMps) continue;
    const meanDt = (dtAP + dtPB) / 2;
    if (Math.abs(v1 - v2) <= FROZEN.aAttrMps2 * meanDt) continue;

    const Am = presentPts[i - 2];
    const Bp = presentPts[i + 2];
    const outer = [];
    if (Am && !Am.hardRejected && A.t - Am.t <= FROZEN.maxNeighborGapS) {
      const vo = vOf(Am, A);
      if (vo != null) outer.push([vo, (A.t - Am.t + B.t - A.t) / 2]);
    }
    if (Bp && !Bp.hardRejected && Bp.t - B.t <= FROZEN.maxNeighborGapS) {
      const vo = vOf(B, Bp);
      if (vo != null) outer.push([vo, (Bp.t - B.t + B.t - A.t) / 2]);
    }
    const restored = outer.length > 0 && outer.every(([vo, mdt]) => Math.abs(vo - vAB) <= FROZEN.aAttrMps2 * mdt);
    if (restored) {
      const ct = crossTrackM(A.b, B.b, P.b);
      if (ct <= FROZEN.crossTrackMaxM) {
        P.attribution = 'TIME_SUSPECT';
      } else {
        P.attribution = 'POSITION_SUSPECT';
      }
      P.detail = { v1Kmh: v1 * 3.6, v2Kmh: v2 * 3.6, crossM: ct, vAbKmh: vAB * 3.6 };
    } else {
      P.attribution = 'INCONSISTENT_UNATTRIBUTED';
    }
  }
  return ptByLab;
}

function collectSignals(label, c4Sample, jit, ordered, pm) {
  const sig = new Set();
  const b = ordered.find((x) => x.bucketLabelUtc === label);
  if (b?.availability === 'ROW_ABSENT') sig.add('S6');
  if (!c4Sample || c4Sample.valueKmh == null) return [...sig];
  const flags = c4Sample.flags || [];
  if (flags.includes('L3_LEG_TIMING_SUSPECT_FALLBACK_ROBUST')) sig.add('S1');
  if (flags.includes('TIMING_JITTER_SUSPECT_IN_WINDOW')) sig.add('S2');
  if (flags.includes('L3_SUPPORT_MISSING_FALLBACK_ROBUST')) sig.add('S3');
  if (jit.has(label) || jit.has(labelOf(secOf(label) - 1))) sig.add('S4');
  return [...sig];
}

function buildVelocitySeeds(ordered, c4ByLabel, jit, pm, distFn, aPlaus) {
  const seeds = new Map();
  const pres = [...pm.keys()].sort();
  const add = (l, r) => {
    const c = c4ByLabel.get(l);
    if (c?.quality === 'OUTLIER_REJECTED' || c?.quality === 'FROZEN_POSITION') return;
    if (!pm.has(l)) return;
    if (!seeds.has(l)) seeds.set(l, new Set());
    seeds.get(l).add(r);
  };

  for (const b of ordered) {
    const l = b.bucketLabelUtc;
    const c = c4ByLabel.get(l);
    if (c && c.valueKmh != null) {
      if (c.flags?.includes('L3_LEG_TIMING_SUSPECT_FALLBACK_ROBUST')) add(l, 'S1');
      if (c.flags?.includes('TIMING_JITTER_SUSPECT_IN_WINDOW')) add(l, 'S2');
      if (jit.has(l) || jit.has(labelOf(secOf(l) - 1))) add(l, 'S4');
    }
  }

  for (let i = 1; i + 1 < pres.length; i++) {
    const A = pm.get(pres[i - 1]);
    const P = pm.get(pres[i]);
    const B = pm.get(pres[i + 1]);
    const dtAP = secOf(pres[i]) - secOf(pres[i - 1]);
    const dtPB = secOf(pres[i + 1]) - secOf(pres[i]);
    if (dtAP > FROZEN.maxNeighborGapS || dtPB > FROZEN.maxNeighborGapS) continue;
    const vAB = distFn(A, B) / (dtAP + dtPB);
    if (vAB < FROZEN.stationaryChordMps) continue;
    const v1 = distFn(A, P) / dtAP;
    const v2 = distFn(P, B) / dtPB;
    if (Math.abs(v1 - v2) > aPlaus * (dtAP + dtPB) / 2) add(pres[i], 'S5');
  }
  return seeds;
}

function buildSuspicionWindows(velocitySeeds, ordered, absentLabels) {
  const intervals = [];
  for (const [lab, rs] of velocitySeeds) {
    const t = secOf(lab);
    let start = t - 1;
    let end = t + 1;
    if (rs.has('S2') || rs.has('S4')) {
      start = t - 3;
      end = t + 3;
    } else if (rs.has('S5')) {
      start = t - 2;
      end = t + 2;
    }
    for (const g of absentLabels) {
      const gt = secOf(g);
      if (gt >= start - 1 && gt <= end + 1) {
        const nearGap = [...velocitySeeds.keys()].some((vs) => Math.abs(secOf(vs) - gt) <= 2);
        if (nearGap) {
          start = Math.min(start, gt - 1);
          end = Math.max(end, gt + 1);
        }
      }
    }
    intervals.push([start, end]);
  }
  intervals.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const iv of intervals) {
    if (merged.length && iv[0] <= merged[merged.length - 1][1]) {
      merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], iv[1]);
    } else merged.push([iv[0], iv[1]]);
  }
  const final = [];
  for (const [s, e] of merged) {
    if (e - s + 1 <= FROZEN.maxWindowLabels) {
      final.push([s, e]);
      continue;
    }
    const mid = Math.floor((s + e) / 2);
    final.push([s, mid]);
    final.push([mid + 1, e]);
  }
  return final;
}

function labelsInWindows(windows, ordered) {
  const set = new Set();
  const gridSecs = new Set(ordered.map((b) => secOf(b.bucketLabelUtc)));
  for (const [s, e] of windows) {
    for (let t = s; t <= e; t++) {
      const l = labelOf(t);
      if (gridSecs.has(t)) set.add(l);
    }
  }
  return set;
}

function presentNeighbors(pm, tSec, dir, maxGap) {
  const pres = [...pm.keys()].map(secOf).sort();
  if (dir < 0) {
    for (let i = pres.length - 1; i >= 0; i--) {
      if (pres[i] < tSec && tSec - pres[i] <= maxGap) return { sec: pres[i], b: pm.get(labelOf(pres[i])) };
    }
  } else {
    for (let i = 0; i < pres.length; i++) {
      if (pres[i] > tSec && pres[i] - tSec <= maxGap) return { sec: pres[i], b: pm.get(labelOf(pres[i])) };
    }
  }
  return null;
}

function tripleAccelViolation(tSec, centerKmh, pm, speedAtSec, aPlaus) {
  const prev = presentNeighbors(pm, tSec, -1, FROZEN.maxNeighborGapS);
  const next = presentNeighbors(pm, tSec, 1, FROZEN.maxNeighborGapS);
  if (!prev || !next) return 0;
  const vPrev = speedAtSec(prev.sec);
  const vNext = speedAtSec(next.sec);
  if (vPrev == null || vNext == null || centerKmh == null) return 0;
  const dt1 = tSec - prev.sec;
  const dt2 = next.sec - tSec;
  const a1 = Math.abs((centerKmh - vPrev) / 3.6 / dt1);
  const a2 = Math.abs((vNext - centerKmh) / 3.6 / dt2);
  return Math.max(a1, a2);
}

/** Q4 pre/post level test on the LOO triple around attributed point P (spec §3.3). */
function manoeuvreGuardQ4(pSec, pm, distFn, aPlaus) {
  const prev = presentNeighbors(pm, pSec, -1, FROZEN.maxNeighborGapS);
  const next = presentNeighbors(pm, pSec, 1, FROZEN.maxNeighborGapS);
  if (!prev || !next) return { pass: true, detail: 'no_neighbors' };
  const A = prev.b;
  const B = next.b;
  const Am = presentNeighbors(pm, prev.sec, -1, FROZEN.maxNeighborGapS);
  const Bp = presentNeighbors(pm, next.sec, 1, FROZEN.maxNeighborGapS);
  const dtAB = next.sec - prev.sec;
  const vAb = distFn(A, B) / dtAB;
  let vPre = null;
  let vPost = null;
  if (Am) {
    const dt = prev.sec - Am.sec;
    vPre = distFn(Am.b, A) / dt;
  }
  if (Bp) {
    const dt = Bp.sec - next.sec;
    vPost = distFn(B, Bp.b) / dt;
  }
  if (vPre != null && vPost != null) {
    if (Math.abs(vPre - vPost) > aPlaus) {
      return { pass: false, detail: { reason: 'pre_post_level', vPreKmh: vPre * 3.6, vPostKmh: vPost * 3.6 } };
    }
    const mean = (vPre + vPost) / 2;
    if (Math.abs(vAb - mean) > aPlaus) {
      return { pass: false, detail: { reason: 'chord_vs_mean', vAbKmh: vAb * 3.6, meanKmh: mean * 3.6 } };
    }
  }
  return { pass: true, detail: { vAbKmh: vAb * 3.6, vPreKmh: vPre != null ? vPre * 3.6 : null, vPostKmh: vPost != null ? vPost * 3.6 : null } };
}

function theilSenKmh(supportPts, distFn) {
  const slopes = [];
  for (let i = 0; i < supportPts.length; i++) {
    for (let j = i + 1; j < supportPts.length; j++) {
      let bad = false;
      for (let k = i + 1; k < j; k++) {
        const att = supportPts[k].attribution;
        if (att === 'INCONSISTENT_UNATTRIBUTED' || att === 'POSITION_SUSPECT') {
          bad = true;
          break;
        }
      }
      if (bad) continue;
      let d = 0;
      for (let k = i; k < j; k++) d += distFn(supportPts[k].b, supportPts[k + 1].b);
      slopes.push(d / (supportPts[j].t - supportPts[i].t));
    }
  }
  if (!slopes.length) return null;
  return median(slopes) * 3.6;
}

function buildSupport(tSec, pm, ptByLab, hardRejected, excludeLabs) {
  const centerLab = labelOf(tSec);
  for (const h of [FROZEN.maxSupportHalfS, 3, 2]) {
    const used = [];
    for (let k = -h; k <= h; k++) {
      const l = labelOf(tSec + k);
      if (excludeLabs.has(l)) continue;
      const b = pm.get(l);
      if (!b) continue;
      if (hardRejected.has(l)) continue;
      const att = ptByLab.get(l)?.attribution || 'OK';
      if (att === 'POSITION_SUSPECT' || att === 'TIME_SUSPECT') continue;
      used.push({ t: tSec + k, l, b, attribution: att });
    }
    const left = used.filter((p) => p.t < tSec).length;
    const right = used.filter((p) => p.t > tSec).length;
    const centerInUsed = used.some((p) => p.l === centerLab);
    const totalForRule = used.length;
    if (totalForRule >= FROZEN.minSupportTotal && left >= FROZEN.minSupportPerSide && right >= FROZEN.minSupportPerSide) {
      const slopePts = [...used].sort((a, b) => a.t - b.t);
      return {
        h,
        present: used,
        slopePts,
        left,
        right,
        totalForRule,
        centerInUsed,
        supportLabelsUsed: used.map((p) => p.l),
      };
    }
  }
  return null;
}

/** Reference-free: block raising speed at a C4 trough when TIME_SUSPECT lies astern of repair center. */
function upwardTroughManoeuvreGuard(tSec, c4Kmh, cand, c4ByLabel, pSec) {
  if (cand == null || c4Kmh == null || cand <= c4Kmh + 0.1) return { pass: true };
  let leftMax = null;
  let rightMax = null;
  for (let dt = -3; dt <= 3; dt++) {
    if (dt === 0) continue;
    const v = c4ByLabel.get(labelOf(tSec + dt))?.valueKmh;
    if (v == null) continue;
    if (dt < 0) leftMax = leftMax == null ? v : Math.max(leftMax, v);
    else rightMax = rightMax == null ? v : Math.max(rightMax, v);
  }
  const trough =
    leftMax != null &&
    rightMax != null &&
    c4Kmh + 2 < leftMax &&
    c4Kmh + 2 < rightMax;
  if (!trough) return { pass: true };
  if (pSec != null && pSec < tSec) {
    return { pass: false, detail: { reason: 'upward_at_c4_trough_attribution_astern', leftMax, rightMax, c4Kmh, cand } };
  }
  return { pass: true, detail: { trough, leftMax, rightMax } };
}

function headingRateReject(tSec, pm) {
  const centerLab = labelOf(tSec);
  const center = pm.get(centerLab);
  const prev = presentNeighbors(pm, tSec, -1, FROZEN.maxNeighborGapS);
  const next = presentNeighbors(pm, tSec, 1, FROZEN.maxNeighborGapS);
  if (!center || !prev || !next) return { reject: false };
  const h1 = bearingDeg(prev.b, center);
  const h2 = bearingDeg(center, next.b);
  const dt = next.sec - prev.sec;
  if (dt <= 0) return { reject: false };
  const rate = angleDiffDeg(h1, h2) / dt;
  return { reject: rate > FROZEN.headingRejectDegPerS, rateDegPerS: rate, dt };
}

function physicalPlausibilityQ5(tSec, cand, pm, dist, c4ByLabel, hardRejected, aPlaus, hardQuarantineLeg) {
  if (cand == null) return { pass: false, detail: 'no_candidate' };
  if (cand > F2_MAX_NUMERIC_KMH) return { pass: false, detail: 'exceeds_f2_cap' };

  const c4s = c4ByLabel.get(labelOf(tSec));
  const c4Kmh = c4s?.valueKmh ?? null;
  const speedAt = (sec, override) => {
    if (sec === tSec) return override;
    return c4ByLabel.get(labelOf(sec))?.valueKmh ?? null;
  };

  const vC4 = tripleAccelViolation(tSec, c4Kmh, pm, (s) => speedAt(s, c4Kmh), aPlaus);
  const vCand = tripleAccelViolation(tSec, cand, pm, (s) => speedAt(s, cand), aPlaus);
  if (vCand > aPlaus + 1e-6 && vC4 <= aPlaus + 1e-6) {
    return { pass: false, detail: { reason: 'new_triple_accel_violation', vCand, vC4 } };
  }
  if (vCand > vC4 + 0.05) {
    return { pass: false, detail: { reason: 'worsens_triple_accel', vCand, vC4 } };
  }

  for (const pair of [[tSec - 1, tSec], [tSec, tSec + 1]]) {
    const leg = legSpeedKmhBetween(pm, dist, pair[0], pair[1]);
    if (leg == null) continue;
    if (hardQuarantineLeg(leg)) {
      return { pass: false, detail: { reason: 'hard_leg_quarantine', legKmh: leg, endpoints: pair.map(labelOf) } };
    }
  }

  for (const dt of [-2, -1, 0, 1, 2]) {
    const sec = tSec + dt;
    const lab = labelOf(sec);
    if (hardRejected.has(lab)) continue;
    const v = speedAt(sec, cand);
    if (v != null && v > F2_MAX_NUMERIC_KMH) {
      return { pass: false, detail: { reason: 'neighbor_numeric_cap', label: lab, v } };
    }
  }

  return { pass: true, detail: { vCand, vC4 } };
}

function passThroughSample(c4s, repairState, extra = {}) {
  return {
    ...c4s,
    repairState,
    estimator: c4s.estimator,
    ...extra,
  };
}

/**
 * @param {object[]} buckets
 * @param {string} codeRoot
 * @param {{ vehicleClass?: string, legGate?: unknown }} opts
 */
function computeC5_1GatedRepair(buckets, codeRoot, opts = {}) {
  const vehicleClass = opts.vehicleClass || 'TESLA';
  const aPlaus = aPlausMps2(vehicleClass);
  const core = loadCore(codeRoot);
  const {
    orderMotionCoreGrid,
    presentBucketMap,
    haversineMeters,
    detectImplausibleOneSecondLegEndpointLabels,
    detectPositionOutliers,
    detectTimingJitterSuspectLegs,
    computeC4AdaptiveL3,
    hardQuarantineOneSecondLegSpeedKmh,
  } = core;

  const dist = (a, b) => haversineMeters(a.latitude, a.longitude, b.latitude, b.longitude);
  const ordered = orderMotionCoreGrid(buckets);
  const c4 = computeC4AdaptiveL3(buckets, opts.legGate);
  const c4ByLabel = new Map(c4.map((s) => [s.label, s]));
  const outliers = detectPositionOutliers(ordered);
  const implausibleLeg = detectImplausibleOneSecondLegEndpointLabels(ordered, opts.legGate);
  const hardRejected = new Set([...outliers.keys(), ...implausibleLeg]);
  const jit = detectTimingJitterSuspectLegs(ordered);
  const pm = presentBucketMap(ordered);
  const absentLabels = new Set(ordered.filter((b) => b.availability === 'ROW_ABSENT').map((b) => b.bucketLabelUtc));

  const presentPts = [...pm.keys()]
    .sort()
    .map((lab) => ({
      lab,
      t: secOf(lab),
      b: pm.get(lab),
      hardRejected: hardRejected.has(lab),
      attribution: 'OK',
      detail: null,
    }));
  const ptByLab = computeGlobalAttributions(presentPts, dist);

  const velocitySeeds = buildVelocitySeeds(ordered, c4ByLabel, jit, pm, dist, aPlaus);
  const windows = buildSuspicionWindows(velocitySeeds, ordered, absentLabels);
  const eligibleLabels = labelsInWindows(windows, ordered);

  const samples = [];
  const perLabelTrace = new Map();
  let repairAccepted = 0;
  let repairRejected = 0;
  let uncertain = 0;
  let passOutside = 0;
  let maxSupportOffset = 0;
  let maxAttributionOffsetS = 0;
  let maxTimeSuspectSpanS = 0;
  const acceptedKmhByLabel = new Map();

  for (const b of ordered) {
    const label = b.bucketLabelUtc;
    const c4s = c4ByLabel.get(label);
    if (!c4s) continue;

    const inWindow = eligibleLabels.has(label);
    const signals = collectSignals(label, c4s, jit, ordered, pm);

    if (!inWindow) {
      samples.push(passThroughSample(c4s, 'PASS_THROUGH_OUTSIDE_WINDOW', { eligibilitySignals: signals }));
      passOutside++;
      continue;
    }

    if (c4s.quality === 'OUTLIER_REJECTED' || c4s.valueKmh == null) {
      samples.push(passThroughSample(c4s, 'PASS_THROUGH_NO_REPAIR', { eligibilitySignals: signals, reason: 'quarantine_or_null' }));
      repairRejected++;
      continue;
    }

    const tSec = secOf(label);
    const tMin = tSec - FROZEN.maxSupportHalfS;
    const tMax = tSec + FROZEN.maxSupportHalfS;
    const timeSuspects = [];
    for (let ts = tMin; ts <= tMax; ts++) {
      const l = labelOf(ts);
      const att = ptByLab.get(l)?.attribution;
      if (att === 'TIME_SUSPECT') timeSuspects.push(l);
    }

    const q = {
      Q1: c4s.quality !== 'OUTLIER_REJECTED',
      Q2: timeSuspects.length === 1,
      Q3: false,
      Q4: false,
      Q5: true,
      Q6: true,
    };
    const P = timeSuspects.length === 1 ? timeSuspects[0] : null;
    if (P) q.Q3 = (c4s.supportLabels || []).includes(P);

    const pSec = P ? secOf(P) : tSec;
    if (P) maxAttributionOffsetS = Math.max(maxAttributionOffsetS, Math.abs(pSec - tSec));
    if (timeSuspects.length) {
      const span =
        Math.max(...timeSuspects.map(secOf)) - Math.min(...timeSuspects.map(secOf));
      maxTimeSuspectSpanS = Math.max(maxTimeSuspectSpanS, span);
    }

    const q4 = manoeuvreGuardQ4(pSec, pm, dist, aPlaus);
    const q4b = upwardTroughManoeuvreGuard(tSec, c4s.valueKmh, null, c4ByLabel, pSec);
    q.Q4 = q4.pass;

    const exclude = new Set(timeSuspects);
    const support = buildSupport(tSec, pm, ptByLab, hardRejected, exclude);
    let cand = null;
    if (support) {
      cand = theilSenKmh(support.slopePts, dist);
      for (const p of support.present) {
        maxSupportOffset = Math.max(maxSupportOffset, Math.abs(p.t - tSec));
      }
    }

    if (cand != null) {
      q4b.cand = cand;
      const q4bWithCand = upwardTroughManoeuvreGuard(tSec, c4s.valueKmh, cand, c4ByLabel, pSec);
      q4b.pass = q4bWithCand.pass;
      q4b.detail = q4bWithCand.detail;
      q.Q4 = q.Q4 && q4b.pass;
    }

    const q5 = physicalPlausibilityQ5(
      tSec,
      cand,
      pm,
      dist,
      c4ByLabel,
      hardRejected,
      aPlaus,
      hardQuarantineOneSecondLegSpeedKmh,
    );
    q.Q5 = q5.pass;

    const effectiveSpeedAt = (s) => {
      const l = labelOf(s);
      if (s === tSec) return cand;
      if (acceptedKmhByLabel.has(l)) return acceptedKmhByLabel.get(l);
      return c4ByLabel.get(l)?.valueKmh ?? null;
    };

    if (cand != null) {
      const vC4 = tripleAccelViolation(tSec, c4s.valueKmh, pm, (s) => c4ByLabel.get(labelOf(s))?.valueKmh ?? null, aPlaus);
      const vCand = tripleAccelViolation(tSec, cand, pm, effectiveSpeedAt, aPlaus);
      q.Q6 = vCand <= vC4 + 1e-6;
    } else {
      q.Q6 = false;
    }

    const heading = headingRateReject(tSec, pm);
    const headingReject = heading.reject;

    const trace = {
      label,
      eligibilitySignals: signals,
      inWindow: true,
      timeSuspects,
      attributionP: P,
      attributionOffsetS: P ? Math.abs(pSec - tSec) : null,
      looDetail: P ? ptByLab.get(P)?.detail : null,
      manoeuvreGuard: q4,
      manoeuvreTroughGuard: q4b,
      support: support
        ? {
            h: support.h,
            totalForRule: support.totalForRule,
            left: support.left,
            right: support.right,
            supportLabelsUsed: support.supportLabelsUsed,
            slopeSupportLabels: support.slopePts.map((p) => p.l),
            centerInUsed: support.centerInUsed,
          }
        : null,
      candidateKmh: cand,
      q,
      q5Detail: q5.detail,
      heading,
      headingReject,
    };

    const allPass = q.Q1 && q.Q2 && q.Q3 && q.Q4 && q.Q5 && q.Q6 && !headingReject && cand != null;
    if (timeSuspects.length > 1) {
      samples.push(passThroughSample(c4s, 'UNCERTAIN', { eligibilitySignals: signals, q, trace }));
      uncertain++;
      perLabelTrace.set(label, { ...trace, repairState: 'UNCERTAIN' });
      continue;
    }
    if (!allPass) {
      samples.push(passThroughSample(c4s, 'REPAIR_REJECTED', { eligibilitySignals: signals, q, trace }));
      repairRejected++;
      perLabelTrace.set(label, { ...trace, repairState: 'REPAIR_REJECTED' });
      continue;
    }

    repairAccepted++;
    acceptedKmhByLabel.set(label, cand);
    const flags = [...(c4s.flags || []), 'C5_1_REPAIR_ACCEPTED', `C5_1_ATTRIBUTION=${P}`];
    samples.push({
      ...c4s,
      valueKmh: cand,
      quality: 'REPAIRED',
      flags,
      repairState: 'REPAIR_ACCEPTED',
      eligibilitySignals: signals,
      q,
      trace,
      originalC4Quality: c4s.quality,
      originalC4Flags: [...(c4s.flags || [])],
      supportLabelsUsed: support.slopePts.map((p) => p.l),
      supportHalfS: support.h,
      estimator: MOTION_CORE_SPEED_C5_1_VERSION,
    });
    perLabelTrace.set(label, { ...trace, repairState: 'REPAIR_ACCEPTED', finalKmh: cand });
  }

  return {
    samples,
    c4,
    meta: {
      version: MOTION_CORE_SPEED_C5_1_VERSION,
      frozen: FROZEN,
      aPlausMps2: aPlaus,
      vehicleClass,
      velocitySeedCount: velocitySeeds.size,
      suspicionWindows: windows.map(([s, e]) => ({ start: labelOf(s), end: labelOf(e), width: e - s + 1 })),
      eligibleLabelCount: eligibleLabels.size,
      gridLabelCount: ordered.length,
      repairAccepted,
      repairRejected,
      uncertain,
      passOutside,
      maxSupportOffset,
      maxAttributionOffsetS,
      maxTimeSuspectSpanS,
      supportHalfSMax: FROZEN.maxSupportHalfS,
      eligibilityHorizonNote:
        'Offline eligibility may depend on merged suspicion windows (seeds ±3 + gap bridge); repair support and attribution LOO remain capped at ±4 s.',
      hardening: HARDENING_TAG,
      perLabelTrace,
    },
  };
}

module.exports = {
  computeC5_1GatedRepair,
  MOTION_CORE_SPEED_C5_1_VERSION,
  HARDENING_TAG,
  FROZEN,
  F2_MAX_NUMERIC_KMH,
  loadCore,
  secOf,
  labelOf,
  aPlausMps2,
  buildSupport,
  angleDiffDeg,
  headingRateReject,
  upwardTroughManoeuvreGuard,
  physicalPlausibilityQ5,
};
