import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  DI_S4_GATE6_GUARD_PROOF_BUNDLE_PATH_ENV,
  evaluateProductionGuardProofChannel,
  guardProofKeysInProcessEnv,
  readGuardProofBundleFile,
  resolveGate6GuardProofValues,
  writeGuardProofBundleFile,
} from './di-v0-s4-gate6-guard-proof-bundle.lib';
import { DI_S4_GATE6_WRAPPER_ATTESTATION_ENV, DI_S4_GATE6_WRAPPER_ATTESTATION_VALUE } from './di-v0-s4-gate6-os-authorization.lib';
import { PRODUCTION_SHARED_BACKEND_ENV_PATH } from '../di-v0-s4-fresh-tiny-staging-production/di-v0-s4-fresh-tiny-staging-live-authority.lib';

describe('Gate-6 guard proof bundle', () => {
  it('rejects injected DI_S4F7AS_* keys on Production surface', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gate6-bundle-'));
    const envFile = path.join(dir, 'backend.env');
    fs.writeFileSync(envFile, 'DI_V0_S4_MASTER_ENABLED=true\n', 'utf8');
    const bundle = path.join(dir, 'bundle.env');
    writeGuardProofBundleFile(bundle, { DI_S4F7AS_TOPOLOGY_OK: 'YES' });

    const channel = evaluateProductionGuardProofChannel({
      SYNQDRIVE_BACKEND_ENV_CANONICAL: PRODUCTION_SHARED_BACKEND_ENV_PATH,
      [DI_S4_GATE6_GUARD_PROOF_BUNDLE_PATH_ENV]: bundle,
      [DI_S4_GATE6_WRAPPER_ATTESTATION_ENV]: DI_S4_GATE6_WRAPPER_ATTESTATION_VALUE,
      DI_S4F7AS_TOPOLOGY_OK: 'YES',
    });

    expect(channel.ok).toBe(false);
    if (!channel.ok) {
      expect(channel.failures).toContain('GUARD_PROOF_INJECTED_IN_PROCESS_ENV');
    }
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('accepts trusted bundle when process env is clean on Production', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gate6-bundle-'));
    const bundle = path.join(dir, 'bundle.env');
    const values = {
      DI_S4F7AS_GLOBAL_ROW_LINES: '1\nKILLED',
      DI_S4F7AS_S4_PERSISTENCE_LINES: '0\n0\n0\n0\n0\n0',
      DI_S4F7AS_ENV_CONTENT: 'DI_V0_S4_MASTER_ENABLED=true\n',
      DI_S4F7AS_VEHICLE_DB_LINES: '1',
      DI_S4F7AS_TOPOLOGY_OK: 'YES',
      DI_S4F7AS_BUDGET_CONFIG_OK: 'YES',
      DI_S4F7AS_BUDGET_RUNTIME_OK: 'YES',
      DI_S4F7AS_REDIS_OK: 'YES',
    };
    writeGuardProofBundleFile(bundle, values);
    const read = readGuardProofBundleFile(bundle);
    expect(read.ok).toBe(true);

    const resolved = resolveGate6GuardProofValues({
      SYNQDRIVE_BACKEND_ENV_CANONICAL: PRODUCTION_SHARED_BACKEND_ENV_PATH,
      [DI_S4_GATE6_GUARD_PROOF_BUNDLE_PATH_ENV]: bundle,
      [DI_S4_GATE6_WRAPPER_ATTESTATION_ENV]: DI_S4_GATE6_WRAPPER_ATTESTATION_VALUE,
    });
    expect(resolved.ok).toBe(true);
    if (resolved.ok) {
      expect(resolved.values.DI_S4F7AS_TOPOLOGY_OK).toBe('YES');
      expect(guardProofKeysInProcessEnv({ DI_S4F7AS_TOPOLOGY_OK: 'YES' })).toContain('DI_S4F7AS_TOPOLOGY_OK');
    }
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
