import { DI_KINEMATIC_ESTIMATE_V0_1 } from '../../core/versions';
import { parseDiV0S4ControlPlaneConfig } from '../../s4a-foundation/di-v0-s4a-control-plane';
import { buildDiV0S4RuntimePipelineManifest } from '../../s4b-orchestration/di-v0-s4b-pipeline-manifest';
import { bindDiV0S4cPipelineManifest, DiV0S4cPipelineBindError } from '../di-v0-s4c-pipeline-bind';

describe('bindDiV0S4cPipelineManifest', () => {
  const config = parseDiV0S4ControlPlaneConfig({
    DI_V0_S4_MASTER_ENABLED: 'true',
    DI_V0_S4_R1_ENABLED: 'true',
    DI_V0_S4_NATIVE_ENABLED: 'false',
  });
  const { manifest } = buildDiV0S4RuntimePipelineManifest(config);

  it('accepts runtime manifest', () => {
    const bound = bindDiV0S4cPipelineManifest(manifest, config);
    expect(bound.versions.structuralVersion).toBe(manifest.structuralVersion);
  });

  it('rejects wrong structural version', () => {
    expect(() =>
      bindDiV0S4cPipelineManifest({ ...manifest, structuralVersion: 'WRONG' as typeof manifest.structuralVersion }, config),
    ).toThrow(DiV0S4cPipelineBindError);
  });

  it('rejects wrong calibration hash', () => {
    expect(() => bindDiV0S4cPipelineManifest({ ...manifest, calibrationBundleHash: 'sha256:00' }, config)).toThrow(
      DiV0S4cPipelineBindError,
    );
  });

  it('rejects incompatible estimator version', () => {
    const bad = { ...manifest, estimatorVersion: DI_KINEMATIC_ESTIMATE_V0_1 + '_X' };
    expect(() => bindDiV0S4cPipelineManifest(bad as typeof manifest, config)).toThrow(DiV0S4cPipelineBindError);
  });
});
