import { RFRF_NATIVE_FALLBACK_CONVERGENCE_AUTHORIZED_ENV } from '@config/raw-fuel-refuel-fallback.config';
import { PrismaService } from '@shared/database/prisma.service';
import { RawRefuelConvergenceService } from './raw-refuel-convergence.service';
import { RawFuelRefuelFallbackMetricsService } from './raw-fuel-refuel-fallback-metrics.service';
import { RawFuelRefuelFallbackRuntimeService } from './raw-fuel-refuel-fallback-runtime.service';
import { RawRefuelPromotionPreparationService } from './raw-refuel-promotion-preparation.service';

describe('RFRF F5 convergence metrics single ownership', () => {
  it('RawRefuelConvergenceService increments SKIPPED_NOT_AUTHORIZED once per attempt', async () => {
    const metrics = {
      recordConvergenceSkippedNotAuthorized: jest.fn(),
    } as unknown as RawFuelRefuelFallbackMetricsService;
    const prisma = {
      rawRefuelCandidate: { findUnique: jest.fn() },
      $transaction: jest.fn(),
    } as unknown as PrismaService;
    const service = new RawRefuelConvergenceService(prisma, metrics);

    await service.evaluateAndApplyConvergenceById('cand-1', {}, {
      [RFRF_NATIVE_FALLBACK_CONVERGENCE_AUTHORIZED_ENV]: 'false',
    });

    expect(metrics.recordConvergenceSkippedNotAuthorized).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('runtime orchestration does not double-increment SKIPPED_NOT_AUTHORIZED domain metric', async () => {
    const metrics = {
      recordConvergenceEvaluationAttempted: jest.fn(),
      recordConvergenceSkippedNotAuthorized: jest.fn(),
    } as unknown as RawFuelRefuelFallbackMetricsService;
    const convergenceService = {
      evaluateAndApplyConvergenceById: jest.fn().mockResolvedValue({
        status: 'SKIPPED_NOT_AUTHORIZED',
        evaluation: null,
        candidateId: 'cand-1',
        convergedNativeEventId: null,
        detail: 'f5_convergence_not_authorized',
      }),
    } as unknown as RawRefuelConvergenceService;
    const promotionPreparation = {
      preparePromotionById: jest.fn().mockResolvedValue({
        readiness: { ready: true, reasonCode: 'READY', lifecycleState: 'READY_FOR_PERSIST', detail: '' },
        eligibility: { status: 'BLOCKED_F5_CONVERGENCE_NOT_AUTHORIZED', blockedPendingF5: true, detail: '' },
        nativeOverlap: { advisoryClassification: 'NO_NATIVE_SIBLINGS', detail: '', sameNativeEventIds: [], distinctNativeEventIds: [], insufficientNativeEventIds: [], siblingAssessments: [] },
        promotionDraft: null,
        f5ConvergenceAuthorized: false,
        canCreateFallbackVehicleEnergyEvent: false,
        blockedByF5Gate: true,
      }),
    } as unknown as RawRefuelPromotionPreparationService;

    const runtime = new RawFuelRefuelFallbackRuntimeService(
      {} as never,
      {} as never,
      promotionPreparation,
      convergenceService,
      undefined,
      undefined,
      metrics,
    );

    const result = {
      promotionPreparationAttempted: 0,
      promotionDraftsConstructed: 0,
      promotionBlockedByF5Gate: 0,
      convergenceEvaluationAttempted: 0,
      convergenceConvergedNative: 0,
      convergenceFailClosed: 0,
      convergenceSkippedNotAuthorized: 0,
      promotionExecutionAttempted: 0,
      promotionCommitted: 0,
      promotionFailClosed: 0,
      promotionSkippedNotAuthorized: 0,
      promotionBlockedByCutover: 0,
      candidateOutcomes: [
        {
          observationIndex: 0,
          lifecycleState: 'READY_FOR_PERSIST',
          persisted: true,
          created: true,
          rediscovered: false,
          candidateId: 'cand-1',
          promotionPreparation: {
            readiness: { ready: true },
          },
        },
      ],
    };

    await (runtime as unknown as { runPromotionPreparationIfPersisted: Function }).runPromotionPreparationIfPersisted(
      'cand-1',
      result,
      0,
      'FUEL_CAPABLE',
      'ADMISSIBLE',
      'TRUSTED',
      { [RFRF_NATIVE_FALLBACK_CONVERGENCE_AUTHORIZED_ENV]: 'false' },
    );

    expect(metrics.recordConvergenceSkippedNotAuthorized).not.toHaveBeenCalled();
    expect(result.convergenceSkippedNotAuthorized).toBe(1);
  });
});
