/**
 * P1.1 — Strict canonical field mapping helpers.
 *
 * Preserves absent vs present vs explicit sentinel (NONE / null / []) semantics.
 * Does not coerce omitted or unrecognized values into benign defaults.
 */
import type { ConnectivityAttentionState, ConnectivityRecommendedAction } from '../../../lib/api';
import {
  isFleetHealthConditionState,
  isHealthEvaluabilityState,
} from '../fleet-health-evaluation/types';
import { isOperationalAvailabilityState } from '../operational-availability/types';
import { absentField, presentField } from './provenance';
import type { CanonicalField, OperationalFieldSource } from './types';

type PresentSource = Exclude<OperationalFieldSource, 'absent'>;

const CONNECTIVITY_RECOMMENDED_ACTIONS: readonly ConnectivityRecommendedAction[] = [
  'NONE',
  'CHECK_DEVICE',
  'REAUTHORIZE_PROVIDER',
  'CONNECT_DATA_SOURCE',
  'REVIEW_CONNECTIVITY',
  'WAIT_FOR_TELEMETRY',
  'CHECK_INTEGRATION',
];

const CONNECTIVITY_ATTENTION_STATES: readonly ConnectivityAttentionState[] = [
  'NONE',
  'WATCH',
  'ACTION_REQUIRED',
  'CRITICAL',
];

export function isConnectivityRecommendedAction(
  value: unknown,
): value is ConnectivityRecommendedAction {
  return CONNECTIVITY_RECOMMENDED_ACTIONS.includes(value as ConnectivityRecommendedAction);
}

export function isConnectivityAttentionState(value: unknown): value is ConnectivityAttentionState {
  return CONNECTIVITY_ATTENTION_STATES.includes(value as ConnectivityAttentionState);
}

export type PipelineAvailability = 'ready' | 'partial' | 'unavailable' | null;

export function isPipelineAvailability(value: unknown): value is PipelineAvailability {
  return (
    value === 'ready' ||
    value === 'partial' ||
    value === 'unavailable' ||
    value === null
  );
}

/** Optional field omitted from an otherwise-present slice. */
export function mapSliceField<T>(
  value: T | undefined,
  source: PresentSource,
): CanonicalField<T> {
  if (value === undefined) return absentField();
  return presentField(value, source);
}

/** Nullable field: `undefined` => absent; explicit `null` => present null. */
export function mapNullableSliceField<T>(
  value: T | null | undefined,
  source: PresentSource,
): CanonicalField<T | null> {
  if (value === undefined) return absentField();
  return presentField(value, source);
}

/** Array field: non-array => absent; explicit `[]` => present empty array. */
export function mapSliceArrayField<T>(
  value: unknown,
  source: PresentSource,
): CanonicalField<readonly T[]> {
  if (!Array.isArray(value)) return absentField();
  return presentField([...value] as T[], source);
}

/** Enum field: unrecognized => absent (never coerced to NONE/UNKNOWN/available). */
export function mapSliceEnumField<T extends string>(
  value: unknown,
  guard: (v: unknown) => v is T,
  source: PresentSource,
): CanonicalField<T> {
  if (!guard(value)) return absentField();
  return presentField(value, source);
}

export function mapOperationalAvailabilityStateField(
  value: unknown,
  source: PresentSource,
): CanonicalField<import('../operational-availability/types').OperationalAvailabilityState> {
  return mapSliceEnumField(value, isOperationalAvailabilityState, source);
}

export function mapHealthEvaluabilityField(
  value: unknown,
  source: PresentSource,
): CanonicalField<import('../fleet-health-evaluation/types').HealthEvaluabilityState> {
  return mapSliceEnumField(value, isHealthEvaluabilityState, source);
}

export function mapHealthConditionField(
  value: unknown,
  source: PresentSource,
): CanonicalField<import('../fleet-health-evaluation/types').FleetHealthConditionState> {
  return mapSliceEnumField(value, isFleetHealthConditionState, source);
}

export function mapPipelineAvailabilityField(
  value: unknown,
  source: PresentSource,
): CanonicalField<PipelineAvailability> {
  if (!isPipelineAvailability(value)) return absentField();
  return presentField(value, source);
}

export function mapConnectivityRecommendedActionField(
  value: unknown,
  source: PresentSource,
): CanonicalField<ConnectivityRecommendedAction> {
  return mapSliceEnumField(value, isConnectivityRecommendedAction, source);
}

export function mapConnectivityAttentionField(
  value: unknown,
  source: PresentSource,
): CanonicalField<ConnectivityAttentionState> {
  return mapSliceEnumField(value, isConnectivityAttentionState, source);
}
