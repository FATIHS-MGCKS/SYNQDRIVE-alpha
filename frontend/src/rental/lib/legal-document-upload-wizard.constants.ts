import type { TranslationKey } from '../i18n/translations/en';
import { LEGAL_DOCUMENT_TYPE_CONFIGS } from './legal-document-types';

export const LEGAL_UPLOAD_WIZARD_STEPS: {
  id: number;
  key: string;
  labelKey: TranslationKey;
}[] = [
  { id: 1, key: 'classification', labelKey: 'legalDocuments.wizard.step.classification' },
  { id: 2, key: 'version', labelKey: 'legalDocuments.wizard.step.version' },
  { id: 3, key: 'file', labelKey: 'legalDocuments.wizard.step.file' },
  { id: 4, key: 'review', labelKey: 'legalDocuments.wizard.step.review' },
];

export const LEGAL_UPLOAD_LANGUAGES = [
  { value: 'de', labelKey: 'legalDocuments.option.language.de' as TranslationKey },
  { value: 'en', labelKey: 'legalDocuments.option.language.en' as TranslationKey },
  { value: 'fr', labelKey: 'legalDocuments.option.language.fr' as TranslationKey },
] as const;

export const LEGAL_UPLOAD_JURISDICTIONS = [
  { value: 'DE', labelKey: 'legalDocuments.option.jurisdiction.DE' as TranslationKey },
  { value: 'AT', labelKey: 'legalDocuments.option.jurisdiction.AT' as TranslationKey },
  { value: 'CH', labelKey: 'legalDocuments.option.jurisdiction.CH' as TranslationKey },
] as const;

export const LEGAL_UPLOAD_CUSTOMER_SEGMENTS = [
  { value: 'BOTH', labelKey: 'legalDocuments.option.segment.BOTH' as TranslationKey },
  { value: 'B2C', labelKey: 'legalDocuments.option.segment.B2C' as TranslationKey },
  { value: 'B2B', labelKey: 'legalDocuments.option.segment.B2B' as TranslationKey },
] as const;

export const LEGAL_UPLOAD_BOOKING_CHANNELS = [
  { value: 'ALL', labelKey: 'legalDocuments.option.channel.ALL' as TranslationKey },
  { value: 'WEBSITE', labelKey: 'legalDocuments.option.channel.WEBSITE' as TranslationKey },
  { value: 'OPERATOR_APP', labelKey: 'legalDocuments.option.channel.OPERATOR_APP' as TranslationKey },
  { value: 'MANUAL', labelKey: 'legalDocuments.option.channel.MANUAL' as TranslationKey },
  { value: 'API', labelKey: 'legalDocuments.option.channel.API' as TranslationKey },
] as const;

export const LEGAL_UPLOAD_STATION_SCOPE_MODES = [
  {
    value: 'ORGANIZATION_WIDE',
    labelKey: 'legalDocuments.option.stationScope.ORGANIZATION_WIDE' as TranslationKey,
  },
  {
    value: 'STATION_SPECIFIC',
    labelKey: 'legalDocuments.option.stationScope.STATION_SPECIFIC' as TranslationKey,
  },
] as const;

export const LEGAL_UPLOAD_PRODUCT_SCOPES = [
  { value: '', labelKey: 'legalDocuments.option.productScope.all' as TranslationKey },
  { value: 'RENTAL', labelKey: 'legalDocuments.option.productScope.RENTAL' as TranslationKey },
  { value: 'FLEET', labelKey: 'legalDocuments.option.productScope.FLEET' as TranslationKey },
  { value: 'TAXI', labelKey: 'legalDocuments.option.productScope.TAXI' as TranslationKey },
  { value: 'LOGISTICS', labelKey: 'legalDocuments.option.productScope.LOGISTICS' as TranslationKey },
  { value: 'OTHER', labelKey: 'legalDocuments.option.productScope.OTHER' as TranslationKey },
] as const;

export const LEGAL_DOCUMENT_TYPE_OPTIONS = LEGAL_DOCUMENT_TYPE_CONFIGS.map((c) => ({
  value: c.key,
  labelKey: c.titleKey,
}));

export const LEGAL_CONSUMER_VARIANT_OPTIONS =
  LEGAL_DOCUMENT_TYPE_CONFIGS.find((c) => c.key === 'CONSUMER_INFORMATION')?.variants?.map((v) => ({
    value: v.value,
    labelKey: v.labelKey,
  })) ?? [];

export const LEGAL_UPLOAD_MAX_MB = Math.max(
  1,
  parseInt(import.meta.env.VITE_DOCUMENT_LEGAL_UPLOAD_MAX_MB || '15', 10),
);
