/**
 * Rental Vehicle Documents presentation adapter (P2.2.59 read-only overview/list slice).
 * Locale-aware display helpers and static TranslationKeys only.
 */
import {
  DEFAULT_PRODUCT_LOCALE,
  isSupportedLocale,
  type SupportedLocale,
} from '../../i18n/locales';
import type { TranslationKey } from '../../i18n/translations/en';
import { vehicleFormattingLocaleOrDefault } from '../components/vehicle/vehicle-i18n';
import type {
  VehicleDocumentCategoryId,
  VehicleDocumentUiStatus,
} from './vehicle-file-summary.types';

type Translate = (key: TranslationKey, vars?: Record<string, string | number>) => string;

const EMPTY_HINT_PROOF_TEMPLATE_IDS: VehicleDocumentCategoryId[] = [
  'service_proof',
  'tire_proof',
  'brake_proof',
  'battery_proof',
];

const CATEGORY_IDS: VehicleDocumentCategoryId[] = [
  'registration',
  'insurance',
  'tax',
  'leasing_financing',
  'tuv_hu',
  'bokraft',
  'service_proof',
  'repair_proof',
  'tire_proof',
  'brake_proof',
  'battery_proof',
  'damage_accident',
  'other',
];

function isKnownCategoryId(id: string): id is VehicleDocumentCategoryId {
  return (CATEGORY_IDS as string[]).includes(id);
}

function categoryKey(
  id: VehicleDocumentCategoryId,
  field: 'shortTitle' | 'description' | 'emptyHint',
): TranslationKey {
  return `vehicleDocuments.category.${id}.${field}` as TranslationKey;
}

export function resolveRentalVehicleDocumentsLocale(
  locale: string | null | undefined,
): SupportedLocale {
  return isSupportedLocale(locale) ? locale : DEFAULT_PRODUCT_LOCALE;
}

export function resolveVehicleDocumentCategoryShortTitle(
  categoryId: string,
  t: Translate,
  backendLabel?: string | null,
): string {
  if (isKnownCategoryId(categoryId)) {
    return t(categoryKey(categoryId, 'shortTitle'));
  }
  return backendLabel?.trim() || categoryId;
}

export function resolveVehicleDocumentCategoryDescription(
  categoryId: string,
  t: Translate,
): string {
  if (isKnownCategoryId(categoryId)) {
    return t(categoryKey(categoryId, 'description'));
  }
  return '';
}

export function resolveVehicleDocumentCategoryEmptyHint(
  categoryId: string,
  t: Translate,
): string {
  if (isKnownCategoryId(categoryId)) {
    if (EMPTY_HINT_PROOF_TEMPLATE_IDS.includes(categoryId)) {
      return t('vehicleDocuments.category.emptyHintProof', {
        categoryShortTitle: t(categoryKey(categoryId, 'shortTitle')),
      });
    }
    return t(categoryKey(categoryId, 'emptyHint'));
  }
  return '';
}

export function resolveVehicleDocumentUiStatusLabel(
  status: VehicleDocumentUiStatus,
  t: Translate,
): string {
  const key = `vehicleDocuments.status.${status}` as TranslationKey;
  const translated = t(key);
  if (translated !== key) return translated;
  return status;
}

export function resolveTimelineKindLabel(kind: string | undefined, t: Translate): string | null {
  if (!kind) return null;
  const key = `vehicleDocuments.timelineKind.${kind}` as TranslationKey;
  const translated = t(key);
  if (translated !== key) return translated;
  return kind;
}

export function resolveFixedCostStatusLabel(status: string, t: Translate): string {
  if (status === 'verified') return t('vehicleDocuments.fixedCostStatus.verified');
  if (status === 'missing_evidence') return t('vehicleDocuments.fixedCostStatus.missing_evidence');
  if (status === 'not_configured') return t('vehicleDocuments.fixedCostStatus.not_configured');
  return t('vehicleDocuments.specs.notProvided');
}

export function resolveStatusSourceLabel(source: string, t: Translate): string {
  const key = `vehicleDocuments.statusSource.${source}` as TranslationKey;
  const translated = t(key);
  if (translated !== key) return translated;
  return source;
}

export function resolveRentalHealthLabel(
  status: 'healthy' | 'warning' | 'critical' | 'blocked' | 'unknown' | null | undefined,
  t: Translate,
): string {
  switch (status) {
    case 'healthy':
      return t('vehicle.overview.readiness.ready');
    case 'warning':
      return t('vehicleDocuments.rentalHealth.warning');
    case 'critical':
      return t('vehicleDocuments.rentalHealth.critical');
    case 'blocked':
      return t('vehicleDocuments.rentalHealth.blocked');
    default:
      return t('vehicle.overview.readiness.unknown');
  }
}

export function formatVehicleDocumentDate(
  locale: string,
  iso: string | null | undefined,
  withTime = false,
): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(vehicleFormattingLocaleOrDefault(locale), {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  });
}

export function formatVehicleDocumentSpecValue(
  value: string | number | null,
  t: Translate,
): string {
  if (value == null || value === '') return t('vehicleDocuments.specs.notProvided');
  return String(value);
}

export function resolveVehicleDocumentsDisplayName(
  make: string | null | undefined,
  model: string | null | undefined,
  t: Translate,
): string {
  const name = [make, model].filter(Boolean).join(' ');
  return name || t('vehicleDocuments.vehicle.fallback');
}
