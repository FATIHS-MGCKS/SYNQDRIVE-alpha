import { createHash } from 'crypto';
import { CALIBRATION_UNSET_V0_BUNDLE } from '../core/calibration/CALIBRATION_UNSET_V0';
import type { DiV0CalibrationBundle } from '../core/calibration/types';
import {
  DI_KINEMATIC_ESTIMATE_V0_1,
  DI_SHADOW_RECORD_V0_1,
  DI_SOURCE_QUALITY_CONTRACT_V0_1,
  SOURCE_FAMILY_POLICY_V0_1,
} from '../core/versions';
import {
  DI_V0_NATIVE_EVENT_EVIDENCE_ADAPTER_V0_2,
  DI_V0_NATIVE_EVENT_EVIDENCE_SNAPSHOT_V0_2,
} from '../native-event-evidence/di-v0-native-event-evidence.versions';
import {
  DI_V0_POSITION_ACQUISITION_ADAPTER_V0_1,
  DI_V0_POSITION_EVIDENCE_SNAPSHOT_V0_1,
  DI_V0_POSITION_QUERY_SPEC_V0_1,
} from '../position-acquisition/di-v0-position-acquisition.versions';
import {
  DI_V0_R1_OBD_ACQUISITION_ADAPTER_V0_3,
  DI_V0_R1_OBD_EVIDENCE_SNAPSHOT_V0_3,
  DI_V0_R1_OBD_QUERY_SPEC_V0_3,
} from '../r1-obd-acquisition/di-v0-r1-obd-acquisition.versions';
import {
  DI_V0_COMBINED_INPUT_IDENTITY_V0_3,
  DI_V0_S4_BOUNDARY_FP_VERSION,
  DI_V0_S4_CHANNEL_POLICY_V1,
  DI_V0_S4_ORCHESTRATION_CONTRACT_VERSION,
  type DiV0S4PipelineManifest,
} from '../s4a-foundation/di-v0-s4a-contract';
import {
  assertDiV0S4RuntimePipelineManifest,
  buildDiV0S4PipelineVersionKey,
  deriveDiV0S4ChannelEnablement,
} from '../s4a-foundation/di-v0-s4a-identity';

/**
 * Manifest label for `evidenceSnapshotContainerVersion`. Differs from the container header
 * `DI_V0_S4_EVIDENCE_CONTAINER_V1` (DI-CONTRA-S4A-CONTAINER-VERSION-NAMING-001, OPEN); the manifest
 * keeps the contract `fixtures.pipelineVersionBase` value until a contract version aligns the name.
 */
export const DI_V0_S4_MANIFEST_EVIDENCE_CONTAINER_LABEL = 'DI_V0_S4_EVIDENCE_SNAPSHOT_V1';

export const DI_V0_S4_CALIBRATION_BUNDLE_HASH_PREFIX = 'sha256';

/**
 * `calibrationBundleHash` (S4A_IDENTITY_AND_FENCING §3, N4): hash over the bundle's numeric
 * content only, serialized like the pipeline key (key-sorted `[key, value]` pairs, no whitespace).
 * The `calibrationVersion` label is excluded because it is its own manifest key.
 */
export function buildDiV0S4CalibrationBundleHash(bundle: DiV0CalibrationBundle): string {
  const entries = Object.keys(bundle)
    .filter((key) => key !== 'calibrationVersion')
    .sort()
    .map((key) => {
      const value = (bundle as unknown as Record<string, unknown>)[key];
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new Error(`DI_V0_S4B_MANIFEST:calibration value ${key} must be a finite number`);
      }
      return [key, value];
    });
  if (entries.length === 0) throw new Error('DI_V0_S4B_MANIFEST:calibration bundle has no numeric content');
  const hex = createHash('sha256').update(JSON.stringify(entries), 'utf8').digest('hex');
  return `${DI_V0_S4_CALIBRATION_BUNDLE_HASH_PREFIX}:${hex}`;
}

export interface DiV0S4RuntimePipeline {
  manifest: DiV0S4PipelineManifest;
  pipelineVersionKey: string;
}

/**
 * The one canonical runtime manifest of this build: every value comes from the version constant
 * of the module that owns it, and `channelEnablement` from the replica's channel flags.
 */
export function buildDiV0S4RuntimePipelineManifest(flags: {
  r1Enabled: boolean;
  nativeEnabled: boolean;
}): DiV0S4RuntimePipeline {
  const manifest: DiV0S4PipelineManifest = {
    boundaryFingerprintVersion: DI_V0_S4_BOUNDARY_FP_VERSION,
    calibrationBundleHash: buildDiV0S4CalibrationBundleHash(CALIBRATION_UNSET_V0_BUNDLE),
    calibrationVersion: CALIBRATION_UNSET_V0_BUNDLE.calibrationVersion,
    channelEnablement: deriveDiV0S4ChannelEnablement(flags),
    channelPolicyVersion: DI_V0_S4_CHANNEL_POLICY_V1,
    combinedInputIdentityVersion: DI_V0_COMBINED_INPUT_IDENTITY_V0_3,
    estimatorVersion: DI_KINEMATIC_ESTIMATE_V0_1,
    evidenceSnapshotContainerVersion: DI_V0_S4_MANIFEST_EVIDENCE_CONTAINER_LABEL,
    nativeAdapterVersion: DI_V0_NATIVE_EVENT_EVIDENCE_ADAPTER_V0_2,
    nativeSnapshotVersion: DI_V0_NATIVE_EVENT_EVIDENCE_SNAPSHOT_V0_2,
    positionAdapterVersion: DI_V0_POSITION_ACQUISITION_ADAPTER_V0_1,
    positionQuerySpecId: DI_V0_POSITION_QUERY_SPEC_V0_1.id,
    positionSnapshotVersion: DI_V0_POSITION_EVIDENCE_SNAPSHOT_V0_1,
    r1AdapterVersion: DI_V0_R1_OBD_ACQUISITION_ADAPTER_V0_3,
    r1QuerySpecId: DI_V0_R1_OBD_QUERY_SPEC_V0_3.id,
    r1SnapshotVersion: DI_V0_R1_OBD_EVIDENCE_SNAPSHOT_V0_3,
    s4OrchestrationContractVersion: DI_V0_S4_ORCHESTRATION_CONTRACT_VERSION,
    shadowRecordVersion: DI_SHADOW_RECORD_V0_1,
    sourceFamilyPolicyVersion: SOURCE_FAMILY_POLICY_V0_1,
    structuralVersion: DI_SOURCE_QUALITY_CONTRACT_V0_1,
  };
  assertDiV0S4RuntimePipelineManifest(manifest, flags);
  return { manifest: Object.freeze(manifest), pipelineVersionKey: buildDiV0S4PipelineVersionKey(manifest) };
}
