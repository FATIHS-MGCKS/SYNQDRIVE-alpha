import {
  type ChargeContextCompletenessReason,
  type ChargeOpportunityTemperatureSource,
} from '../charge-opportunity.types';
import { D4_HISTORICAL_INPUT_CONTRACT_M3_3C_FEATURE_INPUT_V1 } from './longitudinal-integrity-inspection.constants';
import type { ParsedLongitudinalInputSnapshot } from './longitudinal-input.snapshot-parser';

export type D4HistoricalFeatureInputSummaryOutcome =
  | { status: 'OK'; parsed: ParsedLongitudinalInputSnapshot }
  | { status: 'VERSION_UNRESOLVED_OR_MISMATCH' }
  | { status: 'IDENTITY_MISMATCH' }
  | { status: 'MALFORMED_SUPPORTED_INPUT_SUMMARY' }
  | { status: 'UNSUPPORTED_SOURCE_INPUT_CONTRACT'; inputContractVersion: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function extractPersistedInputContractVersion(inputSummary: unknown): string | null {
  if (!isRecord(inputSummary)) return null;
  const version = inputSummary.inputContractVersion;
  if (typeof version !== 'string' || version.length === 0) return null;
  return version;
}

const ANCHOR_STATUSES = ['SELECTED', 'UNAVAILABLE', 'AMBIGUOUS'] as const;
const TEMPERATURE_SOURCES = ['TRIP_EXTERIOR', 'UNKNOWN'] as const;

const CONTEXT_COMPLETENESS_REASONS: ChargeContextCompletenessReason[] = [
  'NO_RELIABLE_PRECEDING_TRIP',
  'TRIP_NOT_COMPLETED',
  'TRIP_LINK_NOT_FOUND',
  'TRIP_VEHICLE_MISMATCH',
  'TRIP_END_BEFORE_START',
  'TRIP_START_MISSING',
  'TRIP_END_MISSING',
  'TRIP_START_AFTER_ANCHOR',
  'TRIP_END_ANCHOR_MISMATCH',
  'CANDIDATE_TRIP_CONTEXT',
  'NO_PROVIDER_QUALIFIED_LV',
  'NO_PROVIDER_OBSERVED_STATE',
  'STATE_FETCH_TIME_ONLY',
  'MISSING_DISTANCE',
  'MISSING_TEMPERATURE',
  'PRIOR_SESSION_FEATURE_NOT_RESOLVED_IN_C2',
  'FOREIGN_TRIP_OBSERVATIONS_EXCLUDED',
  'PARTIAL_CONTEXT',
];

const CONTEXT_COMPLETENESS_SET = new Set<string>(CONTEXT_COMPLETENESS_REASONS);
const TEMPERATURE_SOURCE_SET = new Set<string>(TEMPERATURE_SOURCES);

function parseM3_3CFeatureInputV1Snapshot(input: {
  inputSummary: unknown;
  organizationId: string;
  vehicleId: string;
  restSessionId: string;
}):
  | { status: 'OK'; parsed: ParsedLongitudinalInputSnapshot }
  | { status: 'IDENTITY_MISMATCH' }
  | { status: 'MALFORMED_SUPPORTED_INPUT_SUMMARY' } {
  if (!isRecord(input.inputSummary)) {
    return { status: 'MALFORMED_SUPPORTED_INPUT_SUMMARY' };
  }
  const summary = input.inputSummary;

  if (
    summary.organizationId !== input.organizationId ||
    summary.vehicleId !== input.vehicleId ||
    summary.restSessionId !== input.restSessionId
  ) {
    return { status: 'IDENTITY_MISMATCH' };
  }

  if (summary.inputContractVersion !== D4_HISTORICAL_INPUT_CONTRACT_M3_3C_FEATURE_INPUT_V1) {
    return { status: 'MALFORMED_SUPPORTED_INPUT_SUMMARY' };
  }

  const anchorResolution = summary.anchorResolution;
  if (!isRecord(anchorResolution) || typeof anchorResolution.status !== 'string') {
    return { status: 'MALFORMED_SUPPORTED_INPUT_SUMMARY' };
  }
  if (!ANCHOR_STATUSES.includes(anchorResolution.status as (typeof ANCHOR_STATUSES)[number])) {
    return { status: 'MALFORMED_SUPPORTED_INPUT_SUMMARY' };
  }

  const chargeOpportunityRaw = summary.chargeOpportunityRaw;
  if (!isRecord(chargeOpportunityRaw)) {
    return { status: 'MALFORMED_SUPPORTED_INPUT_SUMMARY' };
  }

  const contextCompleteness = chargeOpportunityRaw.contextCompleteness;
  if (!Array.isArray(contextCompleteness)) {
    return { status: 'MALFORMED_SUPPORTED_INPUT_SUMMARY' };
  }
  const reasons: ChargeContextCompletenessReason[] = [];
  for (const entry of contextCompleteness) {
    if (typeof entry !== 'string' || !CONTEXT_COMPLETENESS_SET.has(entry)) {
      return { status: 'MALFORMED_SUPPORTED_INPUT_SUMMARY' };
    }
    reasons.push(entry as ChargeContextCompletenessReason);
  }

  const temperatureC = chargeOpportunityRaw.temperatureC;
  if (temperatureC !== null && (typeof temperatureC !== 'number' || !Number.isFinite(temperatureC))) {
    return { status: 'MALFORMED_SUPPORTED_INPUT_SUMMARY' };
  }

  const temperatureSource = chargeOpportunityRaw.temperatureSource;
  if (
    typeof temperatureSource !== 'string' ||
    !TEMPERATURE_SOURCE_SET.has(temperatureSource)
  ) {
    return { status: 'MALFORMED_SUPPORTED_INPUT_SUMMARY' };
  }

  return {
    status: 'OK',
    parsed: {
      inputContractVersion: D4_HISTORICAL_INPUT_CONTRACT_M3_3C_FEATURE_INPUT_V1,
      anchorResolutionStatus: anchorResolution.status as ParsedLongitudinalInputSnapshot['anchorResolutionStatus'],
      chargeContextCompleteness: reasons,
      temperatureC: temperatureC as number | null,
      temperatureSource: temperatureSource as ChargeOpportunityTemperatureSource,
    },
  };
}

/**
 * D4 historical input-summary registry — not D1 generic history.
 */
export function parseHistoricalFeatureInputSummaryForD4(input: {
  inputSummary: unknown;
  organizationId: string;
  vehicleId: string;
  restSessionId: string;
  expectedInputContractVersion: string;
}): D4HistoricalFeatureInputSummaryOutcome {
  const persistedVersion = extractPersistedInputContractVersion(input.inputSummary);
  if (persistedVersion === null) {
    return { status: 'VERSION_UNRESOLVED_OR_MISMATCH' };
  }
  if (persistedVersion !== input.expectedInputContractVersion) {
    return { status: 'VERSION_UNRESOLVED_OR_MISMATCH' };
  }

  if (persistedVersion === D4_HISTORICAL_INPUT_CONTRACT_M3_3C_FEATURE_INPUT_V1) {
    const parsed = parseM3_3CFeatureInputV1Snapshot({
      inputSummary: input.inputSummary,
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      restSessionId: input.restSessionId,
    });
    if (parsed.status === 'OK') {
      return { status: 'OK', parsed: parsed.parsed };
    }
    if (parsed.status === 'IDENTITY_MISMATCH') {
      return { status: 'IDENTITY_MISMATCH' };
    }
    return { status: 'MALFORMED_SUPPORTED_INPUT_SUMMARY' };
  }

  return {
    status: 'UNSUPPORTED_SOURCE_INPUT_CONTRACT',
    inputContractVersion: persistedVersion,
  };
}
