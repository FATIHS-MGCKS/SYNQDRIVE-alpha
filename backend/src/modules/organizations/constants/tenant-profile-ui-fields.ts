import type { UpdateTenantOrganizationProfileDto } from '../dto/update-tenant-organization-profile.dto';

/**
 * Fields editable via Settings → Company Information (form save).
 * Logo is uploaded via POST /profile/logo; legacy taxId is not sent from the UI.
 */
export const TENANT_PROFILE_FORM_UPDATE_FIELDS = [
  'companyName',
  'legalCompanyName',
  'legalForm',
  'managerName',
  'managerEmail',
  'language',
  'timezone',
  'address',
  'zip',
  'city',
  'state',
  'country',
  'phone',
  'email',
  'website',
  'invoiceEmail',
  'taxNumber',
  'vatId',
  'isSmallBusiness',
  'defaultVatRate',
  'paymentTermsDays',
  'invoicePrefix',
  'nextInvoiceNumber',
  'bankName',
  'iban',
  'bic',
  'accentColor',
  'pdfFooterText',
  'emailSignature',
] as const satisfies ReadonlyArray<keyof UpdateTenantOrganizationProfileDto>;

export type TenantProfileFormUpdateField =
  (typeof TENANT_PROFILE_FORM_UPDATE_FIELDS)[number];
