import { readFileSync } from 'fs';
import { join } from 'path';
import {
  assertM3_3HvH4A3PreflightSqlReadOnlyV1,
  validateM3_3HvH4A3ProductionRolePreflightSpecV2,
  type M3_3HvH4A3ProductionRolePreflightSpecV2,
} from './m3-3-hv-h4-a3-3-o2-r3-h1-production-role-preflight.spec-validator.v1';

function loadPreflightSpecV2(): M3_3HvH4A3ProductionRolePreflightSpecV2 {
  const path = join(
    process.cwd(),
    '../architecture/battery-v2/scripts/m3-3-hv-h4-a3-o2-r3-production-role-preflight.spec.json',
  );
  return JSON.parse(readFileSync(path, 'utf8')) as M3_3HvH4A3ProductionRolePreflightSpecV2;
}

describe('m3-3-hv-h4-a3-o2-r3-h1 production role preflight spec', () => {
  it('loads Phase A/B machine-readable read-only audit specification', () => {
    const spec = loadPreflightSpecV2();
    expect(spec.specVersion).toBe('M3_3_HV_H4_A3_3_O2_R3_H1_PRODUCTION_ROLE_PREFLIGHT_V2');
    expect(spec.executionPolicy.readOnly).toBe(true);
    expect(spec.executionPolicy.productionExecutionInR3H1).toBe(false);
    validateM3_3HvH4A3ProductionRolePreflightSpecV2(spec);
  });

  it('requires distinct Phase A and Phase B checks', () => {
    const spec = loadPreflightSpecV2();
    const phaseAIds = new Set(spec.phaseA.checks.map((c) => c.id));
    const phaseBIds = new Set(spec.phaseB.checks.map((c) => c.id));
    for (const id of phaseBIds) {
      expect(phaseAIds.has(id)).toBe(false);
    }
    expect(spec.phaseA.checks.some((c) => c.id === 'PHASE_A_ROLE_DISCOVERY')).toBe(true);
    expect(spec.phaseB.checks.some((c) => c.id === 'PHASE_B_EFFECTIVE_APP_ATTESTATION_DENY')).toBe(true);
  });

  it('marks all SQL as read-only SELECT statements', () => {
    const spec = loadPreflightSpecV2();
    for (const check of [...spec.phaseA.checks, ...spec.phaseB.checks]) {
      expect(() => assertM3_3HvH4A3PreflightSqlReadOnlyV1(check.sql)).not.toThrow();
    }
  });

  it('documents named placeholder binding without unsafe interpolation', () => {
    const spec = loadPreflightSpecV2();
    expect(spec.parameterBinding.prohibitUnsafeStringInterpolation).toBe(true);
    expect(spec.parameterBinding.placeholders).toContain('migration_owner');
    expect(spec.parameterBinding.placeholders).toContain('trusted_attestation_issuer');
  });

  it('records NOT_PROVISIONED handling for missing roles in Phase A', () => {
    const spec = loadPreflightSpecV2();
    const discovery = spec.phaseA.checks.find((c) => c.id === 'PHASE_A_ROLE_DISCOVERY');
    expect(discovery?.expect.missingRoleState).toBe('NOT_PROVISIONED');
    expect(discovery?.expect.doNotTreatMissingAsSuccess).toBe(true);
  });
});
