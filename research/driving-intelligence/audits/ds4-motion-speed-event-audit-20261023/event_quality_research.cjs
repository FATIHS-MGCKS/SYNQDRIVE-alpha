/** Experimental offline hypotheses, not customer classification or physical bounds. */
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

const ENVELOPE = { accelMaxMps2: 5.0, decelMinMps2: -9.0, speedMaxKmh: 250 };

const sliceFor = (c4, ev) => c4.filter((s) => s.label >= ev.startLabel && s.label <= ev.endLabel);

const chordSpeeds = (grid) => {
  const positioned = grid.filter((g) => g.latitude != null && g.longitude != null);
  const byLabel = new Map();
  for (let i = 1; i < positioned.length; i++) {
    const a = positioned[i - 1];
    const b = positioned[i];
    const dt = toSec(b.bucketLabelUtc) - toSec(a.bucketLabelUtc);
    byLabel.set(b.bucketLabelUtc, (haversineM(a, b) / dt) * 3.6);
  }
  return byLabel;
};

const gateG1Envelope = (ev) => {
  const dur = Math.max(1, toSec(ev.endLabel) - toSec(ev.startLabel));
  const signed = (ev.kind === 'DECELERATION' ? -1 : 1) * Math.abs(ev.deltaKmh);
  const mean = signed / 3.6 / dur;
  const reasons = [];
  if (ev.kind === 'ACCELERATION' && mean > ENVELOPE.accelMaxMps2) reasons.push(`mean ${mean.toFixed(2)} > ${ENVELOPE.accelMaxMps2} m/s²`);
  if (ev.kind === 'DECELERATION' && mean < ENVELOPE.decelMinMps2) reasons.push(`mean ${mean.toFixed(2)} < ${ENVELOPE.decelMinMps2} m/s²`);
  if (Math.max(ev.startSpeedKmh, ev.endSpeedKmh) > ENVELOPE.speedMaxKmh) reasons.push(`endpoint > ${ENVELOPE.speedMaxKmh} km/h`);
  return reasons;
};

const gateG2TimingSupport = (ev, c4) => {
  const slice = sliceFor(c4, ev);
  const reasons = [];
  if (slice.some((s) => s.quality === 'JITTER_SUSPECT')) reasons.push('JITTER_SUSPECT sample in window');
  const labels = slice.map((s) => toSec(s.label));
  const hasLabelGap = labels.some((t, i) => i > 0 && t - labels[i - 1] > 1);
  const first = slice[0];
  const last = slice[slice.length - 1];
  const sparse = (s) => s && (s.quality === 'SPARSE_SUPPORT' || (s.flags ?? []).includes('MIN_SUPPORT_3_POINTS'));
  if (hasLabelGap && sparse(first) && sparse(last)) reasons.push('label gap in window + both endpoints sparse-support');
  return reasons;
};

const gateG3Chord = (ev, chords) => {
  const reasons = [];
  for (const [role, label, kmh] of [
    ['start', ev.startLabel, ev.startSpeedKmh],
    ['end', ev.endLabel, ev.endSpeedKmh],
  ]) {
    const chord = chords.get(label);
    if (chord == null) continue;
    const dev = Math.abs(chord - kmh);
    if (dev > Math.max(20, 0.5 * Math.max(kmh, 1))) reasons.push(`${role}: C4 ${kmh.toFixed(1)} vs chord ${chord.toFixed(1)} km/h`);
  }
  return reasons;
};

const evaluateGates = (events, c4, grid) => {
  const chords = chordSpeeds(grid);
  return events.map((ev, i) => {
    const g1 = gateG1Envelope(ev);
    const g2 = gateG2TimingSupport(ev, c4);
    const g3 = gateG3Chord(ev, chords);
    return {
      index: i,
      kind: ev.kind,
      start: ev.startLabel,
      end: ev.endLabel,
      startSpeedKmh: ev.startSpeedKmh,
      endSpeedKmh: ev.endSpeedKmh,
      deltaKmh: ev.deltaKmh,
      quality: ev.quality,
      G1_envelope: g1,
      G2_timingSupport: g2,
      G3_chord: g3,
      K_E_combined_uncertain: g1.length > 0 || g2.length > 0,
      K_E3_uncertain: g1.length > 0 || g2.length > 0 || g3.length > 0,
    };
  });
};


module.exports = { evaluateGates, ENVELOPE };
