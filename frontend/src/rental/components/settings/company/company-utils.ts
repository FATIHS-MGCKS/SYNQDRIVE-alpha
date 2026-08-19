import type {
  LegalDocumentDto,
  Station,
  TenantOrganizationProfileDto,
  TenantOrganizationProfileUiUpdate,
} from '../../../../lib/api';
import type { TranslationKey } from '../../../../i18n/translations/en';
import { st } from '../../tasks-settings/settings-i18n';
import { rs } from '../../../lib/rental-surface-ui';

export type CompanySection =
  | 'basis'
  | 'contact'
  | 'tax'
  | 'branding'
  | 'documents'
  | 'history';

export type SetupItemStatus = 'done' | 'missing' | 'review';

export interface CompanyDraft {
  companyName: string;
  legalCompanyName: string;
  legalForm: string;
  managerName: string;
  managerEmail: string;
  language: string;
  timezone: string;
  address: string;
  zip: string;
  city: string;
  state: string;
  country: string;
  phone: string;
  email: string;
  website: string;
  invoiceEmail: string;
  taxNumber: string;
  vatId: string;
  isSmallBusiness: boolean;
  defaultVatRate: string;
  paymentTermsDays: string;
  invoicePrefix: string;
  nextInvoiceNumber: string;
  bankName: string;
  iban: string;
  bic: string;
  accentColor: string;
  pdfFooterText: string;
  emailSignature: string;
}

export function getCompanySections(locale: string): Array<{ id: CompanySection; label: string }> {
  return [
    { id: 'basis', label: st(locale, 'settings.company.sections.basis') },
    { id: 'contact', label: st(locale, 'settings.company.sections.contact') },
    { id: 'tax', label: st(locale, 'settings.company.sections.tax') },
    { id: 'branding', label: st(locale, 'settings.company.sections.branding') },
    { id: 'documents', label: st(locale, 'settings.company.sections.documents') },
    { id: 'history', label: st(locale, 'settings.company.sections.history') },
  ];
}

const LEGAL_FORM_KEYS: Record<string, TranslationKey> = {
  GMBH: 'settings.company.legalForm.GMBH',
  UG: 'settings.company.legalForm.UG',
  AG: 'settings.company.legalForm.AG',
  KG: 'settings.company.legalForm.KG',
  OHG: 'settings.company.legalForm.OHG',
  GBR: 'settings.company.legalForm.GBR',
  EINZELUNTERNEHMEN: 'settings.company.legalForm.EINZELUNTERNEHMEN',
  FREIBERUFLER: 'settings.company.legalForm.FREIBERUFLER',
  OTHER: 'settings.company.legalForm.OTHER',
};

export function getLegalFormOptions(locale: string): Array<{ value: string; label: string }> {
  return Object.entries(LEGAL_FORM_KEYS).map(([value, key]) => ({
    value,
    label: st(locale, key),
  }));
}

export function getCompanyLanguageOptions(locale: string): Array<{ value: string; label: string }> {
  return [
    { value: 'de-DE', label: st(locale, 'settings.company.language.deDE') },
    { value: 'de', label: st(locale, 'settings.company.language.de') },
    { value: 'en-US', label: st(locale, 'settings.company.language.enUS') },
    { value: 'en', label: st(locale, 'settings.company.language.en') },
  ];
}

export const TIMEZONE_OPTIONS = [
  'Europe/Berlin',
  'Europe/Vienna',
  'Europe/Zurich',
  'Europe/Paris',
  'Europe/London',
  'Europe/Amsterdam',
  'Europe/Warsaw',
  'UTC',
] as const;

export function getEmptyValue(locale: string): string {
  return st(locale, 'settings.company.emptyValue');
}

export function draftFromProfile(p: TenantOrganizationProfileDto): CompanyDraft {
  return {
    companyName: p.companyName ?? '',
    legalCompanyName: p.legalCompanyName ?? '',
    legalForm: p.legalForm ?? '',
    managerName: p.managerName ?? '',
    managerEmail: p.managerEmail ?? '',
    language: p.language ?? '',
    timezone: p.timezone ?? '',
    address: p.address ?? '',
    zip: p.zip ?? '',
    city: p.city ?? '',
    state: p.state ?? '',
    country: p.country ?? '',
    phone: p.phone ?? '',
    email: p.email ?? '',
    website: p.website ?? '',
    invoiceEmail: p.invoiceEmail ?? '',
    taxNumber: p.taxNumber ?? '',
    vatId: p.vatId ?? '',
    isSmallBusiness: p.isSmallBusiness ?? false,
    defaultVatRate: p.defaultVatRate != null ? String(p.defaultVatRate) : '',
    paymentTermsDays: String(p.paymentTermsDays ?? 7),
    invoicePrefix: p.invoicePrefix ?? '',
    nextInvoiceNumber: String(p.nextInvoiceNumber ?? 1),
    bankName: p.bankName ?? '',
    iban: p.iban ?? '',
    bic: p.bic ?? '',
    accentColor: p.accentColor ?? '',
    pdfFooterText: p.pdfFooterText ?? '',
    emailSignature: p.emailSignature ?? '',
  };
}

export function cloneDraft(d: CompanyDraft): CompanyDraft {
  return { ...d };
}

export function isDraftDirty(a: CompanyDraft, b: CompanyDraft): boolean {
  return JSON.stringify(a) !== JSON.stringify(b);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[+]?[\d\s()./-]{6,}$/;
const WEBSITE_RE = /^(https?:\/\/)?[\w.-]+\.[a-z]{2,}(\/.*)?$/i;

export function normalizeWebsiteInput(value: string): string {
  const t = value.trim();
  if (!t) return '';
  if (/^https?:\/\//i.test(t)) return t;
  return `https://${t}`;
}

export function validateCompanyDraft(locale: string, draft: CompanyDraft): string | null {
  if (!draft.companyName.trim()) return st(locale, 'settings.company.validation.displayNameRequired');
  if (!draft.email.trim()) return st(locale, 'settings.company.validation.emailRequired');
  if (!EMAIL_RE.test(draft.email.trim())) return st(locale, 'settings.company.validation.emailInvalid');
  if (!draft.address.trim() || !draft.city.trim() || !draft.country.trim()) {
    return st(locale, 'settings.company.validation.addressRequired');
  }
  if (draft.managerEmail.trim() && !EMAIL_RE.test(draft.managerEmail.trim())) {
    return st(locale, 'settings.company.validation.managerEmailInvalid');
  }
  if (draft.invoiceEmail.trim() && !EMAIL_RE.test(draft.invoiceEmail.trim())) {
    return st(locale, 'settings.company.validation.invoiceEmailInvalid');
  }
  if (draft.phone.trim() && !PHONE_RE.test(draft.phone.trim())) {
    return st(locale, 'settings.company.validation.phoneInvalid');
  }
  if (draft.website.trim() && !WEBSITE_RE.test(draft.website.trim())) {
    return st(locale, 'settings.company.validation.websiteInvalid');
  }
  const vat = draft.defaultVatRate.trim();
  if (vat) {
    const n = Number(vat);
    if (Number.isNaN(n) || n < 0 || n > 100) return st(locale, 'settings.company.validation.vatRange');
  }
  const terms = draft.paymentTermsDays.trim();
  if (terms) {
    const n = Number(terms);
    if (!Number.isInteger(n) || n < 0) return st(locale, 'settings.company.validation.paymentTerms');
  }
  const invNum = draft.nextInvoiceNumber.trim();
  if (invNum) {
    const n = Number(invNum);
    if (!Number.isInteger(n) || n < 1) return st(locale, 'settings.company.validation.invoiceNumber');
  }
  return null;
}

export function draftToUpdatePayload(draft: CompanyDraft): TenantOrganizationProfileUiUpdate {
  const str = (v: string) => {
    const t = v.trim();
    return t.length ? t : null;
  };
  const vat = draft.defaultVatRate.trim();
  return {
    companyName: draft.companyName.trim(),
    legalCompanyName: str(draft.legalCompanyName),
    legalForm: str(draft.legalForm) as TenantOrganizationProfileUiUpdate['legalForm'],
    managerName: str(draft.managerName),
    managerEmail: str(draft.managerEmail),
    language: str(draft.language) as TenantOrganizationProfileUiUpdate['language'],
    timezone: str(draft.timezone),
    address: str(draft.address),
    zip: str(draft.zip),
    city: str(draft.city),
    state: str(draft.state),
    country: str(draft.country),
    phone: str(draft.phone),
    email: str(draft.email),
    website: draft.website.trim() ? normalizeWebsiteInput(draft.website) : null,
    invoiceEmail: str(draft.invoiceEmail),
    taxNumber: str(draft.taxNumber),
    vatId: str(draft.vatId),
    isSmallBusiness: draft.isSmallBusiness,
    defaultVatRate: vat ? Number(vat) : null,
    paymentTermsDays: Number(draft.paymentTermsDays) || 0,
    invoicePrefix: str(draft.invoicePrefix),
    nextInvoiceNumber: Number(draft.nextInvoiceNumber) || 1,
    bankName: str(draft.bankName),
    iban: str(draft.iban),
    bic: str(draft.bic),
    accentColor: str(draft.accentColor),
    pdfFooterText: str(draft.pdfFooterText),
    emailSignature: str(draft.emailSignature),
  };
}

export type OverallReadiness = 'ready' | 'incomplete' | 'review';

export interface SetupCheckItem {
  id: string;
  label: string;
  description: string;
  status: SetupItemStatus;
  ctaLabel?: string;
  ctaSection?: CompanySection;
}

/** Billing readiness — legacy `taxId` is intentionally ignored. */
export function isBillingDataComplete(
  profile: TenantOrganizationProfileDto | null | undefined,
): boolean {
  if (!profile) return false;
  const hasTaxIdentifier = Boolean(profile.taxNumber?.trim() || profile.vatId?.trim());
  return Boolean(
    hasTaxIdentifier &&
      profile.invoicePrefix?.trim() &&
      profile.paymentTermsDays != null &&
      profile.defaultVatRate != null &&
      profile.iban?.trim() &&
      profile.bankName?.trim(),
  );
}

export function computeSetupChecklist(
  locale: string,
  profile: TenantOrganizationProfileDto | null,
  logoUrl: string | null,
  legalDocs: LegalDocumentDto[],
  stations: Station[],
): SetupCheckItem[] {
  const p = profile;
  const companyComplete = Boolean(
    p?.companyName?.trim() &&
      p?.legalCompanyName?.trim() &&
      p?.legalForm?.trim() &&
      p?.managerName?.trim() &&
      p?.language?.trim() &&
      p?.timezone?.trim(),
  );
  const billingComplete = isBillingDataComplete(p);
  const brandingOk = Boolean(logoUrl?.trim());
  const legalOk = isLegalTextsComplete(legalDocs);
  const hasStations = stations.length > 0;
  const primaryStation = stations.some((s) => s.isPrimary);
  const stationOk = !hasStations || primaryStation;
  const contactOk = Boolean(
    p?.email?.trim() && (p?.phone?.trim() || p?.website?.trim()),
  );

  return [
    {
      id: 'company',
      label: st(locale, 'settings.company.setup.item.company.label'),
      description: st(locale, 'settings.company.setup.item.company.description'),
      status: companyComplete ? 'done' : 'missing',
      ctaLabel: companyComplete ? undefined : st(locale, 'settings.company.setup.item.company.cta'),
      ctaSection: 'basis',
    },
    {
      id: 'billing',
      label: st(locale, 'settings.company.setup.item.billing.label'),
      description: st(locale, 'settings.company.setup.item.billing.description'),
      status: billingComplete ? 'done' : 'missing',
      ctaLabel: billingComplete ? undefined : st(locale, 'settings.company.setup.item.billing.cta'),
      ctaSection: 'tax',
    },
    {
      id: 'branding',
      label: st(locale, 'settings.company.setup.item.branding.label'),
      description: st(locale, 'settings.company.setup.item.branding.description'),
      status: brandingOk ? 'done' : 'missing',
      ctaLabel: brandingOk ? undefined : st(locale, 'settings.company.setup.item.branding.cta'),
      ctaSection: 'branding',
    },
    {
      id: 'legal',
      label: st(locale, 'settings.company.setup.item.legal.label'),
      description: st(locale, 'settings.company.setup.item.legal.description'),
      status: legalOk ? 'done' : legalDocs.length > 0 ? 'review' : 'missing',
      ctaLabel: st(locale, 'settings.company.setup.item.legal.cta'),
      ctaSection: 'documents',
    },
    {
      id: 'station',
      label: st(locale, 'settings.company.setup.item.station.label'),
      description: hasStations
        ? st(locale, 'settings.company.setup.item.station.descriptionWithStations')
        : st(locale, 'settings.company.setup.item.station.descriptionNoStations'),
      status: stationOk ? 'done' : 'missing',
      ctaLabel: stationOk ? undefined : st(locale, 'settings.company.setup.item.station.cta'),
    },
    {
      id: 'contact',
      label: st(locale, 'settings.company.setup.item.contact.label'),
      description: st(locale, 'settings.company.setup.item.contact.description'),
      status: contactOk ? 'done' : 'missing',
      ctaLabel: contactOk ? undefined : st(locale, 'settings.company.setup.item.contact.cta'),
      ctaSection: 'contact',
    },
  ];
}

export function overallReadiness(items: SetupCheckItem[]): OverallReadiness {
  if (items.some((i) => i.status === 'review')) return 'review';
  if (items.every((i) => i.status === 'done' || i.id === 'station')) return 'ready';
  return 'incomplete';
}

export function getReadinessLabel(locale: string, readiness: OverallReadiness): string {
  return st(locale, `settings.company.setup.readiness.${readiness}`);
}

export function getSetupStatusLabel(locale: string, status: SetupItemStatus): string {
  return st(locale, `settings.company.setup.status.${status}`);
}

export interface DocumentStatusRow {
  id: string;
  label: string;
  status: 'active' | 'missing' | 'generated' | 'unconnected' | 'review';
  detail: string;
}

export type DocumentStatusCategory = 'manageable' | 'system' | 'unconnected';

export interface DocumentStatusGroup {
  id: DocumentStatusCategory;
  title: string;
  description?: string;
  rows: DocumentStatusRow[];
}

const MANAGEABLE_LEGAL_TYPES = [
  { type: 'TERMS_AND_CONDITIONS', labelKey: 'settings.company.documents.terms' as const },
  { type: 'WITHDRAWAL_INFORMATION', labelKey: 'settings.company.documents.withdrawal' as const },
  { type: 'PRIVACY_POLICY', labelKey: 'settings.company.documents.privacy' as const },
] as const;

function getSystemTemplateRows(locale: string): DocumentStatusRow[] {
  return [
    {
      id: 'RENTAL_CONTRACT',
      label: st(locale, 'settings.company.documents.rentalContract'),
      status: 'generated',
      detail: st(locale, 'settings.company.documents.status.generated'),
    },
    {
      id: 'HANDOVER',
      label: st(locale, 'settings.company.documents.handover'),
      status: 'generated',
      detail: st(locale, 'settings.company.documents.status.generated'),
    },
  ];
}

function getUnconnectedRows(locale: string): DocumentStatusRow[] {
  return [
    {
      id: 'TELEMATICS_CONSENT',
      label: st(locale, 'settings.company.documents.telematicsConsent'),
      status: 'unconnected',
      detail: st(locale, 'settings.company.documents.status.unconnected'),
    },
  ];
}

function buildManageableLegalRow(
  locale: string,
  legalDocs: LegalDocumentDto[],
  activeByType: Map<string, LegalDocumentDto>,
  type: string,
  labelKey: TranslationKey,
): DocumentStatusRow {
  const label = st(locale, labelKey);
  const doc = activeByType.get(type);
  if (doc) {
    return {
      id: type,
      label,
      status: 'active',
      detail: st(locale, 'settings.company.documents.status.active', { version: doc.versionLabel }),
    };
  }
  const draft = legalDocs.find((d) => d.documentType === type);
  if (draft) {
    return {
      id: type,
      label,
      status: 'review',
      detail: st(locale, 'settings.company.documents.status.draft', { version: draft.versionLabel }),
    };
  }
  return {
    id: type,
    label,
    status: 'missing',
    detail: st(locale, 'settings.company.documents.status.missing'),
  };
}

/** Legal readiness — only AGB and Widerrufsbelehrung; ignores privacy/telematics/system templates. */
export function isLegalTextsComplete(legalDocs: LegalDocumentDto[]): boolean {
  const active = legalDocs.filter((d) => d.status === 'ACTIVE');
  return (
    active.some((d) => d.documentType === 'TERMS_AND_CONDITIONS') &&
    active.some((d) => d.documentType === 'WITHDRAWAL_INFORMATION')
  );
}

export function buildDocumentStatusGroups(locale: string, legalDocs: LegalDocumentDto[]): DocumentStatusGroup[] {
  const activeByType = new Map<string, LegalDocumentDto>();
  for (const doc of legalDocs) {
    if (doc.status === 'ACTIVE' && !activeByType.has(doc.documentType)) {
      activeByType.set(doc.documentType, doc);
    }
  }

  return [
    {
      id: 'manageable',
      title: st(locale, 'settings.company.documents.group.manageable.title'),
      description: st(locale, 'settings.company.documents.group.manageable.description'),
      rows: MANAGEABLE_LEGAL_TYPES.map(({ type, labelKey }) =>
        buildManageableLegalRow(locale, legalDocs, activeByType, type, labelKey),
      ),
    },
    {
      id: 'system',
      title: st(locale, 'settings.company.documents.group.system.title'),
      description: st(locale, 'settings.company.documents.group.system.description'),
      rows: getSystemTemplateRows(locale),
    },
    {
      id: 'unconnected',
      title: st(locale, 'settings.company.documents.group.unconnected.title'),
      description: st(locale, 'settings.company.documents.group.unconnected.description'),
      rows: getUnconnectedRows(locale),
    },
  ];
}

/** @deprecated Use buildDocumentStatusGroups for grouped document status UI. */
export function buildDocumentStatusRows(locale: string, legalDocs: LegalDocumentDto[]): DocumentStatusRow[] {
  return buildDocumentStatusGroups(locale, legalDocs).flatMap((g) => g.rows);
}

export function displayValue(locale: string, value: string | null | undefined, editing = false): string {
  if (editing) return value ?? '';
  const t = value?.trim();
  return t ? t : getEmptyValue(locale);
}

export const INPUT_CLASS = rs.inputLg;

export const LABEL_CLASS = 'block text-[11px] font-semibold mb-1.5 text-muted-foreground';
