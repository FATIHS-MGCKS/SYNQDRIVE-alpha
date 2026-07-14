/** Deterministic IDs and clock for invoice pipeline integration tests. */
export const FIXED_NOW = new Date('2026-07-15T10:00:00.000Z');

export interface InvoicePipelineFixtureIds {
  orgA: string;
  orgB: string;
  customerPrivate: string;
  customerCompany: string;
  customerOtherOrg: string;
  vehicleA: string;
  vehicleOtherOrg: string;
  vendorA: string;
  bookingWizard: string;
  bookingForm: string;
  userAdmin: string;
}

export function createInvoicePipelineFixtures(): InvoicePipelineFixtureIds {
  return {
    orgA: 'org-invoice-pipeline-a',
    orgB: 'org-invoice-pipeline-b',
    customerPrivate: 'cust-private-a',
    customerCompany: 'cust-company-a',
    customerOtherOrg: 'cust-org-b',
    vehicleA: 'vehicle-a',
    vehicleOtherOrg: 'vehicle-org-b',
    vendorA: 'vendor-a',
    bookingWizard: 'booking-wizard-a',
    bookingForm: 'booking-form-a',
    userAdmin: 'user-admin-a',
  };
}

export const LINE_ITEM_NET = {
  description: 'Miete',
  quantity: 1,
  unitPriceNetCents: 8403,
  taxRate: 19,
};
