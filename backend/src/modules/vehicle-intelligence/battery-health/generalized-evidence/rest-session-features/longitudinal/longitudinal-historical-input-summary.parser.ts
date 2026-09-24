import {
  type ChargeContextCompletenessReason,
  type ChargeOpportunityTemperatureSource,
} from '../charge-opportunity.types';
import { D4_HISTORICAL_INPUT_CONTRACT_M3_3C_FEATURE_INPUT_V1 } from './longitudinal-integrity-inspection.constants';
import type { ParsedLongitudinalInputSnapshot } from './longitudinal-input.snapshot-parser';
import {
  parseLongitudinalInputSnapshotSummary,
} from './longitudinal-input.snapshot-parser';

export type D4HistoricalFeatureInputSummaryOutcome =
  | { status: 'OK'; parsed: ParsedLongitudinalInputSnapshot }
  | { status: 'UNSUPPORTED_SOURCE_INPUT_CONTRACT'; inputContractVersion: string }
  | { status: 'UNRESOLVED' };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function extractPersistedInputContractVersion(inputSummary: unknown): string | null {
  if (!isRecord(inputSummary)) return null;
  const version = inputSummary.inputContractVersion;
  if (typeof version !== 'string' || version.length === 0) return null;
  return version;
}

/**
 * D4 historical input-summary registry — not D1 `parseLongitudinalInputSnapshotSummary` for arbitrary history.
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
    return { status: 'UNRESOLVED' };
  }
  if (persistedVersion !== input.expectedInputContractVersion) {
    return { status: 'UNRESOLVED' };
  }

  if (persistedVersion === D4_HISTORICAL_INPUT_CONTRACT_M3_3C_FEATURE_INPUT_V1) {
    const parsed = parseLongitudinalInputSnapshotSummary({
      inputSummary: input.inputSummary,
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      restSessionId: input.restSessionId,
    });
    if (parsed.status === 'OK') {
      return { status: 'OK', parsed: parsed.parsed };
    }
    return { status: 'UNRESOLVED' };
  }

  return {
    status: 'UNSUPPORTED_SOURCE_INPUT_CONTRACT',
    inputContractVersion: persistedVersion,
  };
}
