import type { RecordBrakeServiceResult } from './brake-lifecycle.service';
import type { RegistrationBrakeManualSpec } from './register-brake-baseline';

export type BrakeInitializationOutcome =
  | 'initialized'
  | 'already_initialized'
  | 'skipped_not_eligible'
  | 'skipped_no_odometer'
  | 'failed';

export interface BrakeInitializationFromRegistrationInput {
  vehicleId: string;
  organizationId: string;
  brakes: RegistrationBrakeManualSpec;
  registrationMileageKm?: number | null;
  latestStateOdometerKm?: number | null;
}

export interface BrakeInitializationWorkflowResult {
  outcome: BrakeInitializationOutcome;
  initialized: boolean;
  skipped: boolean;
  message: string;
  lifecycleResult?: RecordBrakeServiceResult | null;
  serviceEventId?: string | null;
}

export type LegacyBrakeEnrichmentJobClassification =
  | 'ORPHAN_LEGACY_NO_PROCESSOR'
  | 'SUPERSEDED_ALREADY_INITIALIZED'
  | 'REPLAY_CANDIDATE_VIA_BACKFILL'
  | 'STALE_INCOMPATIBLE'
  | 'COMPLETED_OR_TERMINAL';

export type LegacyBrakeEnrichmentJobRecommendedAction =
  | 'no_action'
  | 'ignore_orphan'
  | 'mark_superseded_via_runbook'
  | 'controlled_replay_via_backfill';

export interface LegacyBrakeEnrichmentJobDiagnostic {
  jobId: string;
  vehicleId: string | null;
  organizationId: string | null;
  status: string;
  createdAt: string;
  classification: LegacyBrakeEnrichmentJobClassification;
  recommendedAction: LegacyBrakeEnrichmentJobRecommendedAction;
  replayCompatible: boolean;
  brakeHealthInitialized: boolean;
  hasRegistrationSpec: boolean;
  notes: string[];
}

export interface LegacyBrakeEnrichmentJobDiagnosticsReport {
  generatedAt: string;
  mode: 'read_only';
  jobsScanned: number;
  summary: Record<LegacyBrakeEnrichmentJobClassification, number>;
  jobs: LegacyBrakeEnrichmentJobDiagnostic[];
}
