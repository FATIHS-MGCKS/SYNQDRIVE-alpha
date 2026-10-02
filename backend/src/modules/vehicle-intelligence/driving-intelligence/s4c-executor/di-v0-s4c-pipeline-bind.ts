import {
  DI_KINEMATIC_ESTIMATE_V0_1,
  DI_SOURCE_QUALITY_CONTRACT_V0_1,
  SOURCE_FAMILY_POLICY_V0_1,
  type DiV0VersionTuple,
} from '../core/versions';
import { CALIBRATION_UNSET_V0_BUNDLE } from '../core/calibration/CALIBRATION_UNSET_V0';
import type { DiV0CalibrationBundle } from '../core/calibration/types';
import type { DiV0S4ControlPlaneConfig } from '../s4a-foundation/di-v0-s4a-control-plane';
import type { DiV0S4PipelineManifest } from '../s4a-foundation/di-v0-s4a-contract';
import { assertDiV0S4RuntimePipelineManifest } from '../s4a-foundation/di-v0-s4a-identity';
import { buildDiV0S4CalibrationBundleHash } from '../s4b-orchestration/di-v0-s4b-pipeline-manifest';

export class DiV0S4cPipelineBindError extends Error {
  constructor(message: string) {
    super(`DI_V0_S4C_PIPELINE_BIND:${message}`);
    this.name = 'DiV0S4cPipelineBindError';
  }
}

/** Fail closed unless the claimed manifest matches this replica's supported execution versions. */
export function bindDiV0S4cPipelineManifest(
  manifest: DiV0S4PipelineManifest,
  controlPlane: DiV0S4ControlPlaneConfig,
): { versions: DiV0VersionTuple; calibration: DiV0CalibrationBundle } {
  try {
    assertDiV0S4RuntimePipelineManifest(manifest, {
      r1Enabled: controlPlane.r1Enabled,
      nativeEnabled: controlPlane.nativeEnabled,
    });
  } catch (error) {
    throw new DiV0S4cPipelineBindError(error instanceof Error ? error.message : 'manifest rejected');
  }
  if (manifest.structuralVersion !== DI_SOURCE_QUALITY_CONTRACT_V0_1) {
    throw new DiV0S4cPipelineBindError('structuralVersion mismatch');
  }
  if (manifest.estimatorVersion !== DI_KINEMATIC_ESTIMATE_V0_1) {
    throw new DiV0S4cPipelineBindError('estimatorVersion mismatch');
  }
  if (manifest.sourceFamilyPolicyVersion !== SOURCE_FAMILY_POLICY_V0_1) {
    throw new DiV0S4cPipelineBindError('sourceFamilyPolicyVersion mismatch');
  }
  const expectedHash = buildDiV0S4CalibrationBundleHash(CALIBRATION_UNSET_V0_BUNDLE);
  if (manifest.calibrationVersion !== CALIBRATION_UNSET_V0_BUNDLE.calibrationVersion) {
    throw new DiV0S4cPipelineBindError('calibrationVersion mismatch');
  }
  if (manifest.calibrationBundleHash !== expectedHash) {
    throw new DiV0S4cPipelineBindError('calibrationBundleHash mismatch');
  }
  return {
    versions: {
      structuralVersion: manifest.structuralVersion as DiV0VersionTuple['structuralVersion'],
      estimatorVersion: manifest.estimatorVersion as DiV0VersionTuple['estimatorVersion'],
      calibrationVersion: manifest.calibrationVersion,
      sourceFamilyPolicyVersion: manifest.sourceFamilyPolicyVersion as DiV0VersionTuple['sourceFamilyPolicyVersion'],
    },
    calibration: CALIBRATION_UNSET_V0_BUNDLE,
  };
}
