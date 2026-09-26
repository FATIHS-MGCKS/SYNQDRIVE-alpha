import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { loadBackendEnvIntoProcessEnv } from './load-backend-env';

describe('loadBackendEnvIntoProcessEnv', () => {
  const envBackup = { ...process.env };
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sd-backend-env-'));
  });

  afterEach(() => {
    process.env = { ...envBackup };
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('loads missing keys from backend env file', () => {
    const envPath = path.join(tmpDir, '.env');
    fs.writeFileSync(
      envPath,
      'BATTERY_V2_LONGITUDINAL_PROFILE_MATERIALIZATION_ENABLED=false\n',
      'utf8',
    );
    delete process.env.BATTERY_V2_LONGITUDINAL_PROFILE_MATERIALIZATION_ENABLED;
    const result = loadBackendEnvIntoProcessEnv({ envFilePath: envPath });
    expect(result.loaded).toBe(true);
    expect(process.env.BATTERY_V2_LONGITUDINAL_PROFILE_MATERIALIZATION_ENABLED).toBe('false');
  });

  it('does not override process env already set', () => {
    const envPath = path.join(tmpDir, '.env');
    fs.writeFileSync(
      envPath,
      'BATTERY_V2_LONGITUDINAL_PROFILE_MATERIALIZATION_ENABLED=true\n',
      'utf8',
    );
    process.env.BATTERY_V2_LONGITUDINAL_PROFILE_MATERIALIZATION_ENABLED = 'false';
    loadBackendEnvIntoProcessEnv({ envFilePath: envPath });
    expect(process.env.BATTERY_V2_LONGITUDINAL_PROFILE_MATERIALIZATION_ENABLED).toBe('false');
  });
});
