/**
 * Rental Parts & Accessories presentation helpers.
 * Machine category/sort/availability values stay unchanged; labels resolve via TranslationKey.
 */
import {
  DEFAULT_PRODUCT_LOCALE,
  getFormattingLocale,
  isSupportedLocale,
  type SupportedLocale,
} from '../../i18n/locales';
import { translateKey } from '../../i18n/LanguageContext';
import type { TranslationKey } from '../../i18n/translations/en';

/** Persisted search category values — never translate for API payloads. */
export const PARTS_CATEGORY_VALUES = ['TIRES', 'PARTS', 'ACCESSORIES'] as const;
export type PartsCategoryValue = (typeof PARTS_CATEGORY_VALUES)[number];

export const PARTS_SORT_VALUES = ['relevance', 'price_asc', 'price_desc'] as const;
export type PartsSortValue = (typeof PARTS_SORT_VALUES)[number];

export const AVAILABILITY_STATUS_VALUES = ['in_stock', 'limited', 'out_of_stock'] as const;
export type AvailabilityStatusValue = (typeof AVAILABILITY_STATUS_VALUES)[number];

export const FITMENT_STATUS_VALUES = ['exact_fit', 'likely_fit'] as const;
export type FitmentStatusValue = (typeof FITMENT_STATUS_VALUES)[number];

export const PARTS_WIZARD_STEP_KEYS = [
  'vehicle',
  'category',
  'provider',
  'authorization',
  'results',
  'detail',
] as const;

const CATEGORY_LABEL_KEYS: Record<PartsCategoryValue, TranslationKey> = {
  TIRES: 'partsAccessories.category.TIRES.label',
  PARTS: 'partsAccessories.category.PARTS.label',
  ACCESSORIES: 'partsAccessories.category.ACCESSORIES.label',
};

const CATEGORY_DESC_KEYS: Record<PartsCategoryValue, TranslationKey> = {
  TIRES: 'partsAccessories.category.TIRES.desc',
  PARTS: 'partsAccessories.category.PARTS.desc',
  ACCESSORIES: 'partsAccessories.category.ACCESSORIES.desc',
};

const SORT_LABEL_KEYS: Record<PartsSortValue, TranslationKey> = {
  relevance: 'partsAccessories.sort.relevance',
  price_asc: 'partsAccessories.sort.priceAsc',
  price_desc: 'partsAccessories.sort.priceDesc',
};

const AVAILABILITY_LABEL_KEYS: Record<AvailabilityStatusValue, TranslationKey> = {
  in_stock: 'partsAccessories.availability.in_stock',
  limited: 'partsAccessories.availability.limited',
  out_of_stock: 'partsAccessories.availability.out_of_stock',
};

const FITMENT_LABEL_KEYS: Record<FitmentStatusValue, TranslationKey> = {
  exact_fit: 'partsAccessories.fitment.exact_fit',
  likely_fit: 'partsAccessories.fitment.likely_fit',
};

const WIZARD_STEP_LABEL_KEYS = Object.fromEntries(
  PARTS_WIZARD_STEP_KEYS.map((key) => [key, `partsAccessories.wizard.step.${key}` as TranslationKey]),
) as Record<(typeof PARTS_WIZARD_STEP_KEYS)[number], TranslationKey>;

export function resolvePartsAccessoriesLocale(locale: string | null | undefined): SupportedLocale {
  return isSupportedLocale(locale) ? locale : DEFAULT_PRODUCT_LOCALE;
}

export function pa(
  locale: string,
  key: TranslationKey,
  vars?: Record<string, string | number>,
): string {
  return translateKey(resolvePartsAccessoriesLocale(locale), key, vars).text;
}

export function partsFormattingLocale(locale: string): string {
  return getFormattingLocale(resolvePartsAccessoriesLocale(locale));
}

export function formatPartsPrice(
  locale: string,
  value: number | undefined,
  currency: string,
): string {
  if (value == null) return pa(locale, 'partsAccessories.emptyValue');
  return new Intl.NumberFormat(partsFormattingLocale(locale), {
    style: 'currency',
    currency: currency || 'EUR',
  }).format(value);
}

export function formatPartsDate(locale: string, iso: string): string {
  return new Date(iso).toLocaleDateString(partsFormattingLocale(locale), {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function labelCategory(locale: string, category: string): string {
  const key = CATEGORY_LABEL_KEYS[category as PartsCategoryValue];
  return key ? pa(locale, key) : category;
}

export function descCategory(locale: string, category: string): string {
  const key = CATEGORY_DESC_KEYS[category as PartsCategoryValue];
  return key ? pa(locale, key) : '';
}

export function labelSortOption(locale: string, sort: string): string {
  const key = SORT_LABEL_KEYS[sort as PartsSortValue];
  return key ? pa(locale, key) : sort;
}

export function labelAvailability(locale: string, status: string): string {
  const key = AVAILABILITY_LABEL_KEYS[status as AvailabilityStatusValue];
  if (key) return pa(locale, key);
  if (!status) return pa(locale, 'partsAccessories.availability.unknown');
  return pa(locale, 'partsAccessories.availability.unknown');
}

export function labelFitment(locale: string, status: string): string {
  const key = FITMENT_LABEL_KEYS[status as FitmentStatusValue];
  if (key) return pa(locale, key);
  return pa(locale, 'partsAccessories.fitment.universal');
}

export function labelWizardStep(locale: string, stepKey: string): string {
  const key = WIZARD_STEP_LABEL_KEYS[stepKey as (typeof PARTS_WIZARD_STEP_KEYS)[number]];
  return key ? pa(locale, key) : stepKey;
}

export function availabilityBadgeStyle(status: string, dk: boolean): string {
  if (status === 'in_stock') return dk ? 'bg-emerald-500/15 text-emerald-400' : 'bg-emerald-50 text-emerald-700';
  if (status === 'limited') return dk ? 'bg-amber-500/15 text-amber-400' : 'bg-amber-50 text-amber-700';
  if (status === 'out_of_stock') return dk ? 'bg-red-500/15 text-red-400' : 'bg-red-50 text-red-700';
  return dk ? 'bg-neutral-500/15 text-neutral-400' : 'bg-muted text-muted-foreground';
}

export function fitmentBadgeStyle(status: string, dk: boolean): string {
  if (status === 'exact_fit') return dk ? 'bg-emerald-500/15 text-emerald-400' : 'bg-emerald-50 text-emerald-700';
  if (status === 'likely_fit') return dk ? 'bg-amber-500/15 text-amber-400' : 'bg-amber-50 text-amber-700';
  return dk ? 'bg-neutral-500/15 text-neutral-400' : 'bg-muted text-muted-foreground';
}
