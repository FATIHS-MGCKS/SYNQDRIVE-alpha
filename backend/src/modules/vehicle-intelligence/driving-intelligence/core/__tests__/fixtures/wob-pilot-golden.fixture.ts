/**
 * Minimal structural snippets derived from sealed EXP-021 C1C/C1D evidence
 * (C1-MOBILE-PILOT-R1-001, WOB L 7503). Not used at runtime.
 *
 * Provenance:
 * - Moving L3: C1D2 three-way table ~2026-09-26T09:57:21Z ADMISSIBLE_ALL_FRESH (~21.85 km/h)
 * - Hold: C1C position freshness manifest hold candidate coordinates (51.3353783, 9.506005)
 * - Release displacement class: C1D analysis ~303 m implied-speed misuse case
 */
import { presentObs } from '../test-helpers';

export const PILOT_HOLD_COORD = { lat: 51.3353783, lon: 9.506005 };

/** Three consecutive FRESH seconds suitable for L3 (pilot-scale coordinates). */
export function pilotFreshL3Triple(): ReturnType<typeof presentObs>[] {
  const t0 = presentObs('2026-09-26T09:57:19Z', 51.33545, 9.50605);
  const t1 = presentObs('2026-09-26T09:57:20Z', 51.3355, 9.5061);
  const t2 = presentObs('2026-09-26T09:57:21Z', 51.33555, 9.50615);
  const t3 = presentObs('2026-09-26T09:57:22Z', 51.3356, 9.5062);
  return [t0, t1, t2, t3];
}

/** Long hold at identical coordinates then release jump (~303 m north). */
export function pilotHoldThenRelease303m(): ReturnType<typeof presentObs>[] {
  const lat = 51.3353783;
  const lon = 9.506005;
  const rows = [];
  for (let s = 0; s < 5; s++) {
    const label = new Date(Date.parse('2026-09-26T10:00:00Z') + s * 1000)
      .toISOString()
      .replace(/\.\d{3}Z$/, 'Z');
    rows.push(presentObs(label, lat, lon));
  }
  const releaseLat = lat + 303 / 111_320;
  rows.push(presentObs('2026-09-26T10:00:05Z', releaseLat, lon));
  rows.push(presentObs('2026-09-26T10:00:06Z', releaseLat + 0.00001, lon));
  rows.push(presentObs('2026-09-26T10:00:07Z', releaseLat + 0.00002, lon));
  return rows;
}
