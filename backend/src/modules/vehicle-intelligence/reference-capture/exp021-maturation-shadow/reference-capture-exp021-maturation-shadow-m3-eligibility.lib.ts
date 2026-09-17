import type { Exp021MaturationShadowActivityCohort } from './reference-capture-exp021-maturation-shadow-activity-classification.lib';
import {
  assertFamilyScheduleSemanticallyValid,
  assertStratumAlignsWithFamily,
  isCanonicalQueryGeometryMs,
} from './reference-capture-exp021-maturation-shadow-validation.lib';
import type {
  Exp021MaturationShadowM3EligibilityExclusion,
  Exp021MaturationShadowM3FamilyInput,
  Exp021MaturationShadowM3StratumInput,
} from './reference-capture-exp021-maturation-shadow-m3.types';

export function resolveActivityClassFromJson(json: unknown): Exp021MaturationShadowActivityCohort {
  if (json && typeof json === 'object' && !Array.isArray(json)) {
    const cls = (json as Record<string, unknown>).class;
    if (cls === 'ACTIVE_MOTION' || cls === 'ACTIVE_IDLE' || cls === 'UNKNOWN_ACTIVITY') {
      return cls;
    }
  }
  return 'UNKNOWN_ACTIVITY';
}

export function buildSemanticCohortId(stratum: Exp021MaturationShadowM3StratumInput): string {
  return `${stratum.signalSetHash}|${stratum.querySemanticsHash}|${stratum.runtimeBuildShaAtEnrollment}`;
}

export function validateFamilyEligibility(
  family: Exp021MaturationShadowM3FamilyInput,
): Exp021MaturationShadowM3EligibilityExclusion[] {
  const exclusions: Exp021MaturationShadowM3EligibilityExclusion[] = [];

  if (!family.id || !family.organizationId || !family.vehicleId) {
    exclusions.push({ scope: 'FAMILY', id: family.id ?? 'unknown', reason: 'INVALID_FAMILY_IDENTITY' });
    return exclusions;
  }

  if (!Number.isFinite(family.tokenId) || family.tokenId <= 0) {
    exclusions.push({ scope: 'FAMILY', id: family.id, reason: 'INVALID_TOKEN_ID' });
  }

  if (!family.shadowScheduleVersion) {
    exclusions.push({ scope: 'FAMILY', id: family.id, reason: 'MISSING_SHADOW_SCHEDULE_VERSION' });
  }

  try {
    assertFamilyScheduleSemanticallyValid({
      plannedAgesMsExact: family.plannedAgesMsExact,
      policyDelayProbeMs: family.policyDelayProbeMs,
    });
  } catch (error) {
    exclusions.push({
      scope: 'FAMILY',
      id: family.id,
      reason: `INVALID_FROZEN_SCHEDULE: ${error instanceof Error ? error.message : String(error)}`,
    });
  }

  return exclusions;
}

export function validateStratumEligibility(
  family: Exp021MaturationShadowM3FamilyInput,
  stratum: Exp021MaturationShadowM3StratumInput,
): Exp021MaturationShadowM3EligibilityExclusion[] {
  const exclusions: Exp021MaturationShadowM3EligibilityExclusion[] = [];

  if (!isCanonicalQueryGeometryMs(stratum.queryGeometryMs)) {
    exclusions.push({
      scope: 'STRATUM',
      id: stratum.id,
      reason: `INVALID_QUERY_GEOMETRY_MS:${stratum.queryGeometryMs}`,
    });
  }

  if (!stratum.signalSetHash || !stratum.querySemanticsHash) {
    exclusions.push({
      scope: 'STRATUM',
      id: stratum.id,
      reason: 'MISSING_FROZEN_SIGNAL_OR_QUERY_SEMANTICS',
    });
  }

  if (!stratum.runtimeBuildShaAtEnrollment) {
    exclusions.push({
      scope: 'STRATUM',
      id: stratum.id,
      reason: 'MISSING_RUNTIME_BUILD_SHA_AT_ENROLLMENT',
    });
  }

  try {
    assertStratumAlignsWithFamily({
      familyCanonicalWindowTo: family.canonicalWindowTo,
      queryGeometryMs: stratum.queryGeometryMs,
      windowFrom: stratum.windowFrom,
      windowTo: stratum.windowTo,
    });
  } catch (error) {
    exclusions.push({
      scope: 'STRATUM',
      id: stratum.id,
      reason: `INVALID_WINDOW_GEOMETRY: ${error instanceof Error ? error.message : String(error)}`,
    });
  }

  for (const attempt of stratum.attempts) {
    if (attempt.signalSetHash !== stratum.signalSetHash) {
      exclusions.push({
        scope: 'STRATUM',
        id: stratum.id,
        reason: `ATTEMPT_SIGNAL_SET_HASH_MISMATCH:${attempt.id}`,
      });
      break;
    }
    if (attempt.querySemanticsHash !== stratum.querySemanticsHash) {
      exclusions.push({
        scope: 'STRATUM',
        id: stratum.id,
        reason: `ATTEMPT_QUERY_SEMANTICS_HASH_MISMATCH:${attempt.id}`,
      });
      break;
    }
  }

  return exclusions;
}

export function isStratumEligible(
  family: Exp021MaturationShadowM3FamilyInput,
  stratum: Exp021MaturationShadowM3StratumInput,
): { eligible: boolean; exclusions: Exp021MaturationShadowM3EligibilityExclusion[] } {
  const familyExclusions = validateFamilyEligibility(family);
  const stratumExclusions = validateStratumEligibility(family, stratum);
  const exclusions = [...familyExclusions, ...stratumExclusions];
  return { eligible: exclusions.length === 0, exclusions };
}

export function detectSemanticCohortMismatchAcrossStrata(
  strata: Exp021MaturationShadowM3StratumInput[],
): { mismatch: boolean; reason: string | null; cohortIds: string[] } {
  const byStratumKey = new Map<string, Set<string>>();
  for (const stratum of strata) {
    const key = `${stratum.signalLane}|${stratum.queryGeometryMs}`;
    const cohortId = buildSemanticCohortId(stratum);
    const bucket = byStratumKey.get(key) ?? new Set<string>();
    bucket.add(cohortId);
    byStratumKey.set(key, bucket);
  }

  for (const [stratumKey, cohortIdsForKey] of byStratumKey.entries()) {
    if (cohortIdsForKey.size > 1) {
      const cohortIds = [...cohortIdsForKey].sort();
      return {
        mismatch: true,
        reason: `Incompatible semantic cohorts within stratum group ${stratumKey}: ${cohortIds.join(', ')}`,
        cohortIds,
      };
    }
  }

  const cohortIds = [...new Set(strata.map((s) => buildSemanticCohortId(s)))].sort();
  return { mismatch: false, reason: null, cohortIds };
}

/** Primary combined analysis must not blend incompatible cohorts across a scoped multi-stratum export. */
export function detectPrimaryCombinedCohortBlendingBlocked(
  strata: Exp021MaturationShadowM3StratumInput[],
): { blocked: boolean; reason: string | null; cohortIds: string[] } {
  const cohortIds = [...new Set(strata.map((s) => buildSemanticCohortId(s)))].sort();
  if (cohortIds.length <= 1) {
    return { blocked: false, reason: null, cohortIds };
  }
  return {
    blocked: true,
    reason: `Primary combined analysis blocked across incompatible semantic cohorts: ${cohortIds.join(', ')}`,
    cohortIds,
  };
}
