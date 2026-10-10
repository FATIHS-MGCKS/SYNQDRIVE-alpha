import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { evaluateProductionGate6LiveOpenBoundary } from './di-v0-s4-gate6-live-open-boundary.lib';

describe('Gate-6 production live-open boundary (S4F-7AX.2)', () => {
  it('blocks fixture flag + alternate backend env + simulated guard proofs before live OPEN', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gate6-live-boundary-'));
    const envFile = path.join(dir, 'backend.env');
    fs.writeFileSync(envFile, 'DI_V0_S4_MASTER_ENABLED=true\n', 'utf8');

    const boundary = evaluateProductionGate6LiveOpenBoundary({
      DI_S4F7AS_FIXTURE_MODE: '1',
      SYNQDRIVE_BACKEND_ENV: envFile,
      DI_S4_GATE6_OPEN_ACK: 'YES',
      DI_S4_GATE6_OPEN_AUTHORIZED: 'YES',
      DI_S4F7AS_TOPOLOGY_OK: 'YES',
      DI_S4F7AS_BUDGET_CONFIG_OK: 'YES',
      DI_S4F7AS_BUDGET_RUNTIME_OK: 'YES',
      DI_S4F7AS_REDIS_OK: 'YES',
      DI_S4F7AS_GLOBAL_ROW_LINES: 'kill_state=KILLED',
    });

    expect(boundary.ok).toBe(false);
    if (!boundary.ok) {
      expect(boundary.failures.some((f) => f.startsWith('PRODUCTION_FIXTURE_CONTROL_PRESENT'))).toBe(true);
      expect(boundary.failures.some((f) => f.startsWith('PRODUCTION_SIMULATED_GUARD_PROOF_PRESENT'))).toBe(true);
      expect(
        boundary.failures.some((f) =>
          ['LIVE_OPEN_NON_PRODUCTION_BACKEND_ENV', 'EXACT_PRODUCTION_BACKEND_ENV_MISMATCH', 'PRODUCTION_BACKEND_ENV_REALPATH_FAILED'].includes(
            f,
          ),
        ),
      ).toBe(true);
    }
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
