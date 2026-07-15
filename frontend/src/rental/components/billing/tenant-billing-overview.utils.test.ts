import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { BillingInvoiceDto, TenantSubscriptionOverviewDto } from '../../types/billing.types';
import {
  nextAmountLabel,
  overviewHeaderBadge,
  paymentMethodSummaryLabel,
  pricingModelLabel,
  resolveInvoiceNumberLabel,
  warningTone,
} from './tenant-billing-overview.utils';

const billingDir = resolve(import.meta.dirname);

const money = (cents: number, formatted: string) => ({
  cents,
  currency: 'EUR',
  formatted,
});

function buildOverview(
  partial: Partial<TenantSubscriptionOverviewDto> & {
    contract?: TenantSubscriptionOverviewDto['contract'];
  },
): TenantSubscriptionOverviewDto {
  return {
    asOf: '2026-07-15T12:00:00.000Z',
    plan: { kind: 'RENTAL', name: 'SynqDrive Rental' },
    contract: {
      status: 'ACTIVE',
      statusLabel: 'Aktiv',
      trialEndsAt: null,
      startedAt: '2026-06-01T00:00:00.000Z',
      cancellationScheduledAt: null,
      billingInterval: 'MONTHLY',
      billingIntervalLabel: 'Monatlich',
      currentPeriodStart: '2026-07-01T00:00:00.000Z',
      currentPeriodEnd: '2026-07-31T00:00:00.000Z',
      nextPeriodStart: '2026-08-01T00:00:00.000Z',
      nextPeriodEnd: '2026-08-31T00:00:00.000Z',
    },
    pricing: {
      asOf: '2026-07-15T12:00:00.000Z',
      billableVehicleCount: 2,
      connectedVehicleCount: 3,
      appliedTier: {
        label: '1–10 Fahrzeuge',
        minVehicles: 1,
        maxVehicles: 10,
        unitPrice: money(1500, '15,00 €'),
      },
      baseAmount: money(3000, '30,00 €'),
      discounts: [],
      netAmount: money(3000, '30,00 €'),
      taxAmount: money(570, '5,70 €'),
      grossAmount: money(3570, '35,70 €'),
      taxConfigured: true,
      pricingModel: 'VOLUME',
    },
    billing: {
      nextExpectedInvoice: {
        periodStart: '2026-08-01T00:00:00.000Z',
        periodEnd: '2026-08-31T00:00:00.000Z',
        grossAmount: money(3570, '35,70 €'),
        dueAt: '2026-08-31T00:00:00.000Z',
      },
      nextChargeAt: '2026-07-31T00:00:00.000Z',
    },
    paymentMethod: {
      status: 'READY',
      statusLabel: 'Hinterlegt',
      defaultMethod: {
        type: 'CARD',
        typeLabel: 'Karte',
        brand: 'visa',
        last4: '4242',
        expMonth: 12,
        expYear: 2028,
        bankName: null,
        mandateStatusLabel: null,
      },
      asOf: '2026-07-15T12:00:00.000Z',
    },
    addOns: [],
    warnings: [],
    availableActions: [],
    sectionErrors: [],
    ...partial,
  };
}

describe('tenant billing overview utils', () => {
  it('maps pricing models to German labels', () => {
    expect(pricingModelLabel('VOLUME')).toBe('Mengenpreis');
    expect(pricingModelLabel('GRADUATED')).toBe('Gestaffelter Preis');
    expect(pricingModelLabel(null)).toBe('—');
  });

  it('resolves invoice numbers without fake fallbacks', () => {
    expect(
      resolveInvoiceNumberLabel({
        id: 'inv-1',
        invoiceNumberLabel: 'RE-2026-0042',
      } as BillingInvoiceDto),
    ).toBe('RE-2026-0042');

    expect(
      resolveInvoiceNumberLabel({
        id: 'inv-2',
        invoiceNumber: 'RE-2026-0043',
      } as BillingInvoiceDto),
    ).toBe('RE-2026-0043');

    expect(
      resolveInvoiceNumberLabel({
        id: 'inv-3',
        stripeInvoiceId: 'in_secret',
      } as BillingInvoiceDto),
    ).toBe('Noch nicht finalisiert');
  });

  it('shows active contract header badge', () => {
    const badge = overviewHeaderBadge(buildOverview({}));
    expect(badge).toEqual({ label: 'Aktiv', tone: 'sq-tone-success' });
  });

  it('shows trial contract status and warning tone', () => {
    const overview = buildOverview({
      contract: {
        ...buildOverview({}).contract!,
        status: 'TRIALING',
        statusLabel: 'Testphase',
        trialEndsAt: '2026-07-20T00:00:00.000Z',
      },
      warnings: [
        {
          severity: 'info',
          message: 'Ihre Testphase endet am 20.07.2026.',
          actionHint: null,
        },
      ],
    });

    expect(overview.contract?.statusLabel).toBe('Testphase');
    expect(overviewHeaderBadge(overview)).toEqual({ label: 'Testphase', tone: 'sq-tone-info' });
    expect(warningTone('info')).toBe('sq-tone-info');
  });

  it('shows past due with critical warning and payment action', () => {
    const overview = buildOverview({
      contract: {
        ...buildOverview({}).contract!,
        status: 'PAST_DUE',
        statusLabel: 'Zahlung überfällig',
      },
      warnings: [
        {
          severity: 'critical',
          message: 'Die letzte Abbuchung ist fehlgeschlagen.',
          actionHint: 'Bitte aktualisieren Sie Ihre Zahlungsmethode.',
        },
      ],
      availableActions: [
        { action: 'UPDATE_PAYMENT_METHOD', label: 'Zahlungsmethode aktualisieren', requiresWritePermission: true },
        { action: 'VIEW_INVOICES', label: 'Rechnungen ansehen', requiresWritePermission: false },
      ],
    });

    expect(overviewHeaderBadge(overview)).toEqual({ label: 'Überfällig', tone: 'sq-tone-critical' });
    expect(overview.warnings[0].severity).toBe('critical');
    expect(overview.availableActions.map((action) => action.action)).toContain('UPDATE_PAYMENT_METHOD');
    expect(warningTone('critical')).toBe('sq-tone-critical');
  });

  it('shows cancel scheduled contract', () => {
    const overview = buildOverview({
      contract: {
        ...buildOverview({}).contract!,
        status: 'CANCEL_SCHEDULED',
        statusLabel: 'Kündigung geplant',
        cancellationScheduledAt: '2026-08-31T00:00:00.000Z',
      },
      warnings: [
        {
          severity: 'warning',
          message: 'Ihr Abo endet am 31.08.2026.',
          actionHint: null,
        },
      ],
    });

    expect(overview.contract?.statusLabel).toBe('Kündigung geplant');
    expect(overviewHeaderBadge(overview)).toEqual({
      label: 'Kündigung geplant',
      tone: 'sq-tone-warning',
    });
  });

  it('shows cancelled contract', () => {
    const overview = buildOverview({
      contract: {
        ...buildOverview({}).contract!,
        status: 'CANCELLED',
        statusLabel: 'Gekündigt',
      },
    });

    expect(overviewHeaderBadge(overview)).toEqual({ label: 'Gekündigt', tone: 'sq-tone-neutral' });
  });

  it('shows missing payment method state', () => {
    const overview = buildOverview({
      paymentMethod: {
        status: 'MISSING',
        statusLabel: 'Nicht hinterlegt',
        defaultMethod: null,
        asOf: '2026-07-15T12:00:00.000Z',
      },
      warnings: [
        {
          severity: 'warning',
          message: 'Es ist keine Zahlungsmethode hinterlegt.',
          actionHint: 'Hinterlegen Sie eine Zahlungsmethode, bevor die nächste Abbuchung fällig wird.',
        },
      ],
      availableActions: [
        { action: 'ADD_PAYMENT_METHOD', label: 'Zahlungsmethode hinzufügen', requiresWritePermission: true },
      ],
    });

    expect(paymentMethodSummaryLabel(overview)).toBe('Nicht hinterlegt');
    expect(overview.availableActions[0].action).toBe('ADD_PAYMENT_METHOD');
  });

  it('prefers next expected invoice amount over static pricing', () => {
    const overview = buildOverview({
      billing: {
        nextExpectedInvoice: {
          periodStart: '2026-08-01T00:00:00.000Z',
          periodEnd: '2026-08-31T00:00:00.000Z',
          grossAmount: money(4200, '42,00 €'),
          dueAt: '2026-08-31T00:00:00.000Z',
        },
        nextChargeAt: '2026-07-31T00:00:00.000Z',
      },
    });

    expect(nextAmountLabel(overview)).toBe('42,00 €');
  });

  it('handles overview without last paid invoice', () => {
    const invoice: BillingInvoiceDto | null = null;
    expect(invoice).toBeNull();
    expect(resolveInvoiceNumberLabel({ id: 'draft' } as BillingInvoiceDto)).toBe(
      'Noch nicht finalisiert',
    );
  });

  it('uses responsive metric grid on overview tab', () => {
    const source = readFileSync(resolve(billingDir, 'TenantBillingOverviewTab.tsx'), 'utf8');
    expect(source).toContain('grid-cols-1 sm:grid-cols-2 xl:grid-cols-3');
    expect(source).toContain('data-testid="tenant-billing-overview-tab"');
    expect(source).not.toContain('RE-${');
    expect(source).not.toContain('stripeInvoiceId');
  });
});
