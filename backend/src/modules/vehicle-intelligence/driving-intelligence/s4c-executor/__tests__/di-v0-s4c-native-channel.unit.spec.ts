import { buildDiV0CombinedInputIdentityV03, type DiV0S4ChannelPins } from '../../s4a-foundation/di-v0-s4a-identity';
import { parseDiV0S4ControlPlaneConfig } from '../../s4a-foundation/di-v0-s4a-control-plane';
import { buildDiV0S4cNativeChannelInput } from '../di-v0-s4c-evidence-channels';

const POS_HASH = 'DI_V0_POSITION_EVIDENCE_SNAPSHOT_V0_1:sha256:2ab565e2c07877382a26dd4d1a84fc40e83c52ebca08fcef2af1e813ccd38e22';

function pins(nativeOutcome: string, nativeReason: string | null): DiV0S4ChannelPins {
  return {
    NATIVE_EVENT: [nativeOutcome, nativeReason, null, null],
    POSITION: ['PRESENT', null, POS_HASH, null],
    R1_OBD: ['NOT_APPLICABLE', 'SOURCE_FAMILY', null, null],
  };
}

describe('buildDiV0S4cNativeChannelInput', () => {
  const off = parseDiV0S4ControlPlaneConfig({ DI_V0_S4_MASTER_ENABLED: 'true', DI_V0_S4_NATIVE_ENABLED: 'false' });
  const on = parseDiV0S4ControlPlaneConfig({ DI_V0_S4_MASTER_ENABLED: 'true', DI_V0_S4_NATIVE_ENABLED: 'true' });

  it('native matrix', () => {
    expect(buildDiV0S4cNativeChannelInput(off, 'RUPTELA_R1').outcome).toBe('DISABLED');
    expect(buildDiV0S4cNativeChannelInput(on, 'RUPTELA_R1').outcome).toBe('NOT_READY');
    expect(buildDiV0S4cNativeChannelInput(off, 'API_SYNTHETIC').outcome).toBe('DISABLED');
    expect(buildDiV0S4cNativeChannelInput(on, 'API_SYNTHETIC').outcome).toBe('NOT_APPLICABLE');
  });

  it('combined identity distinctness', () => {
    const a = buildDiV0CombinedInputIdentityV03(pins('NOT_APPLICABLE', 'SOURCE_FAMILY'));
    const b = buildDiV0CombinedInputIdentityV03(pins('NOT_READY', 'READINESS_AUTHORITY_NONE'));
    const c = buildDiV0CombinedInputIdentityV03(pins('DISABLED', 'FLAG_OFF'));
    expect(a).not.toBe(b);
    expect(b).not.toBe(c);
    expect(a).not.toBe(c);
  });
});
