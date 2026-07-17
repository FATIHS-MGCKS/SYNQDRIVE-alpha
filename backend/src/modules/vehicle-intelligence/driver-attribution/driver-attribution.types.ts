import type {
  DriverAttributionSource,
  DriverAttributionType,
  DrivingAttributionConfidence,
} from '@prisma/client';

export type DriverAttributionEvidence = {
  attributionScope?: string;
  reason?: string;
  reasons?: string[];
  rolesModelVersion?: string;
  resolverVersion?: string;
  bookingCustomerId?: string | null;
  assignedDriverId?: string | null;
  actualDriverId?: string | null;
  pipelineJobId?: string | null;
  customerEligibility?: boolean;
  driverEligibility?: boolean;
  conflicts?: Array<{
    code: string;
    message: string;
    competingTypes: string[];
  }>;
  handoverProtocolId?: string | null;
};

export type UpsertDriverAttributionInput = {
  organizationId: string;
  vehicleId: string;
  tripId: string;
  analysisRunId?: string | null;
  bookingId?: string | null;
  customerId?: string | null;
  driverId?: string | null;
  attributionType: DriverAttributionType;
  confidence: DrivingAttributionConfidence;
  source: DriverAttributionSource;
  validFrom: Date;
  validUntil?: Date | null;
  evidence?: DriverAttributionEvidence;
  resolvedByUserId?: string | null;
  resolvedAt?: Date | null;
  modelVersion: string;
};

export type DriverAttributionPriorityInput = {
  attributionType: DriverAttributionType;
  confidence: DrivingAttributionConfidence;
  resolvedAt?: Date | null;
};
