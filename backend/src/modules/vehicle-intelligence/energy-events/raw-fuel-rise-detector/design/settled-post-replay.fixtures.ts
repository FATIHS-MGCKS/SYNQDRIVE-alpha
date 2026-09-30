/**
 * Historical + adversarial replay fixtures for settled-post design (offline only).
 */
import type { RawFuelSignalSample } from '../raw-fuel-signal-sample.types';
import { WOB_2026_09_19_OBSERVED_ABSOLUTE_FUEL_SAMPLES } from '../../raw-fuel-refuel-fallback/testing/wob-2026-09-19-observed-fuel.fixture';
import { KS_MS_661_OBSERVED_ABSOLUTE_FUEL_SAMPLES } from '@modules/dimo/fixtures/ks-ms-661-2026-09-06-refuel-observed.fixture';

export type ReplayCaseKind = 'NATURAL' | 'PRODUCTION_LABELED' | 'ADVERSARIAL' | 'EXCLUDED_SUSPECT';

export interface ReplayCaseDefinition {
  id: string;
  kind: ReplayCaseKind;
  label: string;
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

export const HISTORICAL_REPLAY_CASES: ReplayCaseDefinition[] = [
  {
    id: 'KS_MS_661_2026_09_30',
    kind: 'NATURAL',
    label: 'KS MS 661 first natural post-Alpha refuel',
    window: { from: '2026-09-30T04:35:00.000Z', to: '2026-09-30T11:30:00.000Z' },
    samples: KS_MS_661_2026_09_30_NATURAL_SAMPLES,
    groundTruthLiters: 12,
    relativeCorroboration: 'NO',
  },
  {
    id: 'KS_MS_661_2026_09_06_OBSERVED',
    kind: 'NATURAL',
    label: 'KS MS 661 Esso 2026-09-06 audit anchors (sparse)',
    window: { from: '2026-09-06T08:30:00.000Z', to: '2026-09-06T12:00:00.000Z' },
    samples: KS_MS_661_OBSERVED_ABSOLUTE_FUEL_SAMPLES.map((x) => ({
      timestamp: new Date(x.timestamp),
      absoluteLiters: x.absoluteLiters,
      relativePercent: x.relativePercent,
    })),
    groundTruthLiters: 24,
    relativeCorroboration: 'NO',
    notes: 'Sparse audit anchors; native DIMO refuel segments absent',
  },
  {
    id: 'WOB_7503_2026_09_19',
    kind: 'PRODUCTION_LABELED',
    label: 'WOB L 7503 production extract fixture',
    window: { from: '2026-09-19T15:30:00.000Z', to: '2026-09-19T17:10:00.000Z' },
    samples: WOB_2026_09_19_OBSERVED_ABSOLUTE_FUEL_SAMPLES,
    groundTruthLiters: null,
    relativeCorroboration: 'YES',
  },
];

export const ADVERSARIAL_REPLAY_CASES: ReplayCaseDefinition[] = [
  {
    id: 'A1_spike_return_baseline',
    kind: 'ADVERSARIAL',
    label: 'A1 single 6→20→6',
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
    id: 'A8_overshoot_valid_settle',
    kind: 'ADVERSARIAL',
    label: 'A8 peak overshoot then 18–19 settled (KS MS 661 shaped)',
    window: { from: '2026-09-30T04:35:00.000Z', to: '2026-09-30T11:30:00.000Z' },
    samples: KS_MS_661_2026_09_30_NATURAL_SAMPLES,
    groundTruthLiters: 12,
    relativeCorroboration: 'NO',
  },
  {
    id: 'A3_unstable_collapse',
    kind: 'ADVERSARIAL',
    label: 'A3 6→20→12 unstable',
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
    id: 'A4_gradual_consumption',
    kind: 'ADVERSARIAL',
    label: 'A4 gradual consumption without step refuel',
    window: { from: '2026-01-03T00:00:00.000Z', to: '2026-01-03T06:00:00.000Z' },
    samples: Array.from({ length: 12 }, (_, i) =>
      s(`2026-01-03T0${i}:00:00.000Z`, 40 - i * 0.5),
    ),
    relativeCorroboration: 'N/A',
  },
  {
    id: 'A6_oversized_gap',
    kind: 'ADVERSARIAL',
    label: 'A6 oversized sample gap after rise',
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
    id: 'A2_sensor_reset',
    kind: 'ADVERSARIAL',
    label: 'A2 reset 6→0→20',
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
    id: 'A5_stale_baseline',
    kind: 'ADVERSARIAL',
    label: 'A5 stale baseline + later rise',
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
    id: 'A7_two_fills',
    kind: 'ADVERSARIAL',
    label: 'A7 two separate refuels',
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
    id: 'A9_quantized_plateau',
    kind: 'ADVERSARIAL',
    label: 'A9 quantized 1 L steps stable',
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
    id: 'A11_post_consumption',
    kind: 'ADVERSARIAL',
    label: 'A11 post-refuel continued consumption',
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
];

export const ALL_REPLAY_CASES: ReplayCaseDefinition[] = [
  ...HISTORICAL_REPLAY_CASES,
  ...ADVERSARIAL_REPLAY_CASES,
];
