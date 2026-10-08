import { readFileSync } from 'fs';
import { join } from 'path';

type PreflightSpec = {
  specVersion: string;
  executionPolicy: { readOnly: boolean; productionExecutionInR3: boolean };
  checks: Array<{ id: string; sql: string; expect: Record<string, unknown> }>;
};

describe('m3-3-hv-h4-a3-o2-r3 production role preflight spec', () => {
  it('loads machine-readable read-only audit specification', () => {
    const path = join(
      process.cwd(),
      '../architecture/battery-v2/scripts/m3-3-hv-h4-a3-o2-r3-production-role-preflight.spec.json',
    );
    const raw = readFileSync(path, 'utf8');
    const spec = JSON.parse(raw) as PreflightSpec;
    expect(spec.specVersion).toBe('M3_3_HV_H4_A3_3_O2_R3_PRODUCTION_ROLE_PREFLIGHT_V1');
    expect(spec.executionPolicy.readOnly).toBe(true);
    expect(spec.executionPolicy.productionExecutionInR3).toBe(false);
    expect(spec.checks.length).toBeGreaterThanOrEqual(10);
    const ids = new Set(spec.checks.map((c) => c.id));
    expect(ids.has('PREFLIGHT_LOCK_FUNCTION_EXECUTE')).toBe(true);
    expect(ids.has('PREFLIGHT_PGCRYPTO')).toBe(true);
  });
});
