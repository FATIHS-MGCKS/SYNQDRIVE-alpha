export type LvEstimatedHealthStatusV1 = 'GREEN' | 'YELLOW' | 'RED' | 'UNKNOWN';

type LvEstimatedHealthShadowAssessmentVm = {
  estimatedHealthStatus: LvEstimatedHealthStatusV1;
  estimateConfidence: string;
  assessmentEligibility: string;
  reasonCodes: string[];
  measuredSOH: 'UNKNOWN';
  decisionTrace: {
    finalRuleId: string | null;
    p11ShadowRuleId?: string | null;
    qualifiedEpisodeCount: number;
    bandCounts: Record<string, number>;
    longitudinalTrend: string;
    loadSignal: string;
  };
  evidenceCounts: {
    qualifiedRestEpisodes: number;
    eligibleRestObservations: number;
  };
};

export type LvEstimatedBatteryHealthShadowAdminV1 = {
  shadowContractVersion: 'LV_ESTIMATED_BATTERY_HEALTH_SHADOW_ADMIN_V1';
  organizationId: string;
  vehicleId: string;
  evaluatedAtIso: string;
  temporalSemantics: {
    observationAsOfAuthority: 'PROVIDER_OBSERVATION_TIMESTAMP';
    ingestionTimeAsOfGuarantee: false;
    preStartFollowUpWindowMs: number;
    note: string;
  };
  measuredIntelligenceBoundaryNote: 'MEASURED_INTELLIGENCE_NOT_ASSESSED_IS_NOT_N16_RESULT';
  dataSelection: {
    rawVoltageRowCount: number;
    dedupedVoltageRowCount: number;
    eligibleRestObservationCount: number;
    measuredFromIso: string | null;
    measuredToIso: string | null;
    historicalObservationsTruncated: boolean;
    inputCoverageIncomplete: boolean;
    historicalQueryMode: 'DATE_RANGE_ASC' | 'RECENT_DESC_LIMIT';
  };
  assessment: LvEstimatedHealthShadowAssessmentVm;
  p11ShadowAssessment: LvEstimatedHealthShadowAssessmentVm;
};
