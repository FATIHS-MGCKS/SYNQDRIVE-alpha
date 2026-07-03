import type {
  LegalDocumentDto,
  Station,
  TenantOrganizationProfileDto,
  TenantOrganizationProfileUiUpdate,
} from '../../../../lib/api';

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

export const COMPANY_SECTIONS: Array<{ id: CompanySection; label: string }> = [
  { id: 'basis', label: 'Basisdaten' },
  { id: 'contact', label: 'Adresse & Kontakt' },
  { id: 'tax', label: 'Steuer & Rechnung' },
  { id: 'branding', label: 'Branding' },
  { id: 'documents', label: 'Dokumentenstatus' },
  { id: 'history', label: 'Änderungsverlauf' },
];

export const LEGAL_FORM_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'GMBH', label: 'GmbH' },
  { value: 'UG', label: 'UG (haftungsbeschränkt)' },
  { value: 'AG', label: 'AG' },
  { value: 'KG', label: 'KG' },
  { value: 'OHG', label: 'OHG' },
  { value: 'GBR', label: 'GbR' },
  { value: 'EINZELUNTERNEHMEN', label: 'Einzelunternehmen' },
  { value: 'FREIBERUFLER', label: 'Freiberufler' },
  { value: 'OTHER', label: 'Sonstige' },
];

export const LANGUAGE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'de-DE', label: 'Deutsch (de-DE)' },
  { value: 'de', label: 'Deutsch' },
  { value: 'en-US', label: 'Englisch (en-US)' },
  { value: 'en', label: 'Englisch' },
];

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

export const EMPTY_VALUE = 'Nicht hinterlegt';

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

export function validateCompanyDraft(draft: CompanyDraft): string | null {
  if (!draft.companyName.trim()) return 'Anzeigename ist erforderlich.';
  if (!draft.email.trim()) return 'E-Mail ist erforderlich.';
  if (!EMAIL_RE.test(draft.email.trim())) return 'Ungültige E-Mail-Adresse.';
  if (!draft.address.trim() || !draft.city.trim() || !draft.country.trim()) {
    return 'Adresse, Stadt und Land sind erforderlich.';
  }
  if (draft.managerEmail.trim() && !EMAIL_RE.test(draft.managerEmail.trim())) {
    return 'Ungültige E-Mail des Geschäftsführers.';
  }
  if (draft.invoiceEmail.trim() && !EMAIL_RE.test(draft.invoiceEmail.trim())) {
    return 'Ungültige Rechnungs-E-Mail.';
  }
  if (draft.phone.trim() && !PHONE_RE.test(draft.phone.trim())) {
    return 'Telefonnummer wirkt ungültig.';
  }
  if (draft.website.trim() && !WEBSITE_RE.test(draft.website.trim())) {
    return 'Website-Format ungültig (z. B. https://beispiel.de).';
  }
  const vat = draft.defaultVatRate.trim();
  if (vat) {
    const n = Number(vat);
    if (Number.isNaN(n) || n < 0 || n > 100) return 'Standard-MwSt. muss zwischen 0 und 100 liegen.';
  }
  const terms = draft.paymentTermsDays.trim();
  if (terms) {
    const n = Number(terms);
    if (!Number.isInteger(n) || n < 0) return 'Zahlungsziel muss 0 oder größer sein.';
  }
  const invNum = draft.nextInvoiceNumber.trim();
  if (invNum) {
    const n = Number(invNum);
    if (!Number.isInteger(n) || n < 1) return 'Nächste Rechnungsnummer muss mindestens 1 sein.';
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
      label: 'Unternehmensdaten vollständig',
      description: 'Anzeigename, Rechtsform, Geschäftsführung und Lokalisierung.',
      status: companyComplete ? 'done' : 'missing',
      ctaLabel: companyComplete ? undefined : 'Basisdaten öffnen',
      ctaSection: 'basis',
    },
    {
      id: 'billing',
      label: 'Rechnungsdaten vollständig',
      description: 'Steuernummer oder USt-ID, Bankverbindung, MwSt. und Rechnungspräfix.',
      status: billingComplete ? 'done' : 'missing',
      ctaLabel: billingComplete ? undefined : 'Steuer & Rechnung öffnen',
      ctaSection: 'tax',
    },
    {
      id: 'branding',
      label: 'Logo / Branding vorhanden',
      description: 'Logo für Sidebar, Dokumente und Kundenkommunikation.',
      status: brandingOk ? 'done' : 'missing',
      ctaLabel: brandingOk ? undefined : 'Branding öffnen',
      ctaSection: 'branding',
    },
    {
      id: 'legal',
      label: 'Rechtstexte hinterlegt',
      description: 'Aktive AGB und Widerrufsbelehrung.',
      status: legalOk ? 'done' : legalDocs.length > 0 ? 'review' : 'missing',
      ctaLabel: 'AGB & Widerruf verwalten',
      ctaSection: 'documents',
    },
    {
      id: 'station',
      label: 'Hauptstation konfiguriert',
      description: hasStations
        ? 'Mindestens eine Station ist als Hauptstation markiert.'
        : 'Keine Stationen im System — optional.',
      status: stationOk ? 'done' : 'missing',
      ctaLabel: stationOk ? undefined : 'Stationen prüfen',
    },
    {
      id: 'contact',
      label: 'Kontaktinformationen vollständig',
      description: 'E-Mail und mindestens ein weiterer Kanal (Telefon oder Website).',
      status: contactOk ? 'done' : 'missing',
      ctaLabel: contactOk ? undefined : 'Kontakt öffnen',
      ctaSection: 'contact',
    },
  ];
}

export function overallReadiness(items: SetupCheckItem[]): OverallReadiness {
  if (items.some((i) => i.status === 'review')) return 'review';
  if (items.every((i) => i.status === 'done' || i.id === 'station')) return 'ready';
  return 'incomplete';
}

export const READINESS_LABEL: Record<OverallReadiness, string> = {
  ready: 'Bereit',
  incomplete: 'Unvollständig',
  review: 'Prüfung nötig',
};

export const SETUP_STATUS_LABEL: Record<SetupItemStatus, string> = {
  done: 'Erledigt',
  missing: 'Fehlt',
  review: 'Prüfung nötig',
};

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
  { type: 'TERMS_AND_CONDITIONS', label: 'AGB' },
  { type: 'WITHDRAWAL_INFORMATION', label: 'Widerrufsbelehrung' },
] as const;

const SYSTEM_TEMPLATE_ROWS: DocumentStatusRow[] = [
  {
    id: 'RENTAL_CONTRACT',
    label: 'Mietvertragsvorlage',
    status: 'generated',
    detail: 'Wird automatisch aus Buchungs- und Übergabedaten erzeugt.',
  },
  {
    id: 'HANDOVER',
    label: 'Übergabeprotokollvorlage',
    status: 'generated',
    detail: 'Wird automatisch aus Buchungs- und Übergabedaten erzeugt.',
  },
];

const UNCONNECTED_ROWS: DocumentStatusRow[] = [
  {
    id: 'PRIVACY_POLICY',
    label: 'Datenschutzerklärung',
    status: 'unconnected',
    detail: 'Wird später über Datenschutz / Data Authorization angebunden.',
  },
  {
    id: 'TELEMATICS_CONSENT',
    label: 'Telematik- / GPS-Einwilligung',
    status: 'unconnected',
    detail: 'Wird später über Datenschutz / Data Authorization angebunden.',
  },
];

function buildManageableLegalRow(
  legalDocs: LegalDocumentDto[],
  activeByType: Map<string, LegalDocumentDto>,
  type: string,
  label: string,
): DocumentStatusRow {
  const doc = activeByType.get(type);
  if (doc) {
    return {
      id: type,
      label,
      status: 'active',
      detail: `Aktiv · Version ${doc.versionLabel}`,
    };
  }
  const draft = legalDocs.find((d) => d.documentType === type);
  if (draft) {
    return {
      id: type,
      label,
      status: 'review',
      detail: `Entwurf vorhanden (${draft.versionLabel})`,
    };
  }
  return { id: type, label, status: 'missing', detail: 'In Rechtliche Dokumente hinterlegen' };
}

/** Legal readiness — only AGB and Widerrufsbelehrung; ignores privacy/telematics/system templates. */
export function isLegalTextsComplete(legalDocs: LegalDocumentDto[]): boolean {
  const active = legalDocs.filter((d) => d.status === 'ACTIVE');
  return (
    active.some((d) => d.documentType === 'TERMS_AND_CONDITIONS') &&
    active.some((d) => d.documentType === 'WITHDRAWAL_INFORMATION')
  );
}

export function buildDocumentStatusGroups(legalDocs: LegalDocumentDto[]): DocumentStatusGroup[] {
  const activeByType = new Map<string, LegalDocumentDto>();
  for (const doc of legalDocs) {
    if (doc.status === 'ACTIVE' && !activeByType.has(doc.documentType)) {
      activeByType.set(doc.documentType, doc);
    }
  }

  return [
    {
      id: 'manageable',
      title: 'Verwaltbare Rechtstexte',
      description: 'AGB und Widerrufsbelehrung werden unter Rechtliche Dokumente gepflegt.',
      rows: MANAGEABLE_LEGAL_TYPES.map(({ type, label }) =>
        buildManageableLegalRow(legalDocs, activeByType, type, label),
      ),
    },
    {
      id: 'system',
      title: 'Systemvorlagen',
      description: 'Von SynqDrive automatisch erzeugt — kein Upload nötig.',
      rows: SYSTEM_TEMPLATE_ROWS,
    },
    {
      id: 'unconnected',
      title: 'Noch nicht angebunden',
      description: 'Geplante Anbindung über Datenschutz bzw. Data Authorization.',
      rows: UNCONNECTED_ROWS,
    },
  ];
}

/** @deprecated Use buildDocumentStatusGroups for grouped document status UI. */
export function buildDocumentStatusRows(legalDocs: LegalDocumentDto[]): DocumentStatusRow[] {
  return buildDocumentStatusGroups(legalDocs).flatMap((g) => g.rows);
}

export function displayValue(value: string | null | undefined, editing = false): string {
  if (editing) return value ?? '';
  const t = value?.trim();
  return t ? t : EMPTY_VALUE;
}

export const INPUT_CLASS =
  'w-full px-3 py-2.5 rounded-xl border border-border/70 bg-card text-xs text-foreground placeholder:text-muted-foreground transition-all outline-none focus:border-[color:var(--brand)] focus:ring-2 focus:ring-[color:var(--brand-soft)]';

export const LABEL_CLASS = 'block text-[11px] font-semibold mb-1.5 text-muted-foreground';
