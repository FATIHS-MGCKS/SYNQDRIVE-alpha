import { computeDiV0TripIntervals, type DiV0VersionTuple } from '../core';
import type { DiV0S4ControlPlaneConfig } from '../s4a-foundation/di-v0-s4a-control-plane';
import type { DiV0S4PipelineManifest } from '../s4a-foundation/di-v0-s4a-contract';
import type { DiV0S4ParsedEvidenceContainer } from '../s4a-foundation/di-v0-s4a-evidence-container-parse';
import type { TelemetrySourceFamily } from '../core/types';
import { bindDiV0S4cPipelineManifest, DiV0S4cPipelineBindError } from '../s4c-executor/di-v0-s4c-pipeline-bind';
import { buildDiV0S4dS1InputFromParsedContainer, DiV0S4dReplayS1Error } from '../s4d-replay/di-v0-s4d-replay-s1';
import type { MotionFsmGapBridgeAuxiliary } from '../core/kinematics/motion-fsm-gap-bridge-v1';

export type DiV0MotionCoreFsmGapBridgeAuxBuildCode =
  | 'PIPELINE_BIND_INCOMPATIBLE'
  | 'S1_INPUT_ERROR'
  | 'INTERVAL_COMPUTE_FAILED';

export type DiV0MotionCoreFsmGapBridgeAuxBuildResult =
  | {
      ok: true;
      auxiliary: MotionFsmGapBridgeAuxiliary;
      bindingVersions: DiV0VersionTuple;
    }
  | {
      ok: false;
      code: DiV0MotionCoreFsmGapBridgeAuxBuildCode;
      message: string;
    };

/**
 * STATIONARY_SUPPORTED labels from the same pinned evidence + work-item pipeline binding (no research defaults).
 */
export function buildMotionFsmGapBridgeAuxiliaryFromPinnedTrip(
  parsed: DiV0S4ParsedEvidenceContainer,
  sourceFamily: TelemetrySourceFamily,
  pipelineManifest: DiV0S4PipelineManifest,
  s4ControlPlane: DiV0S4ControlPlaneConfig,
): DiV0MotionCoreFsmGapBridgeAuxBuildResult {
  let computeBinding: { versions: DiV0VersionTuple; calibration: import('../core/calibration/types').DiV0CalibrationBundle };
  try {
    computeBinding = bindDiV0S4cPipelineManifest(pipelineManifest, s4ControlPlane);
  } catch (error) {
    const detail = error instanceof DiV0S4cPipelineBindError ? error.message : 'bind failed';
    return { ok: false, code: 'PIPELINE_BIND_INCOMPATIBLE', message: detail };
  }

  let s1Input;
  try {
    s1Input = buildDiV0S4dS1InputFromParsedContainer(parsed, sourceFamily);
  } catch (error) {
    const detail = error instanceof DiV0S4dReplayS1Error ? error.message : 's1 build failed';
    return { ok: false, code: 'S1_INPUT_ERROR', message: detail };
  }

  try {
    const out = computeDiV0TripIntervals(s1Input, {
      versions: computeBinding.versions,
      calibration: computeBinding.calibration,
    });
    const stationarySupportedLabels = new Set<string>();
    for (const iv of out.intervals) {
      if (iv.motionState === 'STATIONARY_SUPPORTED') {
        stationarySupportedLabels.add(iv.intervalStart);
      }
    }
    return {
      ok: true,
      auxiliary: { stationarySupportedLabels },
      bindingVersions: computeBinding.versions,
    };
  } catch (error) {
    return {
      ok: false,
      code: 'INTERVAL_COMPUTE_FAILED',
      message: error instanceof Error ? error.message : 'interval compute failed',
    };
  }
}
