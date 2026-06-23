import { BillingStatus, BillingUsageCalculationStatus } from '@prisma/client';

/**
 * Mirrors private warning logic from BillingSummaryService for regression tests.
 */
function buildSummaryWarnings(input: {
  sub: {
    status: BillingStatus;
    currentPeriodEnd?: Date | null;
    cancelAtPeriodEnd?: boolean;
  } | null;
  calculationStatus: BillingUsageCalculationStatus;
  hasActivePaymentMethod: boolean;
}): string[] {
  const warnings: string[] = [];
  if (!input.sub) {
    warnings.push('SUBSCRIPTION_MISSING');
  }
  if (!input.hasActivePaymentMethod) {
    warnings.push('PAYMENT_METHOD_MISSING');
  }
  if (input.calculationStatus === BillingUsageCalculationStatus.PRICE_NOT_CONFIGURED) {
    warnings.push('PRICE_NOT_CONFIGURED');
  }
  if (input.calculationStatus === BillingUsageCalculationStatus.NO_ACTIVE_PRICE_VERSION) {
    warnings.push('NO_ACTIVE_PRICE_VERSION');
  }
  if (input.sub?.status === BillingStatus.PAST_DUE) warnings.push('PAST_DUE');
  if (input.calculationStatus === BillingUsageCalculationStatus.NO_BILLABLE_VEHICLES) {
    warnings.push('NO_BILLABLE_VEHICLES');
  }
  if (
    input.sub?.currentPeriodEnd &&
    input.sub.currentPeriodEnd.getTime() < Date.now()
  ) {
    warnings.push('PERIOD_ENDED');
  }
  if (input.sub?.cancelAtPeriodEnd) {
    warnings.push('CANCEL_AT_PERIOD_END');
  }
  return warnings;
}

describe('BillingSummary warnings', () => {
  it('flags missing subscription', () => {
    expect(
      buildSummaryWarnings({
        sub: null,
        calculationStatus: BillingUsageCalculationStatus.NO_ACTIVE_PRICE_VERSION,
        hasActivePaymentMethod: false,
      }),
    ).toContain('SUBSCRIPTION_MISSING');
  });

  it('flags past due and period ended', () => {
    const warnings = buildSummaryWarnings({
      sub: {
        status: BillingStatus.PAST_DUE,
        currentPeriodEnd: new Date('2020-01-01'),
      },
      calculationStatus: BillingUsageCalculationStatus.OK,
      hasActivePaymentMethod: true,
    });
    expect(warnings).toContain('PAST_DUE');
    expect(warnings).toContain('PERIOD_ENDED');
  });

  it('flags price not configured without crashing', () => {
    expect(
      buildSummaryWarnings({
        sub: { status: BillingStatus.ACTIVE },
        calculationStatus: BillingUsageCalculationStatus.PRICE_NOT_CONFIGURED,
        hasActivePaymentMethod: false,
      }),
    ).toEqual(
      expect.arrayContaining(['PRICE_NOT_CONFIGURED', 'PAYMENT_METHOD_MISSING']),
    );
  });
});
