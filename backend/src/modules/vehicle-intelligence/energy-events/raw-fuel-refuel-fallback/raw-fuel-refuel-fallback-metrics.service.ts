import { Injectable } from '@nestjs/common';
import { Counter } from 'prom-client';
import { TripMetricsService } from '@modules/observability/trip-metrics.service';

@Injectable()
export class RawFuelRefuelFallbackMetricsService {
  readonly branchInvocationTotal: Counter<string>;
  readonly masterDisabledTotal: Counter<string>;
  readonly persistWithoutMasterTotal: Counter<string>;
  readonly capabilitySkipTotal: Counter<string>;
  readonly sampleFetchSuccessTotal: Counter<string>;
  readonly sampleFetchFailureTotal: Counter<string>;
  readonly detectorInvocationTotal: Counter<string>;
  readonly zeroObservationsTotal: Counter<string>;
  readonly observationsTotal: Counter<string>;
  readonly persistAttemptTotal: Counter<string>;
  readonly persistCreatedTotal: Counter<string>;
  readonly persistRediscoveredTotal: Counter<string>;
  readonly persistSkippedFlagOffTotal: Counter<string>;
  readonly candidateErrorsTotal: Counter<string>;
  readonly branchErrorTotal: Counter<string>;
  readonly nonFiniteSampleExclusionTotal: Counter<string>;
  readonly readinessEvaluatedTotal: Counter<string>;
  readonly candidateReadyTotal: Counter<string>;
  readonly candidateNotReadyTotal: Counter<string>;
  readonly promotionEligibilityEvaluatedTotal: Counter<string>;
  readonly promotionBlockedTotal: Counter<string>;
  readonly nativeOverlapSameTotal: Counter<string>;
  readonly nativeOverlapDistinctTotal: Counter<string>;
  readonly nativeOverlapInsufficientEvidenceTotal: Counter<string>;
  readonly nativeOverlapAmbiguousTotal: Counter<string>;
  readonly promotionDraftConstructedTotal: Counter<string>;
  readonly promotionBlockedByF5GateTotal: Counter<string>;
  readonly promotionPreparationErrorTotal: Counter<string>;
  readonly forbiddenPromotionExecutionTotal: Counter<string>;
  readonly convergenceEvaluationAttemptedTotal: Counter<string>;
  readonly convergenceConvergedNativeTotal: Counter<string>;
  readonly convergenceFailClosedTotal: Counter<string>;
  readonly convergenceSkippedNotAuthorizedTotal: Counter<string>;
  readonly convergenceAlreadyConvergedTotal: Counter<string>;
  readonly convergenceErrorTotal: Counter<string>;
  readonly convergenceSameNativeTotal: Counter<string>;
  readonly convergenceNoNativeTotal: Counter<string>;
  readonly convergenceDistinctTotal: Counter<string>;
  readonly convergenceInsufficientTotal: Counter<string>;
  readonly convergenceAmbiguousTotal: Counter<string>;
  readonly convergenceNativeSiblingOverflowTotal: Counter<string>;
  readonly promotionAttemptedTotal: Counter<string>;
  readonly promotionSkippedNotAuthorizedTotal: Counter<string>;
  readonly promotionBlockedByCutoverTotal: Counter<string>;
  readonly promotionBlockedByConvergenceTotal: Counter<string>;
  readonly promotionBlockedByTrustTotal: Counter<string>;
  readonly promotionCommittedTotal: Counter<string>;
  readonly promotionIdempotentReplayTotal: Counter<string>;
  readonly promotionTransactionFailureTotal: Counter<string>;
  readonly promotionSourceIdentityCollisionTotal: Counter<string>;
  readonly promotionSyntheticIdCollisionTotal: Counter<string>;

  constructor(private readonly tripMetrics: TripMetricsService) {
    const register = this.tripMetrics.registry;

    this.branchInvocationTotal = new Counter({
      name: 'synqdrive_rfrf_branch_invocation_total',
      help: 'Raw fuel refuel fallback dark branch invocations (master enabled, scan entered)',
      registers: [register],
    });

    this.masterDisabledTotal = new Counter({
      name: 'synqdrive_rfrf_master_disabled_total',
      help: 'RFRF scans skipped because master flag is off',
      registers: [register],
    });

    this.persistWithoutMasterTotal = new Counter({
      name: 'synqdrive_rfrf_persist_without_master_total',
      help: 'RFRF fail-closed: persist flag set without master',
      registers: [register],
    });

    this.capabilitySkipTotal = new Counter({
      name: 'synqdrive_rfrf_capability_skip_total',
      help: 'RFRF scans skipped due to fuel capability gate',
      labelNames: ['capability'],
      registers: [register],
    });

    this.sampleFetchSuccessTotal = new Counter({
      name: 'synqdrive_rfrf_sample_fetch_success_total',
      help: 'RFRF fuel sample provider fetch succeeded (including legitimate empty telemetry)',
      registers: [register],
    });

    this.sampleFetchFailureTotal = new Counter({
      name: 'synqdrive_rfrf_sample_fetch_failure_total',
      help: 'RFRF fuel sample provider/auth fetch failures',
      labelNames: ['error_class'],
      registers: [register],
    });

    this.detectorInvocationTotal = new Counter({
      name: 'synqdrive_rfrf_detector_invocation_total',
      help: 'RFRF F3 detectRawFuelRises invocations',
      registers: [register],
    });

    this.zeroObservationsTotal = new Counter({
      name: 'synqdrive_rfrf_zero_observations_total',
      help: 'RFRF detector runs that emitted zero persistable observations',
      registers: [register],
    });

    this.observationsTotal = new Counter({
      name: 'synqdrive_rfrf_observations_total',
      help: 'Raw fuel rise observations emitted by F3 in dark runtime',
      labelNames: ['lifecycle'],
      registers: [register],
    });

    this.persistAttemptTotal = new Counter({
      name: 'synqdrive_rfrf_persist_attempt_total',
      help: 'RFRF F2 candidate persist attempts',
      registers: [register],
    });

    this.persistCreatedTotal = new Counter({
      name: 'synqdrive_rfrf_persist_created_total',
      help: 'RFRF F2 candidates created',
      registers: [register],
    });

    this.persistRediscoveredTotal = new Counter({
      name: 'synqdrive_rfrf_persist_rediscovered_total',
      help: 'RFRF F2 candidates semantically rediscovered',
      registers: [register],
    });

    this.persistSkippedFlagOffTotal = new Counter({
      name: 'synqdrive_rfrf_persist_skipped_flag_off_total',
      help: 'RFRF observations skipped because persist flag is off',
      registers: [register],
    });

    this.candidateErrorsTotal = new Counter({
      name: 'synqdrive_rfrf_candidate_errors_total',
      help: 'Per-candidate errors during dark runtime persistence',
      registers: [register],
    });

    this.branchErrorTotal = new Counter({
      name: 'synqdrive_rfrf_branch_error_total',
      help: 'RFRF branch-level isolated failures',
      registers: [register],
    });

    this.nonFiniteSampleExclusionTotal = new Counter({
      name: 'synqdrive_rfrf_non_finite_sample_exclusion_total',
      help: 'F3 normalizer invalid_sample exclusions surfaced from dark runtime',
      registers: [register],
    });

    this.readinessEvaluatedTotal = new Counter({
      name: 'synqdrive_rfrf_readiness_evaluated_total',
      help: 'F4 persisted candidate readiness evaluations',
      registers: [register],
    });

    this.candidateReadyTotal = new Counter({
      name: 'synqdrive_rfrf_candidate_ready_total',
      help: 'F4 candidates evaluated READY by runtime evaluator',
      registers: [register],
    });

    this.candidateNotReadyTotal = new Counter({
      name: 'synqdrive_rfrf_candidate_not_ready_total',
      help: 'F4 candidates not ready by reason code',
      labelNames: ['reason'],
      registers: [register],
    });

    this.promotionEligibilityEvaluatedTotal = new Counter({
      name: 'synqdrive_rfrf_promotion_eligibility_evaluated_total',
      help: 'F4 promotion eligibility evaluations',
      registers: [register],
    });

    this.promotionBlockedTotal = new Counter({
      name: 'synqdrive_rfrf_promotion_blocked_total',
      help: 'F4 promotion blocked by eligibility status',
      labelNames: ['status'],
      registers: [register],
    });

    this.nativeOverlapSameTotal = new Counter({
      name: 'synqdrive_rfrf_native_overlap_same_total',
      help: 'F4 advisory native overlap SAME classifications',
      registers: [register],
    });

    this.nativeOverlapDistinctTotal = new Counter({
      name: 'synqdrive_rfrf_native_overlap_distinct_total',
      help: 'F4 advisory native overlap DISTINCT classifications',
      registers: [register],
    });

    this.nativeOverlapInsufficientEvidenceTotal = new Counter({
      name: 'synqdrive_rfrf_native_overlap_insufficient_evidence_total',
      help: 'F4 advisory native overlap INSUFFICIENT_EVIDENCE classifications',
      registers: [register],
    });

    this.nativeOverlapAmbiguousTotal = new Counter({
      name: 'synqdrive_rfrf_native_overlap_ambiguous_total',
      help: 'F4 advisory native overlap ambiguous/multiple SAME classifications',
      registers: [register],
    });

    this.promotionDraftConstructedTotal = new Counter({
      name: 'synqdrive_rfrf_promotion_draft_constructed_total',
      help: 'F4 promotion drafts constructed from persisted candidates',
      registers: [register],
    });

    this.promotionBlockedByF5GateTotal = new Counter({
      name: 'synqdrive_rfrf_promotion_blocked_f5_gate_total',
      help: 'F4 promotion preparation blocked by F5 convergence gate stub',
      registers: [register],
    });

    this.promotionPreparationErrorTotal = new Counter({
      name: 'synqdrive_rfrf_promotion_preparation_error_total',
      help: 'F4 promotion preparation isolated failures',
      registers: [register],
    });

    this.forbiddenPromotionExecutionTotal = new Counter({
      name: 'synqdrive_rfrf_forbidden_promotion_execution_total',
      help: 'Attempted forbidden fallback VehicleEnergyEvent promotion execution — must remain zero',
      registers: [register],
    });

    this.convergenceEvaluationAttemptedTotal = new Counter({
      name: 'synqdrive_rfrf_convergence_evaluation_attempted_total',
      help: 'F5-PR1 authoritative convergence evaluation attempts',
      registers: [register],
    });

    this.convergenceConvergedNativeTotal = new Counter({
      name: 'synqdrive_rfrf_convergence_converged_native_total',
      help: 'F5-PR1 candidates transitioned to CONVERGED_NATIVE',
      registers: [register],
    });

    this.convergenceFailClosedTotal = new Counter({
      name: 'synqdrive_rfrf_convergence_fail_closed_total',
      help: 'F5-PR1 convergence fail-closed outcomes (ambiguous/insufficient/multiple SAME)',
      registers: [register],
    });

    this.convergenceSkippedNotAuthorizedTotal = new Counter({
      name: 'synqdrive_rfrf_convergence_skipped_not_authorized_total',
      help: 'F5-PR1 convergence skipped because authority flag is off',
      registers: [register],
    });

    this.convergenceAlreadyConvergedTotal = new Counter({
      name: 'synqdrive_rfrf_convergence_already_converged_total',
      help: 'F5-PR1 idempotent replay on already CONVERGED_NATIVE candidates',
      registers: [register],
    });

    this.convergenceErrorTotal = new Counter({
      name: 'synqdrive_rfrf_convergence_error_total',
      help: 'F5-PR1 convergence isolated transaction failures',
      registers: [register],
    });

    this.convergenceSameNativeTotal = new Counter({
      name: 'synqdrive_rfrf_convergence_same_native_total',
      help: 'F5-PR1 authoritative evaluations classifying SAME_NATIVE',
      registers: [register],
    });

    this.convergenceNoNativeTotal = new Counter({
      name: 'synqdrive_rfrf_convergence_no_native_total',
      help: 'F5-PR1 authoritative evaluations with no native siblings',
      registers: [register],
    });

    this.convergenceDistinctTotal = new Counter({
      name: 'synqdrive_rfrf_convergence_distinct_total',
      help: 'F5-PR1 authoritative evaluations classifying DISTINCT_FROM_NATIVE',
      registers: [register],
    });

    this.convergenceInsufficientTotal = new Counter({
      name: 'synqdrive_rfrf_convergence_insufficient_total',
      help: 'F5-PR1 authoritative evaluations classifying INSUFFICIENT_EVIDENCE',
      registers: [register],
    });

    this.convergenceAmbiguousTotal = new Counter({
      name: 'synqdrive_rfrf_convergence_ambiguous_total',
      help: 'F5-PR1 authoritative evaluations classifying AMBIGUOUS',
      registers: [register],
    });

    this.convergenceNativeSiblingOverflowTotal = new Counter({
      name: 'synqdrive_rfrf_convergence_native_sibling_overflow_total',
      help: 'F5-PR1 authoritative native sibling bounded query overflow (fail closed)',
      registers: [register],
    });

    this.promotionAttemptedTotal = new Counter({
      name: 'synqdrive_rfrf_promotion_attempted_total',
      help: 'F5-PR2 fallback promotion transaction attempts',
      registers: [register],
    });

    this.promotionSkippedNotAuthorizedTotal = new Counter({
      name: 'synqdrive_rfrf_promotion_skipped_not_authorized_total',
      help: 'Promotion skipped because execution authority is false',
      registers: [register],
    });

    this.promotionBlockedByCutoverTotal = new Counter({
      name: 'synqdrive_rfrf_promotion_blocked_cutover_total',
      help: 'Promotion blocked by RAW_FUEL_REFUEL_FALLBACK_CUTOVER_AT boundary',
      registers: [register],
    });

    this.promotionBlockedByConvergenceTotal = new Counter({
      name: 'synqdrive_rfrf_promotion_blocked_convergence_total',
      help: 'Promotion blocked by authoritative convergence fail-closed',
      registers: [register],
    });

    this.promotionBlockedByTrustTotal = new Counter({
      name: 'synqdrive_rfrf_promotion_blocked_trust_total',
      help: 'Promotion blocked because promotion trust is not TRUSTED',
      registers: [register],
    });

    this.promotionCommittedTotal = new Counter({
      name: 'synqdrive_rfrf_promotion_committed_total',
      help: 'Successful atomic fallback VEE + PROMOTED commits',
      registers: [register],
    });

    this.promotionIdempotentReplayTotal = new Counter({
      name: 'synqdrive_rfrf_promotion_idempotent_replay_total',
      help: 'Promotion replays resolved to existing PROMOTED state or VEE',
      registers: [register],
    });

    this.promotionTransactionFailureTotal = new Counter({
      name: 'synqdrive_rfrf_promotion_transaction_failure_total',
      help: 'Promotion transaction failures (rolled back)',
      registers: [register],
    });

    this.promotionSourceIdentityCollisionTotal = new Counter({
      name: 'synqdrive_rfrf_promotion_source_identity_collision_total',
      help: 'Promotion fail-closed on sourceEventKey identity collision',
      registers: [register],
    });

    this.promotionSyntheticIdCollisionTotal = new Counter({
      name: 'synqdrive_rfrf_promotion_synthetic_id_collision_total',
      help: 'Promotion fail-closed on synthetic dimoSegmentId collision',
      registers: [register],
    });
  }

  recordBranchInvocation(): void {
    this.branchInvocationTotal.inc();
  }

  recordMasterDisabled(): void {
    this.masterDisabledTotal.inc();
  }

  recordPersistWithoutMaster(): void {
    this.persistWithoutMasterTotal.inc();
  }

  recordCapabilitySkip(capability: string): void {
    this.capabilitySkipTotal.inc({ capability });
  }

  recordSampleFetchSuccess(): void {
    this.sampleFetchSuccessTotal.inc();
  }

  recordSampleFetchFailure(errorClass: string): void {
    this.sampleFetchFailureTotal.inc({ error_class: errorClass });
  }

  recordDetectorInvocation(): void {
    this.detectorInvocationTotal.inc();
  }

  recordZeroObservations(): void {
    this.zeroObservationsTotal.inc();
  }

  recordObservation(lifecycleState: string): void {
    this.observationsTotal.inc({ lifecycle: lifecycleState });
  }

  recordPersistAttempt(): void {
    this.persistAttemptTotal.inc();
  }

  recordPersistCreated(): void {
    this.persistCreatedTotal.inc();
  }

  recordPersistRediscovered(): void {
    this.persistRediscoveredTotal.inc();
  }

  recordPersistSkippedFlagOff(): void {
    this.persistSkippedFlagOffTotal.inc();
  }

  recordCandidateError(): void {
    this.candidateErrorsTotal.inc();
  }

  recordBranchError(): void {
    this.branchErrorTotal.inc();
  }

  recordNonFiniteSampleExclusion(count = 1): void {
    if (count > 0) this.nonFiniteSampleExclusionTotal.inc(count);
  }

  recordReadinessEvaluated(): void {
    this.readinessEvaluatedTotal.inc();
  }

  recordCandidateReady(): void {
    this.candidateReadyTotal.inc();
  }

  recordCandidateNotReady(reason: string): void {
    this.candidateNotReadyTotal.inc({ reason });
  }

  recordPromotionEligibilityEvaluated(): void {
    this.promotionEligibilityEvaluatedTotal.inc();
  }

  recordPromotionBlocked(status: string): void {
    this.promotionBlockedTotal.inc({ status });
  }

  recordNativeOverlapSame(): void {
    this.nativeOverlapSameTotal.inc();
  }

  recordNativeOverlapDistinct(): void {
    this.nativeOverlapDistinctTotal.inc();
  }

  recordNativeOverlapInsufficientEvidence(): void {
    this.nativeOverlapInsufficientEvidenceTotal.inc();
  }

  recordNativeOverlapAmbiguous(): void {
    this.nativeOverlapAmbiguousTotal.inc();
  }

  recordPromotionDraftConstructed(): void {
    this.promotionDraftConstructedTotal.inc();
  }

  recordPromotionBlockedByF5Gate(): void {
    this.promotionBlockedByF5GateTotal.inc();
  }

  recordPromotionPreparationError(): void {
    this.promotionPreparationErrorTotal.inc();
  }

  recordForbiddenPromotionExecution(): void {
    this.forbiddenPromotionExecutionTotal.inc();
  }

  recordConvergenceEvaluationAttempted(): void {
    this.convergenceEvaluationAttemptedTotal.inc();
  }

  recordConvergedNative(): void {
    this.convergenceConvergedNativeTotal.inc();
  }

  recordConvergenceFailClosed(): void {
    this.convergenceFailClosedTotal.inc();
  }

  recordConvergenceSkippedNotAuthorized(): void {
    this.convergenceSkippedNotAuthorizedTotal.inc();
  }

  recordConvergenceAlreadyConverged(): void {
    this.convergenceAlreadyConvergedTotal.inc();
  }

  recordConvergenceError(): void {
    this.convergenceErrorTotal.inc();
  }

  recordConvergenceSameNative(): void {
    this.convergenceSameNativeTotal.inc();
  }

  recordConvergenceNoNative(): void {
    this.convergenceNoNativeTotal.inc();
  }

  recordConvergenceDistinct(): void {
    this.convergenceDistinctTotal.inc();
  }

  recordConvergenceInsufficient(): void {
    this.convergenceInsufficientTotal.inc();
  }

  recordConvergenceAmbiguous(): void {
    this.convergenceAmbiguousTotal.inc();
  }

  recordConvergenceNativeSiblingOverflow(): void {
    this.convergenceNativeSiblingOverflowTotal.inc();
  }

  recordPromotionAttempted(): void {
    this.promotionAttemptedTotal.inc();
  }

  recordPromotionSkippedNotAuthorized(): void {
    this.promotionSkippedNotAuthorizedTotal.inc();
  }

  recordPromotionBlockedByCutover(): void {
    this.promotionBlockedByCutoverTotal.inc();
  }

  recordPromotionBlockedByConvergence(): void {
    this.promotionBlockedByConvergenceTotal.inc();
  }

  recordPromotionBlockedByTrust(): void {
    this.promotionBlockedByTrustTotal.inc();
  }

  recordPromotionCommitted(): void {
    this.promotionCommittedTotal.inc();
  }

  recordPromotionIdempotentReplay(): void {
    this.promotionIdempotentReplayTotal.inc();
  }

  recordPromotionTransactionFailure(): void {
    this.promotionTransactionFailureTotal.inc();
  }

  recordPromotionSourceIdentityCollision(): void {
    this.promotionSourceIdentityCollisionTotal.inc();
  }

  recordPromotionSyntheticIdCollision(): void {
    this.promotionSyntheticIdCollisionTotal.inc();
  }
}
