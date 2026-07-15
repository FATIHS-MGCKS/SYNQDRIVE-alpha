import type {
  TenantSubscriptionTariffDetailsDto,
  TenantSubscriptionTariffPricingDto,
  TenantVehicleBillingChangeDto,
} from '../../types/billing.types';
import { formatDateDe } from './billing.utils';
import { pricingModelLabel } from './tenant-billing-overview.utils';

export function planKindLabel(kind: TenantSubscriptionTariffDetailsDto['planKind']): string {
  if (kind === 'RENTAL') return 'SynqDrive Rental';
  if (kind === 'FLEET') return 'SynqDrive Fleet';
  return '—';
}

export function formatPeriodRange(start: string | null | undefined, end: string | null | undefined): string {
  if (!start && !end) return '—';
  return `${formatDateDe(start)} – ${formatDateDe(end)}`;
}

export function pricingBreakdownRows(pricing: TenantSubscriptionTariffPricingDto | null) {
  if (!pricing) return [];

  const rows: Array<{ label: string; value: string; emphasize?: boolean }> = [
    {
      label: 'Abrechenbare Fahrzeuge',
      value: String(pricing.billableVehicleCount),
    },
    {
      label: 'Preisstaffel',
      value: pricing.appliedTier?.label ?? '—',
    },
  ];

  if (pricing.pricingModel === 'GRADUATED' && pricing.tierBreakdown.length > 0) {
    // Graduated lines are rendered in a dedicated table in the UI.
  } else if (pricing.appliedTier?.unitPrice) {
    rows.push({
      label: 'Stückpreis',
      value: `${pricing.appliedTier.unitPrice.formatted} pro Fahrzeug`,
    });
  }

  rows.push(
    {
      label: 'Grundbetrag',
      value: pricing.baseAmount?.formatted ?? '—',
    },
    ...pricing.discounts.map((discount) => ({
      label: discount.label,
      value: `−${discount.amount.formatted}`,
    })),
    {
      label: 'Netto',
      value: pricing.netAmount?.formatted ?? '—',
    },
    {
      label: 'Steuer',
      value: pricing.taxConfigured ? pricing.taxAmount?.formatted ?? '—' : 'Noch nicht hinterlegt',
    },
    {
      label: 'Brutto',
      value: pricing.grossAmount?.formatted ?? '—',
      emphasize: true,
    },
    {
      label: 'Währung',
      value: pricing.currency ?? '—',
    },
    {
      label: 'Stand der Berechnung',
      value: formatDateDe(pricing.calculatedAt),
    },
    {
      label: 'Preismodell',
      value: pricingModelLabel(pricing.pricingModel),
    },
  );

  return rows;
}

export function changeTypeLabel(change: TenantVehicleBillingChangeDto): string {
  switch (change.changeType) {
    case 'ADDED':
      return 'Hinzugefügt';
    case 'REMOVED':
      return 'Entfernt';
    default:
      return 'Geändert';
  }
}

export function changeTypeTone(changeType: TenantVehicleBillingChangeDto['changeType']): string {
  switch (changeType) {
    case 'ADDED':
      return 'sq-tone-success';
    case 'REMOVED':
      return 'sq-tone-warning';
    default:
      return 'sq-tone-neutral';
  }
}
