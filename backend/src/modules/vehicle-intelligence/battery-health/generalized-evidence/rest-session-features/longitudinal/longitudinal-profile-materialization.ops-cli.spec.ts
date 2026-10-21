import * as fs from 'fs';
import * as path from 'path';
import { runBatteryLongitudinalProfileMaterializeCli } from './longitudinal-profile-materialization.ops-cli';

describe('longitudinal-profile-materialization.ops-cli lifecycle', () => {
  const baseArgv = [
    'node',
    'battery-longitudinal-profile-materialize.ts',
    '--organization-id=org-1',
    '--vehicle-id=veh-1',
  ];

  it('A — SKIPPED_FLAG_OFF closes context once and exits 0', async () => {
    const closeContext = jest.fn().mockResolvedValue(undefined);
    const createContext = jest.fn().mockResolvedValue({
      runtime: {
        materialize: jest.fn().mockResolvedValue({ status: 'SKIPPED_FLAG_OFF' }),
      },
    });
    const code = await runBatteryLongitudinalProfileMaterializeCli({
      argv: baseArgv,
      createContext,
      closeContext,
      log: jest.fn(),
      logError: jest.fn(),
    });
    expect(code).toBe(0);
    expect(closeContext).toHaveBeenCalledTimes(1);
  });

  it('B — CREATED closes context once and exits 0', async () => {
    const closeContext = jest.fn().mockResolvedValue(undefined);
    const createContext = jest.fn().mockResolvedValue({
      runtime: {
        materialize: jest.fn().mockResolvedValue({
          outcome: 'CREATED',
          revisionId: 'r1',
          canonicalProfileFingerprint: 'f'.repeat(64),
          longitudinalProfileContractVersion: 'v',
          profilePolicyVersion: 'p',
          revision: {},
        }),
      },
    });
    const code = await runBatteryLongitudinalProfileMaterializeCli({
      argv: baseArgv,
      createContext,
      closeContext,
    });
    expect(code).toBe(0);
    expect(closeContext).toHaveBeenCalledTimes(1);
  });

  it('C — runtime throw closes context once and exits 1', async () => {
    const closeContext = jest.fn().mockResolvedValue(undefined);
    const createContext = jest.fn().mockResolvedValue({
      runtime: {
        materialize: jest.fn().mockRejectedValue(new Error('boom')),
      },
    });
    const code = await runBatteryLongitudinalProfileMaterializeCli({
      argv: baseArgv,
      createContext,
      closeContext,
      log: jest.fn(),
      logError: jest.fn(),
    });
    expect(code).toBe(1);
    expect(closeContext).toHaveBeenCalledTimes(1);
  });

  it('D — ops script has no post-bootstrap process.exit', () => {
    const scriptPath = path.resolve(
      __dirname,
      '../../../../../../../scripts/ops/battery-longitudinal-profile-materialize.ts',
    );
    const source = fs.readFileSync(scriptPath, 'utf8');
    expect(source).not.toMatch(/process\.exit\s*\(/);
    expect(source).toContain('process.exitCode');
  });
});
