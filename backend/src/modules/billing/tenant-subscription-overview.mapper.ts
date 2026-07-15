import { BillingPaymentMethodType, BillingUsageCalculationStatus } from '@prisma/client';
import { formatBillingDate, formatBillingMoney } from './email/billing-email.util';
import {
  BillingAddonKey,
  BillingProductKind,
  SubscriptionStatus,
} from './domain/billing-domain.types';
import { AppliedDiscountLine } from './domain/discount-calculator';
import { ResolvedOrganizationContract } from './domain/billing-resolver.types';
import { SubscriptionPricePreview } from './domain/subscription-price-preview.types';
import {
  TenantBillingAction,
  TenantBillingActionDto,
  TenantBillingWarningDto,
  TenantDefaultPaymentMethodDto,
  TenantMoneyDto,
  TenantPaymentMethodStatus,
  TenantSubscriptionAddOnDto,
  TenantSubscriptionContractDto,
  TenantSubscriptionDiscountDto,
  TenantSubscriptionPlanDto,
  TenantSubscriptionTierDto,
} from './dto/tenant-subscription-overview.dto';
import { BillingEntitlementSnapshot } from './domain/billing-entitlements';
import { SafePaymentMethodView } from './domain/stripe-payment-methods';

const PLAN_NAMES: Record<string, string> = {
  RENTAL: 'SynqDrive Rental',
  FLEET: 'SynqDrive Fleet',
};

const STATUS_LABELS: Record<SubscriptionStatus, string> = {
  DRAFT: 'Entwurf',
  TRIALING: 'Testphase',
  ACTIVE: 'Aktiv',
  PAST_DUE: 'Zahlung überfällig',
  PAUSED: 'Pausiert',
  CANCEL_SCHEDULED: 'Kündigung geplant',
  CANCELLED: 'Beendet',
  INCOMPLETE: 'Unvollständig',
};

const PAYMENT_STATUS_LABELS: Record<TenantPaymentMethodStatus, string> = {
  READY: 'Hinterlegt',
  MISSING: 'Nicht hinterlegt',
  REQUIRES_ACTION: 'Bestätigung erforderlich',
  FAILED: 'Ungültig oder abgelaufen',
};

const ADDON_LABELS: Record<BillingAddonKey, string> = {
  VOICE_AGENT: 'Sprachassistent',
  AI_PACKAGE: 'KI-Paket',
  WHATSAPP: 'WhatsApp',
};

const ADDON_STATUS_LABELS = {
  ACTIVE: 'Aktiv',
  TRIALING: 'Testphase',
  GRACE_PERIOD: 'Karenzzeit',
  SCHEDULED_CANCEL: 'Kündigung geplant',
  PAUSED: 'Pausiert',
  INACTIVE: 'Inaktiv',
} as const;

const INTERVAL_LABELS: Record<string, string> = {
  MONTH: 'Monatlich',
  MONTHLY: 'Monatlich',
  YEAR: 'Jährlich',
  YEARLY: 'Jährlich',
};

const PAYMENT_TYPE_LABELS: Record<string, string> = {
  CARD: 'Karte',
  SEPA_DEBIT: 'SEPA-Lastschrift',
  OTHER: 'Zahlungsmethode',
};

const MANDATE_STATUS_LABELS: Record<string, string> = {
  active: 'Aktiv',
  pending: 'Ausstehend',
  inactive: 'Inaktiv',
};

export function toTenantMoney(
  cents: number | null | undefined,
  currency: string | null | undefined,
): TenantMoneyDto | null {
  if (cents == null || currency == null) return null;
  const formatted = formatBillingMoney(cents, currency, 'de');
  if (!formatted) return null;
  return { cents, currency, formatted };
}

export function resolvePlanDto(input: {
  productKey: string | null;
  productName: string | null;
}): TenantSubscriptionPlanDto | null {
  const key = (input.productKey ?? '').toUpperCase();
  if (key !== BillingProductKind.RENTAL && key !== BillingProductKind.FLEET) {
    return null;
  }
  return {
    kind: key,
    name: input.productName?.trim() || PLAN_NAMES[key] || key,
  };
}

export function resolveContractDto(input: {
  contract: ResolvedOrganizationContract;
  trialEndsAt: Date | null;
  startedAt: Date | null;
  cancellationScheduledAt: Date | null;
  billingInterval: string | null;
}): TenantSubscriptionContractDto {
  const { contract } = input;
  const periodStart = contract.currentPeriod.start;
  const periodEnd = contract.currentPeriod.end;
  const nextPeriodStart = new Date(periodEnd.getTime() + 1);

  return {
    status: contract.status,
    statusLabel: STATUS_LABELS[contract.status] ?? contract.status,
    trialEndsAt: toIsoDate(input.trialEndsAt),
    startedAt: toIsoDate(input.startedAt),
    cancellationScheduledAt: toIsoDate(input.cancellationScheduledAt),
    billingInterval: normalizeInterval(input.billingInterval),
    billingIntervalLabel:
      INTERVAL_LABELS[normalizeInterval(input.billingInterval)] ?? 'Monatlich',
    currentPeriodStart: periodStart.toISOString(),
    currentPeriodEnd: periodEnd.toISOString(),
    nextPeriodStart: nextPeriodStart.toISOString(),
    nextPeriodEnd: addIntervalEnd(nextPeriodStart, input.billingInterval).toISOString(),
  };
}

export function resolveTierDto(
  preview: SubscriptionPricePreview,
): TenantSubscriptionTierDto | null {
  const tier = preview.tier;
  if (!tier) return null;

  const maxLabel = tier.maxVehicles != null ? `–${tier.maxVehicles}` : '+';
  const label = `${tier.minVehicles}${maxLabel} Fahrzeuge`;

  return {
    label,
    minVehicles: tier.minVehicles,
    maxVehicles: tier.maxVehicles,
    unitPrice: toTenantMoney(tier.unitPriceCents, preview.currency),
  };
}

export function resolveDiscountDtos(
  discounts: AppliedDiscountLine[],
  currency: string | null,
): TenantSubscriptionDiscountDto[] {
  if (!currency) return [];
  return discounts.map((discount) => ({
    label: buildDiscountLabel(discount),
    amount: toTenantMoney(discount.appliedAmountCents, currency)!,
  }));
}

export function resolveDefaultPaymentMethodDto(
  paymentMethod: SafePaymentMethodView | null,
): TenantDefaultPaymentMethodDto | null {
  if (!paymentMethod) return null;

  const type =
    paymentMethod.type === BillingPaymentMethodType.CARD
      ? 'CARD'
      : paymentMethod.type === BillingPaymentMethodType.SEPA_DEBIT
        ? 'SEPA_DEBIT'
        : 'OTHER';

  return {
    type,
    typeLabel: PAYMENT_TYPE_LABELS[type],
    brand: paymentMethod.brand,
    last4: paymentMethod.last4,
    expMonth: paymentMethod.expMonth,
    expYear: paymentMethod.expYear,
    bankName: paymentMethod.sepaBankCode,
    mandateStatusLabel: paymentMethod.sepaMandateStatus
      ? MANDATE_STATUS_LABELS[paymentMethod.sepaMandateStatus.toLowerCase()] ??
        paymentMethod.sepaMandateStatus
      : null,
  };
}

export function mapPaymentMethodStatus(
  billingState: SafePaymentMethodView['billingState'] | 'MISSING',
): TenantPaymentMethodStatus {
  if (billingState === 'READY') return 'READY';
  if (billingState === 'REQUIRES_ACTION') return 'REQUIRES_ACTION';
  if (billingState === 'FAILED') return 'FAILED';
  return 'MISSING';
}

export function paymentStatusLabel(status: TenantPaymentMethodStatus): string {
  return PAYMENT_STATUS_LABELS[status];
}

export function resolveAddOnDtos(entitlements: BillingEntitlementSnapshot): TenantSubscriptionAddOnDto[] {
  return entitlements.addons
    .filter((addon) => addon.active)
    .map((addon) => ({
      key: addon.addonKey,
      name: ADDON_LABELS[addon.addonKey] ?? addon.addonKey,
      statusLabel:
        ADDON_STATUS_LABELS[addon.status as keyof typeof ADDON_STATUS_LABELS] ?? addon.status,
      active: addon.active,
    }));
}

export function buildOverviewWarnings(input: {
  contract: ResolvedOrganizationContract | null;
  preview: SubscriptionPricePreview | null;
  paymentStatus: TenantPaymentMethodStatus;
  trialEndsAt: Date | null;
  cancellationScheduledAt: Date | null;
}): TenantBillingWarningDto[] {
  const warnings: TenantBillingWarningDto[] = [];
  const status = input.contract?.status ?? null;

  if (!input.contract?.subscriptionId) {
    warnings.push({
      severity: 'info',
      message: 'Für Ihre Organisation ist noch kein SynqDrive-Abonnement eingerichtet.',
      actionHint: 'Bitte wenden Sie sich an den SynqDrive-Support.',
    });
    return warnings;
  }

  if (input.paymentStatus === 'MISSING' && status !== SubscriptionStatus.CANCELLED) {
    warnings.push({
      severity: 'warning',
      message: 'Es ist keine gültige Zahlungsmethode hinterlegt.',
      actionHint: 'Bitte hinterlegen Sie eine Zahlungsmethode, um Unterbrechungen zu vermeiden.',
    });
  }

  if (input.paymentStatus === 'REQUIRES_ACTION') {
    warnings.push({
      severity: 'critical',
      message: 'Ihre Zahlungsmethode muss noch bestätigt werden.',
      actionHint: 'Bitte schließen Sie die Bestätigung Ihrer Zahlungsmethode ab.',
    });
  }

  if (input.paymentStatus === 'FAILED') {
    warnings.push({
      severity: 'critical',
      message: 'Ihre hinterlegte Zahlungsmethode ist ungültig oder abgelaufen.',
      actionHint: 'Bitte aktualisieren Sie Ihre Zahlungsmethode.',
    });
  }

  if (status === SubscriptionStatus.PAST_DUE) {
    warnings.push({
      severity: 'critical',
      message: 'Eine Zahlung ist überfällig.',
      actionHint: 'Bitte prüfen Sie Ihre Rechnungen und aktualisieren Sie die Zahlungsmethode.',
    });
  }

  if (
    status === SubscriptionStatus.CANCEL_SCHEDULED ||
    input.contract?.cancelAtPeriodEnd
  ) {
    const dateLabel = formatBillingDate(
      input.cancellationScheduledAt ?? input.contract?.currentPeriod.end,
      'de',
    );
    warnings.push({
      severity: 'info',
      message: dateLabel
        ? `Ihr Abonnement endet am ${dateLabel}.`
        : 'Die Kündigung Ihres Abonnements ist geplant.',
      actionHint: null,
    });
  }

  if (status === SubscriptionStatus.TRIALING && input.trialEndsAt) {
    const dateLabel = formatBillingDate(input.trialEndsAt, 'de');
    if (dateLabel) {
      warnings.push({
        severity: 'info',
        message: `Ihre Testphase endet am ${dateLabel}.`,
        actionHint: null,
      });
    }
  }

  if (
    input.preview?.calculationStatus === BillingUsageCalculationStatus.NO_BILLABLE_VEHICLES
  ) {
    warnings.push({
      severity: 'warning',
      message: 'Derzeit sind keine abrechenbaren Fahrzeuge vorhanden.',
      actionHint: 'Verbinden Sie Fahrzeuge, damit die Abrechnung korrekt berechnet werden kann.',
    });
  }

  if (
    input.preview?.calculationStatus === BillingUsageCalculationStatus.PRICE_NOT_CONFIGURED ||
    input.preview?.calculationStatus === BillingUsageCalculationStatus.NO_ACTIVE_PRICE_VERSION
  ) {
    warnings.push({
      severity: 'warning',
      message: 'Die Preisgestaltung für Ihr Abonnement ist noch nicht vollständig hinterlegt.',
      actionHint: 'Bitte wenden Sie sich an den SynqDrive-Support.',
    });
  }

  if ((input.preview?.totalDiscountCents ?? 0) > 0) {
    const formatted = formatBillingMoney(
      input.preview!.totalDiscountCents,
      input.preview!.currency ?? 'EUR',
      'de',
    );
    warnings.push({
      severity: 'info',
      message: formatted
        ? `Ein Rabatt von ${formatted} wird auf die nächste Abrechnung angewendet.`
        : 'Ein Rabatt wird auf die nächste Abrechnung angewendet.',
      actionHint: null,
    });
  }

  return warnings;
}

export function buildAvailableActions(input: {
  contract: ResolvedOrganizationContract | null;
  paymentStatus: TenantPaymentMethodStatus;
  portalAvailable: boolean;
}): TenantBillingActionDto[] {
  const actions: TenantBillingActionDto[] = [];
  const hasContract = Boolean(input.contract?.subscriptionId);
  const status = input.contract?.status ?? null;

  if (hasContract) {
    actions.push({
      action: 'VIEW_INVOICES',
      label: 'Rechnungen anzeigen',
      requiresWritePermission: false,
    });
  }

  if (
    hasContract &&
    status !== SubscriptionStatus.CANCELLED &&
    input.paymentStatus === 'MISSING'
  ) {
    actions.push({
      action: 'ADD_PAYMENT_METHOD',
      label: 'Zahlungsmethode hinzufügen',
      requiresWritePermission: true,
    });
  }

  if (
    hasContract &&
    (input.paymentStatus === 'FAILED' ||
      input.paymentStatus === 'REQUIRES_ACTION' ||
      status === SubscriptionStatus.PAST_DUE)
  ) {
    actions.push({
      action: 'UPDATE_PAYMENT_METHOD',
      label: 'Zahlungsmethode aktualisieren',
      requiresWritePermission: true,
    });
  }

  if (hasContract && input.paymentStatus !== 'MISSING') {
    actions.push({
      action: 'MANAGE_PAYMENT_METHOD',
      label: 'Zahlungsmethoden verwalten',
      requiresWritePermission: true,
    });
  }

  if (input.portalAvailable && hasContract && status !== SubscriptionStatus.CANCELLED) {
    actions.push({
      action: 'OPEN_CUSTOMER_PORTAL',
      label: 'Kundenportal öffnen',
      requiresWritePermission: true,
    });
  }

  return actions;
}

function buildDiscountLabel(discount: AppliedDiscountLine): string {
  if (discount.reason?.trim()) {
    return discount.reason.trim();
  }
  if (discount.kind === 'PERCENTAGE' && discount.percentBps != null) {
    return `${(discount.percentBps / 100).toFixed(2).replace(/\.00$/, '')}% Rabatt`;
  }
  return 'Rabatt';
}

function toIsoDate(value: Date | null | undefined): string | null {
  if (!value) return null;
  return value.toISOString();
}

function normalizeInterval(interval: string | null | undefined): string {
  const raw = (interval ?? 'MONTH').toUpperCase();
  if (raw === 'MONTHLY') return 'MONTH';
  if (raw === 'YEARLY') return 'YEAR';
  return raw;
}

function addIntervalEnd(start: Date, interval: string | null | undefined): Date {
  const normalized = normalizeInterval(interval);
  if (normalized === 'YEAR') {
    return new Date(start.getFullYear() + 1, start.getMonth(), start.getDate(), 23, 59, 59, 999);
  }
  return new Date(start.getFullYear(), start.getMonth() + 1, 0, 23, 59, 59, 999);
}

export const tenantOverviewMapperInternals = {
  STATUS_LABELS,
  PLAN_NAMES,
};
