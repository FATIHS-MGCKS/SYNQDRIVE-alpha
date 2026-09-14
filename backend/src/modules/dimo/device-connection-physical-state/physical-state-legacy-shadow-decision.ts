import type { DeviceConnectionEpisode, DimoDeviceConnectionEventType } from '@prisma/client';
import type { SnapshotPlugEvaluationOutcome } from '../device-connection-episode-resolution/device-connection-episode-resolution.snapshot-evaluator';
import { hashProviderDeviceId } from '../device-connection-episode.service';
import {
  buildDeviceConnectionBindingKey,
  normalizeConnectivityProvider,
} from './device-connection-physical-state.binding';
import {
  inferObdPlugStateFromLastEvent,
  type ObdPlugState,
} from '../device-connection-webhook.service';

/**
 * Canonical legacy-side shadow evidence for P2.3 compare-only adjudication.
 * Never substitute physical candidate values when legacy fields are unknown.
 */
export type LegacyShadowDecision = {
  accepted: boolean;
  /** Diagnostic metadata only — never used to establish GT-R1 proof. */
  diagnosticReason: string | null;
  effectivePlugState: ObdPlugState | null;
  evidenceObservedAt: Date | null;
  bindingKey: string | null;
};

export type LegacyPersistedEvent = {
  eventType: DimoDeviceConnectionEventType;
  observedAt: Date;
  tokenId: number;
  provider: string;
};

export function buildLegacyBindingKeyFromEpisode(
  episode: DeviceConnectionEpisode | null,
  provider = 'DIMO',
): string | null {
  if (!episode?.providerDeviceIdHash) return null;
  return buildDeviceConnectionBindingKey({
    provider: normalizeConnectivityProvider(provider),
    providerDeviceIdHash: episode.providerDeviceIdHash,
  });
}

/**
 * Canonical legacy binding resolution — never derive from incoming/current physical token.
 *
 * A. episode.providerDeviceIdHash when present
 * B. last legacy DIMO event tokenId -> hashProviderDeviceId -> buildDeviceConnectionBindingKey
 * C. else null
 */
export function resolveLegacyBindingKey(input: {
  episode: DeviceConnectionEpisode | null;
  lastLegacyEvent: LegacyPersistedEvent | null;
  provider?: string;
}): string | null {
  const fromEpisode = buildLegacyBindingKeyFromEpisode(
    input.episode,
    input.lastLegacyEvent?.provider ?? input.provider,
  );
  if (fromEpisode) return fromEpisode;

  if (input.lastLegacyEvent?.tokenId != null) {
    const provider = normalizeConnectivityProvider(
      input.lastLegacyEvent.provider ?? input.provider ?? 'DIMO',
    );
    const providerDeviceIdHash = hashProviderDeviceId(provider, input.lastLegacyEvent.tokenId);
    return buildDeviceConnectionBindingKey({ provider, providerDeviceIdHash });
  }

  return null;
}

export function buildLegacyWebhookShadowDecision(input: {
  gate: { persist: boolean; reason?: string };
  lastEvent: Pick<LegacyPersistedEvent, 'eventType' | 'observedAt'> | null;
  incomingPluggedIn: boolean;
  incomingObservedAt: Date;
  bindingKey: string | null;
}): LegacyShadowDecision {
  const incomingPlugState: ObdPlugState = input.incomingPluggedIn ? 'plugged' : 'unplugged';

  if (input.gate.persist) {
    return {
      accepted: true,
      diagnosticReason: null,
      effectivePlugState: incomingPlugState,
      evidenceObservedAt: input.incomingObservedAt,
      bindingKey: input.bindingKey,
    };
  }

  const legacyState = inferObdPlugStateFromLastEvent(input.lastEvent?.eventType);
  return {
    accepted: false,
    diagnosticReason: input.gate.reason ?? null,
    effectivePlugState: legacyState === 'unknown' ? null : legacyState,
    evidenceObservedAt: input.lastEvent?.observedAt ?? null,
    bindingKey: input.bindingKey,
  };
}

function resolvePersistedLegacyPlugState(input: {
  lastLegacyEvent: LegacyPersistedEvent | null;
  episode: DeviceConnectionEpisode | null;
}): ObdPlugState | null {
  const fromEvent = inferObdPlugStateFromLastEvent(input.lastLegacyEvent?.eventType);
  if (fromEvent !== 'unknown') return fromEvent;
  if (input.episode?.status === 'OPEN') return 'unplugged';
  return null;
}

export function buildLegacySnapshotShadowDecision(input: {
  evaluation: SnapshotPlugEvaluationOutcome;
  episode: DeviceConnectionEpisode | null;
  lastLegacyEvent: LegacyPersistedEvent | null;
}): LegacyShadowDecision {
  const legacyBindingKey = resolveLegacyBindingKey({
    episode: input.episode,
    lastLegacyEvent: input.lastLegacyEvent,
  });

  if (input.evaluation.action === 'resolve') {
    return {
      accepted: true,
      diagnosticReason: null,
      effectivePlugState: 'plugged',
      evidenceObservedAt: input.evaluation.providerObservedAt,
      bindingKey: legacyBindingKey,
    };
  }

  const persistedLegacyState = resolvePersistedLegacyPlugState({
    lastLegacyEvent: input.lastLegacyEvent,
    episode: input.episode,
  });
  const legacyEvidenceObservedAt =
    input.lastLegacyEvent?.observedAt ?? input.episode?.openedAt ?? null;

  if (input.evaluation.action === 'noop') {
    return {
      accepted: false,
      diagnosticReason: input.evaluation.reason,
      effectivePlugState: persistedLegacyState,
      evidenceObservedAt: legacyEvidenceObservedAt,
      bindingKey: legacyBindingKey,
    };
  }

  return {
    accepted: false,
    diagnosticReason: input.evaluation.reason,
    effectivePlugState: persistedLegacyState,
    evidenceObservedAt: legacyEvidenceObservedAt,
    bindingKey: legacyBindingKey,
  };
}
