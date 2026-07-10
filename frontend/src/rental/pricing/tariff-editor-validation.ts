import type { TariffEditorFormSnapshot } from './tariff-editor-form-state';

export type TariffEditorFieldKey =
  | 'name'
  | 'currency'
  | 'dailyRateCents'
  | 'weeklyRateCents'
  | 'monthlyRateCents'
  | 'includedKmPerDay'
  | 'extraKmPriceCents'
  | 'depositAmountCents'
  | 'publishEffectiveFrom';

export interface TariffEditorFieldErrors {
  [key: string]: string | undefined;
}

export function validateTariffEditorForm(
  snapshot: TariffEditorFormSnapshot,
  currency: string | null,
): TariffEditorFieldErrors {
  const errors: TariffEditorFieldErrors = {};
  const { rate } = snapshot;

  if (!snapshot.name.trim()) {
    errors.name = 'priceTariffs.editor.errors.nameRequired';
  }
  if (!currency) {
    errors.currency = 'priceTariffs.editor.errors.currencyMissing';
  }
  if (rate.dailyRateCents <= 0) {
    errors.dailyRateCents = 'priceTariffs.editor.errors.dailyRateRequired';
  }
  if (rate.weeklyRateCents < 0) {
    errors.weeklyRateCents = 'priceTariffs.editor.errors.negativePrice';
  }
  if (rate.monthlyRateCents < 0) {
    errors.monthlyRateCents = 'priceTariffs.editor.errors.negativePrice';
  }
  if (rate.includedKmPerDay < 0) {
    errors.includedKmPerDay = 'priceTariffs.editor.errors.negativeKm';
  }
  if (rate.extraKmPriceCents < 0) {
    errors.extraKmPriceCents = 'priceTariffs.editor.errors.negativePrice';
  }
  if (rate.depositAmountCents < 0) {
    errors.depositAmountCents = 'priceTariffs.editor.errors.negativeDeposit';
  }
  if (snapshot.publishEffectiveFrom) {
    const parsed = new Date(snapshot.publishEffectiveFrom);
    if (Number.isNaN(parsed.getTime())) {
      errors.publishEffectiveFrom = 'priceTariffs.editor.errors.invalidEffectiveFrom';
    }
  }

  return errors;
}

export function firstValidationError(errors: TariffEditorFieldErrors): string | null {
  const entry = Object.values(errors).find(Boolean);
  return entry ?? null;
}

export function mapPricingApiErrorToField(code: string | undefined): TariffEditorFieldKey | null {
  switch (code) {
    case 'PRICE_BOOK_CURRENCY_MISSING':
    case 'CURRENCY_MISMATCH':
      return 'currency';
    case 'TARIFF_VERSION_INCOMPLETE':
      return 'dailyRateCents';
    case 'NO_TARIFF_VERSION_FOR_PICKUP':
    case 'INVALID_BOOKING_INSTANT':
      return 'publishEffectiveFrom';
    default:
      return null;
  }
}
