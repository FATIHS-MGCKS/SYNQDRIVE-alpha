import type { DimoDeviceConnectionEventType } from '@prisma/client';
import type { SnapshotPlugEvaluationOutcome } from '../device-connection-episode-resolution/device-connection-episode-resolution.snapshot-evaluator';
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

export function buildLegacyWebhookShadowDecision(input: {
  gate: { persist: boolean; reason?: string };
  lastEvent: { eventType: DimoDeviceConnectionEventType; observedAt: Date } | null;
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

export function buildLegacySnapshotShadowDecision(input: {
  evaluation: SnapshotPlugEvaluationOutcome;
  obdIsPluggedIn: boolean;
  providerObservedAt: Date;
  bindingKey: string | null;
}): LegacyShadowDecision {
  if (input.evaluation.action === 'resolve') {
    return {
      accepted: true,
      diagnosticReason: null,
      effectivePlugState: 'plugged',
      evidenceObservedAt: input.evaluation.providerObservedAt,
      bindingKey: input.bindingKey,
    };
  }

  if (input.evaluation.action === 'noop') {
    return {
      accepted: false,
      diagnosticReason: input.evaluation.reason,
      effectivePlugState: input.obdIsPluggedIn ? 'plugged' : 'unplugged',
      evidenceObservedAt: input.providerObservedAt,
      bindingKey: input.bindingKey,
    };
  }

  const effectivePlugState: ObdPlugState | null =
    input.obdIsPluggedIn === false ? 'unplugged' : input.obdIsPluggedIn === true ? 'plugged' : null;

  return {
    accepted: false,
    diagnosticReason: input.evaluation.reason,
    effectivePlugState,
    evidenceObservedAt: input.providerObservedAt,
    bindingKey: input.bindingKey,
  };
}
