export type HvBatteryAdminAvailability =
  | 'AVAILABLE'
  | 'NOT_AVAILABLE'
  | 'NOT_MEASURED'
  | 'NOT_CALCULATED'
  | 'NOT_VALIDATED';

export interface HvBatteryAdminOverviewV1 {
  contractVersion: string;
  organizationId: string;
  vehicleId: string;
  evaluatedAt: string;
  physicalChargeEpisodeCount: number;
  rawProviderSegmentCount: number;
  lastCompletedCharge: {
    episodeId: string;
    endedAt: string;
    startSocPercent: number | null;
    endSocPercent: number | null;
    energyAddedKwh: number | null;
  } | null;
  socDataAvailability: HvBatteryAdminAvailability;
  energyDataAvailability: HvBatteryAdminAvailability;
  measurementQuality: {
    vehicleQualityLevel: string;
    qualityScore: number;
    capacityConfidence: string;
    referenceConfidence: string;
    sohPublicationReadiness: string;
  };
  capacityEvidence: {
    crossSessionAvailability: HvBatteryAdminAvailability;
    shadowGatePassed: boolean;
    estimatedUsableCapacityKwh: number | null;
    computedAt: string | null;
  };
  sohEvidence: {
    presentation: string;
    availability: HvBatteryAdminAvailability;
    internalEstimatedSohPercent: number | null;
    gateReasonCodes: string[];
    disclaimer: string;
  };
  snapshotCoverage: {
    snapshotsLast30Days: number;
    latestRecordedAt: string | null;
    latestSocPercent: number | null;
    latestEnergyKwh: number | null;
  };
}

export interface HvBatteryAdminChargeEpisodeListItemV1 {
  episodeId: string;
  canonicalSessionId: string;
  startAt: string;
  endAt: string | null;
  durationSeconds: number | null;
  startSocPercent: number | null;
  endSocPercent: number | null;
  deltaSocPercent: number | null;
  energyAddedKwh: number | null;
  providerSegmentCount: number;
  primarySource: string;
  sessionStatus: 'ONGOING' | 'COMPLETED';
  qualityStatus: string | null;
  measurementQuality: string | null;
}

export interface HvBatteryAdminChargeEpisodeListV1 {
  episodes: HvBatteryAdminChargeEpisodeListItemV1[];
  page: number;
  limit: number;
  totalPhysicalEpisodes: number;
  totalRawSegments: number;
}

export interface HvBatteryAdminChargeEpisodeDetailV1 {
  episodeId: string;
  summary: HvBatteryAdminChargeEpisodeListItemV1;
  providerSegments: Array<{
    sessionId: string;
    source: string;
    segmentFingerprint: string;
    startAt: string;
    endAt: string | null;
    isOngoing: boolean;
    isSuperseded: boolean;
  }>;
  m2: {
    availability: HvBatteryAdminAvailability;
    summary: Record<string, unknown> | null;
    observationCount: number;
  };
  m3: {
    availability: HvBatteryAdminAvailability;
    validation: Record<string, unknown> | null;
  };
  measurementQuality: {
    qualityLevel: string;
    qualityScore: number;
    exclusionReasons: string[];
    qualityReasonCodes: string[];
  } | null;
  technicalNotes: string[];
}

export interface HvBatteryAdminTechnicalDetailsV1 {
  evaluatedAt: string;
  measurementQuality: Record<string, unknown>;
  crossSessionAssessment: {
    availability: HvBatteryAdminAvailability;
    persisted: Record<string, unknown> | null;
  };
  sohAssessment: {
    presentation: string;
    availability: HvBatteryAdminAvailability;
    persisted: Record<string, unknown> | null;
    internalEstimatedSohPercent: number | null;
    publicationEligible: boolean;
    gateReasonCodes: string[];
    disclaimer: string;
  };
  snapshotCoverage: HvBatteryAdminOverviewV1['snapshotCoverage'];
  referenceCapacity: {
    availability: HvBatteryAdminAvailability;
    capacityKwh: number | null;
    capacityType: string | null;
    verificationStatus: string | null;
  };
  featureFlags: Record<string, boolean>;
}

export interface HvBatteryAdminVehicleContextV1 {
  hvSupported: boolean;
  driveProfile: string;
  rechargeCapabilitySignalPresent: boolean;
}
