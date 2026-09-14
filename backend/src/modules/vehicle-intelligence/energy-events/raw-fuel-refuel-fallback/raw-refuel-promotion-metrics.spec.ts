import { Registry } from 'prom-client';
import { TripMetricsService } from '@modules/observability/trip-metrics.service';
import {
  evaluateFallbackPromotionAuthority,
  RFRF_FALLBACK_PROMOTION_EXECUTION_AUTHORIZED_ENV,
  RFRF_NATIVE_FALLBACK_CONVERGENCE_AUTHORIZED_ENV,
} from '@config/raw-fuel-refuel-fallback.config';
import { PrismaService } from '@shared/database/prisma.service';
import { RawFuelRefuelFallbackMetricsService } from './raw-fuel-refuel-fallback-metrics.service';
import { RawRefuelPromotionService } from './raw-refuel-promotion.service';

describe('RFRF F5-PR2 promotion metrics single ownership', () => {
  it('RawRefuelPromotionService owns promotionAttempted global counter', async () => {
    const metrics = new RawFuelRefuelFallbackMetricsService({
      registry: new Registry(),
    } as TripMetricsService);
    const attemptedSpy = jest.spyOn(metrics, 'recordPromotionAttempted');
    const skippedSpy = jest.spyOn(metrics, 'recordPromotionSkippedNotAuthorized');
    const prisma = {
      rawRefuelCandidate: { findUnique: jest.fn() },
      $transaction: jest.fn(),
    } as unknown as PrismaService;
    const service = new RawRefuelPromotionService(prisma, metrics);

    await service.evaluateAndApplyPromotionById('cand-1', {}, {
      [RFRF_FALLBACK_PROMOTION_EXECUTION_AUTHORIZED_ENV]: 'false',
      [RFRF_NATIVE_FALLBACK_CONVERGENCE_AUTHORIZED_ENV]: 'true',
    });

    expect(attemptedSpy).not.toHaveBeenCalled();
    expect(skippedSpy).toHaveBeenCalledTimes(1);

    await service.evaluateAndApplyPromotionById('cand-1', {}, {
      [RFRF_FALLBACK_PROMOTION_EXECUTION_AUTHORIZED_ENV]: 'true',
      [RFRF_NATIVE_FALLBACK_CONVERGENCE_AUTHORIZED_ENV]: 'false',
    });

    expect(attemptedSpy).not.toHaveBeenCalled();
    expect(skippedSpy).toHaveBeenCalledTimes(2);
  });

  it('evaluateFallbackPromotionAuthority rejects promotion-only or convergence-only', () => {
    expect(
      evaluateFallbackPromotionAuthority({
        [RFRF_FALLBACK_PROMOTION_EXECUTION_AUTHORIZED_ENV]: 'false',
        [RFRF_NATIVE_FALLBACK_CONVERGENCE_AUTHORIZED_ENV]: 'false',
      }).authorized,
    ).toBe(false);

    expect(
      evaluateFallbackPromotionAuthority({
        [RFRF_FALLBACK_PROMOTION_EXECUTION_AUTHORIZED_ENV]: 'true',
        [RFRF_NATIVE_FALLBACK_CONVERGENCE_AUTHORIZED_ENV]: 'false',
      }).detail,
    ).toBe('convergence_not_authorized');

    expect(
      evaluateFallbackPromotionAuthority({
        [RFRF_FALLBACK_PROMOTION_EXECUTION_AUTHORIZED_ENV]: 'false',
        [RFRF_NATIVE_FALLBACK_CONVERGENCE_AUTHORIZED_ENV]: 'true',
      }).detail,
    ).toBe('promotion_execution_not_authorized');
  });
});
