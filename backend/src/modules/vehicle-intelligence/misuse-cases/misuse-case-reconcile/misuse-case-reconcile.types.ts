import type { MisuseCaseStatus } from '@prisma/client';

export type MisuseReconcileTrigger =
  | 'EVENT_CONTEXT'
  | 'DRIVING_IMPACT'
  | 'ATTRIBUTION'
  | 'MODEL_VERSION_CHANGE'
  | 'PERIODIC_STUCK_TRIP'
  | 'LEGACY_AGGREGATOR';

export type MisuseCaseReconcileInput = {
  organizationId: string;
  vehicleId: string;
  tripId: string;
  analysisRunId?: string | null;
  trigger: MisuseReconcileTrigger;
};

export type MisuseCaseReconcileResult = {
  modelVersion: string;
  trigger: MisuseReconcileTrigger;
  analysisRunId: string | null;
  candidatesEvaluated: number;
  candidatesGated: number;
  upserted: number;
  resolved: number;
  confirmedPreserved: number;
  reconciledFingerprints: string[];
  idempotent: boolean;
};

export type ConfirmedPreserveAuditEntry = {
  modelVersion: string;
  evaluatedAt: string;
  trigger: MisuseReconcileTrigger;
  wouldHaveSeverity: string;
  wouldHaveConfidence: string;
  preservedSeverity: string;
  preservedConfidence: string;
  reason: string;
};

export type MisuseCaseReconcileRowSnapshot = {
  id: string;
  fingerprint: string;
  status: MisuseCaseStatus;
  severity: string;
  confidence: string;
};
