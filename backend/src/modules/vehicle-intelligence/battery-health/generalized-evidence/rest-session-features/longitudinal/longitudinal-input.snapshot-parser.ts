import {
  type ChargeContextCompletenessReason,
  type ChargeOpportunityTemperatureSource,
} from '../charge-opportunity.types';
import { REST_SESSION_FEATURE_INPUT_CONTRACT_VERSION } from '../rest-session-feature.constants';
import type { RestSessionFeatureInputAnchorResolutionStatus } from '../rest-session-feature-input-snapshot.types';

export type ParsedLongitudinalInputSnapshot = {
  inputContractVersion: string;
  anchorResolutionStatus: RestSessionFeatureInputAnchorResolutionStatus;
  chargeContextCompleteness: ChargeContextCompletenessReason[];
  temperatureC: number | null;
  temperatureSource: ChargeOpportunityTemperatureSource;
};

const ANCHOR_STATUSES: RestSessionFeatureInputAnchorResolutionStatus[] = [
  'SELECTED',
  'UNAVAILABLE',
  'AMBIGUOUS',
];

const TEMPERATURE_SOURCES: ChargeOpportunityTemperatureSource[] = [
  'TRIP_EXTERIOR',
  'UNKNOWN',
];

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseTemperatureC(value: unknown): number | null | 'INVALID' {
  if (value === null) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return 'INVALID';
}

function parseContextCompleteness(
  value: unknown,
): ChargeContextCompletenessReason[] | 'INVALID' {
  if (!Array.isArray(value)) return 'INVALID';
  const reasons: ChargeContextCompletenessReason[] = [];
  for (const entry of value) {
    if (typeof entry !== 'string' || !CONTEXT_COMPLETENESS_SET.has(entry)) {
      return 'INVALID';
    }
    reasons.push(entry as ChargeContextCompletenessReason);
  }
  return reasons;
}

function parseTemperatureSource(
  value: unknown,
): ChargeOpportunityTemperatureSource | 'INVALID' {
  if (typeof value !== 'string' || !TEMPERATURE_SOURCE_SET.has(value)) {
    return 'INVALID';
  }
  return value as ChargeOpportunityTemperatureSource;
}

export function parseLongitudinalInputSnapshotSummary(input: {
  inputSummary: unknown;
  organizationId: string;
  vehicleId: string;
  restSessionId: string;
}):
  | { status: 'OK'; parsed: ParsedLongitudinalInputSnapshot }
  | { status: 'UNRESOLVED' } {
  if (!isRecord(input.inputSummary)) {
    return { status: 'UNRESOLVED' };
  }
  const summary = input.inputSummary;

  if (
    summary.organizationId !== input.organizationId ||
    summary.vehicleId !== input.vehicleId ||
    summary.restSessionId !== input.restSessionId
  ) {
    return { status: 'UNRESOLVED' };
  }

  const inputContractVersion = summary.inputContractVersion;
  if (typeof inputContractVersion !== 'string' || inputContractVersion.length === 0) {
    return { status: 'UNRESOLVED' };
  }

  if (inputContractVersion !== REST_SESSION_FEATURE_INPUT_CONTRACT_VERSION) {
    return { status: 'UNRESOLVED' };
  }

  if (!isRecord(summary.anchorResolution)) {
    return { status: 'UNRESOLVED' };
  }
  const anchorStatus = summary.anchorResolution.status;
  if (
    typeof anchorStatus !== 'string' ||
    !ANCHOR_STATUSES.includes(anchorStatus as RestSessionFeatureInputAnchorResolutionStatus)
  ) {
    return { status: 'UNRESOLVED' };
  }

  if (!isRecord(summary.chargeOpportunityRaw)) {
    return { status: 'UNRESOLVED' };
  }
  const raw = summary.chargeOpportunityRaw;

  const completeness = parseContextCompleteness(raw.contextCompleteness);
  if (completeness === 'INVALID') {
    return { status: 'UNRESOLVED' };
  }

  const temperatureC = parseTemperatureC(raw.temperatureC);
  if (temperatureC === 'INVALID') {
    return { status: 'UNRESOLVED' };
  }

  const temperatureSource = parseTemperatureSource(raw.temperatureSource);
  if (temperatureSource === 'INVALID') {
    return { status: 'UNRESOLVED' };
  }

  return {
    status: 'OK',
    parsed: {
      inputContractVersion,
      anchorResolutionStatus: anchorStatus as RestSessionFeatureInputAnchorResolutionStatus,
      chargeContextCompleteness: completeness,
      temperatureC,
      temperatureSource,
    },
  };
}
