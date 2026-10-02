import type {
  M3_3F_F5_NATURAL_CALIBRATION_REPORT_CONTRACT_VERSION,
  M3_3F_F5_NATURAL_CALIBRATION_REPORT_CONTRACT_VERSION_V1,
} from './f5-natural-calibration-report.constants';
import type { F5GroundTruthCorrelationBlockV2 } from './f5-ground-truth-correlation.types';

export type F5MaturityStateV1 =
  | 'COLLECTING'
  | 'DISTRIBUTION_VISIBLE'
  | 'REPEATABILITY_VISIBLE'
  | 'CALIBRATION_CANDIDATE'
  | 'CALIBRATION_VALIDATION_PENDING';

export type F5CalBlockV1 = {
  calId: string;
  maturity: F5MaturityStateV1;
  primaryLimitation: string;
  canAdvanceToF6Now: false;
};

export type M3_3F_F5_NaturalCalibrationReportV1 = {
  meta: {
    reportContractVersion: typeof M3_3F_F5_NATURAL_CALIBRATION_REPORT_CONTRACT_VERSION_V1;
    generatedAt: string;
    asOf: string;
    cohort: string;
    readOnly: true;
  };
  runtimeAuthority: {
    acceptedBatteryRuntimeSha: string;
    observedProcessShaA: string | null;
    observedProcessShaB: string | null;
    d3EffectiveA: boolean | null;
    d3EffectiveB: boolean | null;
  };
  inventory: {
    c3RowsTotal: number;
    d3RevisionRowsTotal: number;
    ackRowsTotal: number;
    d3RevisionsPostFD3T0: number;
    d3RevisionsPostF46T0: number;
    uniqueVehiclesWithD3: number;
    evidenceSpanHours: number | null;
  };
  provenance: {
    f45rRevisionCount: number;
    f45r1RevisionCount: number;
    f46SustainedRevisionCount: number;
  };
  d4: {
    eligibleObservationCount: number;
    quarantinedCount: number;
    sourceEvidenceLimitedCount: number;
    provisionalSessionCount: number;
    excludedSessionCount: number;
    selfIntegrityFailedCount: number;
    eligibleObservationPercent: number | null;
  };
  primaryCohort: {
    revisionCount: number;
    uniqueVehicleCount: number;
    uniqueOrgCount: number;
    evidenceSpanHours: number | null;
  };
  calibration: Record<string, F5CalBlockV1>;
  naturalEvidence: {
    'NAT-M3.3F-001': { status: F5MaturityStateV1 };
    'NAT-M3.3F-002': { status: F5MaturityStateV1 };
    'NAT-M3.3F-003': { status: F5MaturityStateV1 };
  };
  groundTruth: {
    linkageAvailable: false;
    replacementLabelsAvailable: false;
    nat008Owner: 'M3.3G';
    nat009Owner: 'M3.3G';
  };
  safety: {
    crossTenantMismatchCount: number;
    partialRevisionWithoutAckCount: number;
    e3RuntimeCalls: 0;
    e3PersistenceWrites: 0;
    customerEffect: false;
  };
};

export type M3_3F_F5_NaturalCalibrationReportV2 = Omit<M3_3F_F5_NaturalCalibrationReportV1, 'meta' | 'groundTruth'> & {
  meta: {
    reportContractVersion: typeof M3_3F_F5_NATURAL_CALIBRATION_REPORT_CONTRACT_VERSION;
    generatedAt: string;
    asOf: string;
    cohort: string;
    readOnly: true;
  };
  groundTruth: F5GroundTruthCorrelationBlockV2;
};

export type F5ReportBuildOptions = {
  asOf: Date;
  cohort: typeof import('./f5-natural-calibration-report.constants').F5_PRIMARY_COHORT_V1;
  maxRevisions: number;
  timeoutMs: number;
  generatedAt: string;
  runtimeAuthority?: Partial<M3_3F_F5_NaturalCalibrationReportV2['runtimeAuthority']>;
};

/** Current F5 report shape (G3 V2). */
export type M3_3F_F5_NaturalCalibrationReport = M3_3F_F5_NaturalCalibrationReportV2;

export class F5ReportBoundExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'F5ReportBoundExceededError';
  }
}

export class F5ReportTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'F5ReportTimeoutError';
  }
}
