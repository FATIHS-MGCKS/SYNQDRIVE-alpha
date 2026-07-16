import type {
  DrivingAttributionConfidence,
  MisuseAttributionScope,
  MisuseCaseDecisionEligibility,
  MisuseCaseStatus,
  MisuseCaseType,
  MisuseEvidenceSourceType,
  TripAssignmentStatus,
} from '@prisma/client';
import type { TripEvidenceLevel } from '../../trips/trip-evidence-level.types';

import type { MisuseCaseType } from '@prisma/client';

export type MisuseCaseInputIdentity = {
  organizationId: string;
  tripId: string;
  vehicleId: string;
  caseType: MisuseCaseType;
  tripEndTimeIso: string | null;
  behaviorEventCount: number;
  drivingEventCount: number;
  contextAnchorCount: number;
  dimoSafetyEventCount: number;
  dtcEventCount: number;
  modelVersion?: string;
};

export type MisuseCaseLifecycleSnapshot = {
  status: MisuseCaseStatus;
  modelVersion: string;
  inputFingerprint: string;
  analysisRunId: string | null;
  evidenceCount: number;
  attributionConfidence: DrivingAttributionConfidence | null;
  decisionEligibility: MisuseCaseDecisionEligibility;
  informationalOnly: boolean;
  resolvedAt: Date | null;
  resolutionReason: string | null;
};

export type TelemetryLifecycleInput = {
  caseType: MisuseCaseType;
  evidenceLevel: TripEvidenceLevel;
  eventCount: number;
  evidenceCount: number;
  attributionScope: MisuseAttributionScope;
  assignmentStatus: TripAssignmentStatus | null;
  isPrivateTrip: boolean;
  inputFingerprint: string;
  modelVersion: string;
  analysisRunId: string | null;
  existing: MisuseCaseLifecycleSnapshot | null;
};

export type ManualTransitionAction = 'CONFIRM' | 'DISMISS' | 'RESOLVE' | 'DOWNGRADE' | 'SUPERSEDE';

export type ManualTransitionInput = {
  action: ManualTransitionAction;
  existing: MisuseCaseLifecycleSnapshot;
  caseType: MisuseCaseType;
  evidenceLevel: TripEvidenceLevel;
  evidenceSources: MisuseEvidenceSourceType[];
  resolutionReason?: string | null;
  operatorNote?: string | null;
};

export type LifecycleTransitionResult = {
  status: MisuseCaseStatus;
  decisionEligibility: MisuseCaseDecisionEligibility;
  informationalOnly: boolean;
  attributionConfidence: DrivingAttributionConfidence | null;
  resolvedAt: Date | null;
  resolutionReason: string | null;
};
