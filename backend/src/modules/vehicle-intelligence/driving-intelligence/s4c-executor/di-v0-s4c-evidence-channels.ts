import type { DiV0S4ControlPlaneConfig } from '../s4a-foundation/di-v0-s4a-control-plane';
import { DI_V0_S4_CHANNEL_RULES } from '../s4a-foundation/di-v0-s4a-contract';
import type { DiV0S4EvidenceChannelInput } from '../s4a-foundation/di-v0-s4a-identity';
import type { TelemetrySourceFamily } from '../core/types';
import type { DiV0PositionAcquisitionResult } from '../position-acquisition/di-v0-position-acquisition.types';
import { DI_V0_POSITION_EVIDENCE_SNAPSHOT_V0_1 } from '../position-acquisition/di-v0-position-acquisition.versions';
import type { DiV0R1ObdAcquisitionResult } from '../r1-obd-acquisition/di-v0-r1-obd-acquisition.types';
import { DI_V0_R1_OBD_EVIDENCE_SNAPSHOT_V0_3 } from '../r1-obd-acquisition/di-v0-r1-obd-acquisition.versions';
import { serializeDiV0R1ObdSnapshot } from '../r1-obd-acquisition/di-v0-r1-obd-snapshot';
import { resolveDiV0S4cR1ChannelOutcome } from './di-v0-s4c-r1-usable';

export function buildDiV0S4cNativeChannelInput(
  config: DiV0S4ControlPlaneConfig,
  sourceFamily: TelemetrySourceFamily,
): DiV0S4EvidenceChannelInput {
  if (!config.nativeEnabled) {
    return {
      channel: 'NATIVE_EVENT',
      outcome: 'DISABLED',
      reasonCode: 'FLAG_OFF',
      formatVersion: null,
      payload: null,
      attestationRef: null,
    };
  }
  const applicable = (DI_V0_S4_CHANNEL_RULES.channelPolicyV1NativeApplicableFamilies as readonly string[]).includes(
    sourceFamily,
  );
  if (!applicable) {
    return {
      channel: 'NATIVE_EVENT',
      outcome: 'NOT_APPLICABLE',
      reasonCode: 'SOURCE_FAMILY',
      formatVersion: null,
      payload: null,
      attestationRef: null,
    };
  }
  return {
    channel: 'NATIVE_EVENT',
    outcome: 'NOT_READY',
    reasonCode: 'READINESS_AUTHORITY_NONE',
    formatVersion: null,
    payload: null,
    attestationRef: null,
  };
}

export function buildDiV0S4cR1ChannelInput(
  config: DiV0S4ControlPlaneConfig,
  sourceFamily: TelemetrySourceFamily,
  dimoTokenId: number,
  vehicleId: string,
  r1: DiV0R1ObdAcquisitionResult | null,
  r1Failed: { reasonCode: string } | null,
): DiV0S4EvidenceChannelInput {
  if (!config.r1Enabled) {
    return {
      channel: 'R1_OBD',
      outcome: 'DISABLED',
      reasonCode: 'FLAG_OFF',
      formatVersion: null,
      payload: null,
      attestationRef: null,
    };
  }
  const applicable = (DI_V0_S4_CHANNEL_RULES.channelPolicyV1R1ApplicableFamilies as readonly string[]).includes(sourceFamily);
  if (!applicable) {
    return {
      channel: 'R1_OBD',
      outcome: 'NOT_APPLICABLE',
      reasonCode: 'SOURCE_FAMILY',
      formatVersion: null,
      payload: null,
      attestationRef: null,
    };
  }
  if (r1Failed) {
    return {
      channel: 'R1_OBD',
      outcome: 'SOURCE_FAILURE',
      reasonCode: r1Failed.reasonCode,
      formatVersion: null,
      payload: null,
      attestationRef: null,
    };
  }
  if (!r1) {
    throw new Error('R1 channel requires result or failure');
  }
  const outcome = resolveDiV0S4cR1ChannelOutcome(r1);
  const payload = serializeDiV0R1ObdSnapshot({
    dimoTokenId,
    vehicleId,
    window: r1.window,
    sourceFamily: r1.sourceFamily,
    sourceFamilyPolicyVersion: r1.sourceFamilyResolution.policyVersion,
    buckets: r1.buckets,
  });
  return {
    channel: 'R1_OBD',
    outcome,
    reasonCode: null,
    formatVersion: DI_V0_R1_OBD_EVIDENCE_SNAPSHOT_V0_3,
    payload,
    attestationRef: null,
  };
}

export function buildDiV0S4cPositionPresentChannel(
  result: DiV0PositionAcquisitionResult,
): DiV0S4EvidenceChannelInput {
  return {
    channel: 'POSITION',
    outcome: 'PRESENT',
    reasonCode: null,
    formatVersion: DI_V0_POSITION_EVIDENCE_SNAPSHOT_V0_1,
    payload: result.canonicalSnapshotPayload,
    attestationRef: null,
  };
}

export function buildDiV0S4cPositionOutcomeChannel(
  outcome: 'SOURCE_FAILURE' | 'AUTHORIZATION_FAILURE' | 'INVALID_REQUEST' | 'MALFORMED' | 'UNSUPPORTED_SOURCE',
  reasonCode: string,
): DiV0S4EvidenceChannelInput {
  return {
    channel: 'POSITION',
    outcome,
    reasonCode,
    formatVersion: null,
    payload: null,
    attestationRef: null,
  };
}
