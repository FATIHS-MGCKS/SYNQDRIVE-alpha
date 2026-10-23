#!/usr/bin/env node
/**
 * DS4 Motion — screenshot case reconstruction (IMG_7778–IMG_7781) on pinned Tiguan data.
 *
 * Inputs (read-only, from the compact audit package):
 *   - evaluation/snapshots/di_v0_motion_core_shadow_payload.json  (persisted shadow payload)
 *   - evaluation/snapshots/position_grid_verified.json              (1-s POSITION grid, snapshot-verified)
 *
 * Outputs: analysis/screenshot_case_audit.json + analysis/screenshot_case_audit.md
 *
 * No network, no database, no production side effects.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const PKG = path.resolve(
  here,
  '../ds4-motion-tiguan-20261022-compact/DS4_Motion_Tiguan_CURSOR_COMPACT',
);
const read = (rel) => JSON.parse(fs.readFileSync(path.join(PKG, rel), 'utf8'));

const payload = read('evaluation/snapshots/di_v0_motion_core_shadow_payload.json');
const grid = read('evaluation/snapshots/position_grid_verified.json');
const provenance = read('evaluation/PROVENANCE_MANIFEST.json');

const PINNED = {
  vehicleId: provenance.trip_identity.vehicle.id,
  tripId: provenance.trip_identity.trip.id,
  motionRunId: provenance.trip_identity.di_artifacts.motion_core_shadow_run_id,
  pinnedSnapshotHash: provenance.trip_identity.di_artifacts.pinned_snapshot_hash,
  tripEndUtc: provenance.trip_identity.trip.end_time_utc,
  videoWindowUtc: provenance.trip_identity.video_reference_window_utc,
};

/** The four UI screenshot cases (UTC bucket labels). */
const CASES = [
  { img: 'IMG_7778', kind: 'DECELERATION', start: '2026-10-22T19:04:26Z', end: '2026-10-22T19:04:29Z', uiText: '35 → 6 km/h (+29)' },
  { img: 'IMG_7779', kind: 'DECELERATION', start: '2026-10-22T19:04:39Z', end: '2026-10-22T19:04:42Z', uiText: '98 → 69 km/h (+30)' },
  { img: 'IMG_7780', kind: 'ACCELERATION', start: '2026-10-22T19:04:49Z', end: '2026-10-22T19:04:52Z', uiText: '52 → 142 km/h (+90)' },
  { img: 'IMG_7781', kind: 'ACCELERATION', start: '2026-10-22T19:04:34Z', end: '2026-10-22T19:04:38Z', uiText: '6 → 100 km/h (+95)' },
];

const toSec = (label) => Date.parse(label) / 1000;
const haversineM = (a, b) => {
  const R = 6371008.8;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLon = ((b.longitude - a.longitude) * Math.PI) / 180;
  const la1 = (a.latitude * Math.PI) / 180;
  const la2 = (b.latitude * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

const speedByLabel = new Map(payload.speeds.map((s) => [s.bucketLabelUtc, s]));
const fsmByLabel = new Map(payload.fsmLabels.map((s) => [s.bucketLabelUtc, s]));
const gridByLabel = new Map(grid.map((g) => [g.bucketLabelUtc, g]));
const positioned = grid.filter((g) => g.latitude != null && g.longitude != null);

/** Chord legs between consecutive *positioned* buckets (label gap may exceed 1 s). */
const legs = [];
for (let i = 1; i < positioned.length; i++) {
  const a = positioned[i - 1];
  const b = positioned[i];
  const dtLabel = toSec(b.bucketLabelUtc) - toSec(a.bucketLabelUtc);
  const distM = haversineM(a, b);
  legs.push({
    from: a.bucketLabelUtc,
    to: b.bucketLabelUtc,
    labelGapS: dtLabel,
    chordM: Math.round(distM * 10) / 10,
    impliedKmh: Math.round((distM / dtLabel) * 3.6 * 10) / 10,
  });
}
const legByTo = new Map(legs.map((l) => [l.to, l]));

/** Mirrors the pre-fix TripMotionMapPopover formatting (unsigned deltaKmh with a forced '+'). */
const legacyDisplay = (ev) => {
  const delta = ev.deltaKmh > 0 ? `+${Math.round(ev.deltaKmh)}` : `${Math.round(ev.deltaKmh)}`;
  return `${Math.round(ev.startSpeedKmh)} → ${Math.round(ev.endSpeedKmh)} km/h (${delta})`;
};
/** Mirrors deriveMotionEventMetrics + formatSignedKmh in the prototype. */
const signedDelta = (ev) => {
  const diff = ev.endSpeedKmh - ev.startSpeedKmh;
  let sign = Math.sign(diff);
  if (sign === 0) sign = ev.kind === 'DECELERATION' ? -1 : 1;
  return sign * Math.abs(ev.deltaKmh);
};
const fmtSigned = (v) => {
  const r = Math.round(v);
  return r > 0 ? `+${r}` : r < 0 ? `−${Math.abs(r)}` : '0';
};
const newDisplay = (ev) =>
  `${Math.round(ev.startSpeedKmh)} → ${Math.round(ev.endSpeedKmh)} km/h (${fmtSigned(signedDelta(ev))})`;

const describeWindow = (startLabel, endLabel, padS = 3) => {
  const s0 = toSec(startLabel) - padS;
  const s1 = toSec(endLabel) + padS;
  const rows = [];
  for (let t = s0; t <= s1; t++) {
    const label = new Date(t * 1000).toISOString().replace('.000Z', 'Z');
    const sp = speedByLabel.get(label);
    const fsm = fsmByLabel.get(label);
    const g = gridByLabel.get(label);
    const leg = legByTo.get(label);
    rows.push({
      label,
      inEvent: t >= toSec(startLabel) && t <= toSec(endLabel),
      speedKmh: sp?.speedKmh ?? null,
      c4Quality: sp?.quality ?? null,
      c4Flags: sp?.flags ?? [],
      fsmState: fsm?.state ?? null,
      fsmEvidence: fsm?.evidenceQuality ?? null,
      positionAvailability: g?.availability ?? null,
      lat: g?.latitude ?? null,
      lon: g?.longitude ?? null,
      legFromPrevPositioned: leg ?? null,
    });
  }
  return rows;
};

const classifyCase = (ev, rows, c) => {
  const inEv = rows.filter((r) => r.inEvent);
  const absentInWindow = inEv.filter((r) => r.positionAvailability === 'ROW_ABSENT').length;
  const jitterInWindow = inEv.some((r) => r.c4Quality === 'JITTER_SUSPECT');
  const sparseEndpoints = [inEv[0], inEv[inEv.length - 1]].filter(
    (r) => r && (r.c4Flags.includes('MIN_SUPPORT_3_POINTS') || r.c4Quality === 'SPARSE_SUPPORT'),
  ).length;
  const sec = toSec(ev.endLabel) - toSec(ev.startLabel);
  const meanAccel = signedDelta(ev) / 3.6 / Math.max(sec, 1);
  const tripEndDistS = toSec(PINNED.tripEndUtc) - toSec(ev.endLabel);
  const legsIn = inEv.map((r) => r.legFromPrevPositioned).filter(Boolean);
  const maxLegGap = Math.max(...legsIn.map((l) => l.labelGapS), 1);
  const impliedKmh = legsIn.map((l) => l.impliedKmh);

  const issues = [];
  if (c.uiText.includes('(+') && ev.kind === 'DECELERATION') {
    issues.push('DISPLAY_SIGN_BUG: deltaKmh persisted as unsigned magnitude; popover forced "+" prefix (braking shown as gain)');
  }
  if (Math.abs(meanAccel) > 5) {
    issues.push(`KINEMATIC_IMPLAUSIBLE: mean ${meanAccel.toFixed(2)} m/s² exceeds passenger-car envelope (|a| > 5 m/s²)`);
  }
  if (jitterInWindow) {
    issues.push('TIMING_JITTER: C4 marked buckets JITTER_SUSPECT (label-gap vs. fix-cadence mismatch) — speeds in window are 1-s-label artefacts');
  }
  if (absentInWindow > 0) {
    issues.push(`POSITION_GAP: ${absentInWindow} ROW_ABSENT bucket(s) inside the event window (sub-1 Hz fix cadence)`);
  }
  if (sparseEndpoints > 0) {
    issues.push(`SPARSE_ENDPOINTS: ${sparseEndpoints}/2 endpoint bucket(s) with MIN_SUPPORT_3_POINTS / SPARSE_SUPPORT`);
  }
  if (tripEndDistS <= 30) {
    issues.push(`TRIP_END_EDGE: event ends ${tripEndDistS.toFixed(1)} s before trip end (${PINNED.tripEndUtc}); no forward support`);
  }
  if (maxLegGap > 1) {
    issues.push(`LEG_GAP: max positioned-leg label gap ${maxLegGap} s inside window`);
  }
  const videoCovered =
    ev.startLabel >= PINNED.videoWindowUtc.first && ev.endLabel <= PINNED.videoWindowUtc.last;

  let verdict;
  if (ev.kind === 'DECELERATION' && Math.abs(meanAccel) <= 5 && !jitterInWindow) {
    verdict = 'PLAUSIBLE_EVENT_DISPLAY_BUG';
  } else if (ev.kind === 'DECELERATION' && Math.abs(meanAccel) <= 5) {
    verdict = 'PLAUSIBLE_MAGNITUDE_UNCERTAIN_TIMING_DISPLAY_BUG';
  } else if (Math.abs(meanAccel) > 5) {
    verdict = 'MEASUREMENT_ARTEFACT_NOT_DRIVER_BEHAVIOUR';
  } else {
    verdict = 'UNCERTAIN';
  }
  return {
    verdict,
    videoCoverage: videoCovered ? 'VIDEO_COVERED' : 'NOT_VIDEO_COVERED',
    issues,
    metrics: {
      signedDeltaKmh: Math.round(signedDelta(ev) * 10) / 10,
      durationS: sec,
      meanAccelMps2: Math.round(meanAccel * 100) / 100,
      impliedChordKmhInWindow: impliedKmh,
      maxPositionedLegGapS: maxLegGap,
      rowAbsentInWindow: absentInWindow,
      secondsBeforeTripEnd: tripEndDistS,
    },
  };
};

const results = CASES.map((c) => {
  const idx = payload.events.findIndex((e) => e.startLabel === c.start && e.endLabel === c.end);
  const ev = payload.events[idx];
  if (!ev) throw new Error(`pinned event not found for ${c.img}`);
  const rows = describeWindow(c.start, c.end);
  const cls = classifyCase(ev, rows, c);
  const legacy = legacyDisplay(ev);
  return {
    screenshot: c.img,
    eventIndex: idx,
    frontendEventId: `motion-ev-${idx}-${ev.startLabel}`,
    event: ev,
    uiTextObserved: c.uiText,
    uiTextLegacyFormatter: legacy,
    uiTextReproduced: legacy === c.uiText,
    uiTextPrototype: newDisplay(ev),
    ...cls,
    windowRows: rows,
  };
});

/* ---- whole-trip display sanity: any other events with implausible magnitudes? ---- */
const allEventsAudit = payload.events.map((ev, i) => {
  const sec = toSec(ev.endLabel) - toSec(ev.startLabel);
  const meanAccel = signedDelta(ev) / 3.6 / Math.max(sec, 1);
  return {
    index: i,
    kind: ev.kind,
    start: ev.startLabel,
    end: ev.endLabel,
    startSpeedKmh: ev.startSpeedKmh,
    endSpeedKmh: ev.endSpeedKmh,
    deltaKmhPersisted: ev.deltaKmh,
    signedDeltaKmh: Math.round(signedDelta(ev) * 10) / 10,
    durationS: sec,
    meanAccelMps2: Math.round(meanAccel * 100) / 100,
    quality: ev.quality,
    artefactSuspectFlagInMapper: ev.quality === 'ARTEFACT_SUSPECT',
    kinematicallyImplausible: Math.abs(meanAccel) > 5 || ev.endSpeedKmh > 250 || ev.startSpeedKmh > 250,
    legacyDisplay: legacyDisplay(ev),
    prototypeDisplay: newDisplay(ev),
    videoCovered: ev.startLabel >= PINNED.videoWindowUtc.first && ev.endLabel <= PINNED.videoWindowUtc.last,
  };
});

/* ---- "0 Ereignisse" discrepancy ---- */
const zeroEventsFinding = {
  observed: 'TripMapSummaryOverlay shows "0 Ereignisse" while 21 motion markers are rendered',
  cause:
    'countTripEvents(trip) reads legacy VehicleTrip counters (totalAccelerationEvents/totalBrakingEvents/abuseEvents or harsh*Count) — the S4 Motion shadow payload (payload.events, n=21) is a separate read path (motion-map payload) and was never fed into the HUD.',
  motionEventCount: payload.events.length,
  motionEventAcceptedCount: payload.summary.eventAcceptedCount,
  prototypeFix:
    'TripsMapCard passes motionEventCount={motionMapPayload.events.length} when the motion map is active; TripMapSummaryOverlay renders trips.motionMap.summaryEvents instead of the legacy counter.',
};

/* ---- cadence statistics of the POSITION channel over the whole trip ---- */
const gapHist = {};
for (const l of legs) gapHist[l.labelGapS] = (gapHist[l.labelGapS] ?? 0) + 1;
const availability = {};
for (const g of grid) availability[g.availability] = (availability[g.availability] ?? 0) + 1;

const out = {
  schema: 'DS4_MOTION_SCREENSHOT_CASE_AUDIT_V1',
  generatedAtUtc: new Date().toISOString(),
  pinned: PINNED,
  algorithmVersions: payload.contract.algorithmVersions,
  timeSemantics: payload.contract.timeSemantics ?? null,
  positionChannel: { labelCount: grid.length, availability, positionedLegLabelGapHistogram: gapHist },
  cases: results,
  allEvents: allEventsAudit,
  zeroEventsFinding,
};
fs.mkdirSync(path.join(here, 'analysis'), { recursive: true });
fs.writeFileSync(path.join(here, 'analysis/screenshot_case_audit.json'), JSON.stringify(out, null, 2));

/* ---- Markdown ---- */
const md = [];
md.push('# Screenshot-Fälle 19:04 UTC — Rekonstruktion auf gepinnten Daten\n');
md.push(`Vehicle \`${PINNED.vehicleId}\` · Trip \`${PINNED.tripId}\` · Motion-Run \`${PINNED.motionRunId}\``);
md.push(`Snapshot \`${PINNED.pinnedSnapshotHash}\` · Trip-Ende ${PINNED.tripEndUtc} · Video ${PINNED.videoWindowUtc.first}–${PINNED.videoWindowUtc.last}\n`);
md.push('| Screenshot | Event (UTC) | UI-Text (beobachtet) | Legacy-Formatter reproduziert | Prototyp-Anzeige | Ø m/s² | Dauer | Video | Verdict |');
md.push('|---|---|---|---|---|---|---|---|---|');
for (const r of results) {
  md.push(
    `| ${r.screenshot} | ${r.event.kind} ${r.event.startLabel.slice(11, 19)}–${r.event.endLabel.slice(11, 19)} | \`${r.uiTextObserved}\` | ${r.uiTextReproduced ? 'ja' : 'nein'} | \`${r.uiTextPrototype}\` | ${r.metrics.meanAccelMps2} | ${r.metrics.durationS} s | ${r.videoCoverage} | ${r.verdict} |`,
  );
}
md.push('');
for (const r of results) {
  md.push(`## ${r.screenshot} — ${r.event.kind} ${r.event.startLabel}–${r.event.endLabel}\n`);
  md.push(`Frontend-Event-ID: \`${r.frontendEventId}\` · Qualität: \`${r.event.quality}\` · Flags: \`${r.event.flags.join(', ')}\`\n`);
  md.push('Befunde:');
  for (const i of r.issues) md.push(`- ${i}`);
  md.push('');
  md.push('| Label | im Event | C4 km/h | C4-Qualität | FSM | Position | Leg-Gap s | Chord m | implizit km/h |');
  md.push('|---|---|---|---|---|---|---|---|---|');
  for (const w of r.windowRows) {
    const leg = w.legFromPrevPositioned;
    md.push(
      `| ${w.label.slice(11, 19)} | ${w.inEvent ? '●' : ''} | ${w.speedKmh == null ? '—' : w.speedKmh.toFixed(1)} | ${w.c4Quality ?? '—'} | ${w.fsmState ?? '—'} | ${w.positionAvailability ?? '—'} | ${leg ? leg.labelGapS : '—'} | ${leg ? leg.chordM : '—'} | ${leg ? leg.impliedKmh : '—'} |`,
    );
  }
  md.push('');
}
md.push('## Alle 21 persistierten Events — Anzeige vorher/nachher\n');
md.push('| # | Art | UTC | Legacy-Anzeige | Prototyp-Anzeige | Ø m/s² | Qualität | implausibel | Video |');
md.push('|---|---|---|---|---|---|---|---|---|');
for (const e of allEventsAudit) {
  md.push(
    `| ${e.index} | ${e.kind.slice(0, 5)} | ${e.start.slice(11, 19)}–${e.end.slice(11, 19)} | \`${e.legacyDisplay}\` | \`${e.prototypeDisplay}\` | ${e.meanAccelMps2} | ${e.quality} | ${e.kinematicallyImplausible ? '**ja**' : ''} | ${e.videoCovered ? 'ja' : ''} |`,
  );
}
md.push('');
md.push('## „0 Ereignisse“\n');
md.push(`- Beobachtung: ${zeroEventsFinding.observed}`);
md.push(`- Ursache: ${zeroEventsFinding.cause}`);
md.push(`- Prototyp: ${zeroEventsFinding.prototypeFix}`);
md.push('');
md.push('## POSITION-Kanal Kadenz (ganze Fahrt)\n');
md.push(`- Availability: \`${JSON.stringify(availability)}\``);
md.push(`- Label-Gap-Histogramm positionierter Legs: \`${JSON.stringify(gapHist)}\``);
fs.writeFileSync(path.join(here, 'analysis/screenshot_case_audit.md'), md.join('\n') + '\n');

console.log(md.slice(0, 10).join('\n'));
console.log(`\nimplausible events: ${allEventsAudit.filter((e) => e.kinematicallyImplausible).map((e) => `#${e.index} ${e.start.slice(11, 19)} ${e.prototypeDisplay}`).join('; ')}`);
console.log(`position availability: ${JSON.stringify(availability)}; leg gap histogram: ${JSON.stringify(gapHist)}`);
