'use strict';
// Event-evaluation helpers. Every constant mirrors EVALUATION_RULES.md; do not tune here.
const L = require('../../ds4-speed-video-reference-20261023/scripts/eval_lib.cjs'); // PR #2139 copy (v2_gap2s rules frozen)

const EVENT_RULES = Object.freeze({
  matchTolS: 2, // §3 MATCH_TOL_S
  borderlineBandMps2: 0.6, // §3 BORDERLINE_BAND_MPS2
  softFalseAlarmMinStepMps2: 0.9, // §5.3 (= entry 1.5 − 0.6)
  unverifiableUnreadableShare: 0.5, // §5.1
  noDs4SpeedShare: 0.5, // §5.4
  visibleRunMinDeltaKmh: 10, // §4 T3
  visibleRunMinDurationS: 3, // §4 T3
  visibleRunMaxPlateauSteps: 2, // §4 T3
  nearBoundaryS: 2, // §7
  overReferenceMaxMarginKmh: 20, // §8
  artefactSuspectDeltaErrKmh: 15, // §12 N1 (view only)
  minReadablePairsForIntensity: 2, // §12 N2
  acceptedQualities: ['OK', 'DEGRADED', 'LIMITED'], // §12 N3 (production: everything except ARTEFACT_SUSPECT)
  plausibility: {
    // §8 mean acceleration bounds (m/s²) over ≥ 2 s
    TIGUAN: { ACCELERATION: 4.5, DECELERATION: 9.0 },
    TESLA: { ACCELERATION: 9.0, DECELERATION: 9.0 },
  },
});

const sign = (kind) => (kind === 'ACCELERATION' ? 1 : -1);

/** Reference rows → MotionCoreSpeedSample[] (readable seconds only; detector bridges ≤ 2 s gaps itself). */
function referenceAsSpeedSamples(refRows, estimator) {
  return refRows
    .filter((r) => r.ref != null)
    .map((r) => ({
      label: L.labelOf(r.sec * 1000),
      valueKmh: r.ref,
      quality: 'OK',
      supportLabels: [L.labelOf(r.sec * 1000)],
      supportSpanS: 2,
      flags: [],
      estimator,
    }));
}

/** Max 1 s step and max 2 s mean (m/s²) in `kind` direction over consecutive readable reference seconds in [fromSec, toSec]. */
function referenceIntensity(refBySec, fromSec, toSec, kind) {
  const sg = sign(kind);
  let peak1 = null;
  let peak2 = null;
  for (let s = fromSec + 1; s <= toSec; s++) {
    const a = refBySec.get(s - 1);
    const b = refBySec.get(s);
    if (a != null && b != null) {
      const v = (sg * (b - a)) / 3.6;
      peak1 = peak1 == null ? v : Math.max(peak1, v);
    }
    const c = refBySec.get(s - 2);
    if (c != null && b != null) {
      const v = (sg * (b - c)) / 3.6 / 2;
      peak2 = peak2 == null ? v : Math.max(peak2, v);
    }
  }
  return { peak1sMps2: peak1 == null ? null : L.round(peak1), peak2sMps2: peak2 == null ? null : L.round(peak2) };
}

/** Directional reference Δv over a window: max over i<j of sign·(v_j − v_i), readable seconds only. */
function referenceDirectionalDelta(refBySec, fromSec, toSec, kind) {
  const sg = sign(kind);
  const vals = [];
  for (let s = fromSec; s <= toSec; s++) {
    const v = refBySec.get(s);
    if (v != null) vals.push(v);
  }
  if (vals.length < 2) return { readable: vals.length, deltaKmh: null };
  let best = -Infinity;
  let runMin = sg * vals[0];
  for (let j = 1; j < vals.length; j++) {
    const x = sg * vals[j];
    best = Math.max(best, x - runMin);
    runMin = Math.min(runMin, x);
  }
  return { readable: vals.length, deltaKmh: L.round(best, 1) };
}

/** T3 visible monotone runs (rules §4). refRows sorted by sec. */
function visibleRuns(refRows) {
  const runs = [];
  const rows = refRows.filter((r) => r.ref != null);
  for (const kind of ['ACCELERATION', 'DECELERATION']) {
    const sg = sign(kind);
    let start = null; // index of run start
    let lastPos = null; // index of the last positive-step end (run end excludes trailing plateau)
    let plateau = 0;
    const emit = () => {
      if (start == null || lastPos == null) { start = null; return; }
      const a = rows[start];
      const b = rows[lastPos];
      const dv = sg * (b.ref - a.ref);
      const dur = b.sec - a.sec;
      if (dv >= EVENT_RULES.visibleRunMinDeltaKmh && dur >= EVENT_RULES.visibleRunMinDurationS) {
        runs.push({ kind, startSec: a.sec, endSec: b.sec, startKmh: a.ref, endKmh: b.ref, deltaKmh: L.round(dv, 1), durationS: dur, meanMps2: L.round(dv / 3.6 / dur) });
      }
      start = null;
      lastPos = null;
      plateau = 0;
    };
    for (let i = 1; i < rows.length; i++) {
      const consecutive = rows[i].sec === rows[i - 1].sec + 1;
      const step = sg * (rows[i].ref - rows[i - 1].ref);
      if (!consecutive || step < 0) { emit(); continue; }
      if (step > 0) {
        if (start == null) start = i - 1;
        lastPos = i;
        plateau = 0;
      } else if (start != null) {
        plateau++;
        if (plateau > EVENT_RULES.visibleRunMaxPlateauSteps) emit();
      }
    }
    emit();
  }
  runs.sort((a, b) => a.startSec - b.startSec);
  return runs;
}

/** Legacy §5.2 / outputs/main: expand **both** intervals by `tol` on each side (superseded by §12 N4 for primary scoring). */
function overlapS_bilateral(aStart, aEnd, bStart, bEnd, tol) {
  const s = Math.max(aStart - tol, bStart - tol);
  const e = Math.min(aEnd + tol, bEnd + tol);
  return e >= s ? e - s + 1 : 0;
}

/** Inclusive-second indices: gap between disjoint intervals (0 when overlapping). */
function intervalGapS(aStart, aEnd, bStart, bEnd) {
  if (aEnd >= bStart && bEnd >= aStart) return 0;
  if (aEnd < bStart) return bStart - aEnd - 1;
  return aStart - bEnd - 1;
}

/** §12 N4: total tolerance `tol` = maximum allowed gap (no bilateral expansion). */
function intervalsWithinTol(aStart, aEnd, bStart, bEnd, tol) {
  return intervalGapS(aStart, aEnd, bStart, bEnd) <= tol;
}

/** Match score for tie-breaking: overlap length, or a small score when matched only via gap tolerance. */
function matchScoreGap(aStart, aEnd, bStart, bEnd, tol) {
  const gap = intervalGapS(aStart, aEnd, bStart, bEnd);
  if (gap > tol) return 0;
  const s = Math.max(aStart, bStart);
  const e = Math.min(aEnd, bEnd);
  if (e >= s) return e - s + 1;
  return tol - gap + 0.001;
}

const MATCHING_MODES = Object.freeze({
  v1_bilateral: {
    id: 'v1_bilateral',
    rulesRef: '§5.2 (first run outputs/main)',
    score(aStart, aEnd, bStart, bEnd, tol) { return overlapS_bilateral(aStart, aEnd, bStart, bEnd, tol); },
  },
  v2_gap2s: {
    id: 'v2_gap2s',
    rulesRef: '§12 N4',
    score(aStart, aEnd, bStart, bEnd, tol) { return matchScoreGap(aStart, aEnd, bStart, bEnd, tol); },
  },
});

function overlapS(aStart, aEnd, bStart, bEnd, tol) {
  return matchScoreGap(aStart, aEnd, bStart, bEnd, tol);
}

/** Detector segments over a C4 series (same semantics as buildSegments in motion-event-detector.ts). */
function usableSegments(c4, usableQualities, maxGapS) {
  const usable = new Set(usableQualities);
  const segs = [];
  let cur = null;
  for (const s of c4) {
    const sec = L.secOf(s.label);
    if (s.valueKmh == null || !usable.has(s.quality)) continue;
    if (cur && sec - cur.endSec > maxGapS) { segs.push(cur); cur = null; }
    if (!cur) cur = { startSec: sec, endSec: sec, n: 0 };
    cur.endSec = sec;
    cur.n++;
  }
  if (cur) segs.push(cur);
  return segs;
}

function nearestDistance(fromSec, toSec, sortedSecs) {
  if (!sortedSecs.length) return null;
  let best = Infinity;
  for (const s of sortedSecs) {
    const d = s < fromSec ? fromSec - s : s > toSec ? s - toSec : 0;
    if (d < best) best = d;
    if (s > toSec + best) break;
  }
  return Number.isFinite(best) ? best : null;
}

/** §7 boundary / gap features for one DS4 event. ctx prepared once per drive by boundaryContext(). */
function boundaryFeatures(ev, ctx) {
  const s = L.secOf(ev.startLabel);
  const e = L.secOf(ev.endLabel);
  const seg = ctx.segments.find((g) => s >= g.startSec && s <= g.endSec) ?? null;
  const sinceStart = seg ? s - seg.startSec : null;
  const toEnd = seg ? seg.endSec - e : null;
  const nearestUnusable = nearestDistance(s, e, ctx.unusableSecs);
  const nearestQuarantine = nearestDistance(s, e, ctx.quarantineSecs);
  const nearestPosGap = nearestDistance(s, e, ctx.positionGapSecs);
  let nonOk = 0;
  let n = 0;
  for (let t = s; t <= e; t++) {
    const c = ctx.c4BySec.get(t);
    if (!c || c.valueKmh == null) continue;
    n++;
    if (c.quality !== 'OK') nonOk++;
  }
  const candidates = [sinceStart, toEnd, nearestQuarantine].filter((x) => x != null);
  const nearBoundary = candidates.length ? Math.min(...candidates) <= EVENT_RULES.nearBoundaryS : false;
  return {
    segStartSec: seg?.startSec ?? null,
    segEndSec: seg?.endSec ?? null,
    secsSinceSegmentStart: sinceStart,
    secsToSegmentEnd: toEnd,
    nearestUnusableC4S: nearestUnusable,
    nearestQuarantineS: nearestQuarantine,
    nearestPositionGapS: nearestPosGap,
    nonOkShare: n ? L.round(nonOk / n, 2) : null,
    nearBoundary,
  };
}

function boundaryContext(c4, buckets, usableQualities, maxGapS) {
  const usable = new Set(usableQualities);
  const c4BySec = new Map(c4.map((s) => [L.secOf(s.label), s]));
  const unusableSecs = [];
  const quarantineSecs = [];
  for (const s of c4) {
    const sec = L.secOf(s.label);
    if (s.valueKmh == null || !usable.has(s.quality)) unusableSecs.push(sec);
    if (s.quality === 'OUTLIER_REJECTED' || (s.flags ?? []).includes('IMPLAUSIBLE_1S_LEG_ENDPOINT_UNCERTAIN')) quarantineSecs.push(sec);
  }
  const positionGapSecs = buckets
    .filter((b) => !(b.availability === 'PRESENT' && b.latitude != null))
    .map((b) => L.secOf(b.bucketLabelUtc));
  const sortNum = (a, b) => a - b;
  return {
    c4BySec,
    segments: usableSegments(c4, usableQualities, maxGapS),
    unusableSecs: unusableSecs.sort(sortNum),
    quarantineSecs: quarantineSecs.sort(sortNum),
    positionGapSecs: positionGapSecs.sort(sortNum),
  };
}

/** §8 plausibility screen. */
function plausibility(ev, vehicleClass, refMaxKmh) {
  const bound = EVENT_RULES.plausibility[vehicleClass][ev.kind];
  const implausible = ev.durationS >= 2 && Math.abs(ev.meanAccelMps2) > bound;
  const overRefMax = refMaxKmh != null && Math.max(ev.startSpeedKmh, ev.endSpeedKmh) > refMaxKmh + EVENT_RULES.overReferenceMaxMarginKmh;
  return { implausible, boundMps2: bound, overReferenceMax: overRefMax };
}

/** §12 N2: number of consecutive readable reference second-pairs in [fromSec, toSec]. */
function readablePairs(refBySec, fromSec, toSec) {
  let n = 0;
  for (let s = fromSec + 1; s <= toSec; s++) {
    if (refBySec.get(s - 1) != null && refBySec.get(s) != null) n++;
  }
  return n;
}

/**
 * §5 classification of DS4 events against oracle (T2) and the reference series.
 * ds4: full MotionManoeuvreEvent[]; oracle: MotionManoeuvreEvent[] on reference; refRows sorted.
 * opts.strict (§12 N1 sensitivity): tolerance applied to the oracle interval only.
 */
function classifyEvents(ds4, oracle, refRows, minDeltaKmh, opts = {}) {
  const tol = EVENT_RULES.matchTolS;
  const mode = MATCHING_MODES[opts.matching ?? 'v2_gap2s'] ?? MATCHING_MODES.v2_gap2s;
  const score = (s, e, os, oe) => {
    if (opts.strict) {
      if (mode.id === 'v1_bilateral') return overlapS_bilateral(s, e, os - tol, oe + tol, 0);
      return matchScoreGap(s, e, os, oe, 0);
    }
    return mode.score(s, e, os, oe, tol);
  };
  const refBySec = new Map(refRows.map((r) => [r.sec, r.ref]));
  const refSecs = refRows.map((r) => r.sec);
  const refFirst = refSecs[0];
  const refLast = refSecs[refSecs.length - 1];
  const oracleRows = oracle.map((o, idx) => ({ idx, o, s: L.secOf(o.startLabel), e: L.secOf(o.endLabel), hits: [] }));

  const results = ds4.map((ev, idx) => {
    const s = L.secOf(ev.startLabel);
    const e = L.secOf(ev.endLabel);
    const out = { idx, ev, s, e, cls: null, oracleIdx: null, overlapS: 0, refWindow: null, note: [] };
    // §5.1 verifiability
    if (e < refFirst || s > refLast) { out.cls = 'UNVERIFIZIERBAR'; out.note.push('AUSSERHALB_REFERENZFENSTER'); return out; }
    let unreadable = 0;
    let total = 0;
    for (let t = s - 1; t <= e + 1; t++) { total++; if (refBySec.get(t) == null) unreadable++; }
    out.refWindow = { fromSec: s - 1, toSec: e + 1, unreadable, total };
    if (unreadable / total > EVENT_RULES.unverifiableUnreadableShare) { out.cls = 'UNVERIFIZIERBAR'; out.note.push(`UNLESBAR_${unreadable}/${total}`); return out; }
    // §5.2 primary matching
    let best = null;
    for (const orow of oracleRows) {
      if (orow.o.kind !== ev.kind) continue;
      const ov = score(s, e, orow.s, orow.e);
      if (ov > 0 && (best == null || ov > best.ov)) best = { orow, ov };
    }
    if (best) {
      out.oracleIdx = best.orow.idx;
      out.overlapS = best.ov;
      best.orow.hits.push(out);
      // merged coverage: other oracle events of same kind overlapping this DS4 event
      for (const orow of oracleRows) {
        if (orow === best.orow || orow.o.kind !== ev.kind) continue;
        if (score(s, e, orow.s, orow.e) > 0) orow.coveredBy = orow.coveredBy ?? out;
      }
      return out;
    }
    // §5.3 unmatched
    const dd = referenceDirectionalDelta(refBySec, s - 1, e + 1, ev.kind);
    const inten = referenceIntensity(refBySec, s - 1, e + 1, ev.kind);
    out.refDelta = dd;
    out.refIntensity = inten;
    out.readablePairs = readablePairs(refBySec, s - 1, e + 1);
    if (dd.deltaKmh != null && dd.deltaKmh >= minDeltaKmh[ev.kind]) {
      if (out.readablePairs < EVENT_RULES.minReadablePairsForIntensity) { out.cls = 'FEHLALARM_UNBESTIMMT'; out.note.push(`LESBARE_PAARE_${out.readablePairs}`); }
      else if (inten.peak1sMps2 != null && inten.peak1sMps2 >= EVENT_RULES.softFalseAlarmMinStepMps2) out.cls = 'WEICHER_FEHLALARM';
      else out.cls = 'FEHLALARM_INTENSITAET';
    } else {
      out.cls = 'FEHLALARM';
    }
    return out;
  });

  // assign hit / fragment per oracle event (first by DS4 start)
  for (const orow of oracleRows) {
    orow.hits.sort((a, b) => a.s - b.s);
    orow.hits.forEach((h, i) => { h.cls = i === 0 ? 'TREFFER' : 'TREFFER_FRAGMENT'; });
  }
  return { ds4: results, oracleRows, refBySec };
}

/** §5.4 oracle status given DS4 coverage. c4BySec for coverage. */
function oracleStatus(orow, c4BySec, usableQualities) {
  if (orow.hits.length) return 'ERKANNT';
  if (orow.coveredBy) return 'ABGEDECKT_DURCH_VERSCHMELZUNG';
  const usable = new Set(usableQualities);
  let total = 0;
  let noSpeed = 0;
  for (let t = orow.s; t <= orow.e; t++) {
    total++;
    const c = c4BySec.get(t);
    if (!c || c.valueKmh == null || !usable.has(c.quality)) noSpeed++;
  }
  if (noSpeed / total >= EVENT_RULES.noDs4SpeedShare) return 'VERPASST_KEINE_DS4_GESCHWINDIGKEIT';
  const entry = 1.5;
  if (orow.o.peakAccel1sMps2 < entry + EVENT_RULES.borderlineBandMps2) return 'VERPASST_GRENZWERTIG';
  return 'VERPASST';
}

/** Classes that neither count as verifiable nor as hard false alarms (§5.1, §12 N2). */
const UNVERIFIED_CLASSES = Object.freeze(['UNVERIFIZIERBAR', 'FEHLALARM_UNBESTIMMT']);

/** §12 N3 production acceptance (`eventAcceptedCount` semantics of the shadow processor). */
function isAcceptedBaseline(ev) {
  return EVENT_RULES.acceptedQualities.includes(ev.quality);
}

/** Detector segments as sample arrays (identical to buildSegments in motion-event-detector.ts). */
function segmentSamples(c4, usableQualities, maxGapS) {
  const usable = new Set(usableQualities);
  const segs = [];
  let cur = [];
  for (const s of c4) {
    if (s.valueKmh == null || !usable.has(s.quality)) continue;
    if (cur.length && L.secOf(s.label) - L.secOf(cur[cur.length - 1].label) > maxGapS) { segs.push(cur); cur = []; }
    cur.push(s);
  }
  if (cur.length) segs.push(cur);
  return segs;
}

/**
 * Offline candidate K-B ("pre-event baseline reversion"): identical to K3 of the detector, but the post-event
 * speed is additionally compared with the last usable sample *before* the event start (same segment, so ≤ maxGapS
 * before). Returns a Map eventKey → revert label for events the candidate would additionally mark ARTEFACT_SUSPECT.
 * Horizon stays within `windowS` after the event end (§10 criterion 5).
 */
function candidatePreBaselineReversion(c4, events, { usableQualities, maxGapS, windowS, minDeltaKmh, eventKey }) {
  const flagged = new Map();
  const segs = segmentSamples(c4, usableQualities, maxGapS);
  const evByStart = events.map((ev) => ({ ev, s: L.secOf(ev.startLabel), e: L.secOf(ev.endLabel) }));
  for (const seg of segs) {
    const secs = seg.map((x) => L.secOf(x.label));
    const segStart = secs[0];
    const segEnd = secs[secs.length - 1];
    const inSeg = evByStart.filter((r) => r.s >= segStart && r.e <= segEnd);
    for (const r of inSeg) {
      if (r.ev.quality === 'ARTEFACT_SUSPECT') continue; // already caught by K3
      const s0 = secs.indexOf(r.s);
      const s1 = secs.indexOf(r.e);
      if (s0 <= 0 || s1 < 0) continue; // no pre-event sample inside the segment
      const pre = seg[s0 - 1].valueKmh;
      const tol = minDeltaKmh[r.ev.kind];
      let revert = null;
      for (let j = s1 + 1; j < seg.length; j++) {
        if (secs[j] - r.e > windowS) break;
        if (Math.abs(seg[j].valueKmh - pre) < tol) { revert = `${seg[j].label}:${seg[j].valueKmh}`; break; }
      }
      if (!revert) continue;
      const oppositeFollows = inSeg.some((o) => o.ev.kind !== r.ev.kind && o.s >= r.e && o.s - r.e <= windowS);
      if (oppositeFollows) continue;
      flagged.set(eventKey(r.ev), { revert, preSpeedKmh: pre, preLabel: seg[s0 - 1].label });
    }
  }
  return flagged;
}

function medianOf(vals) {
  if (!vals.length) return null;
  const s = [...vals].sort((a, b) => a - b);
  return L.percentile(s, 0.5);
}

function offsetStats(vals) {
  if (!vals.length) return { n: 0 };
  const abs = vals.map(Math.abs);
  return {
    n: vals.length,
    medianS: medianOf(vals),
    meanS: L.round(vals.reduce((a, b) => a + b, 0) / vals.length, 2),
    minS: Math.min(...vals),
    maxS: Math.max(...vals),
    withinTolShare: L.round(abs.filter((x) => x <= EVENT_RULES.matchTolS).length / vals.length, 2),
  };
}

module.exports = {
  EVENT_RULES, UNVERIFIED_CLASSES, MATCHING_MODES, sign, referenceAsSpeedSamples, referenceIntensity, referenceDirectionalDelta, visibleRuns,
  overlapS, overlapS_bilateral, intervalGapS, intervalsWithinTol, matchScoreGap,
  usableSegments, segmentSamples, boundaryContext, boundaryFeatures, plausibility, classifyEvents, oracleStatus, offsetStats, medianOf,
  readablePairs, isAcceptedBaseline, candidatePreBaselineReversion,
};
