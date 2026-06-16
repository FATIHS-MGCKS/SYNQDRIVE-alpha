export interface TenantOrganizationProfileDto {
  id: string;
  companyName: string;
  legalCompanyName: string | null;
  legalForm: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  country: string | null;
  /** @deprecated Legacy combined tax identifier — prefer taxNumber / vatId */
  taxId: string | null;
  taxNumber: string | null;
  vatId: string | null;
  isSmallBusiness: boolean;
  defaultVatRate: number | null;
  invoicePrefix: string | null;
  nextInvoiceNumber: number;
  paymentTermsDays: number;
  invoiceEmail: string | null;
  bankName: string | null;
  iban: string | null;
  bic: string | null;
  pdfFooterText: string | null;
  emailSignature: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  timezone: string | null;
  language: string | null;
  managerName: string | null;
  managerEmail: string | null;
  logoUrl: string | null;
  logoDarkUrl: string | null;
  pdfLogoUrl: string | null;
  accentColor: string | null;
  businessType: string;
}

export const TENANT_PROFILE_CRITICAL_FIELDS = [
  'companyName',
  'legalCompanyName',
  'taxNumber',
  'vatId',
  'taxId',
  'invoicePrefix',
  'nextInvoiceNumber',
  'iban',
] as const;
