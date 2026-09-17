import type {
  Exp021MaturationShadowProviderOutcomeClass,
  Exp021MaturationShadowSignalLane,
} from '@prisma/client';
import type { Exp021MaturationShadowActivityCohort } from './reference-capture-exp021-maturation-shadow-activity-classification.lib';
import type { Exp021MaturationShadowQueryGeometryMs } from './reference-capture-exp021-maturation-shadow.types';

export type Exp021MaturationShadowM3CensoringClass =
  | 'INTERVAL_CENSORED'
  | 'LEFT_CENSORED'
  | 'RIGHT_CENSORED'
  | 'NO_VALID_PROVIDER_EVIDENCE';

export type Exp021MaturationShadowM3AnalysisScope = {
  organizationId?: string;
  vehicleId?: string;
  tokenId?: number;
  windowFamilyId?: string;
  signalLane?: Exp021MaturationShadowSignalLane;
  queryGeometryMs?: Exp021MaturationShadowQueryGeometryMs;
  activityClass?: Exp021MaturationShadowActivityCohort;
  canonicalWindowToFrom?: Date;
  canonicalWindowToTo?: Date;
};

export type Exp021MaturationShadowM3AttemptInput = {
  id: string;
  observationSlotId: string;
  attemptOrdinal: number;
  plannedAgeMs: number;
  actualAgeMs: number;
  schedulerDriftMs: number;
  providerRequestSucceeded: boolean;
  providerOutcomeClass: Exp021MaturationShadowProviderOutcomeClass;
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
};

export type Exp021MaturationShadowM3StratumInput = {
  id: string;
  windowFamilyId: string;
  signalLane: Exp021MaturationShadowSignalLane;
  queryGeometryMs: Exp021MaturationShadowQueryGeometryMs;
  windowFrom: Date;
  windowTo: Date;
  signalSetHash: string;
  querySemanticsHash: string;
  runtimeBuildShaAtEnrollment: string;
  activityClassificationJson: unknown;
  attempts: Exp021MaturationShadowM3AttemptInput[];
};

export type Exp021MaturationShadowM3FamilyInput = {
  id: string;
  organizationId: string;
  vehicleId: string;
  tokenId: number;
  canonicalWindowTo: Date;
  shadowScheduleVersion: string;
  plannedAgesMsExact: number[];
  policyDelayProbeMs: number;
  strata: Exp021MaturationShadowM3StratumInput[];
};

export type Exp021MaturationShadowM3EligibilityExclusion = {
  scope: 'FAMILY' | 'STRATUM';
  id: string;
  reason: string;
};

export type Exp021MaturationShadowM3BucketLocusReconstruction = {
  loci: string[];
  uniqueCount: number;
  persistedUniqueCount: number | null;
  persistedCountConsistent: boolean;
  identityVersion: string;
};

export type Exp021MaturationShadowM3MaturationObservation = {
  attemptId: string;
  plannedAgeMs: number;
  actualAgeMs: number;
  schedulerDriftMs: number;
  providerOutcomeClass: Exp021MaturationShadowProviderOutcomeClass;
  reconstructedUniqueBucketLocusCount: number;
  newBucketLociVsPriorAge: number;
  cumulativeBucketLocusUnionCount: number;
  bucketLocusCoverageRatioVsFinalObservedUnion: number | null;
  payloadRevisionCount: number | null;
  changedPayloadLocusCount: number | null;
};

export type Exp021MaturationShadowM3AvailabilityTransition = {
  windowFamilyId: string;
  windowStratumId: string;
  signalLane: Exp021MaturationShadowSignalLane;
  queryGeometryMs: Exp021MaturationShadowQueryGeometryMs;
  activityClass: Exp021MaturationShadowActivityCohort;
  semanticCohortId: string;
  lastNegativeAgeMs: number | null;
  firstPositiveAgeMs: number | null;
  firstNonZeroActualAgeMs: number | null;
  lowerBoundExclusiveMs: number | null;
  upperBoundInclusiveMs: number | null;
  censoringClass: Exp021MaturationShadowM3CensoringClass;
  providerErrorAgesMs: number[];
};

export type Exp021MaturationShadowM3StratumAnalysis = {
  windowStratumId: string;
  windowFamilyId: string;
  signalLane: Exp021MaturationShadowSignalLane;
  queryGeometryMs: Exp021MaturationShadowQueryGeometryMs;
  activityClass: Exp021MaturationShadowActivityCohort;
  semanticCohortId: string;
  eligible: boolean;
  exclusions: Exp021MaturationShadowM3EligibilityExclusion[];
  finalShadowObservedUnionLabel: string;
  finalShadowObservedUnionLoci: string[];
  finalShadowObservedUnionCount: number;
  perFieldFinalObservedUnion: Record<string, string[]>;
  maturationObservations: Exp021MaturationShadowM3MaturationObservation[];
  availabilityTransition: Exp021MaturationShadowM3AvailabilityTransition;
  providerQuality: {
    providerAttempts: number;
    providerSuccesses: number;
    providerErrors: number;
    providerErrorRate: number | null;
    providerErrorClassDistribution: Record<string, number>;
    providerStatusDistribution: Record<string, number>;
    successfulZeroObservations: number;
    successfulNonZeroObservations: number;
  };
  schedulerDriftByPlannedAge: Array<{
    plannedAgeMs: number;
    actualAgeMsValues: number[];
    schedulerDriftMsValues: number[];
    medianDriftMs: number | null;
    p25DriftMs: number | null;
    p75DriftMs: number | null;
    minDriftMs: number | null;
    maxDriftMs: number | null;
  }>;
};

export type Exp021MaturationShadowM3PairedGeometryObservation = {
  windowFamilyId: string;
  signalLane: Exp021MaturationShadowSignalLane;
  semanticCohortId60: string;
  semanticCohortId90: string;
  activityClass60: Exp021MaturationShadowActivityCohort;
  activityClass90: Exp021MaturationShadowActivityCohort;
  firstNonZeroActualAgeMs60: number | null;
  firstNonZeroActualAgeMs90: number | null;
  transition60: Pick<
    Exp021MaturationShadowM3AvailabilityTransition,
    'censoringClass' | 'lowerBoundExclusiveMs' | 'upperBoundInclusiveMs' | 'providerErrorAgesMs'
  >;
  transition90: Pick<
    Exp021MaturationShadowM3AvailabilityTransition,
    'censoringClass' | 'lowerBoundExclusiveMs' | 'upperBoundInclusiveMs' | 'providerErrorAgesMs'
  >;
  coverageByActualAgeMs60: Array<{ actualAgeMs: number; coverageRatio: number | null }>;
  coverageByActualAgeMs90: Array<{ actualAgeMs: number; coverageRatio: number | null }>;
  schedulerDriftSummary60: { medianMs: number | null; p25Ms: number | null; p75Ms: number | null };
  schedulerDriftSummary90: { medianMs: number | null; p25Ms: number | null; p75Ms: number | null };
};

export type Exp021MaturationShadowM3AggregateCounts = {
  primarySamplingUnit: 'WINDOW_FAMILY';
  nWindowFamilies: number;
  nStrata: number;
  nValidProviderSuccessObservations: number;
  nProviderErrors: number;
  nSuccessfulZeroObservations: number;
  nSuccessfulNonZeroObservations: number;
};

export type Exp021MaturationShadowM3DescriptiveSummary = {
  availabilityAmongProviderSuccesses: {
    numerator: number;
    denominator: number;
    observedProportion: number | null;
    wilson95Lower: number | null;
    wilson95Upper: number | null;
  };
  bucketLocusCoverageRatio: {
    median: number | null;
    p25: number | null;
    p75: number | null;
    sampleCount: number;
  };
};

export type Exp021MaturationShadowM3AnalysisResult = {
  exportSchemaVersion: string;
  generatedAt: string;
  scope: Exp021MaturationShadowM3AnalysisScope;
  aggregateCounts: Exp021MaturationShadowM3AggregateCounts;
  eligibilityExclusions: Exp021MaturationShadowM3EligibilityExclusion[];
  stratumAnalyses: Exp021MaturationShadowM3StratumAnalysis[];
  pairedGeometryObservations: Exp021MaturationShadowM3PairedGeometryObservation[];
  descriptiveByStratum: Record<
    string,
    Exp021MaturationShadowM3DescriptiveSummary & { perStratumN: Exp021MaturationShadowM3AggregateCounts }
  >;
  semanticCohortMismatchBlocked: boolean;
  semanticCohortMismatchReason: string | null;
};
