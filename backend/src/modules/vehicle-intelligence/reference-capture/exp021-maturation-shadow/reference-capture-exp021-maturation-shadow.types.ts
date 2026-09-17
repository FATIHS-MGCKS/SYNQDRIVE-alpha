import type {
  Exp021MaturationShadowProviderOutcomeClass,
  Exp021MaturationShadowScientificClassification,
  Exp021MaturationShadowSignalLane,
  Exp021MaturationShadowWindowLifecycle,
  Exp021MaturationShadowWindowTerminalState,
  Prisma,
} from '@prisma/client';

/** Default disabled — no runtime execution in PR-M1. */
export const EXP021_MATURATION_SHADOW_ENABLED_DEFAULT = false;

export const EXP021_MATURATION_SHADOW_SCHEDULE_VERSION_V1 = 'MATURATION_SHADOW_SCHEDULE_v1';

export const EXP021_MATURATION_SHADOW_QUERY_GEOMETRIES_MS = [60_000, 90_000] as const;

export type Exp021MaturationShadowQueryGeometryMs =
  (typeof EXP021_MATURATION_SHADOW_QUERY_GEOMETRIES_MS)[number];

export type Exp021MaturationShadowFamilyIdentity = {
  organizationId: string;
  vehicleId: string;
  tokenId: number;
  canonicalWindowTo: Date;
  shadowScheduleVersion: string;
};

export type Exp021MaturationShadowStratumIdentity = {
  windowFamilyId: string;
  signalLane: Exp021MaturationShadowSignalLane;
  queryGeometryMs: Exp021MaturationShadowQueryGeometryMs;
};

export type Exp021MaturationShadowStratumImmutableAttributes = {
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
  manifestIdentifier?: string | null;
  manifestHash?: string | null;
  runtimeBuildShaAtEnrollment: string;
  activityClassificationJson?: Prisma.JsonValue;
};

export type Exp021MaturationShadowAttemptRawFacts = {
  plannedAgeMs: number;
  requestStartedAt: Date;
  requestCompletedAt?: Date | null;
  runtimeBuildSha: string;
  querySemanticsHash: string;
  signalSetHash: string;
  providerRequestSucceeded: boolean;
  providerOutcomeClass: Exp021MaturationShadowProviderOutcomeClass;
  providerStatus?: string | null;
  providerErrorClass?: string | null;
  uniqueBucketLocusCount?: number | null;
  uniqueTemporalBucketStartCount?: number | null;
  perFieldRowCountJson?: Prisma.InputJsonValue;
  perFieldBucketLocusCountJson?: Prisma.InputJsonValue;
  firstProviderTimestamp?: Date | null;
  lastProviderTimestamp?: Date | null;
  bucketLocusManifestJson?: Prisma.InputJsonValue;
  bucketLocusIdentityVersion?: string | null;
  duplicateCount?: number | null;
  payloadRevisionCount?: number | null;
  changedPayloadLocusCount?: number | null;
  nearestPriorAgeBucketDeltaMs?: number | null;
  queryProvenanceJson?: Prisma.InputJsonValue;
};

export type Exp021MaturationShadowConfig = {
  enabled: boolean;
  shadowScheduleVersion: string;
};

export function defaultExp021MaturationShadowConfig(): Exp021MaturationShadowConfig {
  return {
    enabled: EXP021_MATURATION_SHADOW_ENABLED_DEFAULT,
    shadowScheduleVersion: EXP021_MATURATION_SHADOW_SCHEDULE_VERSION_V1,
  };
}

export type Exp021MaturationShadowLifecycleFields = {
  lifecycleState?: Exp021MaturationShadowWindowLifecycle;
  terminalState?: Exp021MaturationShadowWindowTerminalState | null;
  scientificClassification?: Exp021MaturationShadowScientificClassification | null;
};
