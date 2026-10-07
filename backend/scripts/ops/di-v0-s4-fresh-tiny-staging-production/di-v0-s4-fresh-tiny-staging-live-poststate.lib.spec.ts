import {
  sha256Utf8,
  verifyLiveStagingPostState,
} from './di-v0-s4-fresh-tiny-staging-live-poststate.lib';
import { OPS_DI_V0_S4_DISCOVERY_TRIP_END_NOT_BEFORE_ENV } from '../di-v0-s4-tiny-staging-production/di-v0-s4-tiny-staging-frozen-not-before';
import { DI_V0_S4_ENV_ALLOWLISTS } from '../../../src/modules/vehicle-intelligence/driving-intelligence/s4a-foundation/di-v0-s4a-control-plane';

const ORG = 'faa710c9-6d91-4079-a7d5-91fdccdec14a';
const VEH = 'c10351f8-b6a2-4258-947f-631aeaa6d359';
const NB = '2026-10-07T16:00:00.000Z';

describe('S4F-7Y.1 live poststate verify', () => {
  const backup = 'DIMO_GLOBAL_BUDGET_ENABLED=true\n';
  const authorized = {
    [OPS_DI_V0_S4_DISCOVERY_TRIP_END_NOT_BEFORE_ENV]: NB,
    [DI_V0_S4_ENV_ALLOWLISTS.organization]: ORG,
    [DI_V0_S4_ENV_ALLOWLISTS.vehicle]: VEH,
  };
  const staged = `${backup}${OPS_DI_V0_S4_DISCOVERY_TRIP_END_NOT_BEFORE_ENV}=${NB}\n${DI_V0_S4_ENV_ALLOWLISTS.organization}=${ORG}\n${DI_V0_S4_ENV_ALLOWLISTS.vehicle}=${VEH}\n`;

  it('PASS exact three-key staging poststate', () => {
    const r = verifyLiveStagingPostState({
      backupContent: backup,
      currentContent: staged,
      authorizedPreEnvSha256: sha256Utf8(backup),
      authorizedStagingValues: authorized,
    });
    expect(r.ok).toBe(true);
    expect(r.envChangedKeyCount).toBe(3);
    expect(r.unexpectedChangedKeyCount).toBe(0);
  });

  it('FAIL unexpected fourth key', () => {
    const tampered = `${staged}EXTRA_KEY=1\n`;
    const r = verifyLiveStagingPostState({
      backupContent: backup,
      currentContent: tampered,
      authorizedPreEnvSha256: sha256Utf8(backup),
      authorizedStagingValues: authorized,
    });
    expect(r.ok).toBe(false);
    expect(r.unexpectedChangedKeyCount).toBeGreaterThan(0);
  });

  it('FAIL wrong target value', () => {
    const bad = staged.replace(ORG, '00000000-0000-0000-0000-000000000099');
    const r = verifyLiveStagingPostState({
      backupContent: backup,
      currentContent: bad,
      authorizedPreEnvSha256: sha256Utf8(backup),
      authorizedStagingValues: authorized,
    });
    expect(r.ok).toBe(false);
    expect(r.authorizedValuesExact).toBe(false);
  });
});
