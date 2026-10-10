/**
 * R4A — machine-verifiable RFRF OQ-014 calibration event populations (offline only).
 * Canonical IDs align with EED-EV-0104 §1–2 and settled-post replay fixtures.
 */

export type RfrfCalibrationPopulation =
  | 'CANONICAL_PHYSICAL'
  | 'POSITIVE_LABELED'
  | 'SUSPECT_PHYSICAL'
  | 'DROP_CALIBRATION_ELIGIBLE'
  | 'SETTLING_TIMING_CALIBRATION_ELIGIBLE'
  | 'LOCALITY_CALIBRATION_ELIGIBLE'
  | 'COMMITTED_FULL_REPLAY_FIXTURE'
  | 'EXCLUDED_FROM_ELIGIBLE'
  | 'PARTIAL_RECOVERY_TARGET';

export interface RfrfCalibrationEventRecord {
  eventId: string;
  vehicleLabel: string;
  populations: RfrfCalibrationPopulation[];
  replayFixtureId: string | null;
  spineArtifactPath: string | null;
  notes?: string;
}

/** Fourteen canonical physical refuels (EED-EV-0104 §1). */
export const CANONICAL_PHYSICAL_EVENT_IDS: readonly string[] = [
  'KS_MS_661_2026_09_30',
  'KS_MS_661_2026_09_06',
  'KS_MS_661_2026_09_14_SUSPECT_57L',
  'WOB_7503_2026_09_19',
  'WOB_7503_2026_09_27_EVENT_B',
  'WOB_7503_2026_09_24',
  'WOB_7503_2026_09_15',
  'WOB_7503_2026_09_02',
  'WOB_7503_2026_09_03',
  'WOB_7503_2026_09_05',
  'WOB_7503_2026_09_07',
  'KS_MX_2024_2026_09_16',
  'KS_MX_2024_2026_09_04',
  'HMUE_C_215_2026_09_29',
  'WOB_7503_2026_10_09',
] as const;

export const SUSPECT_PHYSICAL_EVENT_IDS: readonly string[] = [
  'KS_MS_661_2026_09_14_SUSPECT_57L',
] as const;

/** Six natural calibration-eligible events (EED-EV-0104 §2 table — authoritative). */
export const NATURAL_CALIBRATION_ELIGIBLE_EVENT_IDS: readonly string[] = [
  'KS_MS_661_2026_09_30',
  'WOB_7503_2026_09_19',
  'WOB_7503_2026_09_27_EVENT_B',
  'KS_MX_2024_2026_09_16',
  'KS_MX_2024_2026_09_04',
  'WOB_7503_2026_09_15',
] as const;

export const POSITIVE_LABELED_PHYSICAL_EVENT_IDS: readonly string[] =
  CANONICAL_PHYSICAL_EVENT_IDS.filter(
    (id) => !SUSPECT_PHYSICAL_EVENT_IDS.includes(id as (typeof SUSPECT_PHYSICAL_EVENT_IDS)[number]),
  );

export const SETTLING_TIMING_INELIGIBLE_EVENT_IDS: readonly string[] = [
  'WOB_7503_2026_09_19',
] as const;

export const DROP_CALIBRATION_ELIGIBLE_EVENT_IDS: readonly string[] =
  NATURAL_CALIBRATION_ELIGIBLE_EVENT_IDS;

export const SETTLING_TIMING_CALIBRATION_ELIGIBLE_EVENT_IDS: readonly string[] =
  NATURAL_CALIBRATION_ELIGIBLE_EVENT_IDS.filter(
    (id) => !SETTLING_TIMING_INELIGIBLE_EVENT_IDS.includes(id as (typeof SETTLING_TIMING_INELIGIBLE_EVENT_IDS)[number]),
  );

export const LOCALITY_CALIBRATION_ELIGIBLE_EVENT_IDS: readonly string[] =
  SETTLING_TIMING_CALIBRATION_ELIGIBLE_EVENT_IDS;

export const COMMITTED_FULL_REPLAY_FIXTURE_IDS: readonly string[] = [
  'KS_MS_661_2026_09_30',
  'WOB_7503_2026_09_19',
  'WOB_7503_2026_09_27_EVENT_B',
  'KS_MX_2024_2026_09_16',
  'KS_MX_2024_2026_09_04',
  'WOB_7503_2026_09_15',
] as const;

export const RFRF_OQ014_R4A_EVENT_ACCOUNTING: readonly RfrfCalibrationEventRecord[] = [
  {
    eventId: 'KS_MS_661_2026_09_30',
    vehicleLabel: 'KS MS 661',
    populations: [
      'CANONICAL_PHYSICAL',
      'POSITIVE_LABELED',
      'DROP_CALIBRATION_ELIGIBLE',
      'SETTLING_TIMING_CALIBRATION_ELIGIBLE',
      'LOCALITY_CALIBRATION_ELIGIBLE',
      'COMMITTED_FULL_REPLAY_FIXTURE',
    ],
    replayFixtureId: 'KS_MS_661_2026_09_30',
    spineArtifactPath: null,
  },
  {
    eventId: 'KS_MS_661_2026_09_06',
    vehicleLabel: 'KS MS 661',
    populations: ['CANONICAL_PHYSICAL', 'POSITIVE_LABELED', 'EXCLUDED_FROM_ELIGIBLE', 'PARTIAL_RECOVERY_TARGET'],
    replayFixtureId: 'KS_MS_661_2026_09_06_OBSERVED',
    spineArtifactPath: null,
    notes: 'Sparse / terminal F3 — excluded from eligible N=6',
  },
  {
    eventId: 'KS_MS_661_2026_09_14_SUSPECT_57L',
    vehicleLabel: 'KS MS 661',
    populations: ['CANONICAL_PHYSICAL', 'SUSPECT_PHYSICAL', 'EXCLUDED_FROM_ELIGIBLE'],
    replayFixtureId: 'KS_MS_661_2026_09_14_SUSPECT_57L',
    spineArtifactPath: null,
  },
  {
    eventId: 'WOB_7503_2026_09_19',
    vehicleLabel: 'WOB L 7503',
    populations: [
      'CANONICAL_PHYSICAL',
      'POSITIVE_LABELED',
      'DROP_CALIBRATION_ELIGIBLE',
      'COMMITTED_FULL_REPLAY_FIXTURE',
    ],
    replayFixtureId: 'WOB_7503_2026_09_19',
    spineArtifactPath: null,
    notes: 'DELAYED_OBSERVATION — not settling-timing calibration grade',
  },
  {
    eventId: 'WOB_7503_2026_09_27_EVENT_B',
    vehicleLabel: 'WOB L 7503',
    populations: [
      'CANONICAL_PHYSICAL',
      'POSITIVE_LABELED',
      'DROP_CALIBRATION_ELIGIBLE',
      'SETTLING_TIMING_CALIBRATION_ELIGIBLE',
      'LOCALITY_CALIBRATION_ELIGIBLE',
      'COMMITTED_FULL_REPLAY_FIXTURE',
    ],
    replayFixtureId: 'WOB_7503_2026_09_27_EVENT_B',
    spineArtifactPath: null,
  },
  {
    eventId: 'WOB_7503_2026_09_24',
    vehicleLabel: 'WOB L 7503',
    populations: ['CANONICAL_PHYSICAL', 'POSITIVE_LABELED', 'PARTIAL_RECOVERY_TARGET', 'EXCLUDED_FROM_ELIGIBLE'],
    replayFixtureId: 'WOB_7503_2026_09_24',
    spineArtifactPath: null,
  },
  {
    eventId: 'WOB_7503_2026_09_15',
    vehicleLabel: 'WOB L 7503',
    populations: [
      'CANONICAL_PHYSICAL',
      'POSITIVE_LABELED',
      'DROP_CALIBRATION_ELIGIBLE',
      'SETTLING_TIMING_CALIBRATION_ELIGIBLE',
      'LOCALITY_CALIBRATION_ELIGIBLE',
      'COMMITTED_FULL_REPLAY_FIXTURE',
    ],
    replayFixtureId: 'WOB_7503_2026_09_15',
    spineArtifactPath:
      'architecture/knowledge-graphs/energy-event-detection/evidence/data/EED-EV-0104-WOB-L-7503-2026-09-15-ABSOLUTE-SPINE.json',
  },
  {
    eventId: 'WOB_7503_2026_10_09',
    vehicleLabel: 'WOB L 7503',
    populations: [
      'CANONICAL_PHYSICAL',
      'POSITIVE_LABELED',
      'EXCLUDED_FROM_ELIGIBLE',
      'PARTIAL_RECOVERY_TARGET',
    ],
    replayFixtureId: null,
    spineArtifactPath:
      'architecture/knowledge-graphs/energy-event-detection/evidence/data/EED-EV-0110-WOB-L-7503-2026-10-09-ABSOLUTE-SPINE.json',
    notes:
      'R4B bounded admission EED-EV-0110 — not R4A eligible N=6; 3040s observation gap; user pump quantity anchor only',
  },
  {
    eventId: 'WOB_7503_2026_09_02',
    vehicleLabel: 'WOB L 7503',
    populations: ['CANONICAL_PHYSICAL', 'POSITIVE_LABELED', 'PARTIAL_RECOVERY_TARGET', 'EXCLUDED_FROM_ELIGIBLE'],
    replayFixtureId: null,
    spineArtifactPath: null,
  },
  {
    eventId: 'WOB_7503_2026_09_03',
    vehicleLabel: 'WOB L 7503',
    populations: ['CANONICAL_PHYSICAL', 'POSITIVE_LABELED', 'PARTIAL_RECOVERY_TARGET', 'EXCLUDED_FROM_ELIGIBLE'],
    replayFixtureId: null,
    spineArtifactPath: null,
  },
  {
    eventId: 'WOB_7503_2026_09_05',
    vehicleLabel: 'WOB L 7503',
    populations: ['CANONICAL_PHYSICAL', 'POSITIVE_LABELED', 'PARTIAL_RECOVERY_TARGET', 'EXCLUDED_FROM_ELIGIBLE'],
    replayFixtureId: null,
    spineArtifactPath: null,
  },
  {
    eventId: 'WOB_7503_2026_09_07',
    vehicleLabel: 'WOB L 7503',
    populations: ['CANONICAL_PHYSICAL', 'POSITIVE_LABELED', 'PARTIAL_RECOVERY_TARGET', 'EXCLUDED_FROM_ELIGIBLE'],
    replayFixtureId: null,
    spineArtifactPath: null,
  },
  {
    eventId: 'KS_MX_2024_2026_09_16',
    vehicleLabel: 'KS MX 2024',
    populations: [
      'CANONICAL_PHYSICAL',
      'POSITIVE_LABELED',
      'DROP_CALIBRATION_ELIGIBLE',
      'SETTLING_TIMING_CALIBRATION_ELIGIBLE',
      'LOCALITY_CALIBRATION_ELIGIBLE',
      'COMMITTED_FULL_REPLAY_FIXTURE',
    ],
    replayFixtureId: 'KS_MX_2024_2026_09_16',
    spineArtifactPath: null,
  },
  {
    eventId: 'KS_MX_2024_2026_09_04',
    vehicleLabel: 'KS MX 2024',
    populations: [
      'CANONICAL_PHYSICAL',
      'POSITIVE_LABELED',
      'DROP_CALIBRATION_ELIGIBLE',
      'SETTLING_TIMING_CALIBRATION_ELIGIBLE',
      'LOCALITY_CALIBRATION_ELIGIBLE',
      'COMMITTED_FULL_REPLAY_FIXTURE',
    ],
    replayFixtureId: 'KS_MX_2024_2026_09_04',
    spineArtifactPath:
      'architecture/knowledge-graphs/energy-event-detection/evidence/data/EED-EV-0104-KS-MX-2024-2026-09-04-ABSOLUTE-SPINE.json',
  },
  {
    eventId: 'HMUE_C_215_2026_09_29',
    vehicleLabel: 'HMÜ C 215',
    populations: ['CANONICAL_PHYSICAL', 'POSITIVE_LABELED', 'PARTIAL_RECOVERY_TARGET', 'EXCLUDED_FROM_ELIGIBLE'],
    replayFixtureId: null,
    spineArtifactPath: null,
  },
];

export function eventsInPopulation(population: RfrfCalibrationPopulation): string[] {
  return RFRF_OQ014_R4A_EVENT_ACCOUNTING.filter((r) => r.populations.includes(population)).map(
    (r) => r.eventId,
  );
}

export function countByVehicle(eventIds: readonly string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const id of eventIds) {
    const row = RFRF_OQ014_R4A_EVENT_ACCOUNTING.find((r) => r.eventId === id);
    const vehicle = row?.vehicleLabel ?? 'UNKNOWN';
    counts[vehicle] = (counts[vehicle] ?? 0) + 1;
  }
  return counts;
}

export function maxEventsFromSingleVehicle(eventIds: readonly string[]): {
  vehicleLabel: string;
  count: number;
  fraction: number;
} {
  const counts = countByVehicle(eventIds);
  let bestVehicle = '';
  let bestCount = 0;
  for (const [vehicle, count] of Object.entries(counts)) {
    if (count > bestCount) {
      bestCount = count;
      bestVehicle = vehicle;
    }
  }
  return {
    vehicleLabel: bestVehicle,
    count: bestCount,
    fraction: eventIds.length === 0 ? 0 : bestCount / eventIds.length,
  };
}
