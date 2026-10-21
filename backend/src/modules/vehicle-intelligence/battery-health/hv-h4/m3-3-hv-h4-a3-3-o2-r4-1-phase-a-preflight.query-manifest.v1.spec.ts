import {
  M3_3_HV_H4_A3_PHASE_A_QUERY_MANIFEST_V1,
  assertSingleApprovedStatementV1,
  getApprovedPhaseAQuerySqlV1,
} from './m3-3-hv-h4-a3-3-o2-r4-1-phase-a-preflight.query-manifest.v1';
import type { M3_3HvH4A3PhaseAQueryManifestIdV1 } from './m3-3-hv-h4-a3-3-o2-r4-1-phase-a-preflight.query-manifest.v1';
import { assertM3_3HvH4A3PreflightSqlReadOnlyV1 } from './m3-3-hv-h4-a3-3-o2-r3-h1-production-role-preflight.spec-validator.v1';

describe('m3-3-hv-h4-a3-o2-r4-1 phase-a query manifest', () => {
  it('every manifest entry is a single approved read-only SELECT', () => {
    for (const id of Object.keys(M3_3_HV_H4_A3_PHASE_A_QUERY_MANIFEST_V1) as M3_3HvH4A3PhaseAQueryManifestIdV1[]) {
      const sql = getApprovedPhaseAQuerySqlV1(id);
      assertSingleApprovedStatementV1(sql);
      expect(() => assertM3_3HvH4A3PreflightSqlReadOnlyV1(sql)).not.toThrow();
    }
  });

  it('rejects multi-statement SQL', () => {
    expect(() => assertSingleApprovedStatementV1('SELECT 1; SELECT 2')).toThrow(
      'PHASE_A_QUERY_MULTI_STATEMENT_REJECTED',
    );
  });
});
