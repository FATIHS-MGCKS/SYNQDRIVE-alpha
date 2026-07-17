import { hasWearOrSafetyAlert } from './brake-health-alert.builder';
import type { BrakeHealthSummaryDto } from './brake-health.service';

/**
 * API contract: legacy fields are present for backward compatibility but must
 * not drive product decisions. Canonical fields are always populated when
 * summary is returned.
 */
describe('BrakeHealthSummary API contract', () => {
  it('hasAlert mirrors wear/safety openAlerts only', () => {
    const openAlerts = [
      {
        code: 'BRAKE_COVERAGE_GAP' as const,
        alertType: 'COVERAGE_GAP',
        category: 'DATA_QUALITY' as const,
        reasonCode: 'COVERAGE_GAP',
        severity: 'info' as const,
        message: 'Gap',
        messageEn: 'Gap',
        displayMode: 'DATA_GAP' as const,
      },
    ];
    expect(hasWearOrSafetyAlert(openAlerts)).toBe(false);

    const wearAlerts = [
      {
        code: 'BRAKE_PAD_WARNING' as const,
        alertType: 'PAD_WARNING',
        category: 'WEAR' as const,
        reasonCode: 'PAD_WARNING_ESTIMATED',
        severity: 'warning' as const,
        message: 'Warn',
        messageEn: 'Warn',
        displayMode: 'ESTIMATED' as const,
      },
    ];
    expect(hasWearOrSafetyAlert(wearAlerts)).toBe(true);
  });

  it('legacy DTO fields are optional compat — canonical fields required on summary shape', () => {
    const summary = {
      isInitialized: true,
      stateClass: 'MEASURED',
      overallCondition: 'GOOD',
      dataBasis: 'MEASURED',
      confidenceLevel: 'HIGH',
      openAlerts: [],
      legacy: {
        padsHealthPct: 72,
        discsHealthPct: null,
        padsRemainingKm: 28000,
        discsRemainingKm: null,
        status: 'good',
        remainingKm: 28000,
      },
    } satisfies Pick<
      BrakeHealthSummaryDto,
      | 'isInitialized'
      | 'stateClass'
      | 'overallCondition'
      | 'dataBasis'
      | 'confidenceLevel'
      | 'openAlerts'
      | 'legacy'
    >;

    expect(summary.overallCondition).toBe('GOOD');
    expect(summary.legacy.padsHealthPct).toBe(72);
    expect(hasWearOrSafetyAlert(summary.openAlerts)).toBe(false);
  });
});
