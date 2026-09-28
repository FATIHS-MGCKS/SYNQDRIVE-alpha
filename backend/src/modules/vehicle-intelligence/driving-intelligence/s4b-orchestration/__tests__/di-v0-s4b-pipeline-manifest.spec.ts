import * as fs from 'fs';
import * as path from 'path';
import { CALIBRATION_UNSET_V0_BUNDLE } from '../../core/calibration/CALIBRATION_UNSET_V0';
import { DI_V0_S4_PIPELINE_MANIFEST_KEYS } from '../../s4a-foundation/di-v0-s4a-contract';
import { assertDiV0S4RuntimePipelineManifest, buildDiV0S4PipelineVersionKey } from '../../s4a-foundation/di-v0-s4a-identity';
import {
  buildDiV0S4CalibrationBundleHash,
  buildDiV0S4RuntimePipelineManifest,
  DI_V0_S4_MANIFEST_EVIDENCE_CONTAINER_LABEL,
} from '../di-v0-s4b-pipeline-manifest';

const CONTRACT = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, '../../../../../../../architecture/drivingintelligence/design/s4a/s4a-contract.v2.json'),
    'utf8',
  ),
);
const FLAG_COMBOS = [
  { r1Enabled: false, nativeEnabled: false },
  { r1Enabled: true, nativeEnabled: false },
  { r1Enabled: false, nativeEnabled: true },
  { r1Enabled: true, nativeEnabled: true },
];

describe('DI V0 S4B canonical pipeline manifest (D14)', () => {
  it('D14a carries exactly the 20 contract keys and passes the runtime manifest assertion for every flag combination', () => {
    for (const flags of FLAG_COMBOS) {
      const { manifest, pipelineVersionKey } = buildDiV0S4RuntimePipelineManifest(flags);
      expect(Object.keys(manifest).sort()).toEqual([...DI_V0_S4_PIPELINE_MANIFEST_KEYS].sort());
      expect(Object.keys(manifest).sort()).toEqual([...CONTRACT.pipelineVersion.requiredKeys].sort());
      expect(() => assertDiV0S4RuntimePipelineManifest(manifest, flags)).not.toThrow();
      expect(pipelineVersionKey).toBe(buildDiV0S4PipelineVersionKey(manifest));
      expect(pipelineVersionKey).toMatch(/^DI_V0_S4_PIPELINE_V1:sha256:[0-9a-f]{64}$/);
    }
  });

  it('D14b equals the contract pipelineVersionBase fixture except the real bundle hash and derived channel enablement', () => {
    const { manifest } = buildDiV0S4RuntimePipelineManifest({ r1Enabled: true, nativeEnabled: true });
    const fixture = CONTRACT.fixtures.pipelineVersionBase as Record<string, string>;
    const differing = Object.keys(fixture).filter((key) => fixture[key] !== (manifest as Record<string, string>)[key]);
    expect(differing).toEqual(['calibrationBundleHash']);
    expect(manifest.channelEnablement).toBe(fixture.channelEnablement);
    expect(manifest.evidenceSnapshotContainerVersion).toBe(DI_V0_S4_MANIFEST_EVIDENCE_CONTAINER_LABEL);
  });

  it('D14c channel flags change the pipeline version key; the key is deterministic per flag set', () => {
    const keys = FLAG_COMBOS.map((flags) => buildDiV0S4RuntimePipelineManifest(flags).pipelineVersionKey);
    expect(new Set(keys).size).toBe(FLAG_COMBOS.length);
    expect(buildDiV0S4RuntimePipelineManifest(FLAG_COMBOS[1]).pipelineVersionKey).toBe(keys[1]);
  });

  it('D14d calibrationBundleHash binds numeric content, not the label, and is key-order independent', () => {
    const base = buildDiV0S4CalibrationBundleHash(CALIBRATION_UNSET_V0_BUNDLE);
    expect(base).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(buildDiV0S4CalibrationBundleHash({ ...CALIBRATION_UNSET_V0_BUNDLE, calibrationVersion: 'OTHER_LABEL' })).toBe(base);
    expect(buildDiV0S4CalibrationBundleHash({ ...CALIBRATION_UNSET_V0_BUNDLE, r1ConflictAbsKmh: 10.5 })).not.toBe(base);
    const reversed = Object.fromEntries(Object.entries(CALIBRATION_UNSET_V0_BUNDLE).reverse());
    expect(buildDiV0S4CalibrationBundleHash(reversed as typeof CALIBRATION_UNSET_V0_BUNDLE)).toBe(base);
    expect(() =>
      buildDiV0S4CalibrationBundleHash({ ...CALIBRATION_UNSET_V0_BUNDLE, holdNoiseDisplacementM: Number.NaN }),
    ).toThrow(/finite number/);
  });

  it('D14e the manifest is frozen', () => {
    const { manifest } = buildDiV0S4RuntimePipelineManifest({ r1Enabled: true, nativeEnabled: false });
    expect(Object.isFrozen(manifest)).toBe(true);
  });
});
