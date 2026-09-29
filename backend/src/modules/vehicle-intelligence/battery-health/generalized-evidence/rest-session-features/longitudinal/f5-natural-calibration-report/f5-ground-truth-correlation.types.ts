import type { BatteryGroundTruthType } from '@prisma/client';
import type { F5MaturityStateV1 } from './f5-natural-calibration-report.types';
import type { F5_LONGITUDINAL_SCOPE_AUTHORITY } from './f5-ground-truth-correlation.constants';

export type F5GroundTruthTemporalRegionV1 =
  | 'PRE_EVENT'
  | 'INTERVENTION_WINDOW'
  | 'POST_EVENT'
  | 'UNKNOWN';

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
    prePostReplacementPoolingBlocked: true;
    temporalRegionCorrelationCounts: {
      preEvent: number;
      interventionWindow: number;
      postEvent: number;
      unknown: number;
    };
    rejectedCrossTenantCount: number;
    rejectedCrossVehicleCount: number;
    rejectedCrossScopeCount: number;
    rejectedNotActiveAtReadCount: number;
    rejectedKnowledgeAfterAsOfCount: number;
  };
  nat008: {
    infrastructureStatus: 'IMPLEMENTED';
    naturalEvidenceStatus: F5MaturityStateV1;
  };
  nat009: {
    infrastructureStatus: 'IMPLEMENTED';
    naturalEvidenceStatus: F5MaturityStateV1;
  };
  cal007: {
    nonCausal: true;
    causalityIntroduced: false;
  };
  temporalAuthority: {
    interventionTimeField: 'effectiveAt';
    evidenceIntervalFields: ['firstIncludedAnchorAt', 'lastIncludedAnchorAt'];
    groundTruthKnowledgeCutoff: 'createdAt<=asOf AND effectiveAt<=asOf';
    numericInterventionEnvelope: 'NONE';
  };
};

export type F5GroundTruthRowForCorrelation = {
  id: string;
  organizationId: string;
  vehicleId: string;
  groundTruthType: BatteryGroundTruthType;
  batteryScope: import('@prisma/client').BatteryEvidenceScope;
  effectiveAt: Date;
  createdAt: Date;
  verificationStatus: import('@prisma/client').BatteryGroundTruthVerificationStatus;
  revocations: { revokedAt: Date }[];
};

export type F5RevisionEvidenceInterval = {
  revisionId: string;
  organizationId: string;
  vehicleId: string;
  firstIncludedAnchorAt: Date | null;
  lastIncludedAnchorAt: Date | null;
};
