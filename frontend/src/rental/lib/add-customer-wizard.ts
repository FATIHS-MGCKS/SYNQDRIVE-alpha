import { api } from '../../lib/api';
import type {
  CustomerVerificationEligibility,
  DocumentEligibilityStatus,
} from './customer-verification';
import {
  buildCustomerCreatePayload,
  type BuildCustomerCreatePayloadArgs,
  type PendingCustomerDocumentFiles,
} from './entityMappers';

export type AddCustomerFormState = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  street: string;
  zip: string;
  city: string;
  type: 'Individual' | 'Corporate';
  company: string;
  licenseNumber: string;
  licenseExpiry: string;
  licenseClass: string;
  idType: 'Personalausweis' | 'Reisepass';
  idNumber: string;
  idExpiry: string;
  notes: string;
};

export const DEFAULT_ADD_CUSTOMER_FORM: AddCustomerFormState = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  street: '',
  zip: '',
  city: 'Kassel',
  type: 'Individual',
  company: '',
  licenseNumber: '',
  licenseExpiry: '',
  licenseClass: 'B',
  idType: 'Personalausweis',
  idNumber: '',
  idExpiry: '',
  notes: '',
};

const DIDIT_DOCUMENT_OK: DocumentEligibilityStatus[] = [
  'verified',
  'pending',
  'requires_review',
];

function isDiditDocumentOk(status?: DocumentEligibilityStatus): boolean {
  return status != null && DIDIT_DOCUMENT_OK.includes(status);
}

export function addCustomerFormToPayload(form: AddCustomerFormState): BuildCustomerCreatePayloadArgs {
  return {
    firstName: form.firstName,
    lastName: form.lastName,
    email: form.email,
    phone: form.phone,
    street: form.street,
    zip: form.zip,
    city: form.city || 'Kassel',
    country: 'DE',
    type: form.type,
    company: form.type === 'Corporate' ? form.company : undefined,
    licenseNumber: form.licenseNumber,
    licenseExpiry: form.licenseExpiry,
    licenseClass: form.licenseClass,
    idType: form.idType,
    idNumber: form.idNumber,
    idExpiry: form.idExpiry,
    notes: form.notes,
  };
}

export function validateAddCustomerDocumentsStep(
  pending: PendingCustomerDocumentFiles,
  eligibility: CustomerVerificationEligibility | null,
  messages: {
    idFront: string;
    idBack: string;
    licenseFront: string;
  },
): Record<string, string> {
  const errors: Record<string, string> = {};

  const idManual = Boolean(pending.ID_FRONT && pending.ID_BACK);
  const idDidit = isDiditDocumentOk(eligibility?.idDocument);
  if (!idManual && !idDidit) {
    if (!pending.ID_FRONT && !idDidit) errors.idFront = messages.idFront;
    if (!pending.ID_BACK && !idDidit) errors.idBack = messages.idBack;
  }

  const licenseManual = Boolean(pending.LICENSE_FRONT);
  const licenseDidit = isDiditDocumentOk(eligibility?.drivingLicense);
  if (!licenseManual && !licenseDidit) {
    errors.licenseFront = messages.licenseFront;
  }

  return errors;
}

/** Persist customer before document step so Didit sessions can bind to customerId. */
export async function ensureWizardDraftCustomer(
  orgId: string,
  draftCustomerId: string | null,
  form: AddCustomerFormState,
): Promise<string> {
  const payload = buildCustomerCreatePayload(addCustomerFormToPayload(form));
  if (draftCustomerId) {
    await api.customers.update(orgId, draftCustomerId, payload);
    return draftCustomerId;
  }
  const created = await api.customers.create(orgId, payload);
  return created.id;
}
