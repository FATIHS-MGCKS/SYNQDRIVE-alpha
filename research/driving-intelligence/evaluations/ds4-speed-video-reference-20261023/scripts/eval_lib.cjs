'use strict';
// Shared evaluation helpers. Every rule here mirrors EVALUATION_RULES.md; do not tune thresholds here.
const fs = require('node:fs');
const { createHash } = require('node:crypto');

const RULES = Object.freeze({
  stationaryBandMaxKmh: 3, // DS4 "still" when numeric <= 3 (L3: < 3, see rules §6)
  movingBandMinKmh: 5,
  confirmedMotionMinKmh: 5,
  zeroRunMinS: 3,
  timingWindowS: 10,
  changingDeltaKmh: 5,
  sensitivityShiftsS: [-2, -1, 1, 2],
  bands: [
    ['ref_0', (v) => v === 0],
    ['ref_0_30', (v) => v > 0 && v < 30],
    ['ref_30_60', (v) => v >= 30 && v < 60],
    ['ref_60_100', (v) => v >= 60 && v < 100],
    ['ref_100_plus', (v) => v >= 100],
  ],
});

function sha256File(file) {
  return createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

// RFC-4180 cells; empty cells stay '' (never Number('') = 0).
function parseCsv(text) {
  const lines = text.replace(/^\uFEFF/, '').trim().split(/\r?\n/);
  const cells = (line) => {
    const out = [];
    let value = '';
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (quoted && line[i + 1] === '"') {
          value += '"';
          i++;
        } else quoted = !quoted;
      } else if (ch === ',' && !quoted) {
        out.push(value);
        value = '';
      } else value += ch;
    }
    out.push(value);
    return out;
  };
  const header = cells(lines.shift());
  return lines.map((line) => Object.fromEntries(cells(line).map((v, i) => [header[i], v])));
}

function toCsv(rows, columns) {
  const esc = (v) => {
    if (v == null) return '';
    const s = typeof v === 'number' ? String(v) : Array.isArray(v) ? v.join('|') : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [columns.join(','), ...rows.map((r) => columns.map((c) => esc(r[c])).join(','))].join('\n') + '\n';
}

function numOrNull(v) {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = String(v).trim();
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function labelOf(ms) {
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function secOf(label) {
  const ms = Date.parse(label);
  if (Number.isNaN(ms)) throw new Error(`bad label ${label}`);
  return Math.floor(ms / 1000);
}

function percentile(sortedAbs, p) {
  const n = sortedAbs.length;
  if (n === 0) return null;
  const x = (n - 1) * p;
  const lo = Math.floor(x);
  const hi = Math.ceil(x);
  return sortedAbs[lo] + (sortedAbs[hi] - sortedAbs[lo]) * (x - lo);
}

function round(x, d = 3) {
  return x == null ? null : Math.round(x * 10 ** d) / 10 ** d;
}

// errors = estimate - reference (km/h)
function metrics(errors) {
  const n = errors.length;
  if (n === 0) return { n: 0 };
  const abs = errors.map(Math.abs).sort((a, b) => a - b);
  const sum = errors.reduce((a, b) => a + b, 0);
  return {
    n,
    maeKmh: round(abs.reduce((a, b) => a + b, 0) / n),
    medianAbsKmh: round(percentile(abs, 0.5)),
    p95AbsKmh: round(percentile(abs, 0.95)),
    maxAbsKmh: round(abs[n - 1]),
    biasKmh: round(sum / n),
    rmseKmh: round(Math.sqrt(errors.reduce((s, e) => s + e * e, 0) / n)),
    within3: round(abs.filter((e) => e <= 3).length / n),
    within5: round(abs.filter((e) => e <= 5).length / n),
  };
}

/**
 * Reference classes per rules §6. rows: [{sec, ref}] sorted; ref null = unreadable.
 * Returns Map sec -> { cls: 'STILL_CORE'|'STILL_EDGE'|'MOVING_CONFIRMED'|'SLOW_OR_AMBIGUOUS'|'UNREADABLE', run: idx|null }
 */
function classifyReference(rows) {
  const bySec = new Map(rows.map((r) => [r.sec, r.ref]));
  const runs = zeroRuns(rows);
  const runBySec = new Map();
  runs.forEach((run, idx) => {
    for (let s = run.startSec; s <= run.endSec; s++) runBySec.set(s, idx);
  });
  const out = new Map();
  for (const r of rows) {
    if (r.ref == null) {
      out.set(r.sec, { cls: 'UNREADABLE', run: null });
      continue;
    }
    if (r.ref === 0) {
      const idx = runBySec.get(r.sec);
      const run = idx == null ? null : runs[idx];
      if (run && run.lengthS >= RULES.zeroRunMinS && r.sec > run.startSec && r.sec < run.endSec) {
        out.set(r.sec, { cls: 'STILL_CORE', run: idx });
      } else {
        out.set(r.sec, { cls: 'STILL_EDGE', run: idx ?? null });
      }
      continue;
    }
    const prev = bySec.get(r.sec - 1);
    const next = bySec.get(r.sec + 1);
    if (
      r.ref >= RULES.confirmedMotionMinKmh &&
      prev != null && prev >= RULES.confirmedMotionMinKmh &&
      next != null && next >= RULES.confirmedMotionMinKmh
    ) {
      out.set(r.sec, { cls: 'MOVING_CONFIRMED', run: null });
    } else {
      out.set(r.sec, { cls: 'SLOW_OR_AMBIGUOUS', run: null });
    }
  }
  return { classes: out, runs };
}

/** Consecutive reference-zero seconds (must be consecutive calendar seconds; clip gaps break runs). */
function zeroRuns(rows) {
  const runs = [];
  let cur = null;
  for (const r of rows) {
    if (r.ref === 0) {
      if (cur && r.sec === cur.endSec + 1) cur.endSec = r.sec;
      else {
        if (cur) runs.push(cur);
        cur = { startSec: r.sec, endSec: r.sec };
      }
    } else if (cur && r.sec !== cur.endSec) {
      // a non-zero or unreadable row after the run ends it
      runs.push(cur);
      cur = null;
    }
  }
  if (cur) runs.push(cur);
  for (const run of runs) run.lengthS = run.endSec - run.startSec + 1;
  return runs;
}

/** Reference phase: changing when |ref(t+2) - ref(t-2)| >= 5 (both readable), steady otherwise, null if not evaluable. */
function phaseOf(bySec, sec) {
  const a = bySec.get(sec - 2);
  const b = bySec.get(sec + 2);
  if (a == null || b == null) return null;
  return Math.abs(b - a) >= RULES.changingDeltaKmh ? 'CHANGING' : 'STEADY';
}

/** DS4 motion claim per path (rules §6). Returns 'STILL' | 'MOVING' | 'NONE'. */
function l3Claim(speed, motionState) {
  if (motionState === 'STATIONARY_SUPPORTED') return 'STILL';
  if (speed != null && speed < RULES.stationaryBandMaxKmh) return 'STILL';
  if (speed != null && speed >= RULES.movingBandMinKmh && (motionState == null || motionState === 'MOVING_SPEED_ESTIMATED')) return 'MOVING';
  return 'NONE';
}
function c4Claim(speed) {
  if (speed == null) return 'NONE';
  if (speed <= RULES.stationaryBandMaxKmh) return 'STILL';
  if (speed >= RULES.movingBandMinKmh) return 'MOVING';
  return 'NONE';
}
function fsmClaim(state) {
  if (state === 'STATIONARY' || state === 'STOP_CANDIDATE') return 'STILL';
  if (state === 'MOVING' || state === 'STARTING') return 'MOVING';
  return 'NONE';
}

/**
 * Speed metrics for one estimate series against reference rows.
 * rows: [{sec, ref, cls, phase}], get: sec -> number|null, gridHas: sec -> bool
 */
function speedEvaluation(rows, get, gridHas) {
  const readable = rows.filter((r) => r.ref != null);
  const paired = [];
  const exclusions = { REF_SPEED_MISSING: 0, OUTSIDE_GRID: 0, DS4_NULL: 0 };
  for (const r of rows) {
    if (r.ref == null) {
      exclusions.REF_SPEED_MISSING++;
      continue;
    }
    if (!gridHas(r.sec)) {
      exclusions.OUTSIDE_GRID++;
      continue;
    }
    const v = get(r.sec);
    if (v == null) {
      exclusions.DS4_NULL++;
      continue;
    }
    paired.push({ ...r, est: v, err: v - r.ref });
  }
  const seg = (name, pred) => [name, metrics(paired.filter(pred).map((p) => p.err))];
  return {
    coverage: {
      referenceRows: rows.length,
      readable: readable.length,
      paired: paired.length,
      pairedShareOfReadable: round(readable.length ? paired.length / readable.length : 0),
      missingEstimateOnReadable: readable.length - paired.length,
      exclusions,
    },
    all: metrics(paired.map((p) => p.err)),
    bands: Object.fromEntries(RULES.bands.map(([name, pred]) => seg(name, (p) => pred(p.ref)))),
    phases: Object.fromEntries([
      seg('STEADY', (p) => p.phase === 'STEADY'),
      seg('CHANGING', (p) => p.phase === 'CHANGING'),
    ]),
    pairedSecs: paired.map((p) => p.sec),
  };
}

/** Common-support comparison of two series on the same reference rows. */
function commonSupport(rows, getA, getB) {
  const errsA = [];
  const errsB = [];
  for (const r of rows) {
    if (r.ref == null) continue;
    const a = getA(r.sec);
    const b = getB(r.sec);
    if (a == null || b == null) continue;
    errsA.push(a - r.ref);
    errsB.push(b - r.ref);
  }
  return { n: errsA.length, a: metrics(errsA), b: metrics(errsB) };
}

/** Standstill / motion claim counters per rules §6. claim: sec -> 'STILL'|'MOVING'|'NONE' */
function motionClaimEvaluation(rows, claim) {
  const out = {
    confirmedStillCoreSecs: 0, falseMotionInConfirmedStill: 0, stillCorrect: 0, stillNoClaim: 0,
    confirmedMotionSecs: 0, falseStillInConfirmedMotion: 0, motionCorrect: 0, motionNoClaim: 0,
    ambiguousSecs: 0, ambiguousStill: 0, ambiguousMoving: 0, ambiguousNoClaim: 0,
    falseMotionLabels: [], falseStillLabels: [],
  };
  for (const r of rows) {
    const c = claim(r.sec);
    if (r.cls === 'STILL_CORE') {
      out.confirmedStillCoreSecs++;
      if (c === 'MOVING') { out.falseMotionInConfirmedStill++; out.falseMotionLabels.push(labelOf(r.sec * 1000)); }
      else if (c === 'STILL') out.stillCorrect++;
      else out.stillNoClaim++;
    } else if (r.cls === 'MOVING_CONFIRMED') {
      out.confirmedMotionSecs++;
      if (c === 'STILL') { out.falseStillInConfirmedMotion++; out.falseStillLabels.push(labelOf(r.sec * 1000)); }
      else if (c === 'MOVING') out.motionCorrect++;
      else out.motionNoClaim++;
    } else if (r.cls === 'SLOW_OR_AMBIGUOUS' || r.cls === 'STILL_EDGE') {
      out.ambiguousSecs++;
      if (c === 'STILL') out.ambiguousStill++;
      else if (c === 'MOVING') out.ambiguousMoving++;
      else out.ambiguousNoClaim++;
    }
  }
  return out;
}

/**
 * Stop/start timing offsets per zero run (rules §6). Requires readable neighbours of the run.
 * claim: sec -> 'STILL'|'MOVING'|'NONE'; refBySec for neighbour readability.
 */
function timingOffsets(runs, refBySec, claim, gridHas) {
  const results = [];
  for (const run of runs) {
    if (run.lengthS < RULES.zeroRunMinS) continue;
    const before = refBySec.get(run.startSec - 1);
    const after = refBySec.get(run.endSec + 1);
    const entry = {
      refStopLabel: labelOf(run.startSec * 1000), refStartLabel: after == null ? null : labelOf((run.endSec + 1) * 1000),
      refZeroLengthS: run.lengthS, refBeforeKmh: before ?? null, refAfterKmh: after ?? null,
      stopOffsetS: null, startOffsetS: null, stopStatus: null, startStatus: null,
    };
    if (before == null || !gridHas(run.startSec)) {
      entry.stopStatus = before == null ? 'REF_EDGE_UNREADABLE' : 'OUTSIDE_GRID';
    } else {
      let found = null;
      for (let s = run.startSec - RULES.timingWindowS; s <= run.startSec + RULES.timingWindowS; s++) {
        if (claim(s) === 'STILL') { found = s; break; }
      }
      if (found == null) entry.stopStatus = 'MISSED';
      else { entry.stopStatus = 'FOUND'; entry.stopOffsetS = found - run.startSec; }
    }
    if (after == null || !gridHas(run.endSec + 1)) {
      entry.startStatus = after == null ? 'REF_EDGE_UNREADABLE' : 'OUTSIDE_GRID';
    } else if (entry.stopStatus !== 'FOUND') {
      entry.startStatus = 'NO_DS4_STOP';
    } else {
      const refStart = run.endSec + 1;
      const from = Math.max(run.startSec + entry.stopOffsetS + 1, refStart - RULES.timingWindowS);
      let found = null;
      for (let s = from; s <= refStart + RULES.timingWindowS; s++) {
        if (claim(s) === 'MOVING') { found = s; break; }
      }
      if (found == null) entry.startStatus = 'MISSED';
      else { entry.startStatus = 'FOUND'; entry.startOffsetS = found - refStart; }
    }
    results.push(entry);
  }
  const summarize = (key, status) => {
    const vals = results.filter((r) => r[status] === 'FOUND').map((r) => r[key]).sort((a, b) => a - b);
    return {
      evaluated: results.filter((r) => r[status] !== 'REF_EDGE_UNREADABLE' && r[status] !== 'OUTSIDE_GRID' && r[status] !== 'NO_DS4_STOP').length,
      found: vals.length,
      missed: results.filter((r) => r[status] === 'MISSED').length,
      medianOffsetS: vals.length ? percentile(vals, 0.5) : null,
      meanOffsetS: vals.length ? round(vals.reduce((a, b) => a + b, 0) / vals.length, 2) : null,
      minOffsetS: vals.length ? vals[0] : null,
      maxOffsetS: vals.length ? vals[vals.length - 1] : null,
      offsets: vals,
    };
  };
  return { runs: results, stop: summarize('stopOffsetS', 'stopStatus'), start: summarize('startOffsetS', 'startStatus') };
}

/** Position neighbourhood features per grid second. presentSecs: Set of seconds with PRESENT position. */
function positionFeatures(presentSecs, gridSecs) {
  const sorted = [...presentSecs].sort((a, b) => a - b);
  const feats = new Map();
  for (const sec of gridSecs) {
    const present = presentSecs.has(sec);
    let nearest = null;
    if (present) nearest = 0;
    else {
      // binary search neighbours
      let lo = 0, hi = sorted.length - 1, idx = sorted.length;
      while (lo <= hi) { const mid = (lo + hi) >> 1; if (sorted[mid] < sec) lo = mid + 1; else { idx = mid; hi = mid - 1; } }
      const after = idx < sorted.length ? sorted[idx] - sec : null;
      const before = idx > 0 ? sec - sorted[idx - 1] : null;
      nearest = Math.min(after ?? Infinity, before ?? Infinity);
      if (!Number.isFinite(nearest)) nearest = null;
    }
    let gapLen = 0;
    if (!present) {
      let a = sec; while (!presentSecs.has(a - 1) && gridSecs.has(a - 1)) a--;
      let b = sec; while (!presentSecs.has(b + 1) && gridSecs.has(b + 1)) b++;
      gapLen = b - a + 1;
    }
    feats.set(sec, {
      present, prev: presentSecs.has(sec - 1), next: presentSecs.has(sec + 1), nearestDistS: nearest, gapLenS: gapLen,
      pattern: `${presentSecs.has(sec - 1) ? 'P' : '-'}${present ? 'P' : '-'}${presentSecs.has(sec + 1) ? 'P' : '-'}`,
    });
  }
  return feats;
}

function groupAbsErrors(items, keyFn) {
  const groups = new Map();
  for (const it of items) {
    const k = keyFn(it);
    if (k == null) continue;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(it.err);
  }
  return Object.fromEntries([...groups.entries()].sort().map(([k, errs]) => [k, metrics(errs)]));
}

function distClass(d) {
  if (d == null) return 'no_position_in_grid';
  if (d === 0) return 'd0';
  if (d === 1) return 'd1';
  if (d === 2) return 'd2';
  if (d <= 5) return 'd3_5';
  return 'd_gt5';
}

module.exports = {
  RULES, sha256File, parseCsv, toCsv, numOrNull, labelOf, secOf, percentile, round, metrics,
  classifyReference, zeroRuns, phaseOf, l3Claim, c4Claim, fsmClaim, speedEvaluation, commonSupport,
  motionClaimEvaluation, timingOffsets, positionFeatures, groupAbsErrors, distClass,
};
