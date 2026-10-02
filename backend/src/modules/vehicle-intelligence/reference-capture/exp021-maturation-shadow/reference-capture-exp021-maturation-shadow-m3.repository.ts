import type { Prisma, PrismaClient } from '@prisma/client';
import type {
  Exp021MaturationShadowM3AnalysisScope,
  Exp021MaturationShadowM3AttemptInput,
  Exp021MaturationShadowM3FamilyInput,
} from './reference-capture-exp021-maturation-shadow-m3.types';
import { EXP021_MATURATION_SHADOW_QUERY_GEOMETRIES_MS } from './reference-capture-exp021-maturation-shadow.types';

function buildFamilyWhere(scope: Exp021MaturationShadowM3AnalysisScope): Prisma.Exp021MaturationShadowWindowFamilyWhereInput {
  const where: Prisma.Exp021MaturationShadowWindowFamilyWhereInput = {};
  if (scope.organizationId) where.organizationId = scope.organizationId;
  if (scope.vehicleId) where.vehicleId = scope.vehicleId;
  if (scope.tokenId != null) where.tokenId = scope.tokenId;
  if (scope.windowFamilyId) where.id = scope.windowFamilyId;
  if (scope.canonicalWindowToFrom || scope.canonicalWindowToTo) {
    where.canonicalWindowTo = {};
    if (scope.canonicalWindowToFrom) where.canonicalWindowTo.gte = scope.canonicalWindowToFrom;
    if (scope.canonicalWindowToTo) where.canonicalWindowTo.lte = scope.canonicalWindowToTo;
  }
  return where;
}

function mapAttempt(row: {
  id: string;
  observationSlotId: string;
  attemptOrdinal: number;
  plannedAgeMs: number;
  actualAgeMs: number;
  schedulerDriftMs: number;
  providerRequestSucceeded: boolean;
  providerOutcomeClass: Exp021MaturationShadowM3AttemptInput['providerOutcomeClass'];
  providerStatus: string | null;
  providerErrorClass: string | null;
  uniqueBucketLocusCount: number | null;
  perFieldBucketLocusCountJson: unknown;
  bucketLocusManifestJson: unknown;
  bucketLocusIdentityVersion: string | null;
  payloadRevisionCount: number | null;
  changedPayloadLocusCount: number | null;
  signalSetHash: string;
  querySemanticsHash: string;
  runtimeBuildSha: string;
}): Exp021MaturationShadowM3AttemptInput {
  return {
    id: row.id,
    observationSlotId: row.observationSlotId,
    attemptOrdinal: row.attemptOrdinal,
    plannedAgeMs: row.plannedAgeMs,
    actualAgeMs: row.actualAgeMs,
    schedulerDriftMs: row.schedulerDriftMs,
    providerRequestSucceeded: row.providerRequestSucceeded,
    providerOutcomeClass: row.providerOutcomeClass,
    providerStatus: row.providerStatus,
    providerErrorClass: row.providerErrorClass,
    uniqueBucketLocusCount: row.uniqueBucketLocusCount,
    perFieldBucketLocusCountJson: row.perFieldBucketLocusCountJson,
    bucketLocusManifestJson: row.bucketLocusManifestJson,
    bucketLocusIdentityVersion: row.bucketLocusIdentityVersion,
    payloadRevisionCount: row.payloadRevisionCount,
    changedPayloadLocusCount: row.changedPayloadLocusCount,
    signalSetHash: row.signalSetHash,
    querySemanticsHash: row.querySemanticsHash,
    runtimeBuildSha: row.runtimeBuildSha,
  };
}

export async function loadExp021MaturationShadowFamiliesForM3(
  prisma: PrismaClient,
  scope: Exp021MaturationShadowM3AnalysisScope,
): Promise<Exp021MaturationShadowM3FamilyInput[]> {
  if (!scope.organizationId || !scope.vehicleId) {
    throw new Error('M3 analysis scope requires explicit organizationId and vehicleId');
  }

  const families = await prisma.exp021MaturationShadowWindowFamily.findMany({
    where: buildFamilyWhere(scope),
    include: {
      strata: {
        include: {
          slots: {
            include: {
              attempts: {
                orderBy: [{ actualAgeMs: 'asc' }, { attemptOrdinal: 'asc' }],
              },
            },
          },
        },
      },
    },
    orderBy: { id: 'asc' },
  });

  return families.map((family) => ({
    id: family.id,
    organizationId: family.organizationId,
    vehicleId: family.vehicleId,
    tokenId: family.tokenId,
    canonicalWindowTo: family.canonicalWindowTo,
    shadowScheduleVersion: family.shadowScheduleVersion,
    plannedAgesMsExact: family.plannedAgesMsExact,
    policyDelayProbeMs: family.policyDelayProbeMs,
    strata: family.strata
      .filter((stratum) => {
        if (scope.signalLane && stratum.signalLane !== scope.signalLane) return false;
        if (scope.queryGeometryMs && stratum.queryGeometryMs !== scope.queryGeometryMs) return false;
        return (EXP021_MATURATION_SHADOW_QUERY_GEOMETRIES_MS as readonly number[]).includes(
          stratum.queryGeometryMs,
        );
      })
      .sort((a, b) => {
        const laneCmp = a.signalLane.localeCompare(b.signalLane);
        if (laneCmp !== 0) return laneCmp;
        return a.queryGeometryMs - b.queryGeometryMs;
      })
      .map((stratum) => ({
        id: stratum.id,
        windowFamilyId: stratum.windowFamilyId,
        signalLane: stratum.signalLane,
        queryGeometryMs: stratum.queryGeometryMs as 60_000 | 90_000,
        windowFrom: stratum.windowFrom,
        windowTo: stratum.windowTo,
        signalSetHash: stratum.signalSetHash,
        querySemanticsHash: stratum.querySemanticsHash,
        runtimeBuildShaAtEnrollment: stratum.runtimeBuildShaAtEnrollment,
        activityClassificationJson: stratum.activityClassificationJson,
        attempts: stratum.slots
          .flatMap((slot) => slot.attempts.map((attempt) => mapAttempt(attempt)))
          .sort((a, b) => {
            if (a.actualAgeMs !== b.actualAgeMs) return a.actualAgeMs - b.actualAgeMs;
            return a.attemptOrdinal - b.attemptOrdinal;
          }),
      })),
  }));
}
