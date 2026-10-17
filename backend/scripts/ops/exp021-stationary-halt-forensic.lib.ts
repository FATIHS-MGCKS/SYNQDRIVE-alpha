import { haversineMeters } from '../../src/modules/vehicle-intelligence/driving-intelligence/core/geo/haversine';
import { bucketLabelToMs } from '../../src/modules/vehicle-intelligence/driving-intelligence/speed-qc/di-v0-speed-qc-geo';
import type { DiV0SpeedQcPositionSample } from '../../src/modules/vehicle-intelligence/driving-intelligence/speed-qc/di-v0-speed-qc.types';
import { enumerateInclusive } from './exp021-stationary-offline-prototype.lib';
import { EXP021_VIDEO_TACHO_ZERO_WINDOWS_UTC } from './exp021-ev-ground-truth-forensic-export.lib';

export type PositionPointSummary = {
  bucketLabelUtc: string;
  deltaSecondsFromAnchor: number;
  availability: string;
  positionState: string | null;
  distanceMFromPreviousPresent: number | null;
  coordRounded: { lat: number; lon: number } | null;
};

function roundCoord(n: number): number {
  return Math.round(n * 1e5) / 1e5;
}

export function summarizePresentChain(
  labels: string[],
  posByLabel: Map<string, DiV0SpeedQcPositionSample>,
): PositionPointSummary[] {
  const out: PositionPointSummary[] = [];
  let prevPresent: { label: string; lat: number; lon: number } | null = null;
  for (const label of labels) {
    const p = posByLabel.get(label);
    const coord =
      p?.availability === 'PRESENT' && p.latitude != null && p.longitude != null
        ? { lat: roundCoord(p.latitude), lon: roundCoord(p.longitude) }
        : null;
    let dist: number | null = null;
    if (coord && prevPresent) {
      dist = haversineMeters(prevPresent.lat, prevPresent.lon, coord.lat, coord.lon);
    }
    if (coord) prevPresent = { label, lat: coord.lat, lon: coord.lon };
    out.push({
      bucketLabelUtc: label,
      deltaSecondsFromAnchor: 0,
      availability: p?.availability ?? 'MISSING',
      positionState: p?.positionState ?? null,
      distanceMFromPreviousPresent: dist,
      coordRounded: coord,
    });
  }
  return out;
}

export function buildMainHaltForensics(
  haltId: string,
  fromUtc: string,
  toUtc: string,
  posByLabel: Map<string, DiV0SpeedQcPositionSample>,
  freshProviderByLabel: Map<string, { availability: string }> | null,
): Record<string, unknown> {
  const labels = enumerateInclusive(fromUtc, toUtc);
  const anchorMs = bucketLabelToMs(fromUtc);

  const beforeLabels: string[] = [];
  for (let i = 30; i >= 1; i -= 1) {
    beforeLabels.push(new Date(anchorMs - i * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z'));
  }
  const afterLabels: string[] = [];
  const endMs = bucketLabelToMs(toUtc);
  for (let i = 1; i <= 30; i += 1) {
    afterLabels.push(new Date(endMs + i * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z'));
  }

  const beforePresent = summarizePresentChain(
    beforeLabels.filter((l) => posByLabel.get(l)?.availability === 'PRESENT'),
    posByLabel,
  ).slice(-8);
  const afterPresent = summarizePresentChain(
    afterLabels.filter((l) => posByLabel.get(l)?.availability === 'PRESENT'),
    posByLabel,
  ).slice(0, 8);

  let rowAbsent = 0;
  let present = 0;
  let signalNull = 0;
  const within: Array<Record<string, unknown>> = [];
  const presentCoords: Array<{ label: string; lat: number; lon: number }> = [];

  for (const label of labels) {
    const p = posByLabel.get(label);
    const av = p?.availability ?? 'MISSING';
    if (av === 'ROW_ABSENT') rowAbsent += 1;
    else if (av === 'PRESENT') present += 1;
    else if (av === 'SIGNAL_NULL') signalNull += 1;
    if (p?.availability === 'PRESENT' && p.latitude != null && p.longitude != null) {
      presentCoords.push({ label, lat: p.latitude, lon: p.longitude });
    }
    within.push({
      bucketLabelUtc: label,
      pinnedAvailability: av,
      positionState: p?.positionState ?? null,
      freshProviderAvailability: freshProviderByLabel?.get(label)?.availability ?? null,
    });
  }

  let maxSpanM = 0;
  for (let i = 1; i < presentCoords.length; i += 1) {
    const d = haversineMeters(
      presentCoords[i - 1].lat,
      presentCoords[i - 1].lon,
      presentCoords[i].lat,
      presentCoords[i].lon,
    );
    maxSpanM = Math.max(maxSpanM, d);
  }

  const firstPresent = presentCoords[0];
  const lastPresent = presentCoords[presentCoords.length - 1];
  const endpointsDisplacementM =
    firstPresent && lastPresent && firstPresent.label !== lastPresent.label
      ? haversineMeters(firstPresent.lat, firstPresent.lon, lastPresent.lat, lastPresent.lon)
      : null;

  return {
    haltId,
    window: { fromUtc, toUtc },
    withinHaltCounts: { present, rowAbsent, signalNull, totalSeconds: labels.length },
    pinnedPresentDisplacement: {
      maxConsecutivePresentSpanM: maxSpanM,
      firstToLastPresentDisplacementM: endpointsDisplacementM,
      interpretation:
        'Equal coords across gap do not prove continuous standstill; unobserved motion inside ROW_ABSENT runs remains possible.',
    },
    lastPresentBeforeHalt: beforePresent,
    firstPresentAfterHalt: afterPresent,
    withinHaltSample: within.filter((_, idx) => idx % 5 === 0),
  };
}

export function buildAllMainHalts(
  posByLabel: Map<string, DiV0SpeedQcPositionSample>,
  freshProviderByLabel: Map<string, { availability: string }> | null,
): Record<string, unknown>[] {
  return EXP021_VIDEO_TACHO_ZERO_WINDOWS_UTC.map((w, i) =>
    buildMainHaltForensics(`LONG_HALT_${i + 1}`, w.from, w.to, posByLabel, freshProviderByLabel),
  );
}
