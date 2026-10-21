const FORBIDDEN_SQL_PATTERN =
  /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|GRANT|REVOKE|TRUNCATE|CALL|DO)\b/i;

export type M3_3HvH4A3PreflightCheckV1 = {
  id: string;
  sql: string;
  expect: Record<string, unknown>;
};

export type M3_3HvH4A3ProductionRolePreflightSpecV2 = {
  specVersion: string;
  executionPolicy: {
    readOnly: boolean;
    mutationsForbidden: boolean;
    credentialOutputForbidden: boolean;
    productionExecutionInR3H1?: boolean;
  };
  parameterBinding: {
    prohibitUnsafeStringInterpolation: boolean;
    placeholders: string[];
  };
  phaseA: { id: string; checks: M3_3HvH4A3PreflightCheckV1[] };
  phaseB: { id: string; checks: M3_3HvH4A3PreflightCheckV1[] };
  migrationOrder?: { prerequisiteExtensions: string[]; requiredMigrations: string[] };
};

function stripSqlLiteralsForSafetyScanV1(sql: string): string {
  return sql.replace(/--.*$/gm, '').replace(/'[^']*'/g, "''");
}

export function assertM3_3HvH4A3PreflightSqlReadOnlyV1(sql: string): void {
  const withoutLineComments = stripSqlLiteralsForSafetyScanV1(sql);
  if (FORBIDDEN_SQL_PATTERN.test(withoutLineComments)) {
    throw new Error(`PREFLIGHT_SQL_NOT_READ_ONLY:${sql.slice(0, 80)}`);
  }
  const normalized = withoutLineComments.trim().toUpperCase();
  if (!normalized.startsWith('SELECT')) {
    throw new Error(`PREFLIGHT_SQL_MUST_BE_SELECT:${sql.slice(0, 80)}`);
  }
}

export function validateM3_3HvH4A3ProductionRolePreflightSpecV2(
  spec: M3_3HvH4A3ProductionRolePreflightSpecV2,
): void {
  if (spec.executionPolicy.readOnly !== true || spec.executionPolicy.mutationsForbidden !== true) {
    throw new Error('PREFLIGHT_EXECUTION_POLICY_INVALID');
  }
  if (spec.executionPolicy.credentialOutputForbidden !== true) {
    throw new Error('PREFLIGHT_CREDENTIAL_OUTPUT_NOT_FORBIDDEN');
  }
  if (spec.parameterBinding.prohibitUnsafeStringInterpolation !== true) {
    throw new Error('PREFLIGHT_UNSAFE_INTERPOLATION_NOT_PROHIBITED');
  }
  if (spec.phaseA.id !== 'PRE_PROVISION_READ_ONLY' || spec.phaseB.id !== 'POST_PROVISION_CERTIFICATION') {
    throw new Error('PREFLIGHT_PHASE_IDS_INVALID');
  }
  if (spec.phaseA.checks.length === 0 || spec.phaseB.checks.length === 0) {
    throw new Error('PREFLIGHT_PHASE_CHECKS_EMPTY');
  }

  const phaseAIds = new Set(spec.phaseA.checks.map((c) => c.id));
  const phaseBIds = new Set(spec.phaseB.checks.map((c) => c.id));
  if (phaseAIds.size !== spec.phaseA.checks.length || phaseBIds.size !== spec.phaseB.checks.length) {
    throw new Error('PREFLIGHT_DUPLICATE_CHECK_ID');
  }

  for (const check of [...spec.phaseA.checks, ...spec.phaseB.checks]) {
    assertM3_3HvH4A3PreflightSqlReadOnlyV1(check.sql);
  }

  const phaseARoleDiscovery = spec.phaseA.checks.find((c) => c.id === 'PHASE_A_ROLE_DISCOVERY');
  if (!phaseARoleDiscovery?.expect.missingRoleState) {
    throw new Error('PHASE_A_MISSING_ROLE_HANDLING_UNDEFINED');
  }
  if (phaseARoleDiscovery.expect.missingRoleState !== 'NOT_PROVISIONED') {
    throw new Error('PHASE_A_MISSING_ROLE_STATE_INVALID');
  }

  const effectiveChecks = [
    ...spec.phaseB.checks.filter((c) => c.id.startsWith('PHASE_B_EFFECTIVE_')),
    ...spec.phaseA.checks.filter((c) => c.id.includes('EFFECTIVE_')),
  ];
  if (effectiveChecks.length < 2) {
    throw new Error('PREFLIGHT_EFFECTIVE_PRIVILEGE_CHECKS_INSUFFICIENT');
  }

  const inheritanceCheck = spec.phaseB.checks.find((c) => c.id === 'PHASE_B_ROLE_INHERITANCE_BOUNDARY');
  if (!inheritanceCheck?.sql.includes('pg_has_role')) {
    throw new Error('PREFLIGHT_ROLE_INHERITANCE_CHECK_MISSING');
  }

  const ownershipCheck = spec.phaseB.checks.find((c) => c.id === 'PHASE_B_TRUSTED_OBJECT_OWNERSHIP');
  if (!ownershipCheck?.expect.runtimeRolesMustNotOwnTrustedObjects) {
    throw new Error('PREFLIGHT_OWNER_BYPASS_CHECK_MISSING');
  }
}
