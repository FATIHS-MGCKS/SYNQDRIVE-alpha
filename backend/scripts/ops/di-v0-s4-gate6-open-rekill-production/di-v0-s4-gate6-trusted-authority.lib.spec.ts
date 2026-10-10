import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { PRODUCTION_SHARED_BACKEND_ENV_PATH } from '../di-v0-s4-fresh-tiny-staging-production/di-v0-s4-fresh-tiny-staging-live-authority.lib';
import {
  enforceExactProductionBackendEnvForLiveOpen,
  resolveCanonicalBackendEnvPathFromFilesystem,
} from './di-v0-s4-gate6-trusted-authority.lib';

describe('exact Production backend.env enforcement', () => {
  it('allows fixture temp env paths in fixture mode', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gate6-env-fixture-'));
    const envFile = path.join(dir, 'backend.env');
    fs.writeFileSync(envFile, 'X=1\n', 'utf8');
    const resolved = resolveCanonicalBackendEnvPathFromFilesystem({ SYNQDRIVE_BACKEND_ENV: envFile });
    const enforced = enforceExactProductionBackendEnvForLiveOpen(
      { DI_S4F7AS_FIXTURE_MODE: '1', SYNQDRIVE_BACKEND_ENV: envFile },
      resolved,
      { permitFixtureAlternateBackendEnv: true },
    );
    expect(enforced.ok).toBe(true);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('rejects non-production realpath when not in fixture mode', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gate6-env-alt-'));
    const envFile = path.join(dir, 'backend.env');
    fs.writeFileSync(envFile, 'X=1\n', 'utf8');
    const resolved = resolveCanonicalBackendEnvPathFromFilesystem({ SYNQDRIVE_BACKEND_ENV: envFile });
    const enforced = enforceExactProductionBackendEnvForLiveOpen(
      {
        SYNQDRIVE_BACKEND_ENV: envFile,
        SYNQDRIVE_BACKEND_ENV_CANONICAL: PRODUCTION_SHARED_BACKEND_ENV_PATH,
      },
      resolved,
    );
    expect(enforced.ok).toBe(false);
    if (!enforced.ok) {
      if (fs.existsSync(PRODUCTION_SHARED_BACKEND_ENV_PATH)) {
        expect(enforced.failures).toContain('EXACT_PRODUCTION_BACKEND_ENV_MISMATCH');
      } else {
        expect(enforced.failures).toContain('PRODUCTION_BACKEND_ENV_REALPATH_FAILED');
      }
    }
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
