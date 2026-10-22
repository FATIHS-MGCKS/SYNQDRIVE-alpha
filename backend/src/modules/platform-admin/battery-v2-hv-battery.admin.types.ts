export const HV_BATTERY_ADMIN_CONTRACT_VERSION = 'hv-battery-master-admin-v1' as const;

export type HvBatteryAdminAvailability =
  | 'AVAILABLE'
  | 'NOT_AVAILABLE'
  | 'NOT_MEASURED'
  | 'NOT_CALCULATED'
  | 'NOT_VALIDATED';

export type HvBatteryAdminSohPresentation =
  | 'NONE'
  | 'SHADOW_CROSS_SESSION_ONLY'
  | 'SHADOW_SOH_GATE_INTERNAL'
  | 'PUBLICATION_DISABLED';

export interface HvBatteryAdminVehicleContextV1 {
  contractVersion: typeof HV_BATTERY_ADMIN_CONTRACT_VERSION;
  organizationId: string;
  vehicleId: string;
  hvSupported: boolean;
  driveProfile: string;
  rechargeCapabilitySignalPresent: boolean;
}

export interface HvBatteryAdminOverviewV1 {
  contractVersion: typeof HV_BATTERY_ADMIN_CONTRACT_VERSION;
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
    presentation: HvBatteryAdminSohPresentation;
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
  contractVersion: typeof HV_BATTERY_ADMIN_CONTRACT_VERSION;
  organizationId: string;
  vehicleId: string;
  page: number;
  limit: number;
  totalPhysicalEpisodes: number;
  totalRawSegments: number;
  episodes: HvBatteryAdminChargeEpisodeListItemV1[];
}

export interface HvBatteryAdminProviderSegmentV1 {
  sessionId: string;
  source: string;
  segmentFingerprint: string;
  startAt: string;
  endAt: string | null;
  isOngoing: boolean;
  isSuperseded: boolean;
  supersededBySegmentFingerprint: string | null;
  qualityStatus: string | null;
  measurementQuality: string | null;
}

export interface HvBatteryAdminChargeEpisodeDetailV1 {
  contractVersion: typeof HV_BATTERY_ADMIN_CONTRACT_VERSION;
  organizationId: string;
  vehicleId: string;
  episodeId: string;
  summary: HvBatteryAdminChargeEpisodeListItemV1;
  providerSegments: HvBatteryAdminProviderSegmentV1[];
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
  contractVersion: typeof HV_BATTERY_ADMIN_CONTRACT_VERSION;
  organizationId: string;
  vehicleId: string;
  evaluatedAt: string;
  measurementQuality: Record<string, unknown>;
  crossSessionAssessment: {
    availability: HvBatteryAdminAvailability;
    persisted: Record<string, unknown> | null;
  };
  sohAssessment: {
    presentation: HvBatteryAdminSohPresentation;
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
  featureFlags: {
    hvCapacityShadowEnabled: boolean;
    hvSohPublicationEnabled: boolean;
    hvRechargeSessionEnabled: boolean;
  };
}
