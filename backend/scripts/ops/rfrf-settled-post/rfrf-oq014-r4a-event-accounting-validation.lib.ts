import {
  CANONICAL_PHYSICAL_EVENT_IDS,
  COMMITTED_FULL_REPLAY_FIXTURE_IDS,
  DROP_CALIBRATION_ELIGIBLE_EVENT_IDS,
  eventsInPopulation,
  LOCALITY_CALIBRATION_ELIGIBLE_EVENT_IDS,
  NATURAL_CALIBRATION_ELIGIBLE_EVENT_IDS,
  POSITIVE_LABELED_PHYSICAL_EVENT_IDS,
  RFRF_OQ014_R4A_EVENT_ACCOUNTING,
  SETTLING_TIMING_CALIBRATION_ELIGIBLE_EVENT_IDS,
  SUSPECT_PHYSICAL_EVENT_IDS,
  type RfrfCalibrationPopulation,
} from './rfrf-oq014-r4a-event-accounting';

export interface R4aDerivedPopulationCounts {
  canonicalPhysical: number;
  positiveLabeledPhysical: number;
  suspectPhysical: number;
  naturalCalibrationEligible: number;
  dropCalibrationEligible: number;
  settlingTimingCalibrationEligible: number;
  localityCalibrationEligible: number;
  committedFullReplayFixture: number;
  independentVehicleCount: number;
}

export function derivePopulationCountsFromRegistry(): R4aDerivedPopulationCounts {
  const naturalIds = eventsInPopulation('DROP_CALIBRATION_ELIGIBLE');
  const vehicles = new Set(
    naturalIds.map((id) => RFRF_OQ014_R4A_EVENT_ACCOUNTING.find((r) => r.eventId === id)?.vehicleLabel),
  );
  vehicles.delete(undefined);

  return {
    canonicalPhysical: eventsInPopulation('CANONICAL_PHYSICAL').length,
    positiveLabeledPhysical: eventsInPopulation('POSITIVE_LABELED').length,
    suspectPhysical: eventsInPopulation('SUSPECT_PHYSICAL').length,
    naturalCalibrationEligible: naturalIds.length,
    dropCalibrationEligible: eventsInPopulation('DROP_CALIBRATION_ELIGIBLE').length,
    settlingTimingCalibrationEligible: eventsInPopulation('SETTLING_TIMING_CALIBRATION_ELIGIBLE').length,
    localityCalibrationEligible: eventsInPopulation('LOCALITY_CALIBRATION_ELIGIBLE').length,
    committedFullReplayFixture: eventsInPopulation('COMMITTED_FULL_REPLAY_FIXTURE').length,
    independentVehicleCount: vehicles.size,
  };
}

function sortedIds(ids: readonly string[]): string[] {
  return [...ids].sort((a, b) => a.localeCompare(b));
}

function assertPopulationMatchesConst(
  population: RfrfCalibrationPopulation,
  constIds: readonly string[],
  errors: string[],
): void {
  const fromRegistry = sortedIds(eventsInPopulation(population));
  const fromConst = sortedIds(constIds);
  if (JSON.stringify(fromRegistry) !== JSON.stringify(fromConst)) {
    errors.push(
      `population ${population}: registry [${fromRegistry.join(',')}] != const [${fromConst.join(',')}]`,
    );
  }
}

/** Fail-closed validation for machine JSON + registry integrity. */
export function validateR4aEventAccountingRegistry(): string[] {
  const errors: string[] = [];
  const rows = [...RFRF_OQ014_R4A_EVENT_ACCOUNTING];
  const ids = rows.map((r) => r.eventId);

  if (new Set(ids).size !== ids.length) {
    errors.push('duplicate eventId in RFRF_OQ014_R4A_EVENT_ACCOUNTING');
  }

  for (const canonicalId of CANONICAL_PHYSICAL_EVENT_IDS) {
    if (!ids.includes(canonicalId)) {
      errors.push(`missing canonical physical eventId ${canonicalId}`);
    }
  }

  if (rows.length !== CANONICAL_PHYSICAL_EVENT_IDS.length) {
    errors.push(
      `registry row count ${rows.length} != canonical physical count ${CANONICAL_PHYSICAL_EVENT_IDS.length}`,
    );
  }

  assertPopulationMatchesConst('DROP_CALIBRATION_ELIGIBLE', DROP_CALIBRATION_ELIGIBLE_EVENT_IDS, errors);
  assertPopulationMatchesConst(
    'SETTLING_TIMING_CALIBRATION_ELIGIBLE',
    SETTLING_TIMING_CALIBRATION_ELIGIBLE_EVENT_IDS,
    errors,
  );
  assertPopulationMatchesConst('LOCALITY_CALIBRATION_ELIGIBLE', LOCALITY_CALIBRATION_ELIGIBLE_EVENT_IDS, errors);
  assertPopulationMatchesConst('COMMITTED_FULL_REPLAY_FIXTURE', COMMITTED_FULL_REPLAY_FIXTURE_IDS, errors);
  assertPopulationMatchesConst('SUSPECT_PHYSICAL', SUSPECT_PHYSICAL_EVENT_IDS, errors);

  const positiveFromRegistry = sortedIds(eventsInPopulation('POSITIVE_LABELED'));
  const positiveFromConst = sortedIds(POSITIVE_LABELED_PHYSICAL_EVENT_IDS);
  if (JSON.stringify(positiveFromRegistry) !== JSON.stringify(positiveFromConst)) {
    errors.push('POSITIVE_LABELED membership mismatch vs derived suspect exclusion');
  }

  const naturalFromRegistry = sortedIds(eventsInPopulation('DROP_CALIBRATION_ELIGIBLE'));
  const naturalFromConst = sortedIds(NATURAL_CALIBRATION_ELIGIBLE_EVENT_IDS);
  if (JSON.stringify(naturalFromRegistry) !== JSON.stringify(naturalFromConst)) {
    errors.push('natural calibration eligible mismatch');
  }

  for (const row of rows) {
    if (row.populations.includes('SUSPECT_PHYSICAL') && row.populations.includes('DROP_CALIBRATION_ELIGIBLE')) {
      errors.push(`${row.eventId}: suspect cannot be drop-calibration eligible`);
    }
    if (row.populations.includes('DROP_CALIBRATION_ELIGIBLE') && !row.populations.includes('POSITIVE_LABELED')) {
      errors.push(`${row.eventId}: drop eligible must be positive-labeled`);
    }
    if (row.eventId.startsWith('KS_MS_661') && row.vehicleLabel !== 'KS MS 661') {
      errors.push(`${row.eventId}: invalid vehicle assignment`);
    }
    if (row.eventId.startsWith('WOB_7503') && row.vehicleLabel !== 'WOB L 7503') {
      errors.push(`${row.eventId}: invalid vehicle assignment`);
    }
    if (row.eventId.startsWith('KS_MX_2024') && row.vehicleLabel !== 'KS MX 2024') {
      errors.push(`${row.eventId}: invalid vehicle assignment`);
    }
  }

  return errors;
}
