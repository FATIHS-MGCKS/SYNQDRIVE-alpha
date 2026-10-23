'use strict';
const path = require('node:path');
const L = require('../../ds4-speed-video-reference-20261023/scripts/eval_lib.cjs');
const C51 = require('./c5-1-gated-repair.cjs');

const R_E = 6371008.8;

function legSpeedKmh(a, b) {
  const dt = (L.secOf(b.bucketLabelUtc) - L.secOf(a.bucketLabelUtc));
  if (dt <= 0) return null;
  const lat0 = (a.latitude * Math.PI) / 180;
  const dx = ((b.longitude - a.longitude) * Math.PI) / 180 * Math.cos(lat0) * R_E;
  const dy = ((b.latitude - a.latitude) * Math.PI) / 180 * R_E;
  return (Math.hypot(dx, dy) / dt) * 3.6;
}

/** Mean acceleration (m/s²) between consecutive 1 s legs using path speeds (km/h → m/s). */
function meanAlongTrackAccelMps2(buckets) {
  const acc = [];
  for (let i = 2; i < buckets.length; i++) {
    const v1 = legSpeedKmh(buckets[i - 2], buckets[i - 1]);
    const v2 = legSpeedKmh(buckets[i - 1], buckets[i]);
    if (v1 == null || v2 == null) continue;
    acc.push(((v2 - v1) / 3.6) / 1);
  }
  if (!acc.length) return null;
  return acc.reduce((s, x) => s + x, 0) / acc.length;
}

function decelProfileBuckets({ t0Sec, n = 14, v0Mps = 27, decelMps2 = 2.8, baseLat = 48.1, baseLon = 11.5 }) {
  const lab = (i) => L.labelOf((t0Sec + i) * 1000);
  let pos = 0;
  const buckets = [
    {
      bucketLabelUtc: lab(0),
      availability: 'PRESENT',
      latitude: baseLat,
      longitude: baseLon,
    },
  ];
  for (let i = 1; i < n; i++) {
    const v = Math.max(2, v0Mps - decelMps2 * (i - 1));
    pos += v;
    buckets.push({
      bucketLabelUtc: lab(i),
      availability: 'PRESENT',
      latitude: baseLat + pos / 111320,
      longitude: baseLon,
    });
  }
  return buckets;
}

function accelProfileBuckets({ t0Sec, n = 14, v0Mps = 4, accelMps2 = 3.0, baseLat = 48.1, baseLon = 11.5 }) {
  const lab = (i) => L.labelOf((t0Sec + i) * 1000);
  let pos = 0;
  const buckets = [
    {
      bucketLabelUtc: lab(0),
      availability: 'PRESENT',
      latitude: baseLat,
      longitude: baseLon,
    },
  ];
  for (let i = 1; i < n; i++) {
    const v = v0Mps + accelMps2 * (i - 1);
    pos += v;
    buckets.push({
      bucketLabelUtc: lab(i),
      availability: 'PRESENT',
      latitude: baseLat + pos / 111320,
      longitude: baseLon,
    });
  }
  return buckets;
}

function cornerHeadingBuckets({ t0Sec, latBumpM = 0.0002, baseLat = 48.1, baseLon = 11.5 }) {
  const lab = (i) => L.labelOf((t0Sec + i) * 1000);
  const cos = Math.cos((baseLat * Math.PI) / 180);
  const buckets = Array.from({ length: 14 }, (_, i) => {
    const along = i <= 6 ? i * 28 : 6 * 28;
    const cross = i <= 6 ? 0 : (i - 6) * 28;
    return {
      bucketLabelUtc: lab(i),
      availability: 'PRESENT',
      latitude: baseLat + along / 111320,
      longitude: baseLon + cross / (111320 * cos),
    };
  });
  buckets[7] = { ...buckets[7], latitude: buckets[7].latitude + latBumpM };
  return buckets;
}

/** Start from standstill: 2 stationary seconds, then constant acceleration (s = ½·a·t²). */
function startFromStopBuckets({ t0Sec, n = 16, accelMps2 = 2.0, stillSeconds = 2, baseLat = 48.1, baseLon = 11.5 }) {
  const lab = (i) => L.labelOf((t0Sec + i) * 1000);
  return Array.from({ length: n }, (_, i) => {
    const t = Math.max(0, i - stillSeconds);
    return {
      bucketLabelUtc: lab(i),
      availability: 'PRESENT',
      latitude: baseLat + (0.5 * accelMps2 * t * t) / 111320,
      longitude: baseLon,
    };
  });
}

/** Timing-jitter model: one fix displaced along-track by `meters` (negative = lagging fix). */
function jitterAlongTrack(buckets, idx, meters) {
  const out = [...buckets];
  out[idx] = { ...out[idx], latitude: out[idx].latitude + meters / 111320 };
  return out;
}

/** Position-outlier model: one fix displaced along-track far enough for C4 to quarantine only that fix. */
function singleFixOutlier(buckets, idx, meters) {
  return jitterAlongTrack(buckets, idx, meters);
}

/** Strip C5.1-only flags so the production event detector sees a plain motion-core series. */
function toMotionSamples(samples) {
  return samples.map((s) => ({
    label: s.label,
    valueKmh: s.valueKmh,
    quality: s.quality,
    supportLabels: s.supportLabels,
    supportSpanS: s.supportSpanS,
    flags: (s.flags || []).filter((f) => !f.startsWith('C5_1_')),
    estimator: s.estimator,
  }));
}

/**
 * Proof that the repair path actually ran: counts of eligibility, candidates and Q4/Q5/Q6
 * evaluations. A scenario must not be green merely because `eligible === 0` or `candidates === 0`.
 */
function repairPathActivity(result) {
  const inWindow = result.samples.filter((s) => s.trace?.inWindow);
  const withCand = inWindow.filter((s) => s.trace.candidateKmh != null);
  const states = {};
  for (const s of result.samples) states[s.repairState] = (states[s.repairState] || 0) + 1;
  return {
    eligible: result.meta.eligibleLabelCount,
    inWindow: inWindow.length,
    candidates: withCand.length,
    attributed: inWindow.filter((s) => s.trace.attributionP != null).length,
    q4Evaluated: withCand.filter((s) => s.trace.manoeuvreGuard && typeof s.trace.manoeuvreGuard.pass === 'boolean').length,
    q5Evaluated: withCand.filter((s) => s.trace.q5Evidence != null).length,
    q6Evaluated: withCand.filter((s) => s.trace.q6Evidence != null).length,
    q5Insufficient: withCand.filter((s) => s.trace.q5Evidence === C51.EVIDENCE.INSUFFICIENT_EVIDENCE).length,
    accepted: result.meta.repairAccepted,
    rejected: result.meta.repairRejected,
    uncertain: result.meta.uncertain,
    insufficientEvidenceRejections: result.meta.insufficientEvidenceRejections,
    states,
  };
}

module.exports = {
  legSpeedKmh,
  meanAlongTrackAccelMps2,
  decelProfileBuckets,
  accelProfileBuckets,
  cornerHeadingBuckets,
  startFromStopBuckets,
  jitterAlongTrack,
  singleFixOutlier,
  toMotionSamples,
  repairPathActivity,
  C51,
  L,
};
