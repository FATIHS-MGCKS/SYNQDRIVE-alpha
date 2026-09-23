import { REST_SESSION_FEATURE_INPUT_CONTRACT_VERSION } from '../rest-session-feature.constants';
import type { RestSessionFeatureInputAnchorResolutionStatus } from '../rest-session-feature-input-snapshot.types';

export type ParsedLongitudinalInputSnapshot = {
  inputContractVersion: string;
  anchorResolutionStatus: RestSessionFeatureInputAnchorResolutionStatus;
  chargeContextCompleteness: string[];
  temperatureC: number | null;
  temperatureSource: string | null;
};

const ANCHOR_STATUSES: RestSessionFeatureInputAnchorResolutionStatus[] = [
  'SELECTED',
  'UNAVAILABLE',
  'AMBIGUOUS',
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  if (!value.every((entry) => typeof entry === 'string')) return null;
  return value;
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
  const completeness = readStringArray(raw.contextCompleteness);
  if (completeness === null) {
    return { status: 'UNRESOLVED' };
  }

  const temperatureC =
    typeof raw.temperatureC === 'number' && Number.isFinite(raw.temperatureC)
      ? raw.temperatureC
      : raw.temperatureC === null
        ? null
        : null;

  const temperatureSource =
    typeof raw.temperatureSource === 'string' ? raw.temperatureSource : null;

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
