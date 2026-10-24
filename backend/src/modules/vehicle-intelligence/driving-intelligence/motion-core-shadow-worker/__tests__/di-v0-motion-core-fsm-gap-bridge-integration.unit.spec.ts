import { DEFAULT_DI_V0_VERSION_TUPLE, DI_KINEMATIC_ESTIMATE_V0_1, type MotionCorePositionBucket } from '../../core';
import { MOTION_FSM_GAP_BRIDGE_V1_VERSION } from '../../core/kinematics/motion-fsm-gap-bridge-v1';
import { buildMotionFsmGapBridgeAuxiliaryFromPinnedTrip } from '../di-v0-motion-core-fsm-gap-bridge-auxiliary';
import { isFsmGapBridgeV1Effective } from '../di-v0-motion-core-fsm-gap-bridge-v1-admission';
import {
  DI_V0_MOTION_CORE_SHADOW_BUNDLE_VERSION_V1,
  DI_V0_MOTION_CORE_SHADOW_BUNDLE_VERSION_V3_FSM_GAP_BRIDGE,
  DI_V0_MOTION_CORE_SHADOW_BUNDLE_VERSION_V4_C5_1_AND_FSM_GAP_BRIDGE,
  resolveMotionCoreShadowBundleVersion,
} from '../di-v0-motion-core-shadow.bundle.version';
import { parseDiV0MotionCoreShadowControlPlaneConfig } from '../di-v0-motion-core-shadow-control-plane';
import { processDiV0MotionCoreShadowFromEvidenceAdaptation } from '../di-v0-motion-core-shadow-processor';
import type { DiV0MotionCoreShadowEvidenceAdaptation } from '../di-v0-motion-core-shadow-evidence.adapter';
import type { DiV0S4ParsedEvidenceContainer } from '../../s4a-foundation/di-v0-s4a-evidence-container-parse';
import type { DiV0S4PipelineManifest } from '../../s4a-foundation/di-v0-s4a-contract';
import { parseDiV0S4ControlPlaneConfig } from '../../s4a-foundation/di-v0-s4a-control-plane';
import { s4aManifestFor } from '../../s4a-foundation/__tests__/di-v0-s4a-postgres-harness';

function evidenceFromGrid(buckets: MotionCorePositionBucket[]): DiV0MotionCoreShadowEvidenceAdaptation {
  return {
    buckets,
    sparseSpeed: [],
    sparsePersisted: [],
    sparseChannelOutcome: null,
    sparseComparable: false,
    limitations: [],
  };
}

function mk(i: number): MotionCorePositionBucket {
  return {
    bucketLabelUtc: new Date((1_900_000_000 + i) * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z'),
    availability: 'PRESENT',
    latitude: 48.1 + (i * 27.8) / 111_320,
    longitude: 11.5,
  };
}

describe('FSM gap-bridge V1.3.1 shadow integration', () => {
  it('resolves bundle versions for C5.1 × gap-bridge matrix', () => {
    expect(
      resolveMotionCoreShadowBundleVersion({ c5_1PreferredSpeedEnabled: false, fsmGapBridgeV1Enabled: false }),
    ).toBe(DI_V0_MOTION_CORE_SHADOW_BUNDLE_VERSION_V1);
    expect(
      resolveMotionCoreShadowBundleVersion({ c5_1PreferredSpeedEnabled: false, fsmGapBridgeV1Enabled: true }),
    ).toBe(DI_V0_MOTION_CORE_SHADOW_BUNDLE_VERSION_V3_FSM_GAP_BRIDGE);
    expect(
      resolveMotionCoreShadowBundleVersion({ c5_1PreferredSpeedEnabled: true, fsmGapBridgeV1Enabled: true }),
    ).toBe(DI_V0_MOTION_CORE_SHADOW_BUNDLE_VERSION_V4_C5_1_AND_FSM_GAP_BRIDGE);
  });

  it('requires activation cutoff when gap-bridge flag enabled', () => {
    expect(() =>
      parseDiV0MotionCoreShadowControlPlaneConfig({
        DI_V0_MOTION_CORE_FSM_GAP_BRIDGE_V1_ENABLED: 'true',
      }),
    ).toThrow(/DI_V0_MOTION_CORE_FSM_GAP_BRIDGE_V1_ACTIVATION_SINCE/);
  });

  it('activation cutoff prevents historical bundle bump', () => {
    const cp = parseDiV0MotionCoreShadowControlPlaneConfig({
      DI_V0_MOTION_CORE_FSM_GAP_BRIDGE_V1_ENABLED: 'true',
      DI_V0_MOTION_CORE_FSM_GAP_BRIDGE_V1_ACTIVATION_SINCE: '2026-11-01T00:00:00.000Z',
    });
    expect(
      isFsmGapBridgeV1Effective(cp, { workItemCompletedAt: new Date('2026-10-01T00:00:00.000Z') }),
    ).toBe(false);
    expect(
      isFsmGapBridgeV1Effective(cp, { workItemCompletedAt: new Date('2026-11-02T00:00:00.000Z') }),
    ).toBe(true);
  });

  it('flag OFF keeps byte-identical FSM labels vs baseline processor path', () => {
    const buckets = [0, 1, 2, 3, 4, 5].map(mk);
    const base = processDiV0MotionCoreShadowFromEvidenceAdaptation(evidenceFromGrid(buckets), {
      pinnedSnapshotHash: 'a',
      combinedInputIdentity: 'b',
      fsmGapBridgeV1Enabled: false,
    });
    const again = processDiV0MotionCoreShadowFromEvidenceAdaptation(evidenceFromGrid(buckets), {
      pinnedSnapshotHash: 'a',
      combinedInputIdentity: 'b',
    });
    expect(again.payload.fsmLabels).toEqual(base.payload.fsmLabels);
    expect(again.payload.contract.algorithmVersions.gapBridgeV1).toBeNull();
    expect(again.payload.contract.algorithmVersions.fsmAuxBinding).toBeNull();
  });

  it('flag ON records gap-bridge version and distinct intent key', () => {
    const buckets = [0, 1, 2, 3, 4, 5].map(mk);
    const off = processDiV0MotionCoreShadowFromEvidenceAdaptation(evidenceFromGrid(buckets), {
      pinnedSnapshotHash: 'hash',
      combinedInputIdentity: 'id',
      fsmGapBridgeV1Enabled: false,
    });
    const on = processDiV0MotionCoreShadowFromEvidenceAdaptation(evidenceFromGrid(buckets), {
      pinnedSnapshotHash: 'hash',
      combinedInputIdentity: 'id',
      fsmGapBridgeV1Enabled: true,
      gapBridgeAuxiliary: { stationarySupportedLabels: new Set() },
      gapBridgeAuxBindingVersions: DEFAULT_DI_V0_VERSION_TUPLE,
    });
    expect(on.payload.contract.algorithmVersions.gapBridgeV1).toBe(MOTION_FSM_GAP_BRIDGE_V1_VERSION);
    expect(on.payload.contract.algorithmVersions.fsm).toContain('retrospectiveGapBridgeV1');
    expect(on.intentKey).not.toBe(off.intentKey);
    expect(on.payload.contract.algorithmVersions.fsmAuxBinding?.estimatorVersion).toBe(
      DI_KINEMATIC_ESTIMATE_V0_1,
    );
  });

  it('rejects incompatible pipeline manifest for aux binding', () => {
    const parsed = {
      channelManifest: [],
      channelPayloads: {},
      snapshotHash: 'x',
      combinedInputIdentity: 'y',
    } as unknown as DiV0S4ParsedEvidenceContainer;
    const s4 = parseDiV0S4ControlPlaneConfig({
      DI_V0_S4_MASTER_ENABLED: 'true',
      DI_V0_S4_POSITION_ENABLED: 'true',
    });
    const badManifest = { ...s4aManifestFor(s4), estimatorVersion: 'UNKNOWN_ESTIMATOR' };
    const result = buildMotionFsmGapBridgeAuxiliaryFromPinnedTrip(
      parsed,
      'API_SYNTHETIC',
      badManifest as DiV0S4PipelineManifest,
      s4,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('PIPELINE_BIND_INCOMPATIBLE');
    }
  });
});
