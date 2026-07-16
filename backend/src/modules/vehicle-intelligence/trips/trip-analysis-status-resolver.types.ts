import type { AnalysisAssessabilityContext } from './trip-analysis-status';

/** Runtime state of a single analysis stage (resolver input). */
export type TripAnalysisStageRuntimeState =
  | 'not_started'
  | 'pending'
  | 'done'
  | 'skipped'
  | 'failed'
  /** Capability gap — not a technical failure. */
  | 'not_required';

export type TripAnalysisStageKey =
  | 'behavior'
  | 'nativeEvents'
  | 'route'
  | 'eventContext'
  | 'drivingImpact'
  | 'misuse'
  | 'attribution';

export interface TripAnalysisStageSnapshot {
  behavior: TripAnalysisStageRuntimeState;
  nativeEvents: TripAnalysisStageRuntimeState;
  route: TripAnalysisStageRuntimeState;
  eventContext: TripAnalysisStageRuntimeState;
  drivingImpact: TripAnalysisStageRuntimeState;
  misuse: TripAnalysisStageRuntimeState;
  attribution: TripAnalysisStageRuntimeState;
}

/** Canonical resolver output (Driving Intelligence V2). */
export type ResolvedTripAnalysisStatus =
  | 'NOT_STARTED'
  | 'IN_PROGRESS'
  | 'PARTIAL'
  | 'COMPLETED'
  | 'FAILED'
  | 'SKIPPED'
  | 'NOT_ASSESSABLE';

export interface TripAnalysisStatusResolverInput {
  stages: TripAnalysisStageSnapshot;
  assessability: AnalysisAssessabilityContext;
  /** True once analysis has been enqueued for this trip. */
  analysisQueued?: boolean;
}

export interface TripAnalysisStatusResolverResult {
  status: ResolvedTripAnalysisStatus;
  /** Mirrors to legacy `tripAnalysisStatus` (PENDING, IN_PROGRESS, …). */
  legacyTripAnalysisStatus:
    | 'PENDING'
    | 'IN_PROGRESS'
    | 'PARTIAL'
    | 'COMPLETED'
    | 'FAILED'
    | 'SKIPPED';
  hasUsablePartialResults: boolean;
  failedStages: TripAnalysisStageKey[];
  pendingStages: TripAnalysisStageKey[];
}

export const TRIP_ANALYSIS_STAGE_KEYS: TripAnalysisStageKey[] = [
  'behavior',
  'nativeEvents',
  'route',
  'eventContext',
  'drivingImpact',
  'misuse',
  'attribution',
];
