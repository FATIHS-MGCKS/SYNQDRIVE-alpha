import { TripDetectionState } from '@prisma/client';

import {
  assessLiveStartSnapshotFreshness,
  type LiveStartFreshnessState,
} from '../../modules/vehicle-intelligence/trips/trip-start-detection-policy';
import { TRIP_FSM_MAX_FUTURE_SKEW_MS } from '../../modules/vehicle-intelligence/trips/trip-fsm-clock-contract';
import type { SnapshotPollingTierConfig } from '../schedulers/snapshot-polling/snapshot-polling-tier.config';
import type {
  ProviderWakeTimestampClass,
  SnapshotJobOrigin,
  SnapshotWakeContext,
  SnapshotWakeForensics,
  SnapshotWakeReason,
  SnapshotWakeSignalName,
} from './snapshot-wake.types';

export function snapshotJobId(vehicleId: string): string {
  return `snapshot-${vehicleId}`;
}

export function pendingWakeRedisKey(vehicleId: string): string {
  return `synqdrive:snapshot-wake:pending:${vehicleId}`;
}

export function successorWakeRedisKey(vehicleId: string): string {
  return `synqdrive:snapshot-wake:successor:${vehicleId}`;
}

export function parseVehicleIdFromSuccessorRedisKey(key: string): string | null {
  const prefix = 'synqdrive:snapshot-wake:successor:';
  if (!key.startsWith(prefix)) {
    return null;
  }
  const vehicleId = key.slice(prefix.length);
  return vehicleId.length > 0 ? vehicleId : null;
}

export function snapshotWakeHandoffJobId(vehicleId: string): string {
  return `wake-handoff-${vehicleId}`;
}

/**
 * Physical Bull job origin vs logical wake semantics for probe/coverage decisions.
 * A SCHEDULED job that merged a generation-0 DIMO provider wake must still use
 * provider-wake probe rules without falsifying queue provenance.
 */
export function resolveEffectiveWakeOrigin(
  jobOrigin: SnapshotJobOrigin | undefined,
  wakeContext: SnapshotWakeContext | null | undefined,
): SnapshotJobOrigin | undefined {
  if (!wakeContext) {
    return jobOrigin;
  }
  if (wakeContext.probeGeneration === 1) {
    return 'WAKE_PROBE';
  }
  if (wakeContext.source === 'DIMO_TRIGGER' && wakeContext.probeGeneration === 0) {
    return 'PROVIDER_WAKE';
  }
  return jobOrigin;
}

export function parseProviderWakeTimestamp(
  value: unknown,
): { observedAt: Date | null; classification: ProviderWakeTimestampClass } {
  if (value == null || value === '') {
    return { observedAt: null, classification: 'MISSING' };
  }
  const parsed = value instanceof Date ? value : new Date(String(value));
  if (!Number.isFinite(parsed.getTime())) {
    return { observedAt: null, classification: 'INVALID' };
  }
  const workerNow = new Date();
  if (parsed.getTime() - workerNow.getTime() > TRIP_FSM_MAX_FUTURE_SKEW_MS) {
    return { observedAt: null, classification: 'FUTURE_INVALID' };
  }
  const freshness = assessLiveStartSnapshotFreshness({
    providerSourceTimestamp: parsed,
    workerNow,
  });
  const classification = mapFreshnessToWakeClass(freshness.state);
  return { observedAt: parsed, classification };
}

function mapFreshnessToWakeClass(
  state: LiveStartFreshnessState,
): ProviderWakeTimestampClass {
  switch (state) {
    case 'FRESH':
      return 'FRESH';
    case 'STALE':
      return 'STALE';
    case 'MISSING':
      return 'MISSING';
    default:
      return 'INVALID';
  }
}

export function classifyDimoStartWakeSignal(params: {
  signalName: string | null | undefined;
  value: unknown;
  movementSpeedKmh: number;
}): { eligible: boolean; reason?: SnapshotWakeReason; signalName?: SnapshotWakeSignalName } {
  if (params.signalName === 'speed') {
    const speed = parseNumericSignal(params.value);
    if (speed == null) {
      return { eligible: false };
    }
    if (speed > params.movementSpeedKmh) {
      return { eligible: true, reason: 'SPEED_MOVEMENT', signalName: 'speed' };
    }
    return { eligible: false };
  }

  if (params.signalName === 'isIgnitionOn') {
    const ignitionOn = parseBooleanSignal(params.value);
    if (ignitionOn === true) {
      return { eligible: true, reason: 'IGNITION_ON', signalName: 'isIgnitionOn' };
    }
    return { eligible: false };
  }

  return { eligible: false };
}

function parseNumericSignal(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function parseBooleanSignal(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (value >= 0.5) return true;
    if (value <= 0) return false;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1') return true;
    if (normalized === 'false' || normalized === '0') return false;
  }
  return null;
}

export function buildSnapshotWakeContext(params: {
  reason: SnapshotWakeReason;
  signalName: SnapshotWakeSignalName;
  providerObservedAt: Date | null;
  receivedAt: Date;
  probeGeneration?: 0 | 1;
}): SnapshotWakeContext {
  return {
    source: 'DIMO_TRIGGER',
    reason: params.reason,
    providerObservedAt: params.providerObservedAt?.toISOString() ?? null,
    receivedAt: params.receivedAt.toISOString(),
    signalName: params.signalName,
    probeGeneration: params.probeGeneration ?? 0,
  };
}

export function isRestingPrimaryWakeFsm(state: TripDetectionState | null | undefined): boolean {
  return state === TripDetectionState.RESTING;
}

export function wakeAlreadyCoveredBySnapshot(params: {
  wakeContext: SnapshotWakeContext;
  snapshotSourceTimestamp: Date | null;
}): boolean {
  if (!params.snapshotSourceTimestamp || !params.wakeContext.providerObservedAt) {
    return false;
  }
  const wakeAt = new Date(params.wakeContext.providerObservedAt);
  if (!Number.isFinite(wakeAt.getTime())) {
    return false;
  }
  return params.snapshotSourceTimestamp.getTime() >= wakeAt.getTime();
}

export function evaluateTrustedCompleteCooldownBypass(params: {
  lastRestingReason: string | undefined;
  restAnchorAt: Date | null;
  wakeContext: SnapshotWakeContext | null | undefined;
  snapshotSourceTimestamp: Date | null;
  workerNow: Date;
}): { bypass: boolean; cooldownBypassUsed: boolean } {
  if (!params.wakeContext || params.wakeContext.source !== 'DIMO_TRIGGER') {
    return { bypass: false, cooldownBypassUsed: false };
  }
  if (params.lastRestingReason !== 'complete') {
    return { bypass: false, cooldownBypassUsed: false };
  }
  if (
    params.wakeContext.reason !== 'SPEED_MOVEMENT' &&
    params.wakeContext.reason !== 'IGNITION_ON'
  ) {
    return { bypass: false, cooldownBypassUsed: false };
  }
  if (!params.restAnchorAt || !Number.isFinite(params.restAnchorAt.getTime())) {
    return { bypass: false, cooldownBypassUsed: false };
  }
  if (!params.wakeContext.providerObservedAt) {
    return { bypass: false, cooldownBypassUsed: false };
  }
  const providerObservedAt = new Date(params.wakeContext.providerObservedAt);
  if (!Number.isFinite(providerObservedAt.getTime())) {
    return { bypass: false, cooldownBypassUsed: false };
  }
  if (providerObservedAt.getTime() <= params.restAnchorAt.getTime()) {
    return { bypass: false, cooldownBypassUsed: false };
  }
  const wakeFreshness = assessLiveStartSnapshotFreshness({
    providerSourceTimestamp: providerObservedAt,
    workerNow: params.workerNow,
  });
  if (wakeFreshness.state !== 'FRESH') {
    return { bypass: false, cooldownBypassUsed: false };
  }
  if (!params.snapshotSourceTimestamp || !Number.isFinite(params.snapshotSourceTimestamp.getTime())) {
    return { bypass: false, cooldownBypassUsed: false };
  }
  const snapshotFreshness = assessLiveStartSnapshotFreshness({
    providerSourceTimestamp: params.snapshotSourceTimestamp,
    workerNow: params.workerNow,
  });
  if (snapshotFreshness.state !== 'FRESH') {
    return { bypass: false, cooldownBypassUsed: false };
  }
  if (params.snapshotSourceTimestamp.getTime() < providerObservedAt.getTime()) {
    return { bypass: false, cooldownBypassUsed: false };
  }
  return { bypass: true, cooldownBypassUsed: true };
}

export function shouldRequestWakeProbe(params: {
  origin?: SnapshotJobOrigin;
  effectiveWakeOrigin?: SnapshotJobOrigin;
  wakeContext: SnapshotWakeContext | null | undefined;
  snapshotSourceTimestamp: Date | null;
  staleMonotonicSkipped: boolean;
  tripStartEvalError: boolean;
  possibleStartCreated: boolean;
  providerFetchFailed?: boolean;
  fsmState: TripDetectionState | null | undefined;
}): boolean {
  if (params.wakeContext?.probeGeneration === 1) {
    return false;
  }
  if (!params.wakeContext) {
    return false;
  }

  const effectiveOrigin =
    params.effectiveWakeOrigin ??
    resolveEffectiveWakeOrigin(params.origin, params.wakeContext);

  if (effectiveOrigin !== 'PROVIDER_WAKE' && effectiveOrigin !== 'WAKE_PROBE') {
    return false;
  }

  if (params.providerFetchFailed) {
    return params.fsmState === TripDetectionState.RESTING;
  }

  if (
    params.fsmState != null &&
    params.fsmState !== TripDetectionState.RESTING &&
    effectiveOrigin === 'WAKE_PROBE'
  ) {
    return false;
  }
  if (
    !isRestingPrimaryWakeFsm(params.fsmState) &&
    effectiveOrigin === 'PROVIDER_WAKE'
  ) {
    return false;
  }
  if (params.staleMonotonicSkipped) {
    return true;
  }
  if (
    params.wakeContext.providerObservedAt &&
    params.snapshotSourceTimestamp &&
    params.snapshotSourceTimestamp.getTime() <
      new Date(params.wakeContext.providerObservedAt).getTime()
  ) {
    return true;
  }
  if (params.tripStartEvalError) {
    return true;
  }
  if (
    effectiveOrigin === 'PROVIDER_WAKE' &&
    !params.possibleStartCreated &&
    params.wakeContext.providerObservedAt != null
  ) {
    const wakeAt = new Date(params.wakeContext.providerObservedAt);
    const wakeFreshness = assessLiveStartSnapshotFreshness({
      providerSourceTimestamp: wakeAt,
      workerNow: new Date(),
    });
    if (wakeFreshness.state !== 'FRESH') {
      return false;
    }
    const snapshotFreshness = assessLiveStartSnapshotFreshness({
      providerSourceTimestamp: params.snapshotSourceTimestamp,
      workerNow: new Date(),
    });
    if (snapshotFreshness.state !== 'FRESH') {
      return true;
    }
    if (
      params.snapshotSourceTimestamp &&
      params.snapshotSourceTimestamp.getTime() >= wakeAt.getTime()
    ) {
      return true;
    }
  }
  return false;
}

export function buildSnapshotWakeForensics(params: {
  wakeContext: SnapshotWakeContext;
  snapshotFetchedAt: Date | null;
  cooldownBypassUsed: boolean;
}): SnapshotWakeForensics {
  return {
    source: params.wakeContext.source,
    reason: params.wakeContext.reason,
    providerObservedAt: params.wakeContext.providerObservedAt,
    receivedAt: params.wakeContext.receivedAt,
    snapshotFetchedAt: params.snapshotFetchedAt?.toISOString() ?? null,
    probeGeneration: params.wakeContext.probeGeneration,
    cooldownBypassUsed: params.cooldownBypassUsed,
  };
}

export function mergePendingWakeContext(
  existing: SnapshotWakeContext | null | undefined,
  incoming: SnapshotWakeContext,
): SnapshotWakeContext {
  if (!existing) {
    return incoming;
  }
  const existingObserved = existing.providerObservedAt
    ? new Date(existing.providerObservedAt).getTime()
    : null;
  const incomingObserved = incoming.providerObservedAt
    ? new Date(incoming.providerObservedAt).getTime()
    : null;
  if (
    incomingObserved != null &&
    (existingObserved == null || incomingObserved >= existingObserved)
  ) {
    return {
      ...incoming,
      probeGeneration: Math.min(existing.probeGeneration, incoming.probeGeneration) as 0 | 1,
    };
  }
  return existing;
}

export function wakeProbeDelayMs(config: SnapshotPollingTierConfig): number {
  return config.intervalMsByTier.RECENTLY_ACTIVE;
}
