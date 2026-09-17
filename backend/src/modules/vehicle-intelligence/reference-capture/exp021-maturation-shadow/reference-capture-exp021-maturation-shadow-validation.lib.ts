import type { Exp021MaturationShadowProviderOutcomeClass, Exp021MaturationShadowWindowFamily } from '@prisma/client';
import {
  Exp021MaturationShadowAttemptAuthorityError,
  Exp021MaturationShadowFamilyIdentityError,
  Exp021MaturationShadowOffScheduleSlotError,
  Exp021MaturationShadowProviderOutcomeConsistencyError,
  Exp021MaturationShadowStratumSemanticMismatchError,
} from './reference-capture-exp021-maturation-shadow.errors';
import {
  EXP021_MATURATION_SHADOW_QUERY_GEOMETRIES_MS,
  type Exp021MaturationShadowQueryGeometryMs,
} from './reference-capture-exp021-maturation-shadow.types';

function isFinitePositiveInteger(value: number): boolean {
  return Number.isFinite(value) && Number.isInteger(value) && value > 0;
}

export function plannedAgesMsExactEqual(left: number[], right: number[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

export function assertFamilyScheduleSemanticallyValid(input: {
  plannedAgesMsExact: number[];
  policyDelayProbeMs: number;
}): void {
  if (!Array.isArray(input.plannedAgesMsExact) || input.plannedAgesMsExact.length === 0) {
    throw new Exp021MaturationShadowFamilyIdentityError(
      'plannedAgesMsExact must be a non-empty array',
    );
  }

  const seen = new Set<number>();
  for (const age of input.plannedAgesMsExact) {
    if (!isFinitePositiveInteger(age)) {
      throw new Exp021MaturationShadowFamilyIdentityError(
        'plannedAgesMsExact must contain only finite positive integers',
      );
    }
    if (seen.has(age)) {
      throw new Exp021MaturationShadowFamilyIdentityError(
        'plannedAgesMsExact must not contain duplicate ages',
      );
    }
    seen.add(age);
  }

  if (!isFinitePositiveInteger(input.policyDelayProbeMs)) {
    throw new Exp021MaturationShadowFamilyIdentityError(
      'policyDelayProbeMs must be a finite positive integer',
    );
  }
}

export function isCanonicalQueryGeometryMs(
  queryGeometryMs: number,
): queryGeometryMs is Exp021MaturationShadowQueryGeometryMs {
  return (EXP021_MATURATION_SHADOW_QUERY_GEOMETRIES_MS as readonly number[]).includes(queryGeometryMs);
}

export function assertCanonicalQueryGeometryMs(queryGeometryMs: number): Exp021MaturationShadowQueryGeometryMs {
  if (!isCanonicalQueryGeometryMs(queryGeometryMs)) {
    throw new Exp021MaturationShadowStratumSemanticMismatchError(
      `queryGeometryMs ${queryGeometryMs} is not canonical; allowed values: ${EXP021_MATURATION_SHADOW_QUERY_GEOMETRIES_MS.join(', ')}`,
    );
  }
  return queryGeometryMs;
}

export function assertStratumAlignsWithFamily(input: {
  familyCanonicalWindowTo: Date;
  queryGeometryMs: number;
  windowFrom: Date;
  windowTo: Date;
}): void {
  assertCanonicalQueryGeometryMs(input.queryGeometryMs);

  if (input.windowTo.getTime() !== input.familyCanonicalWindowTo.getTime()) {
    throw new Exp021MaturationShadowStratumSemanticMismatchError(
      'Stratum windowTo must equal family canonicalWindowTo',
    );
  }

  const expectedWindowFromMs = input.windowTo.getTime() - input.queryGeometryMs;
  if (input.windowFrom.getTime() !== expectedWindowFromMs) {
    throw new Exp021MaturationShadowStratumSemanticMismatchError(
      'Stratum windowFrom must equal windowTo - queryGeometryMs',
    );
  }
}

export function assertFamilyScheduleMatchesPersisted(
  existing: Pick<Exp021MaturationShadowWindowFamily, 'plannedAgesMsExact' | 'policyDelayProbeMs'>,
  proposed: { plannedAgesMsExact: number[]; policyDelayProbeMs: number },
): void {
  if (!plannedAgesMsExactEqual(existing.plannedAgesMsExact, proposed.plannedAgesMsExact)) {
    throw new Exp021MaturationShadowFamilyIdentityError(
      'Frozen family plannedAgesMsExact mismatch for canonical identity',
    );
  }
  if (existing.policyDelayProbeMs !== proposed.policyDelayProbeMs) {
    throw new Exp021MaturationShadowFamilyIdentityError(
      'Frozen family policyDelayProbeMs mismatch for canonical identity',
    );
  }
}

export function canonicalJsonFingerprint(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalJsonFingerprint(entry)).join(',')}]`;
  }
  const objectValue = value as Record<string, unknown>;
  const keys = Object.keys(objectValue).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJsonFingerprint(objectValue[key])}`).join(',')}}`;
}

export function jsonValuesSemanticallyEqual(a: unknown, b: unknown): boolean {
  return canonicalJsonFingerprint(a) === canonicalJsonFingerprint(b);
}

export function assertPlannedAgeOnFamilySchedule(
  family: Pick<Exp021MaturationShadowWindowFamily, 'plannedAgesMsExact'>,
  plannedAgeMs: number,
): void {
  if (!family.plannedAgesMsExact.includes(plannedAgeMs)) {
    throw new Exp021MaturationShadowOffScheduleSlotError(
      `plannedAgeMs ${plannedAgeMs} is not in family frozen schedule`,
    );
  }
}

export function deriveCanonicalActualAgeMs(requestStartedAt: Date, windowTo: Date): number {
  return requestStartedAt.getTime() - windowTo.getTime();
}

export function deriveSchedulerDriftMs(actualAgeMs: number, plannedAgeMs: number): number {
  return actualAgeMs - plannedAgeMs;
}

export function assertRequestTimeOrder(requestStartedAt: Date, requestCompletedAt: Date | null | undefined): void {
  if (requestCompletedAt == null) return;
  if (requestCompletedAt.getTime() < requestStartedAt.getTime()) {
    throw new Exp021MaturationShadowAttemptAuthorityError(
      'requestCompletedAt must be >= requestStartedAt',
    );
  }
}

export function assertAttemptParentAuthority(input: {
  slotPlannedAgeMs: number;
  proposedPlannedAgeMs: number;
  stratumQuerySemanticsHash: string;
  stratumSignalSetHash: string;
  proposedQuerySemanticsHash: string;
  proposedSignalSetHash: string;
  requestStartedAt: Date;
  requestCompletedAt?: Date | null;
  windowTo: Date;
}): { actualAgeMs: number; schedulerDriftMs: number; querySemanticsHash: string; signalSetHash: string } {
  if (input.proposedPlannedAgeMs !== input.slotPlannedAgeMs) {
    throw new Exp021MaturationShadowAttemptAuthorityError(
      'Attempt plannedAgeMs must equal parent ObservationSlot.plannedAgeMs',
    );
  }
  if (input.proposedQuerySemanticsHash !== input.stratumQuerySemanticsHash) {
    throw new Exp021MaturationShadowAttemptAuthorityError(
      'Attempt querySemanticsHash must equal frozen stratum querySemanticsHash',
    );
  }
  if (input.proposedSignalSetHash !== input.stratumSignalSetHash) {
    throw new Exp021MaturationShadowAttemptAuthorityError(
      'Attempt signalSetHash must equal frozen stratum signalSetHash',
    );
  }

  assertRequestTimeOrder(input.requestStartedAt, input.requestCompletedAt);

  const actualAgeMs = deriveCanonicalActualAgeMs(input.requestStartedAt, input.windowTo);
  if (actualAgeMs < 0) {
    throw new Exp021MaturationShadowAttemptAuthorityError(
      'actualAgeMs must be >= 0; requestStartedAt must not precede windowTo',
    );
  }
  const schedulerDriftMs = deriveSchedulerDriftMs(actualAgeMs, input.slotPlannedAgeMs);

  return {
    actualAgeMs,
    schedulerDriftMs,
    querySemanticsHash: input.stratumQuerySemanticsHash,
    signalSetHash: input.stratumSignalSetHash,
  };
}

function isNonEmptyString(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

export function assertProviderOutcomeConsistency(input: {
  providerRequestSucceeded: boolean;
  providerOutcomeClass: Exp021MaturationShadowProviderOutcomeClass;
  providerErrorClass?: string | null;
  uniqueBucketLocusCount?: number | null;
}): void {
  const bucketCount = input.uniqueBucketLocusCount;
  const errorClass = input.providerErrorClass;

  switch (input.providerOutcomeClass) {
    case 'PROVIDER_ERROR':
      if (input.providerRequestSucceeded) {
        throw new Exp021MaturationShadowProviderOutcomeConsistencyError(
          'PROVIDER_ERROR requires providerRequestSucceeded=false',
        );
      }
      if (!isNonEmptyString(errorClass)) {
        throw new Exp021MaturationShadowProviderOutcomeConsistencyError(
          'PROVIDER_ERROR requires non-empty providerErrorClass',
        );
      }
      if (bucketCount != null) {
        throw new Exp021MaturationShadowProviderOutcomeConsistencyError(
          'PROVIDER_ERROR requires uniqueBucketLocusCount to be null or undefined',
        );
      }
      return;
    case 'PROVIDER_SUCCESS_ZERO':
      if (!input.providerRequestSucceeded) {
        throw new Exp021MaturationShadowProviderOutcomeConsistencyError(
          'PROVIDER_SUCCESS_ZERO requires providerRequestSucceeded=true',
        );
      }
      if (errorClass != null && errorClass !== '') {
        throw new Exp021MaturationShadowProviderOutcomeConsistencyError(
          'PROVIDER_SUCCESS_ZERO requires providerErrorClass=null',
        );
      }
      if (bucketCount !== 0) {
        throw new Exp021MaturationShadowProviderOutcomeConsistencyError(
          'PROVIDER_SUCCESS_ZERO requires uniqueBucketLocusCount=0',
        );
      }
      return;
    case 'PROVIDER_SUCCESS_NONZERO':
      if (!input.providerRequestSucceeded) {
        throw new Exp021MaturationShadowProviderOutcomeConsistencyError(
          'PROVIDER_SUCCESS_NONZERO requires providerRequestSucceeded=true',
        );
      }
      if (errorClass != null && errorClass !== '') {
        throw new Exp021MaturationShadowProviderOutcomeConsistencyError(
          'PROVIDER_SUCCESS_NONZERO requires providerErrorClass=null',
        );
      }
      if (bucketCount == null || bucketCount <= 0) {
        throw new Exp021MaturationShadowProviderOutcomeConsistencyError(
          'PROVIDER_SUCCESS_NONZERO requires uniqueBucketLocusCount > 0',
        );
      }
      return;
    default:
      throw new Exp021MaturationShadowProviderOutcomeConsistencyError(
        `Unsupported providerOutcomeClass: ${input.providerOutcomeClass}`,
      );
  }
}
