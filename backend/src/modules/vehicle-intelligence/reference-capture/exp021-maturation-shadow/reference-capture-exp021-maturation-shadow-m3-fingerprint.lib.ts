import { createHash } from 'crypto';
import type { PrismaClient } from '@prisma/client';
import {
  captureCanonicalStateFingerprint,
  fingerprintDigest,
  fingerprintsIdentical,
  type Exp021MaturationShadowCanonicalFingerprint,
} from './reference-capture-exp021-maturation-shadow-canonical-fingerprint.lib';

export type Exp021MaturationShadowM3ScientificFingerprint = {
  windowFamilyCount: number;
  windowStratumCount: number;
  observationSlotCount: number;
  observationAttemptCount: number;
  contentDigest: string;
};

function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

function stableIso(value: Date | null | undefined): string | null {
  return value == null ? null : value.toISOString();
}

function stableJson(value: unknown): unknown {
  if (value == null) return null;
  if (Array.isArray(value)) return value.map(stableJson);
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      sorted[key] = stableJson(record[key]);
    }
    return sorted;
  }
  return value;
}

function serializeScientificContent(rows: {
  families: Array<{
    id: string;
    organizationId: string;
    vehicleId: string;
    tokenId: number;
    canonicalWindowTo: Date;
    shadowScheduleVersion: string;
    enrollmentEventId: string;
    plannedAgesMsExact: number[];
    policyDelayProbeMs: number;
    createdUnderRuntimeSha: string;
    lifecycleState: string;
    terminalState: string | null;
    scientificClassification: string | null;
  }>;
  strata: Array<{
    id: string;
    windowFamilyId: string;
    signalLane: string;
    queryGeometryMs: number;
    windowFrom: Date;
    windowTo: Date;
    resolvedProviderFields: string[];
    resolvedProviderFieldsCanonicalSorted: string[];
    signalSetHash: string;
    signalSetVersion: string;
    querySemanticsHash: string;
    queryBuilderSemanticVersionOrHash: string;
    queryBoundarySemanticVersion: string;
    interval: string;
    aggregation: string;
    manifestIdentifier: string | null;
    manifestHash: string | null;
    runtimeBuildShaAtEnrollment: string;
    activityClassificationJson: unknown;
  }>;
  slots: Array<{
    id: string;
    windowStratumId: string;
    plannedAgeMs: number;
    bullJobId: string | null;
  }>;
  attempts: Array<{
    id: string;
    observationSlotId: string;
    attemptOrdinal: number;
    plannedAgeMs: number;
    actualAgeMs: number;
    schedulerDriftMs: number;
    requestStartedAt: Date;
    requestCompletedAt: Date | null;
    runtimeBuildSha: string;
    querySemanticsHash: string;
    signalSetHash: string;
    providerRequestSucceeded: boolean;
    providerOutcomeClass: string;
    providerStatus: string | null;
    providerErrorClass: string | null;
    uniqueBucketLocusCount: number | null;
    uniqueTemporalBucketStartCount: number | null;
    perFieldRowCountJson: unknown;
    perFieldBucketLocusCountJson: unknown;
    firstProviderTimestamp: Date | null;
    lastProviderTimestamp: Date | null;
    bucketLocusManifestJson: unknown;
    bucketLocusIdentityVersion: string | null;
    duplicateCount: number | null;
    payloadRevisionCount: number | null;
    changedPayloadLocusCount: number | null;
    nearestPriorAgeBucketDeltaMs: number | null;
    newBucketLociVsPriorAge: number | null;
    missingPriorBucketLociAtThisAge: number | null;
    cumulativeBucketLocusUnionCount: number | null;
    bucketLocusCoverageRatioVsFinalObservedUnion: number | null;
    queryProvenanceJson: unknown;
  }>;
}): string {
  const payload = {
    families: rows.families.map((family) => ({
      id: family.id,
      organizationId: family.organizationId,
      vehicleId: family.vehicleId,
      tokenId: family.tokenId,
      canonicalWindowTo: stableIso(family.canonicalWindowTo),
      shadowScheduleVersion: family.shadowScheduleVersion,
      enrollmentEventId: family.enrollmentEventId,
      plannedAgesMsExact: family.plannedAgesMsExact,
      policyDelayProbeMs: family.policyDelayProbeMs,
      createdUnderRuntimeSha: family.createdUnderRuntimeSha,
      lifecycleState: family.lifecycleState,
      terminalState: family.terminalState,
      scientificClassification: family.scientificClassification,
    })),
    strata: rows.strata.map((stratum) => ({
      id: stratum.id,
      windowFamilyId: stratum.windowFamilyId,
      signalLane: stratum.signalLane,
      queryGeometryMs: stratum.queryGeometryMs,
      windowFrom: stableIso(stratum.windowFrom),
      windowTo: stableIso(stratum.windowTo),
      resolvedProviderFields: stratum.resolvedProviderFields,
      resolvedProviderFieldsCanonicalSorted: stratum.resolvedProviderFieldsCanonicalSorted,
      signalSetHash: stratum.signalSetHash,
      signalSetVersion: stratum.signalSetVersion,
      querySemanticsHash: stratum.querySemanticsHash,
      queryBuilderSemanticVersionOrHash: stratum.queryBuilderSemanticVersionOrHash,
      queryBoundarySemanticVersion: stratum.queryBoundarySemanticVersion,
      interval: stratum.interval,
      aggregation: stratum.aggregation,
      manifestIdentifier: stratum.manifestIdentifier,
      manifestHash: stratum.manifestHash,
      runtimeBuildShaAtEnrollment: stratum.runtimeBuildShaAtEnrollment,
      activityClassificationJson: stableJson(stratum.activityClassificationJson),
    })),
    slots: rows.slots.map((slot) => ({
      id: slot.id,
      windowStratumId: slot.windowStratumId,
      plannedAgeMs: slot.plannedAgeMs,
      bullJobId: slot.bullJobId,
    })),
    attempts: rows.attempts.map((attempt) => ({
      id: attempt.id,
      observationSlotId: attempt.observationSlotId,
      attemptOrdinal: attempt.attemptOrdinal,
      plannedAgeMs: attempt.plannedAgeMs,
      actualAgeMs: attempt.actualAgeMs,
      schedulerDriftMs: attempt.schedulerDriftMs,
      requestStartedAt: stableIso(attempt.requestStartedAt),
      requestCompletedAt: stableIso(attempt.requestCompletedAt),
      runtimeBuildSha: attempt.runtimeBuildSha,
      querySemanticsHash: attempt.querySemanticsHash,
      signalSetHash: attempt.signalSetHash,
      providerRequestSucceeded: attempt.providerRequestSucceeded,
      providerOutcomeClass: attempt.providerOutcomeClass,
      providerStatus: attempt.providerStatus,
      providerErrorClass: attempt.providerErrorClass,
      uniqueBucketLocusCount: attempt.uniqueBucketLocusCount,
      uniqueTemporalBucketStartCount: attempt.uniqueTemporalBucketStartCount,
      perFieldRowCountJson: stableJson(attempt.perFieldRowCountJson),
      perFieldBucketLocusCountJson: stableJson(attempt.perFieldBucketLocusCountJson),
      firstProviderTimestamp: stableIso(attempt.firstProviderTimestamp),
      lastProviderTimestamp: stableIso(attempt.lastProviderTimestamp),
      bucketLocusManifestJson: stableJson(attempt.bucketLocusManifestJson),
      bucketLocusIdentityVersion: attempt.bucketLocusIdentityVersion,
      duplicateCount: attempt.duplicateCount,
      payloadRevisionCount: attempt.payloadRevisionCount,
      changedPayloadLocusCount: attempt.changedPayloadLocusCount,
      nearestPriorAgeBucketDeltaMs: attempt.nearestPriorAgeBucketDeltaMs,
      newBucketLociVsPriorAge: attempt.newBucketLociVsPriorAge,
      missingPriorBucketLociAtThisAge: attempt.missingPriorBucketLociAtThisAge,
      cumulativeBucketLocusUnionCount: attempt.cumulativeBucketLocusUnionCount,
      bucketLocusCoverageRatioVsFinalObservedUnion: attempt.bucketLocusCoverageRatioVsFinalObservedUnion,
      queryProvenanceJson: stableJson(attempt.queryProvenanceJson),
    })),
  };

  return sha256Hex(JSON.stringify(payload));
}

export async function captureM3ScientificFingerprint(
  prisma: PrismaClient,
  scope: { organizationId?: string; vehicleId?: string },
): Promise<Exp021MaturationShadowM3ScientificFingerprint> {
  const familyWhere =
    scope.organizationId && scope.vehicleId
      ? { organizationId: scope.organizationId, vehicleId: scope.vehicleId }
      : {};

  const families = await prisma.exp021MaturationShadowWindowFamily.findMany({
    where: familyWhere,
    orderBy: { id: 'asc' },
  });
  const strata = await prisma.exp021MaturationShadowWindow.findMany({
    where: familyWhere.organizationId
      ? { family: { organizationId: familyWhere.organizationId, vehicleId: familyWhere.vehicleId } }
      : {},
    orderBy: [{ windowFamilyId: 'asc' }, { signalLane: 'asc' }, { queryGeometryMs: 'asc' }],
  });
  const slots = await prisma.exp021MaturationShadowObservationSlot.findMany({
    where: familyWhere.organizationId
      ? { stratum: { family: { organizationId: familyWhere.organizationId, vehicleId: familyWhere.vehicleId } } }
      : {},
    orderBy: [{ windowStratumId: 'asc' }, { plannedAgeMs: 'asc' }],
  });
  const attempts = await prisma.exp021MaturationShadowObservationAttempt.findMany({
    where: familyWhere.organizationId
      ? {
          slot: {
            stratum: { family: { organizationId: familyWhere.organizationId, vehicleId: familyWhere.vehicleId } },
          },
        }
      : {},
    orderBy: [{ observationSlotId: 'asc' }, { attemptOrdinal: 'asc' }],
  });

  const contentDigest = serializeScientificContent({
    families,
    strata,
    slots,
    attempts,
  });

  return {
    windowFamilyCount: families.length,
    windowStratumCount: strata.length,
    observationSlotCount: slots.length,
    observationAttemptCount: attempts.length,
    contentDigest,
  };
}

export function m3ScientificFingerprintDigest(fingerprint: Exp021MaturationShadowM3ScientificFingerprint): string {
  return sha256Hex(JSON.stringify(fingerprint));
}

export function m3ScientificFingerprintsIdentical(
  left: Exp021MaturationShadowM3ScientificFingerprint,
  right: Exp021MaturationShadowM3ScientificFingerprint,
): boolean {
  return m3ScientificFingerprintDigest(left) === m3ScientificFingerprintDigest(right);
}

export async function proveM3ReadOnlyNonInterference(
  prisma: PrismaClient,
  scope: { organizationId: string; vehicleId: string },
  runAnalysis: () => Promise<unknown>,
): Promise<{
  canonicalBefore: Exp021MaturationShadowCanonicalFingerprint;
  canonicalAfter: Exp021MaturationShadowCanonicalFingerprint;
  scientificBefore: Exp021MaturationShadowM3ScientificFingerprint;
  scientificAfter: Exp021MaturationShadowM3ScientificFingerprint;
  canonicalStateIdentical: boolean;
  scientificStateIdentical: boolean;
}> {
  const canonicalBefore = await captureCanonicalStateFingerprint(prisma, scope);
  const scientificBefore = await captureM3ScientificFingerprint(prisma, scope);

  await runAnalysis();

  const canonicalAfter = await captureCanonicalStateFingerprint(prisma, scope);
  const scientificAfter = await captureM3ScientificFingerprint(prisma, scope);

  return {
    canonicalBefore,
    canonicalAfter,
    scientificBefore,
    scientificAfter,
    canonicalStateIdentical: fingerprintsIdentical(canonicalBefore, canonicalAfter),
    scientificStateIdentical: m3ScientificFingerprintsIdentical(scientificBefore, scientificAfter),
  };
}

export { fingerprintDigest };
