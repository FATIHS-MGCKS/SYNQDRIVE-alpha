/**
 * Historical + adversarial replay fixtures for settled-post design (offline only).
 */
import type { RawFuelSignalSample } from '../raw-fuel-signal-sample.types';
import { WOB_2026_09_19_OBSERVED_ABSOLUTE_FUEL_SAMPLES } from '../../raw-fuel-refuel-fallback/testing/wob-2026-09-19-observed-fuel.fixture';
import { buildWob20260927EventBSamples } from '../../raw-fuel-refuel-fallback/testing/wob-2026-09-19-stretched-end.fixture';
import { buildKsMx20260916FreshPre5Samples } from '../../raw-fuel-refuel-fallback/testing/ks-mx-2026-09-16-baseline-recency.fixture';
import { KS_MS_661_OBSERVED_ABSOLUTE_FUEL_SAMPLES } from '@modules/dimo/fixtures/ks-ms-661-2026-09-06-refuel-observed.fixture';
import { KS_MX_2024_SEPT04_EVENT_A } from '@modules/dimo/fixtures/ks-mx-2024-sept04-refuel.fixture';

export type ReplayCaseKind =
  | 'NATURAL'
  | 'PRODUCTION_LABELED'
  | 'ADVERSARIAL'
  | 'EXCLUDED_SUSPECT';

export type ReplayEvidenceTier =
  | 'FULL_REPLAY'
  | 'PARTIAL_REPLAY'
  | 'INSUFFICIENT_SOURCE_EVIDENCE';

export interface ReplayCaseDefinition {
  id: string;
  kind: ReplayCaseKind;
  label: string;
  vehicle: string;
  eventTimestamp: string;
  replayEvidenceTier: ReplayEvidenceTier;
  window: { from: string; to: string };
  samples: RawFuelSignalSample[];
  groundTruthLiters?: number | null;
  relativeCorroboration: 'YES' | 'NO' | 'PARTIAL' | 'N/A';
  notes?: string;
}

function s(iso: string, abs: number, rel: number | null = null): RawFuelSignalSample {
  return { timestamp: new Date(iso), absoluteLiters: abs, relativePercent: rel };
}

/** Production DIMO 30s extract — KS MS 661 natural refuel 2026-09-30 (read-only VPS 2026-09-30). */
function buildKsMs661_20260930Series(): RawFuelSignalSample[] {
  const out: RawFuelSignalSample[] = [];
  for (let t = Date.parse('2026-09-30T04:35:00.000Z'); t <= Date.parse('2026-09-30T04:56:30.000Z'); t += 30_000) {
    out.push(s(new Date(t).toISOString(), 6));
  }
  out.push(
    s('2026-09-30T04:57:00.000Z', 10.5),
    s('2026-09-30T04:58:00.000Z', 13),
    s('2026-09-30T04:58:30.000Z', 15),
    s('2026-09-30T04:59:00.000Z', 16.5),
    s('2026-09-30T04:59:30.000Z', 18),
    s('2026-09-30T05:00:00.000Z', 19),
    s('2026-09-30T05:01:00.000Z', 19.5),
    s('2026-09-30T05:01:30.000Z', 20),
    s('2026-09-30T05:02:00.000Z', 20),
    s('2026-09-30T05:02:30.000Z', 20),
    s('2026-09-30T05:03:30.000Z', 19),
    s('2026-09-30T05:04:00.000Z', 19),
    s('2026-09-30T05:05:00.000Z', 19),
    s('2026-09-30T05:05:30.000Z', 19),
    s('2026-09-30T05:40:00.000Z', 19),
    s('2026-09-30T05:41:00.000Z', 19),
    s('2026-09-30T05:42:30.000Z', 18.142857142857142),
    s('2026-09-30T05:43:00.000Z', 18),
    s('2026-09-30T05:50:00.000Z', 18),
    s('2026-09-30T06:00:00.000Z', 18),
  );
  return out;
}

export const KS_MS_661_2026_09_30_NATURAL_SAMPLES = buildKsMs661_20260930Series();

/** Seven defensible natural-class calibration rows (calibration decision pack 2026-09-30). */
export const DEFENSIBLE_NATURAL_CALIBRATION_ROWS: ReplayCaseDefinition[] = [
  {
    id: 'KS_MS_661_2026_09_30',
    kind: 'NATURAL',
    label: 'KS MS 661 first natural post-Alpha refuel',
    vehicle: 'KS MS 661',
    eventTimestamp: '2026-09-30T04:57:00.000Z',
    replayEvidenceTier: 'FULL_REPLAY',
    window: { from: '2026-09-30T04:35:00.000Z', to: '2026-09-30T11:30:00.000Z' },
    samples: KS_MS_661_2026_09_30_NATURAL_SAMPLES,
    groundTruthLiters: 12,
    relativeCorroboration: 'NO',
  },
  {
    id: 'KS_MS_661_2026_09_06_OBSERVED',
    kind: 'NATURAL',
    label: 'KS MS 661 Esso 2026-09-06 audit anchors (sparse)',
    vehicle: 'KS MS 661',
    eventTimestamp: '2026-09-06T09:39:30.000Z',
    replayEvidenceTier: 'PARTIAL_REPLAY',
    window: { from: '2026-09-06T08:30:00.000Z', to: '2026-09-06T12:00:00.000Z' },
    samples: KS_MS_661_OBSERVED_ABSOLUTE_FUEL_SAMPLES.map((x) => ({
      timestamp: new Date(x.timestamp),
      absoluteLiters: x.absoluteLiters,
      relativePercent: x.relativePercent,
    })),
    groundTruthLiters: 24,
    relativeCorroboration: 'NO',
    notes: 'Sparse audit anchors; gap before rise; no post-settle plateau series',
  },
  {
    id: 'WOB_7503_2026_09_19',
    kind: 'PRODUCTION_LABELED',
    label: 'WOB L 7503 production extract fixture',
    vehicle: 'WOB L 7503',
    eventTimestamp: '2026-09-19T16:11:28.937Z',
    replayEvidenceTier: 'FULL_REPLAY',
    window: { from: '2026-09-19T15:30:00.000Z', to: '2026-09-19T17:10:00.000Z' },
    samples: WOB_2026_09_19_OBSERVED_ABSOLUTE_FUEL_SAMPLES,
    groundTruthLiters: null,
    relativeCorroboration: 'YES',
  },
  {
    id: 'WOB_7503_2026_09_27_EVENT_B',
    kind: 'PRODUCTION_LABELED',
    label: 'WOB L 7503 Event B 2026-09-27 (production-shaped fixture)',
    vehicle: 'WOB L 7503',
    eventTimestamp: '2026-09-27T21:34:16.923Z',
    replayEvidenceTier: 'FULL_REPLAY',
    window: { from: '2026-09-27T21:17:16.923Z', to: '2026-09-27T22:02:16.923Z' },
    samples: buildWob20260927EventBSamples(),
    groundTruthLiters: 9,
    relativeCorroboration: 'PARTIAL',
    notes: 'Absolute spine from fixture; hybrid trust UNKNOWN in Production (EED-EV-0102)',
  },
  {
    id: 'WOB_7503_2026_09_24',
    kind: 'PRODUCTION_LABELED',
    label: 'WOB L 7503 2026-09-24 natural row (no DIMO absolute extract in repo)',
    vehicle: 'WOB L 7503',
    eventTimestamp: '2026-09-24T00:00:00.000Z',
    replayEvidenceTier: 'INSUFFICIENT_SOURCE_EVIDENCE',
    window: { from: '2026-09-24T00:00:00.000Z', to: '2026-09-24T23:59:59.000Z' },
    samples: [],
    groundTruthLiters: null,
    relativeCorroboration: 'N/A',
    notes: 'Listed in calibration pack; no reconstructable sample series committed — do not fabricate',
  },
  {
    id: 'KS_MX_2024_2026_09_16',
    kind: 'PRODUCTION_LABELED',
    label: 'KS MX 2024 fresh-pre Esso fill 2026-09-16',
    vehicle: 'KS MX 2024',
    eventTimestamp: '2026-09-16T20:52:30.008Z',
    replayEvidenceTier: 'FULL_REPLAY',
    window: { from: '2026-09-16T20:46:00.008Z', to: '2026-09-16T21:00:00.008Z' },
    samples: buildKsMx20260916FreshPre5Samples(),
    groundTruthLiters: 22,
    relativeCorroboration: 'YES',
    notes: 'Fresh pre baseline fixture; native segment ground truth 5→27 L',
  },
  {
    id: 'KS_MX_2024_2026_09_04',
    kind: 'PRODUCTION_LABELED',
    label: 'KS MX 2024 2026-09-04 duplicate REFUEL forensic (segment metadata only)',
    vehicle: 'KS MX 2024',
    eventTimestamp: KS_MX_2024_SEPT04_EVENT_A.fuelLevelRiseStart,
    replayEvidenceTier: 'INSUFFICIENT_SOURCE_EVIDENCE',
    window: { from: '2026-09-04T03:30:00.000Z', to: '2026-09-04T04:10:00.000Z' },
    samples: [],
    groundTruthLiters: KS_MX_2024_SEPT04_EVENT_A.fuelDeltaLiters,
    relativeCorroboration: 'PARTIAL',
    notes: 'Route/fuel JSON lacks committed absolute rise spine for offline F3 replay',
  },
];

/** Excluded suspect control — not positive calibration. */
export const EXCLUDED_SUSPECT_CONTROLS: ReplayCaseDefinition[] = [
  {
    id: 'KS_MS_661_2026_09_14_SUSPECT_57L',
    kind: 'EXCLUDED_SUSPECT',
    label: 'KS MS 661 ~57 L telemetry suspect (calibration pack exclusion)',
    vehicle: 'KS MS 661',
    eventTimestamp: '2026-09-14T00:00:00.000Z',
    replayEvidenceTier: 'INSUFFICIENT_SOURCE_EVIDENCE',
    window: { from: '2026-09-14T00:00:00.000Z', to: '2026-09-14T23:59:59.000Z' },
    samples: [],
    groundTruthLiters: null,
    relativeCorroboration: 'NO',
    notes: 'Negative/suspect control only; no auditable absolute sample series in repo',
  },
];

export const HISTORICAL_REPLAY_CASES: ReplayCaseDefinition[] = [
  ...DEFENSIBLE_NATURAL_CALIBRATION_ROWS.filter((c) => c.samples.length > 0),
];

function buildA4GradualConsumptionSamples(): RawFuelSignalSample[] {
  const out: RawFuelSignalSample[] = [];
  for (let i = 0; i < 12; i += 1) {
    const hour = 10 + Math.floor(i / 2);
    const minute = (i % 2) * 30;
    out.push(
      s(
        `2026-01-03T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00.000Z`,
        40 - i * 0.5,
      ),
    );
  }
  return out;
}

/** Semantic adversarial matrix A1–A12 (approved design review). */
export const ADVERSARIAL_REPLAY_CASES: ReplayCaseDefinition[] = [
  {
    id: 'A1',
    kind: 'ADVERSARIAL',
    label: 'A1 single 6→20 spike→6',
    vehicle: 'SYNTHETIC',
    eventTimestamp: '2026-01-01T00:03:00.000Z',
    replayEvidenceTier: 'FULL_REPLAY',
    window: { from: '2026-01-01T00:00:00.000Z', to: '2026-01-01T02:00:00.000Z' },
    samples: [
      s('2026-01-01T00:00:00.000Z', 6),
      s('2026-01-01T00:01:00.000Z', 6),
      s('2026-01-01T00:02:00.000Z', 6),
      s('2026-01-01T00:03:00.000Z', 20),
      s('2026-01-01T00:04:00.000Z', 6),
      s('2026-01-01T00:05:00.000Z', 6),
    ],
    relativeCorroboration: 'N/A',
  },
  {
    id: 'A2',
    kind: 'ADVERSARIAL',
    label: 'A2 reset 6→0→20',
    vehicle: 'SYNTHETIC',
    eventTimestamp: '2026-01-05T00:03:00.000Z',
    replayEvidenceTier: 'FULL_REPLAY',
    window: { from: '2026-01-05T00:00:00.000Z', to: '2026-01-05T02:00:00.000Z' },
    samples: [
      s('2026-01-05T00:00:00.000Z', 6),
      s('2026-01-05T00:01:00.000Z', 6),
      s('2026-01-05T00:02:00.000Z', 0),
      s('2026-01-05T00:03:00.000Z', 20),
      s('2026-01-05T00:04:00.000Z', 20),
      s('2026-01-05T00:05:00.000Z', 20),
    ],
    relativeCorroboration: 'N/A',
  },
  {
    id: 'A3',
    kind: 'ADVERSARIAL',
    label: 'A3 6→20→12 unstable collapse',
    vehicle: 'SYNTHETIC',
    eventTimestamp: '2026-01-02T00:04:00.000Z',
    replayEvidenceTier: 'FULL_REPLAY',
    window: { from: '2026-01-02T00:00:00.000Z', to: '2026-01-02T02:00:00.000Z' },
    samples: [
      s('2026-01-02T00:00:00.000Z', 6),
      s('2026-01-02T00:01:00.000Z', 6),
      s('2026-01-02T00:02:00.000Z', 6),
      s('2026-01-02T00:03:00.000Z', 10),
      s('2026-01-02T00:04:00.000Z', 20),
      s('2026-01-02T00:05:00.000Z', 15),
      s('2026-01-02T00:06:00.000Z', 12),
      s('2026-01-02T00:07:00.000Z', 11),
      s('2026-01-02T00:08:00.000Z', 12),
    ],
    relativeCorroboration: 'N/A',
  },
  {
    id: 'A4',
    kind: 'ADVERSARIAL',
    label: 'A4 gradual normal consumption',
    vehicle: 'SYNTHETIC',
    eventTimestamp: '2026-01-03T10:00:00.000Z',
    replayEvidenceTier: 'FULL_REPLAY',
    window: { from: '2026-01-03T10:00:00.000Z', to: '2026-01-03T16:00:00.000Z' },
    samples: buildA4GradualConsumptionSamples(),
    relativeCorroboration: 'N/A',
  },
  {
    id: 'A5',
    kind: 'ADVERSARIAL',
    label: 'A5 stale baseline + later rise',
    vehicle: 'SYNTHETIC',
    eventTimestamp: '2026-01-06T02:00:00.000Z',
    replayEvidenceTier: 'FULL_REPLAY',
    window: { from: '2026-01-06T00:00:00.000Z', to: '2026-01-06T06:00:00.000Z' },
    samples: [
      s('2026-01-06T00:00:00.000Z', 6),
      s('2026-01-06T00:30:00.000Z', 6),
      s('2026-01-06T02:00:00.000Z', 18),
      s('2026-01-06T02:01:00.000Z', 19),
      s('2026-01-06T02:02:00.000Z', 19),
      s('2026-01-06T02:03:00.000Z', 19),
    ],
    relativeCorroboration: 'N/A',
  },
  {
    id: 'A6',
    kind: 'ADVERSARIAL',
    label: 'A6 oversized sample gap after rise',
    vehicle: 'SYNTHETIC',
    eventTimestamp: '2026-01-04T00:02:00.000Z',
    replayEvidenceTier: 'FULL_REPLAY',
    window: { from: '2026-01-04T00:00:00.000Z', to: '2026-01-04T06:00:00.000Z' },
    samples: [
      s('2026-01-04T00:00:00.000Z', 6),
      s('2026-01-04T00:01:00.000Z', 6),
      s('2026-01-04T00:02:00.000Z', 18),
      s('2026-01-04T00:03:00.000Z', 19),
      s('2026-01-04T02:00:00.000Z', 19),
      s('2026-01-04T02:01:00.000Z', 19),
    ],
    relativeCorroboration: 'N/A',
  },
  {
    id: 'A7',
    kind: 'ADVERSARIAL',
    label: 'A7 two separate refuels',
    vehicle: 'SYNTHETIC',
    eventTimestamp: '2026-01-07T00:02:00.000Z',
    replayEvidenceTier: 'FULL_REPLAY',
    window: { from: '2026-01-07T00:00:00.000Z', to: '2026-01-07T12:00:00.000Z' },
    samples: [
      s('2026-01-07T00:00:00.000Z', 10),
      s('2026-01-07T00:01:00.000Z', 10),
      s('2026-01-07T00:02:00.000Z', 25),
      s('2026-01-07T00:03:00.000Z', 25),
      s('2026-01-07T00:04:00.000Z', 25),
      s('2026-01-07T06:00:00.000Z', 12),
      s('2026-01-07T06:01:00.000Z', 12),
      s('2026-01-07T06:02:00.000Z', 28),
      s('2026-01-07T06:03:00.000Z', 28),
      s('2026-01-07T06:04:00.000Z', 28),
    ],
    relativeCorroboration: 'N/A',
  },
  {
    id: 'A8',
    kind: 'ADVERSARIAL',
    label: 'A8 peak overshoot then 18–19 settled (KS MS 661 shaped)',
    vehicle: 'KS MS 661 (shaped)',
    eventTimestamp: '2026-09-30T04:57:00.000Z',
    replayEvidenceTier: 'FULL_REPLAY',
    window: { from: '2026-09-30T04:35:00.000Z', to: '2026-09-30T11:30:00.000Z' },
    samples: KS_MS_661_2026_09_30_NATURAL_SAMPLES,
    groundTruthLiters: 12,
    relativeCorroboration: 'NO',
  },
  {
    id: 'A9',
    kind: 'ADVERSARIAL',
    label: 'A9 quantized 1 L steps stable plateau',
    vehicle: 'SYNTHETIC',
    eventTimestamp: '2026-01-08T00:02:00.000Z',
    replayEvidenceTier: 'FULL_REPLAY',
    window: { from: '2026-01-08T00:00:00.000Z', to: '2026-01-08T02:00:00.000Z' },
    samples: [
      s('2026-01-08T00:00:00.000Z', 8),
      s('2026-01-08T00:01:00.000Z', 8),
      s('2026-01-08T00:02:00.000Z', 14),
      s('2026-01-08T00:03:00.000Z', 15),
      s('2026-01-08T00:04:00.000Z', 16),
      s('2026-01-08T00:05:00.000Z', 16),
      s('2026-01-08T00:06:00.000Z', 16),
    ],
    relativeCorroboration: 'N/A',
  },
  {
    id: 'A10',
    kind: 'ADVERSARIAL',
    label: 'A10 driving/slosh around stable post state',
    vehicle: 'SYNTHETIC',
    eventTimestamp: '2026-01-10T00:03:00.000Z',
    replayEvidenceTier: 'FULL_REPLAY',
    window: { from: '2026-01-10T00:00:00.000Z', to: '2026-01-10T02:00:00.000Z' },
    samples: [
      s('2026-01-10T00:00:00.000Z', 12),
      s('2026-01-10T00:01:00.000Z', 12),
      s('2026-01-10T00:02:00.000Z', 12),
      s('2026-01-10T00:03:00.000Z', 24),
      s('2026-01-10T00:04:00.000Z', 26),
      s('2026-01-10T00:05:00.000Z', 25),
      s('2026-01-10T00:06:00.000Z', 24),
      s('2026-01-10T00:07:00.000Z', 26),
      s('2026-01-10T00:08:00.000Z', 25),
      s('2026-01-10T00:09:00.000Z', 25),
      s('2026-01-10T00:10:00.000Z', 25),
    ],
    relativeCorroboration: 'N/A',
  },
  {
    id: 'A11',
    kind: 'ADVERSARIAL',
    label: 'A11 post-refuel continued consumption',
    vehicle: 'SYNTHETIC',
    eventTimestamp: '2026-01-09T00:02:00.000Z',
    replayEvidenceTier: 'FULL_REPLAY',
    window: { from: '2026-01-09T00:00:00.000Z', to: '2026-01-09T06:00:00.000Z' },
    samples: [
      s('2026-01-09T00:00:00.000Z', 6),
      s('2026-01-09T00:01:00.000Z', 6),
      s('2026-01-09T00:02:00.000Z', 20),
      s('2026-01-09T00:03:00.000Z', 20),
      s('2026-01-09T00:04:00.000Z', 20),
      s('2026-01-09T01:00:00.000Z', 19),
      s('2026-01-09T02:00:00.000Z', 18),
      s('2026-01-09T03:00:00.000Z', 17),
      s('2026-01-09T04:00:00.000Z', 16),
    ],
    relativeCorroboration: 'N/A',
  },
  {
    id: 'A12',
    kind: 'ADVERSARIAL',
    label: 'A12 second material rise within continuation boundary',
    vehicle: 'SYNTHETIC',
    eventTimestamp: '2026-01-11T00:02:00.000Z',
    replayEvidenceTier: 'FULL_REPLAY',
    window: { from: '2026-01-11T00:00:00.000Z', to: '2026-01-11T06:00:00.000Z' },
    samples: [
      s('2026-01-11T00:00:00.000Z', 8),
      s('2026-01-11T00:01:00.000Z', 8),
      s('2026-01-11T00:02:00.000Z', 20),
      s('2026-01-11T00:03:00.000Z', 20),
      s('2026-01-11T00:04:00.000Z', 20),
      s('2026-01-11T00:05:00.000Z', 20),
      s('2026-01-11T00:06:00.000Z', 19),
      s('2026-01-11T00:07:00.000Z', 18),
      s('2026-01-11T00:08:00.000Z', 17),
      s('2026-01-11T00:09:00.000Z', 16),
      s('2026-01-11T00:10:00.000Z', 28),
      s('2026-01-11T00:11:00.000Z', 28),
      s('2026-01-11T00:12:00.000Z', 28),
    ],
    relativeCorroboration: 'N/A',
  },
];

export const ALL_REPLAY_CASES: ReplayCaseDefinition[] = [
  ...HISTORICAL_REPLAY_CASES,
  ...ADVERSARIAL_REPLAY_CASES,
];

export const CALIBRATION_PACK_MANIFEST = {
  defensibleNaturalRows: DEFENSIBLE_NATURAL_CALIBRATION_ROWS.length,
  excludedSuspectControls: EXCLUDED_SUSPECT_CONTROLS.length,
  adversarialSemanticCases: ADVERSARIAL_REPLAY_CASES.length,
} as const;
