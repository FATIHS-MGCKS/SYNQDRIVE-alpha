#!/usr/bin/env node
'use strict';
/**
 * Fable A/B harness — alternative acceleration/braking detectors vs production baseline on the four pinned
 * reference drives. Read-only: nothing in the repository is modified; code-root = production SHA checkout.
 *
 *   node scripts/candidates_ab.cjs --code-root <production-checkout> --tag fable_base_7340637 [--out <dir>]
 */
const fs = require('node:fs');
const path = require('node:path');
const P = require('./paths.cjs');
const R = require(P.replayScript);
const E = require(P.eventEvalLib);
const L = require(P.evalLib);
const DI = P.DI;
const { haversineMeters } = require(path.join(DI, 'core/geo/haversine.ts'));
const { detectTimingJitterSuspectLegs } = require(path.join(DI, 'core/kinematics/leg-consistency.ts'));

const { loadDrives, evaluateDrive, core, GUARDS, THR, OPTIONS, eventKey, codeSha } = R;
const sec = (label) => L.secOf(label);
const sgn = (kind) => (kind === 'ACCELERATION' ? 1 : -1);
const OUT = P.outRoot;
fs.mkdirSync(OUT, { recursive: true });

// ---------------------------------------------------------------------------------------------
// Generic re-implementation of the production detector with hooks (parity asserted against core).
// ---------------------------------------------------------------------------------------------
function buildSegments(samples, usable, maxGapS) {
  const segs = []; let cur = [];
  for (const s of samples) {
    if (s.valueKmh == null || !usable.has(s.quality)) continue;
    if (cur.length && sec(s.label) - sec(cur[cur.length - 1].label) > maxGapS) { segs.push(cur); cur = []; }
    cur.push(s);
  }
  if (cur.length) segs.push(cur);
  return segs;
}
function eventQuality(slice) {
  const q = new Set(slice.map((x) => x.quality));
  if (q.size === 1 && q.has('OK')) return 'OK';
  if (q.has('JITTER_SUSPECT') || q.has('REPAIRED')) return 'DEGRADED';
  return 'LIMITED';
}
const r1 = (x) => Math.round(x * 10) / 10;
const r3 = (x) => Math.round(x * 1000) / 1000;

/**
 * hooks.accelAt(seg, i, sign) → acceleration attributed to step i-1→i (m/s²). Default = production 1-s difference.
 * hooks.entryAllowed(seg, i, segStartSec) → default = production post-gap guard.
 */
function detectGeneric(samples, { usableQualities = GUARDS.usableQualities, thresholds = THR, maxGapS = GUARDS.maxGapS, postGapGuardS = GUARDS.postGapGuardS, spikeReversion = true, hooks = {}, source = 'GENERIC' } = {}) {
  const usable = new Set(usableQualities);
  const events = [];
  const accelAt = hooks.accelAt ?? ((seg, i, sign) => {
    const dt = sec(seg[i].label) - sec(seg[i - 1].label);
    return (sign * (seg[i].valueKmh - seg[i - 1].valueKmh)) / 3.6 / dt;
  });
  const entryAllowed = hooks.entryAllowed ?? ((seg, i, segStart) => sec(seg[i - 1].label) - segStart >= postGapGuardS);
  for (const seg of buildSegments(samples, usable, maxGapS)) {
    if (seg.length < 3) continue;
    const segStart = sec(seg[0].label);
    const segEvents = [];
    for (const kind of ['ACCELERATION', 'DECELERATION']) {
      const sign = sgn(kind);
      let inEv = false, evStart = 0, peak = 0, steps = 0;
      const raw = [];
      for (let i = 1; i < seg.length; i++) {
        const a = accelAt(seg, i, sign);
        if (!inEv) {
          if (a >= thresholds.entryMps2 && entryAllowed(seg, i, segStart)) { inEv = true; evStart = i - 1; peak = a; steps = 1; }
        } else if (a >= thresholds.continueMps2) { steps += 1; peak = Math.max(peak, a); }
        else { raw.push([evStart, i - 1, peak, steps]); inEv = false; }
      }
      if (inEv) raw.push([evStart, seg.length - 1, peak, steps]);
      const acc = raw.filter(([s0, s1, , st]) => st >= thresholds.minSteps && sign * (seg[s1].valueKmh - seg[s0].valueKmh) >= thresholds.minDeltaKmh[kind]);
      const merged = [];
      for (const e of acc) {
        if (merged.length && sec(seg[e[0]].label) - sec(seg[merged[merged.length - 1][1]].label) < thresholds.mergeGapS[kind]) {
          const m = merged[merged.length - 1]; m[1] = e[1]; m[2] = Math.max(m[2], e[2]); m[3] += e[3];
        } else merged.push([...e]);
      }
      for (const [s0, s1, pk, st] of merged) {
        const dur = sec(seg[s1].label) - sec(seg[s0].label);
        const dv = sign * (seg[s1].valueKmh - seg[s0].valueKmh);
        const slice = seg.slice(s0, s1 + 1);
        const vals = slice.map((x) => [sec(x.label), x.valueKmh]);
        const two = [];
        for (let j = 2; j < vals.length; j++) two.push((sign * (vals[j][1] - vals[j - 2][1])) / 3.6 / (vals[j][0] - vals[j - 2][0]));
        const flags = [...new Set(slice.flatMap((x) => x.flags))].sort();
        const ev = {
          trip: 0, kind, startLabel: seg[s0].label, endLabel: seg[s1].label,
          startUncertaintyS: '±1 s label + unvalidated clock offset', endUncertaintyS: '±1 s label + unvalidated clock offset',
          startSpeedKmh: r1(seg[s0].valueKmh), endSpeedKmh: r1(seg[s1].valueKmh), deltaKmh: r1(dv),
          meanAccelMps2: r3(dv / 3.6 / Math.max(dur, 1)), peakAccel1sMps2: r3(pk), peakAccel2sMps2: two.length ? r3(Math.max(...two)) : null,
          durationS: dur, steps: st, coverageRatio: r3((s1 - s0 + 1) / Math.max(1, dur + 1)), quality: eventQuality(slice), source,
          algorithmVersion: 'GENERIC', flags,
        };
        events.push(ev); segEvents.push({ ev, s0, s1 });
      }
    }
    if (spikeReversion) applyK3(seg, segEvents, thresholds);
  }
  events.sort((a, b) => a.startLabel.localeCompare(b.startLabel));
  return events;
}
function applyK3(seg, segEvents, thresholds) {
  const win = core.MOTION_EVENT_SPIKE_REVERSION_WINDOW_S;
  for (const { ev, s0, s1 } of segEvents) {
    const endSec = sec(seg[s1].label); const startSpeed = seg[s0].valueKmh; const tol = thresholds.minDeltaKmh[ev.kind];
    let revertLabel = null, revertSpeed = null;
    for (let j = s1 + 1; j < seg.length; j++) {
      const dt = sec(seg[j].label) - endSec; if (dt > win) break;
      if (Math.abs(seg[j].valueKmh - startSpeed) < tol) { revertLabel = seg[j].label; revertSpeed = seg[j].valueKmh; break; }
    }
    if (revertLabel == null) continue;
    const opposite = segEvents.some((o) => o.ev.kind !== ev.kind && o.s0 >= s1 && sec(seg[o.s0].label) - endSec <= win);
    if (opposite) { ev.flags = [...ev.flags, 'REVERSION_EXPLAINED_BY_OPPOSITE_EVENT'].sort(); continue; }
    ev.quality = 'ARTEFACT_SUSPECT';
    ev.flags = [...ev.flags, `SPIKE_REVERSION_WITHIN_${win}S=${revertLabel}:${r1(revertSpeed)}`].sort();
  }
}
const persisted = (e) => ({ kind: e.kind, startLabel: e.startLabel, endLabel: e.endLabel, startSpeedKmh: e.startSpeedKmh, endSpeedKmh: e.endSpeedKmh, deltaKmh: e.deltaKmh, quality: e.quality, flags: [...e.flags].sort() });

// ---------------------------------------------------------------------------------------------
// Physics envelope (nameplate-derived, NOT tuned on the reference drives).
//   accel: a_max(v) = min(a_launch, P_wheel / (m · v)) evaluated at the event's lowest speed (most permissive)
//   decel: a_max = µ·g ≈ 9.0 m/s² (tyre/road limit, speed independent)
// ---------------------------------------------------------------------------------------------
const PHYS = {
  TIGUAN: { massKg: 1800, wheelPowerW: 150e3, launchMps2: 4.5, decelMps2: 9.0, note: 'ICE SUV ≤ 2.0 TSI/TDI; 0–100 ≥ 6 s' },
  TESLA: { massKg: 2000, wheelPowerW: 400e3, launchMps2: 9.0, decelMps2: 9.0, note: 'upper envelope incl. Performance variants' },
};
function physEnvelope(ev, vehicleClass) {
  const p = PHYS[vehicleClass] ?? PHYS.TESLA;
  if (ev.kind === 'DECELERATION') return { boundMps2: p.decelMps2, basis: 'tyre_limit' };
  const vLow = Math.max(Math.min(ev.startSpeedKmh, ev.endSpeedKmh) / 3.6, 5); // ≥ 5 m/s to avoid the 1/v singularity
  const powerBound = p.wheelPowerW / (p.massKg * vLow);
  return powerBound < p.launchMps2 ? { boundMps2: r3(powerBound), basis: 'power_limit' } : { boundMps2: p.launchMps2, basis: 'launch_limit' };
}
function physViolation(ev, vehicleClass, { useMean = true, usePeak2 = false, margin = 1.0 } = {}) {
  const env = physEnvelope(ev, vehicleClass);
  const reasons = [];
  if (useMean && ev.durationS >= 2 && ev.meanAccelMps2 > env.boundMps2 * margin) reasons.push(`MEAN_${ev.meanAccelMps2}>${env.boundMps2}`);
  if (usePeak2 && ev.peakAccel2sMps2 != null && ev.peakAccel2sMps2 > env.boundMps2 * margin) reasons.push(`PEAK2S_${ev.peakAccel2sMps2}>${env.boundMps2}`);
  return reasons.length ? { violated: true, env, reasons } : { violated: false, env, reasons };
}

// ---------------------------------------------------------------------------------------------
// Spike-bracket guard: event is bracketed by opposite-sign steps ≥ entry threshold immediately before start
// and immediately after end (same segment; post window = K3 window). V/Λ-shaped excursion, no jerk a real
// vehicle produces at these amplitudes (|Δa| ≥ 3 m/s² within 1–2 s on both flanks).
// ---------------------------------------------------------------------------------------------
function spikeBracketFlags(c4, events) {
  const segs = buildSegments(c4, new Set(GUARDS.usableQualities), GUARDS.maxGapS);
  const flagged = new Map();
  for (const seg of segs) {
    const secs = seg.map((x) => sec(x.label));
    for (const ev of events) {
      const s0 = secs.indexOf(sec(ev.startLabel)); const s1 = secs.indexOf(sec(ev.endLabel));
      if (s0 < 0 || s1 < 0) continue;
      const sign = sgn(ev.kind);
      const stepA = (i) => (sign * (seg[i].valueKmh - seg[i - 1].valueKmh)) / 3.6 / (secs[i] - secs[i - 1]);
      const pre = s0 >= 1 ? stepA(s0) : null; // step into the start sample
      const post = s1 + 1 < seg.length && secs[s1 + 1] - secs[s1] <= core.MOTION_EVENT_SPIKE_REVERSION_WINDOW_S ? stepA(s1 + 1) : null;
      if (pre != null && post != null && pre <= -THR.entryMps2 && post <= -THR.entryMps2) {
        flagged.set(eventKey(ev), { preStepMps2: r3(pre), postStepMps2: r3(post) });
      }
    }
  }
  return flagged;
}

// ---------------------------------------------------------------------------------------------
// LEG hypothesis: 1-s forward-chord leg speeds (2-s acceleration kernel instead of C4's ~3-s kernel), gated by the
// same quarantine/jitter machinery C4 uses. Quality 'OK' for usable legs; unusable legs break segments.
// ---------------------------------------------------------------------------------------------
function legSpeedSeries(d) {
  const ordered = core.orderMotionCoreGrid ? core.orderMotionCoreGrid(d.buckets) : d.buckets;
  const byLabel = new Map(ordered.map((b) => [b.bucketLabelUtc, b]));
  const c4ByLabel = new Map(d.c4.map((s) => [s.label, s]));
  const jitter = detectTimingJitterSuspectLegs(ordered);
  const out = [];
  for (const b of ordered) {
    const lab = b.bucketLabelUtc;
    const nb = byLabel.get(L.labelOf((sec(lab) + 1) * 1000));
    const cq = c4ByLabel.get(lab)?.quality; const nq = nb ? c4ByLabel.get(nb.bucketLabelUtc)?.quality : null;
    const bad = (q) => q == null || q === 'OUTLIER_REJECTED' || q === 'FROZEN_POSITION' || q === 'NO_POSITION';
    if (!nb || b.latitude == null || nb.latitude == null || bad(cq) || bad(nq) || jitter.has(lab)) {
      out.push({ label: lab, valueKmh: null, quality: 'NO_SUPPORT', supportLabels: [], supportSpanS: null, flags: [], estimator: 'LEG' });
      continue;
    }
    const v = haversineMeters(b.latitude, b.longitude, nb.latitude, nb.longitude) * 3.6;
    out.push({ label: lab, valueKmh: v, quality: 'OK', supportLabels: [lab, nb.bucketLabelUtc], supportSpanS: 1, flags: ['LEG_CHORD'], estimator: 'LEG' });
  }
  return out;
}

// REG3 hypothesis: acceleration from least-squares slope over 3 consecutive usable samples (i-1, i, i+1 if present).
function reg3Hook(seg, i, sign) {
  const pts = [];
  for (const k of [i - 1, i, i + 1]) if (k >= 0 && k < seg.length) pts.push([sec(seg[k].label), seg[k].valueKmh / 3.6]);
  const n = pts.length; const mx = pts.reduce((a, p) => a + p[0], 0) / n; const my = pts.reduce((a, p) => a + p[1], 0) / n;
  let num = 0, den = 0; for (const [x, y] of pts) { num += (x - mx) * (y - my); den += (x - mx) ** 2; }
  return sign * (den ? num / den : 0);
}

// ---------------------------------------------------------------------------------------------
// Candidate definitions
// ---------------------------------------------------------------------------------------------
const vehicleClassOf = (d) => d.identity.vehicleClass;
const CANDIDATES = [
  { id: 'BASE', title: 'Production detector on C4 (HF_THRESHOLDS_V1 + GUARDS_V0_1 + K3)', level: 'baseline', apply: (d) => ({ events: d.events, isAccepted: E.isAcceptedBaseline }) },
  { id: 'C51', title: 'Production detector on C5.1 V1.2 preferred series (bundle V2/V4 wiring)', level: 'speed input', apply: (d) => {
      const c5 = core.computeC5_1GatedRepair(d.buckets, { vehicleClass: vehicleClassOf(d) });
      const events = core.detectMotionManoeuvreEvents(0, c5.samples, core.MOTION_CORE_SPEED_C5_1_VERSION, GUARDS.usableQualities, OPTIONS);
      const states = c5.samples.reduce((m, s) => { m[s.repairState] = (m[s.repairState] ?? 0) + 1; return m; }, {});
      return { events, isAccepted: E.isAcceptedBaseline, extra: { repairStates: states } };
    } },
  { id: 'KB', title: 'K3 + pre-event baseline reversion (PR #2139 K-B)', level: 'detector option (ARTEFACT_SUSPECT)', apply: (d) => {
      const flagged = E.candidatePreBaselineReversion(d.c4, d.events, { usableQualities: GUARDS.usableQualities, maxGapS: GUARDS.maxGapS, windowS: core.MOTION_EVENT_SPIKE_REVERSION_WINDOW_S, minDeltaKmh: THR.minDeltaKmh, eventKey });
      const events = d.events.map((e) => flagged.has(eventKey(e)) ? { ...e, quality: 'ARTEFACT_SUSPECT', flags: [...e.flags, 'PRE_BASELINE_REVERSION'].sort() } : e);
      return { events, isAccepted: E.isAcceptedBaseline, changed: [...flagged.keys()] };
    } },
  { id: 'BRACKET', title: 'Spike-bracket guard (opposite ≥ entry step before start AND after end)', level: 'detector option (ARTEFACT_SUSPECT)', apply: (d) => {
      const flagged = spikeBracketFlags(d.c4, d.events);
      const events = d.events.map((e) => flagged.has(eventKey(e)) && e.quality !== 'ARTEFACT_SUSPECT' ? { ...e, quality: 'ARTEFACT_SUSPECT', flags: [...e.flags, `SPIKE_BRACKET=${JSON.stringify(flagged.get(eventKey(e)))}`].sort() } : e);
      return { events, isAccepted: E.isAcceptedBaseline, changed: [...flagged.keys()] };
    } },
  { id: 'PHYS_MEAN', title: 'Physics envelope on event mean (power/launch/tyre limits, nameplate constants)', level: 'acceptance (vehicle-class aware)', apply: (d) => {
      const vc = vehicleClassOf(d);
      const viol = new Map(d.events.filter((e) => physViolation(e, vc).violated).map((e) => [eventKey(e), physViolation(e, vc)]));
      return { events: d.events, isAccepted: (e) => E.isAcceptedBaseline(e) && !viol.has(eventKey(e)), changed: [...viol.keys()], extra: { violations: Object.fromEntries([...viol].map(([k, v]) => [k, v.reasons])) } };
    } },
  { id: 'PHYS_PEAK2', title: 'Physics envelope on event mean OR 2-s peak', level: 'acceptance (vehicle-class aware)', apply: (d) => {
      const vc = vehicleClassOf(d);
      const viol = new Map(d.events.filter((e) => physViolation(e, vc, { usePeak2: true }).violated).map((e) => [eventKey(e), physViolation(e, vc, { usePeak2: true })]));
      return { events: d.events, isAccepted: (e) => E.isAcceptedBaseline(e) && !viol.has(eventKey(e)), changed: [...viol.keys()], extra: { violations: Object.fromEntries([...viol].map(([k, v]) => [k, v.reasons])) } };
    } },
  { id: 'KA2', title: 'Accept only OK/LIMITED (no DEGRADED) — PR #2139 K-A2', level: 'acceptance', apply: (d) => ({ events: d.events, isAccepted: (e) => e.quality === 'OK' || e.quality === 'LIMITED' }) },
  { id: 'COMBO', title: 'KB + BRACKET (ARTEFACT_SUSPECT) + PHYS_MEAN (acceptance)', level: 'combined small fix', apply: (d) => {
      const vc = vehicleClassOf(d);
      const kb = E.candidatePreBaselineReversion(d.c4, d.events, { usableQualities: GUARDS.usableQualities, maxGapS: GUARDS.maxGapS, windowS: core.MOTION_EVENT_SPIKE_REVERSION_WINDOW_S, minDeltaKmh: THR.minDeltaKmh, eventKey });
      const br = spikeBracketFlags(d.c4, d.events);
      const events = d.events.map((e) => (kb.has(eventKey(e)) || br.has(eventKey(e))) && e.quality !== 'ARTEFACT_SUSPECT' ? { ...e, quality: 'ARTEFACT_SUSPECT', flags: [...e.flags, kb.has(eventKey(e)) ? 'PRE_BASELINE_REVERSION' : 'SPIKE_BRACKET'].sort() } : e);
      const viol = new Set(events.filter((e) => physViolation(e, vc).violated).map(eventKey));
      return { events, isAccepted: (e) => E.isAcceptedBaseline(e) && !viol.has(eventKey(e)), changed: [...new Set([...kb.keys(), ...br.keys(), ...viol])] };
    } },
  { id: 'LEG', title: 'HYPOTHESIS: detector on quality-gated 1-s leg chords (2-s accel kernel)', level: 'speed input (hypothesis)', apply: (d) => {
      const series = legSpeedSeries(d);
      const events = detectGeneric(series, { usableQualities: ['OK'], source: 'LEG' });
      return { events, isAccepted: E.isAcceptedBaseline, extra: { legUsable: series.filter((s) => s.valueKmh != null).length } };
    } },
  { id: 'REG3', title: 'HYPOTHESIS: 3-point least-squares slope acceleration on C4 (same thresholds)', level: 'detector estimator (hypothesis)', apply: (d) => ({ events: detectGeneric(d.c4, { hooks: { accelAt: reg3Hook }, source: 'REG3' }), isAccepted: E.isAcceptedBaseline }) },
  { id: 'NOGUARD_STANDSTILL', title: 'HYPOTHESIS: waive post-gap guard when segment starts from standstill (<5 km/h)', level: 'detector guard (hypothesis)', apply: (d) => ({ events: detectGeneric(d.c4, { hooks: { entryAllowed: (seg, i, segStart) => sec(seg[i - 1].label) - segStart >= GUARDS.postGapGuardS || seg[0].valueKmh < 5 }, source: 'NOGUARD' }), isAccepted: E.isAcceptedBaseline }) },
];

// ---------------------------------------------------------------------------------------------
function summarize(res) {
  const s = res.summary; const acc = s.accepted;
  const hits = res.events.filter((r) => r.cls === 'TREFFER');
  return {
    detected: s.ds4Events, accepted: acc.events,
    cls_all: s.ds4ByClass, cls_accepted: acc.ds4ByClass,
    oracle_all: s.oracleByStatus, oracle_accepted: acc.oracleByStatus,
    hardFA_accepted: acc.ds4ByClass.FEHLALARM ?? 0, softFA_accepted: (acc.ds4ByClass.WEICHER_FEHLALARM ?? 0) + (acc.ds4ByClass.FEHLALARM_INTENSITAET ?? 0),
    treffer_accepted: acc.ds4ByClass.TREFFER ?? 0, fragments_accepted: acc.ds4ByClass.TREFFER_FRAGMENT ?? 0,
    missedHard_accepted: acc.oracleHardMissed, missedBorderline_accepted: acc.oracleBorderlineMissed,
    noSpeed: s.oracleByStatus.VERPASST_KEINE_DS4_GESCHWINDIGKEIT ?? 0,
    startOffsetMedian: acc.offsets.start.medianS, endOffsetMedian: acc.offsets.end.medianS, startWithin2: acc.offsets.start.withinTolShare,
    deltaDiff: s.deltaDiffKmh, implausible: s.implausible.length,
    unverifiable: s.ds4ByClass.UNVERIFIZIERBAR ?? 0,
    hitsN: hits.length,
  };
}
function intensityErrors(res) {
  const oracleByStart = new Map(res.oracle.map((o) => [o.start_utc + '|' + o.kind, o]));
  const rows = res.events.filter((r) => r.cls === 'TREFFER' && r.oracle_start_utc).map((r) => {
    const o = oracleByStart.get(r.oracle_start_utc + '|' + r.kind);
    return { meanErr: r.mean_mps2 - o.mean_mps2, peak2Err: (r.peak2s_mps2 ?? r.peak1s_mps2) - (o.peak2s_mps2 ?? o.peak1s_mps2), peak1Err: r.peak1s_mps2 - o.peak1s_mps2, quality: r.quality };
  });
  const mae = (xs) => xs.length ? r3(xs.reduce((a, x) => a + Math.abs(x), 0) / xs.length) : null;
  const bias = (xs) => xs.length ? r3(xs.reduce((a, x) => a + x, 0) / xs.length) : null;
  return { n: rows.length, meanMae: mae(rows.map((r) => r.meanErr)), meanBias: bias(rows.map((r) => r.meanErr)), peak2Mae: mae(rows.map((r) => r.peak2Err)), peak2Bias: bias(rows.map((r) => r.peak2Err)), peak1Mae: mae(rows.map((r) => r.peak1Err)), peak1Bias: bias(rows.map((r) => r.peak1Err)) };
}

function main() {
  const drives = loadDrives();
  // parity: generic == production
  for (const d of drives) {
    const g = detectGeneric(d.c4, { source: 'C4_ADAPTIVE_L3' });
    if (JSON.stringify(g.map(persisted)) !== JSON.stringify(d.events.map(persisted))) throw new Error(`generic parity broken on ${d.id}`);
  }
  console.log(`generic re-implementation parity: OK on ${drives.map((d) => d.id).join(', ')} (code ${codeSha})`);

  const report = { codeSha, generatedAtUtc: new Date().toISOString(), physics: PHYS, candidates: [] };
  const baseByDrive = {};
  for (const cand of CANDIDATES) {
    const out = { id: cand.id, title: cand.title, level: cand.level, drives: {}, changedEvents: {} };
    for (const d of drives) {
      const { events, isAccepted, changed, extra } = cand.apply(d);
      const res = evaluateDrive(d, { events, isAccepted, write: false });
      const sum = summarize(res);
      sum.intensity = intensityErrors(res);
      if (extra) sum.extra = extra;
      out.drives[d.id] = { role: d.identity.role, ...sum };
      if (changed && changed.length) {
        out.changedEvents[d.id] = changed.map((k) => {
          const row = res.events.find((r) => `${r.kind}|${r.start_utc}|${r.end_utc}` === k);
          return row ? `${k} ${row.start_kmh}->${row.end_kmh} q=${row.quality} cls=${row.cls} acc=${row.accepted} mean=${row.mean_mps2}` : k;
        });
      }
      if (cand.id === 'BASE') baseByDrive[d.id] = { res, events };
      else {
        // event set diff vs base (keys)
        const bk = new Set(baseByDrive[d.id].events.map(eventKey)); const ck = new Set(events.map(eventKey));
        out.drives[d.id].eventSetDiff = { onlyCandidate: [...ck].filter((k) => !bk.has(k)), onlyBase: [...bk].filter((k) => !ck.has(k)) };
        if (cand.id === 'LEG' || cand.id === 'REG3' || cand.id === 'NOGUARD_STANDSTILL' || cand.id === 'C51') {
          out.drives[d.id].candidateEventRows = res.events.map((r) => `${r.kind}|${r.start_utc}|${r.end_utc} ${r.start_kmh}->${r.end_kmh} q=${r.quality} cls=${r.cls} mean=${r.mean_mps2}`);
        }
      }
    }
    report.candidates.push(out);
  }
  fs.writeFileSync(path.join(OUT, 'candidates_ab.json'), JSON.stringify(report, null, 2));

  // compact table
  const cols = ['detected', 'accepted', 'treffer_accepted', 'fragments_accepted', 'hardFA_accepted', 'softFA_accepted', 'missedHard_accepted', 'missedBorderline_accepted', 'noSpeed', 'unverifiable', 'implausible', 'startOffsetMedian', 'endOffsetMedian'];
  const lines = [];
  lines.push('| candidate | drive | role | ' + cols.join(' | ') + ' | Δv MAE | mean-a MAE | peak2 MAE |');
  lines.push('|' + ' --- |'.repeat(cols.length + 6));
  for (const c of report.candidates) for (const [id, s] of Object.entries(c.drives)) {
    lines.push(`| ${c.id} | ${id} | ${s.role} | ` + cols.map((k) => s[k] ?? '').join(' | ') + ` | ${s.deltaDiff.maeKmh ?? ''} | ${s.intensity.meanMae ?? ''} | ${s.intensity.peak2Mae ?? ''} |`);
  }
  // pooled EVAL / DEV
  lines.push('\n### Pooled (EVAL = TIG22+TES16, DEV = TES21-1+TES21-2)\n');
  lines.push('| candidate | pool | accepted | TREFFER | hard FA | soft FA | hard missed | borderline missed | unverifiable | implausible |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const c of report.candidates) for (const [pool, ids] of [['EVAL', ['TIG22', 'TES16']], ['DEV', ['TES21-1', 'TES21-2']]]) {
    const s = (k) => ids.reduce((a, id) => a + (c.drives[id][k] ?? 0), 0);
    lines.push(`| ${c.id} | ${pool} | ${s('accepted')} | ${s('treffer_accepted')} | ${s('hardFA_accepted')} | ${s('softFA_accepted')} | ${s('missedHard_accepted')} | ${s('missedBorderline_accepted')} | ${s('unverifiable')} | ${s('implausible')} |`);
  }
  lines.push('\n### Changed events per candidate\n');
  for (const c of report.candidates) {
    if (!Object.keys(c.changedEvents).length) continue;
    lines.push(`**${c.id}** — ${c.title}`);
    for (const [id, arr] of Object.entries(c.changedEvents)) for (const a of arr) lines.push(`- ${id}: ${a}`);
    lines.push('');
  }
  fs.writeFileSync(path.join(OUT, 'CANDIDATES_AB.md'), lines.join('\n') + '\n');
  console.log(lines.join('\n'));
}
main();
