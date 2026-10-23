'use strict';
/**
 * C5 PTQ V0 — offline experimental point-time-quality kinematics (Fable C5_PTQ_V0).
 * Frozen research parameters; not production code.
 */
const path = require('node:path');

const MOTION_CORE_SPEED_C5_PTQ_V0_VERSION = 'MOTION_CORE_SPEED_C5_PTQ_V0_V0_1_RESEARCH';

/** Frozen hypotheses (do not tune on eval drives). */
const PTQ_FROZEN = Object.freeze({
  aMaxMps2: 6,
  crossTrackMaxM: 6,
  initialHalfWindowS: 2,
  maxHalfWindowS: 4,
  minSupportPerSide: 3,
  maxNeighborGapS: 3,
  stationaryChordMps: 3,
  lookaheadS: 4,
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

function enu(ref, p) {
  const lat0 = (ref.latitude * Math.PI) / 180;
  return [
    ((p.longitude - ref.longitude) * Math.PI / 180) * Math.cos(lat0) * R_E,
    ((p.latitude - ref.latitude) * Math.PI / 180) * R_E,
  ];
}

/** Cross-track distance of P from chord A→B (m). */
function crossTrackM(A, B, P) {
  const [bx, by] = enu(A, B);
  const [px, py] = enu(A, P);
  const L = Math.hypot(bx, by);
  if (L < 1e-6) return Math.hypot(px, py);
  return Math.abs(-px * (by / L) + py * (bx / L));
}

function median(v) {
  if (!v.length) return null;
  const s = [...v].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function legSpeedMps(a, b, distFn) {
  const dt = secOf(b.bucketLabelUtc) - secOf(a.bucketLabelUtc);
  if (dt <= 0) return null;
  return distFn(a, b) / dt;
}

function isSupportGrade(pt) {
  return pt && !pt.hardRejected && !pt.suspect && !pt.unattributed;
}

/**
 * @param {import('../../../../backend/...')} buckets MotionCorePositionBucket[]
 * @returns {import('...').MotionCoreSpeedSample[]}
 */
function computeC5PtqV0(buckets, legGate, codeRoot) {
  const core = loadCore(codeRoot);
  const {
    orderMotionCoreGrid,
    presentBucketMap,
    haversineMeters,
    detectImplausibleOneSecondLegEndpointLabels,
    detectImplausibleOneSecondLegStartLabels,
    detectPositionOutliers,
    coordsEqual,
    bucketLabelPlusSeconds,
  } = core;

  const dist = (a, b) => haversineMeters(a.latitude, a.longitude, b.latitude, b.longitude);
  const ordered = orderMotionCoreGrid(buckets);
  const outliers = detectPositionOutliers(ordered);
  const implausibleLeg = detectImplausibleOneSecondLegEndpointLabels(ordered, legGate);
  const hardRejected = new Set([...outliers.keys(), ...implausibleLeg]);

  const pm = presentBucketMap(ordered);
  const presentPts = [...pm.keys()]
    .sort()
    .map((lab) => ({
      lab,
      t: secOf(lab),
      b: pm.get(lab),
      hardRejected: hardRejected.has(lab),
      suspect: null,
      unattributed: false,
      attribution: 'OK',
      detail: null,
    }));

  const ptByLab = new Map(presentPts.map((p) => [p.lab, p]));
  const vOf = (X, Y) => legSpeedMps(X.b, Y.b, dist);

  for (let i = 1; i + 1 < presentPts.length; i++) {
    const A = presentPts[i - 1];
    const P = presentPts[i];
    const B = presentPts[i + 1];
    if (A.hardRejected || P.hardRejected || B.hardRejected) continue;
    const dtAP = P.t - A.t;
    const dtPB = B.t - P.t;
    if (dtAP > PTQ_FROZEN.maxNeighborGapS || dtPB > PTQ_FROZEN.maxNeighborGapS) continue;
    const v1 = vOf(A, P);
    const v2 = vOf(P, B);
    const vAB = vOf(A, B);
    if (v1 == null || v2 == null || vAB == null) continue;
    if (vAB < PTQ_FROZEN.stationaryChordMps) continue;
    const meanDt = (dtAP + dtPB) / 2;
    if (Math.abs(v1 - v2) <= PTQ_FROZEN.aMaxMps2 * meanDt) continue;

    const Am = presentPts[i - 2];
    const Bp = presentPts[i + 2];
    const outer = [];
    if (Am && !Am.hardRejected && A.t - Am.t <= PTQ_FROZEN.maxNeighborGapS) {
      const vo = vOf(Am, A);
      if (vo != null) outer.push([vo, (A.t - Am.t + B.t - A.t) / 2]);
    }
    if (Bp && !Bp.hardRejected && Bp.t - B.t <= PTQ_FROZEN.maxNeighborGapS) {
      const vo = vOf(B, Bp);
      if (vo != null) outer.push([vo, (Bp.t - B.t + B.t - A.t) / 2]);
    }
    const restored = outer.length > 0 && outer.every(([vo, mdt]) => Math.abs(vo - vAB) <= PTQ_FROZEN.aMaxMps2 * mdt);
    if (restored) {
      const ct = crossTrackM(A.b, B.b, P.b);
      if (ct <= PTQ_FROZEN.crossTrackMaxM) {
        P.suspect = 'TIME_SUSPECT';
        P.attribution = 'TIME_SUSPECT';
      } else {
        P.suspect = 'POSITION_SUSPECT';
        P.attribution = 'POSITION_SUSPECT';
      }
      P.detail = { v1Kmh: v1 * 3.6, v2Kmh: v2 * 3.6, crossM: ct };
    } else {
      P.unattributed = true;
      P.attribution = 'INCONSISTENT_UNATTRIBUTED';
    }
  }

  const speedByPresent = new Map();

  for (const P of presentPts) {
    if (P.hardRejected) continue;
    let half = PTQ_FROZEN.initialHalfWindowS;
    let left = [];
    let right = [];
    while (half <= PTQ_FROZEN.maxHalfWindowS) {
      const cand = presentPts.filter(
        (q) => !q.hardRejected && !q.suspect && Math.abs(q.t - P.t) <= half,
      );
      left = cand.filter((q) => q.t < P.t);
      right = cand.filter((q) => q.t > P.t);
      if (left.length >= PTQ_FROZEN.minSupportPerSide && right.length >= PTQ_FROZEN.minSupportPerSide) break;
      half++;
    }
    const sup = presentPts.filter(
      (q) => !q.hardRejected && !q.suspect && Math.abs(q.t - P.t) <= half,
    );
    const hasSides =
      sup.filter((q) => q.t < P.t).length >= PTQ_FROZEN.minSupportPerSide &&
      sup.filter((q) => q.t > P.t).length >= PTQ_FROZEN.minSupportPerSide;

    if (!hasSides) {
      speedByPresent.set(P.lab, {
        valueKmh: null,
        quality: 'NO_SUPPORT',
        supportLabels: [P.lab],
        supportSpanS: null,
        flags: ['PTQ_INSUFFICIENT_SUPPORT', `attribution=${P.attribution}`],
        attribution: P.attribution === 'OK' ? 'UNKNOWN' : P.attribution,
      });
      continue;
    }

    const slopes = [];
    for (let i = 0; i < sup.length; i++) {
      for (let j = i + 1; j < sup.length; j++) {
        let segmentBad = false;
        for (let k = i + 1; k < j; k++) {
          if (sup[k].unattributed || sup[k].suspect === 'POSITION_SUSPECT') {
            segmentBad = true;
            break;
          }
        }
        if (segmentBad) continue;
        let d = 0;
        for (let k = i; k < j; k++) d += dist(sup[k].b, sup[k + 1].b);
        const dt = sup[j].t - sup[i].t;
        if (dt > 0) slopes.push(d / dt);
      }
    }
    if (!slopes.length) {
      speedByPresent.set(P.lab, {
        valueKmh: null,
        quality: 'NO_SUPPORT',
        supportLabels: sup.map((q) => q.lab),
        supportSpanS: half * 2,
        flags: ['PTQ_NO_VALID_SLOPE_PAIRS', `attribution=${P.attribution}`],
        attribution: P.unattributed ? 'INCONSISTENT_UNATTRIBUTED' : P.attribution === 'OK' ? 'UNKNOWN' : P.attribution,
      });
      continue;
    }
    const vMps = median(slopes);
    let quality = 'OK';
    const flags = [`PTQ_WINDOW_HALF_S=${half}`];
    if (P.suspect === 'TIME_SUSPECT') {
      quality = 'REPAIRED';
      flags.push('PTQ_BRIDGED_TIME_SUSPECT');
    } else if (P.unattributed) {
      quality = 'SPARSE_SUPPORT';
      flags.push('PTQ_INCONSISTENT_CONTEXT');
    } else if (half > PTQ_FROZEN.initialHalfWindowS) {
      quality = 'SPARSE_SUPPORT';
      flags.push('PTQ_EXPANDED_WINDOW');
    }
    speedByPresent.set(P.lab, {
      valueKmh: vMps * 3.6,
      quality,
      supportLabels: sup.map((q) => q.lab),
      supportSpanS: half * 2,
      flags: [...flags, `attribution=${P.attribution}`],
      attribution: P.attribution,
    });
  }

  const out = [];
  for (const b of ordered) {
    const lab = b.bucketLabelUtc;
    if (b.availability === 'ROW_ABSENT' || b.latitude == null || b.longitude == null) {
      out.push({
        label: lab,
        valueKmh: null,
        quality: b.availability === 'ROW_ABSENT' ? 'NO_POSITION' : 'NO_POSITION',
        supportLabels: [lab],
        supportSpanS: null,
        flags: ['ROW_ABSENT_OR_MISSING_COORD'],
        estimator: MOTION_CORE_SPEED_C5_PTQ_V0_VERSION,
        attribution: 'UNKNOWN',
      });
      continue;
    }
    if (hardRejected.has(lab)) {
      const flags = [];
      if (implausibleLeg.has(lab)) flags.push('IMPLAUSIBLE_1S_LEG_ENDPOINT_UNCERTAIN');
      if (outliers.has(lab)) flags.push('POSITION_OUTLIER_CHORD_DEVIATION');
      flags.push('HARD_QUARANTINE_PARITY_C4');
      out.push({
        label: lab,
        valueKmh: null,
        quality: 'OUTLIER_REJECTED',
        supportLabels: [lab],
        supportSpanS: null,
        flags,
        estimator: MOTION_CORE_SPEED_C5_PTQ_V0_VERSION,
        attribution: 'OK',
      });
      continue;
    }
    const prev = pm.get(bucketLabelPlusSeconds(lab, -1));
    const next = pm.get(bucketLabelPlusSeconds(lab, 1));
    const center = pm.get(lab);
    if (
      center &&
      ((prev &&
        prev.latitude != null &&
        coordsEqual(
          { latitude: prev.latitude, longitude: prev.longitude },
          { latitude: center.latitude, longitude: center.longitude },
        )) ||
        (next &&
          next.latitude != null &&
          coordsEqual(
            { latitude: center.latitude, longitude: center.longitude },
            { latitude: next.latitude, longitude: next.longitude },
          )))
    ) {
      out.push({
        label: lab,
        valueKmh: null,
        quality: 'FROZEN_POSITION',
        supportLabels: [lab],
        supportSpanS: null,
        flags: ['IDENTICAL_COORDINATES_STALE_FIX_SUSPECT'],
        estimator: MOTION_CORE_SPEED_C5_PTQ_V0_VERSION,
        attribution: 'OK',
      });
      continue;
    }
    const est = speedByPresent.get(lab);
    if (!est) {
      out.push({
        label: lab,
        valueKmh: null,
        quality: 'NO_SUPPORT',
        supportLabels: [lab],
        supportSpanS: null,
        flags: ['PTQ_NO_ESTIMATE'],
        estimator: MOTION_CORE_SPEED_C5_PTQ_V0_VERSION,
        attribution: 'UNKNOWN',
      });
      continue;
    }
    out.push({
      label: lab,
      valueKmh: est.valueKmh,
      quality: est.quality,
      supportLabels: est.supportLabels,
      supportSpanS: est.supportSpanS,
      flags: est.flags,
      estimator: MOTION_CORE_SPEED_C5_PTQ_V0_VERSION,
      attribution: est.attribution,
    });
  }
  return { samples: out, meta: { version: MOTION_CORE_SPEED_C5_PTQ_V0_VERSION, frozen: PTQ_FROZEN, presentAttribution: presentPts.map((p) => ({ lab: p.lab, attribution: p.attribution, suspect: p.suspect, detail: p.detail })) } };
}

/** Event detector qualities for C5 offline eval (numeric speeds from OK / repaired / sparse support). */
const C5_EVENT_USABLE_QUALITIES = ['OK', 'REPAIRED', 'SPARSE_SUPPORT'];

module.exports = {
  MOTION_CORE_SPEED_C5_PTQ_V0_VERSION,
  PTQ_FROZEN,
  C5_EVENT_USABLE_QUALITIES,
  computeC5PtqV0,
  loadCore,
};
