/**
 * Resolves chassis-family DIMO samples into explicit domain observations (P31).
 */
import { findChassisSignalDefinition } from './chassis-signal-catalog';
import { mapDimoProviderSignalToCanonical } from './canonical-driving-signal-mapper';
import {
  CHASSIS_SIGNAL_DOMAIN_VERSION,
  type ChassisSignalCapabilityContext,
  type ChassisSignalObservation,
  type ChassisSignalObservationAvailable,
  type ChassisSignalObservationNull,
  type ChassisSignalObservationStale,
  type ChassisSignalObservationUnsupported,
} from './chassis-signal-observation.types';
import type {
  CanonicalSignalMappingContext,
  DimoProviderSignalSample,
} from './canonical-driving-signal-mapper.types';

function observationBase(def: NonNullable<ReturnType<typeof findChassisSignalDefinition>>) {
  return {
    family: def.family,
    canonicalKey: def.key,
    dimoSignalName: def.dimoSignalName,
    domainVersion: CHASSIS_SIGNAL_DOMAIN_VERSION as typeof CHASSIS_SIGNAL_DOMAIN_VERSION,
    detectorEligible: false as const,
    healthEvaluationEligible: false as const,
    tripDetectionEligible: false as const,
  };
}

function toUnsupported(
  def: NonNullable<ReturnType<typeof findChassisSignalDefinition>>,
  reason: ChassisSignalObservationUnsupported['reason'],
): ChassisSignalObservationUnsupported {
  return {
    ...observationBase(def),
    state: 'unsupported',
    reason,
  };
}

/**
 * Map a chassis-family provider sample to an explicit observation state.
 * Returns null when the DIMO signal is outside the chassis catalog.
 */
export function resolveChassisSignalObservation(
  sample: DimoProviderSignalSample,
  context: CanonicalSignalMappingContext & ChassisSignalCapabilityContext,
): ChassisSignalObservation | null {
  const def = findChassisSignalDefinition(sample.dimoSignalName);
  if (!def) {
    return null;
  }

  const mapping = mapDimoProviderSignalToCanonical(sample, context);

  if (mapping.status === 'SUPPORTED') {
    const available: ChassisSignalObservationAvailable = {
      ...observationBase(def),
      state: 'available',
      value: mapping.value,
      unit: mapping.unit,
      observedAt: mapping.observedAt,
      receivedAt: mapping.receivedAt,
      providerUnit: mapping.providerUnit,
      usageScope: mapping.usageScope,
      mappingVersion: mapping.mappingVersion,
    };
    return available;
  }

  if (mapping.status === 'NULL_SAMPLE') {
    const nullSample: ChassisSignalObservationNull = {
      ...observationBase(def),
      state: 'null_sample',
      reason: 'provider_null_not_observation',
      observedAt: mapping.observedAt ?? null,
    };
    return nullSample;
  }

  if (mapping.status === 'STALE') {
    const stale: ChassisSignalObservationStale = {
      ...observationBase(def),
      state: 'stale',
      reason: 'observation_stale',
      observedAt: mapping.observedAt!,
      receivedAt: mapping.receivedAt!,
      ageMs: mapping.ageMs!,
      staleAfterMs: mapping.staleAfterMs!,
    };
    return stale;
  }

  const reason: ChassisSignalObservationUnsupported['reason'] =
    mapping.reason === 'capability_not_supported' ||
    mapping.reason === 'powertrain_not_applicable' ||
    mapping.reason === 'unknown_dimo_signal' ||
    mapping.reason === 'provider_unit_unknown' ||
    mapping.reason === 'invalid_numeric_value'
      ? mapping.reason
      : 'invalid_numeric_value';

  return toUnsupported(def, reason);
}
