import type { BatteryGroundTruthType, BatteryGroundTruthSourceAuthority } from '@prisma/client';
import type { F5_LONGITUDINAL_SCOPE_AUTHORITY } from './f5-ground-truth-correlation.constants';

export type F5GroundTruthTemporalRegionV1 =
  | 'PRE_EVENT'
  | 'INTERVENTION_WINDOW'
  | 'POST_EVENT'
  | 'UNKNOWN';

export type F5NatNaturalEvidenceStatusV1 = 'NONE' | 'PRESENT';
export type F5NatValidationSampleMaturityV1 = 'NOT_EVALUATED';

export type F5GroundTruthCorrelationBlockV2 = {
  linkageAvailable: boolean;
  replacementLabelsAvailable: boolean;
  nat008Owner: 'M3.3G';
  nat009Owner: 'M3.3G';
  longitudinalScopeAuthority: typeof F5_LONGITUDINAL_SCOPE_AUTHORITY;
  correlation: {
    admissibleActiveGroundTruthCount: number;
    workshopMeasurementGroundTruthCount: number;
    batteryReplacementGroundTruthCount: number;
    affectedVehicleCount: number;
    segmentationAvailable: boolean;
    activeReplacementBoundaryCount: number;
    deterministicSegmentEpochCount: number;
    segmentAssignedRevisionCount: number;
    interventionCrossingRevisionCount: number;
    unlabeledRevisionCount: number;
    missingAnchorRevisionCount: number;
    totalDerivedSegmentCount: number;
    maxSegmentCountPerVehicle: number;
    continuityMetricsSegmentAware: true;
    prePostReplacementPoolingBlockedBySegmentAssignment: boolean;
    temporalRegionRevisionBoundaryPairCounts: {
      preEvent: number;
      interventionWindow: number;
      postEvent: number;
      missingAnchorInterval: number;
    };
    temporalRegionPairDenominator: 'primary_cohort_revision_x_admissible_replacement_boundary';
    rejectedCrossScopeCount: number;
    gtQueryScope: 'PRIMARY_COHORT_ORG_VEHICLE_PAIRS';
  };
  nat008: {
    infrastructureStatus: 'IMPLEMENTED';
    naturalEvidenceStatus: F5NatNaturalEvidenceStatusV1;
    naturalEvidenceCount: number;
    validationSampleMaturity: F5NatValidationSampleMaturityV1;
  };
  nat009: {
    infrastructureStatus: 'IMPLEMENTED';
    naturalEvidenceStatus: F5NatNaturalEvidenceStatusV1;
    naturalEvidenceCount: number;
    validationSampleMaturity: F5NatValidationSampleMaturityV1;
  };
  cal007: {
    nonCausal: true;
    causalityIntroduced: false;
  };
  temporalAuthority: {
    interventionTimeField: 'effectiveAt';
    evidenceIntervalFields: ['firstIncludedAnchorAt', 'lastIncludedAnchorAt'];
    groundTruthHistoricalAuthority: 'isGroundTruthActiveAtAsOf';
    groundTruthKnowledgeCutoff: 'createdAt<=asOf lifecycle knowledge; effectiveAt<=asOf admissible GT; no revocation/supersession by asOf';
    numericInterventionEnvelope: 'NONE';
  };
};

export type F5GroundTruthRowForCorrelation = {
  id: string;
  organizationId: string;
  vehicleId: string;
  groundTruthType: BatteryGroundTruthType;
  batteryScope: import('@prisma/client').BatteryEvidenceScope;
  sourceAuthority: BatteryGroundTruthSourceAuthority;
  effectiveAt: Date;
  createdAt: Date;
  verificationStatus: import('@prisma/client').BatteryGroundTruthVerificationStatus;
  supersedesGroundTruthEventId: string | null;
  revocations: { revokedAt: Date }[];
};

export type F5RevisionEvidenceInterval = {
  revisionId: string;
  organizationId: string;
  vehicleId: string;
  firstIncludedAnchorAt: Date | null;
  lastIncludedAnchorAt: Date | null;
};

export type F5SegmentationSummaryForCorrelation = {
  segmentAssignedRevisionCount: number;
  interventionCrossingRevisionCount: number;
  unlabeledRevisionCount: number;
  missingAnchorRevisionCount: number;
  totalDerivedSegmentCount: number;
  maxSegmentCountPerVehicle: number;
  prePostReplacementPoolingBlockedBySegmentAssignment: boolean;
};
