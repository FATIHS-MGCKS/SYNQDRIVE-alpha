/**
 * Rental Vendor Directory presentation helpers.
 * Machine category/scope/service-area/relation values stay unchanged; labels resolve via TranslationKey.
 */
import type { VendorCategory, VendorSourceType, VendorVehicleRelationType } from '../../lib/api';
import {
  DEFAULT_PRODUCT_LOCALE,
  isSupportedLocale,
  type SupportedLocale,
} from '../../i18n/locales';
import { translateKey } from '../../i18n/LanguageContext';
import type { TranslationKey } from '../../i18n/translations/en';
import {
  VENDOR_CATEGORIES,
  VENDOR_SERVICE_AREAS,
  type VendorDirectoryScope,
} from './vendor-directory.utils';

export type VendorDetailTab = 'overview' | 'vehicles' | 'tasks' | 'invoices' | 'documents' | 'history';

export const VENDOR_SCOPE_VALUES = ['ALL', 'ACTIVE', 'INACTIVE', 'LINKED', 'PREFERRED'] as const satisfies readonly VendorDirectoryScope[];

export const VENDOR_RELATION_VALUES = [
  'PRIMARY_WORKSHOP',
  'TIRE_PARTNER',
  'BODY_SHOP',
  'GLASS_REPAIR',
  'CLEANING_PARTNER',
  'INSPECTION_PARTNER',
  'OTHER',
] as const satisfies readonly VendorVehicleRelationType[];

export const VENDOR_DETAIL_TAB_VALUES = [
  'overview',
  'vehicles',
  'tasks',
  'invoices',
  'documents',
  'history',
] as const satisfies readonly VendorDetailTab[];

export const VENDOR_SOURCE_TYPE_VALUES = ['LOCAL_BUSINESS', 'ONLINE_VENDOR'] as const satisfies readonly VendorSourceType[];

const CATEGORY_LABEL_KEYS: Record<VendorCategory, TranslationKey> = {
  WORKSHOP: 'tasks.vendor.category.WORKSHOP',
  SERVICE_PARTNER: 'tasks.vendor.category.SERVICE_PARTNER',
  PAINT_SHOP: 'tasks.vendor.category.PAINT_SHOP',
  BODY_REPAIR: 'tasks.vendor.category.BODY_REPAIR',
  AUTO_GLASS: 'tasks.vendor.category.AUTO_GLASS',
  TIRE_DEALER: 'tasks.vendor.category.TIRE_DEALER',
  PARTS_DEALER: 'vendors.directory.category.PARTS_DEALER',
  DETAILING: 'tasks.vendor.category.DETAILING',
  TUV_STATION: 'tasks.vendor.category.TUV_STATION',
  ONLINE_SUPPLIER: 'vendors.directory.category.ONLINE_SUPPLIER',
  INSURANCE: 'vendors.directory.category.INSURANCE',
  APPRAISER: 'vendors.directory.category.APPRAISER',
  TOWING: 'vendors.directory.category.TOWING',
  DEALERSHIP: 'vendors.directory.category.DEALERSHIP',
  OEM_SERVICE: 'vendors.directory.category.OEM_SERVICE',
  OTHER: 'tasks.vendor.category.OTHER',
};

const SERVICE_AREA_LABEL_KEYS: Record<(typeof VENDOR_SERVICE_AREAS)[number], TranslationKey> = {
  Tires: 'vendors.directory.serviceArea.Tires',
  Brakes: 'vendors.directory.serviceArea.Brakes',
  'Oil / Service': 'vendors.directory.serviceArea.OilService',
  'Body Repair': 'vendors.directory.serviceArea.BodyRepair',
  Paint: 'vendors.directory.serviceArea.Paint',
  'Auto Glass': 'vendors.directory.serviceArea.AutoGlass',
  'Inspections (TÜV/HU)': 'vendors.directory.serviceArea.InspectionsTuvHu',
  'Parts Supply': 'vendors.directory.serviceArea.PartsSupply',
  'Detailing / Reconditioning': 'vendors.directory.serviceArea.DetailingReconditioning',
  'Battery / EV Service': 'vendors.directory.serviceArea.BatteryEvService',
  'Roadside / Towing': 'vendors.directory.serviceArea.RoadsideTowing',
  'General Workshop': 'vendors.directory.serviceArea.GeneralWorkshop',
  Windshield: 'vendors.directory.serviceArea.Windshield',
  Suspension: 'vendors.directory.serviceArea.Suspension',
  Exhaust: 'vendors.directory.serviceArea.Exhaust',
  'AC / Climate': 'vendors.directory.serviceArea.AcClimate',
  Electrical: 'vendors.directory.serviceArea.Electrical',
};

const SCOPE_LABEL_KEYS: Record<VendorDirectoryScope, TranslationKey> = {
  ALL: 'vendors.directory.scope.ALL',
  ACTIVE: 'vendors.directory.scope.ACTIVE',
  INACTIVE: 'vendors.directory.scope.INACTIVE',
  LINKED: 'vendors.directory.scope.LINKED',
  PREFERRED: 'vendors.directory.scope.PREFERRED',
};

const RELATION_LABEL_KEYS: Record<VendorVehicleRelationType, TranslationKey> = {
  PRIMARY_WORKSHOP: 'vendors.directory.relation.PRIMARY_WORKSHOP',
  TIRE_PARTNER: 'vendors.directory.relation.TIRE_PARTNER',
  BODY_SHOP: 'vendors.directory.relation.BODY_SHOP',
  GLASS_REPAIR: 'vendors.directory.relation.GLASS_REPAIR',
  CLEANING_PARTNER: 'vendors.directory.relation.CLEANING_PARTNER',
  INSPECTION_PARTNER: 'vendors.directory.relation.INSPECTION_PARTNER',
  OTHER: 'vendors.directory.relation.OTHER',
};

const TAB_LABEL_KEYS: Record<VendorDetailTab, TranslationKey> = {
  overview: 'vendors.directory.tab.overview',
  vehicles: 'vendors.directory.tab.vehicles',
  tasks: 'vendors.directory.tab.tasks',
  invoices: 'vendors.directory.tab.invoices',
  documents: 'vendors.directory.tab.documents',
  history: 'vendors.directory.tab.history',
};

const SOURCE_TYPE_LABEL_KEYS: Record<VendorSourceType, TranslationKey> = {
  LOCAL_BUSINESS: 'vendors.directory.form.sourceType.LOCAL_BUSINESS',
  ONLINE_VENDOR: 'vendors.directory.form.sourceType.ONLINE_VENDOR',
};

/** Blind-spot guard: every category must resolve to a translation key. */
export const VENDOR_CATEGORY_LABEL_KEY_ENTRIES = VENDOR_CATEGORIES.map((entry) => ({
  value: entry.value,
  labelKey: CATEGORY_LABEL_KEYS[entry.value],
}));

/** Blind-spot guard: every service area must resolve to a translation key. */
export const VENDOR_SERVICE_AREA_LABEL_KEY_ENTRIES = VENDOR_SERVICE_AREAS.map((value) => ({
  value,
  labelKey: SERVICE_AREA_LABEL_KEYS[value],
}));

export function resolveVendorDirectoryLocale(locale: string | null | undefined): SupportedLocale {
  return isSupportedLocale(locale) ? locale : DEFAULT_PRODUCT_LOCALE;
}

export function vdi(
  locale: string,
  key: TranslationKey,
  vars?: Record<string, string | number>,
): string {
  return translateKey(resolveVendorDirectoryLocale(locale), key, vars).text;
}

export function vendorDirectoryFormattingLocale(locale: string): string {
  return resolveVendorDirectoryLocale(locale) === 'de' ? 'de-DE' : 'en-US';
}

export function labelVendorCategory(locale: string, category: VendorCategory): string {
  return vdi(locale, CATEGORY_LABEL_KEYS[category] ?? CATEGORY_LABEL_KEYS.OTHER);
}

export function labelVendorServiceArea(locale: string, serviceArea: string): string {
  const key = SERVICE_AREA_LABEL_KEYS[serviceArea as (typeof VENDOR_SERVICE_AREAS)[number]];
  return key ? vdi(locale, key) : serviceArea;
}

export function labelVendorScope(locale: string, scope: VendorDirectoryScope): string {
  return vdi(locale, SCOPE_LABEL_KEYS[scope]);
}

export function labelVendorRelationType(locale: string, relation: VendorVehicleRelationType): string {
  return vdi(locale, RELATION_LABEL_KEYS[relation] ?? RELATION_LABEL_KEYS.OTHER);
}

export function labelVendorDetailTab(locale: string, tab: VendorDetailTab): string {
  return vdi(locale, TAB_LABEL_KEYS[tab]);
}

export function labelVendorSourceType(locale: string, sourceType: VendorSourceType): string {
  return vdi(locale, SOURCE_TYPE_LABEL_KEYS[sourceType]);
}

export function labelVendorCategoryFilter(
  locale: string,
  category: VendorCategory | 'ALL',
): string {
  if (category === 'ALL') return vdi(locale, 'tasks.vendor.allCategories');
  return labelVendorCategory(locale, category);
}

export function labelVendorServiceAreaFilter(
  locale: string,
  serviceArea: string | 'ALL',
): string {
  if (serviceArea === 'ALL') return vdi(locale, 'tasks.vendor.allServiceAreas');
  return labelVendorServiceArea(locale, serviceArea);
}

export function formatVendorDirectoryDate(
  locale: string,
  value: string | Date | null | undefined,
  options?: Intl.DateTimeFormatOptions,
): string {
  if (value == null || value === '') return vdi(locale, 'vendors.directory.emptyValue');
  const date = value instanceof Date ? value : new Date(String(value));
  if (!Number.isFinite(date.getTime())) return vdi(locale, 'vendors.directory.emptyValue');
  return date.toLocaleDateString(
    vendorDirectoryFormattingLocale(locale),
    options ?? { day: '2-digit', month: '2-digit', year: 'numeric' },
  );
}

export function formatVendorDirectoryDateTime(locale: string, value: string | Date): string {
  const date = value instanceof Date ? value : new Date(String(value));
  if (!Number.isFinite(date.getTime())) return vdi(locale, 'vendors.directory.emptyValue');
  return date.toLocaleString(vendorDirectoryFormattingLocale(locale));
}

export function formatVendorDirectoryAmount(
  locale: string,
  cents: number,
  currency = 'EUR',
): string {
  return new Intl.NumberFormat(vendorDirectoryFormattingLocale(locale), {
    style: 'currency',
    currency,
  }).format(cents / 100);
}
