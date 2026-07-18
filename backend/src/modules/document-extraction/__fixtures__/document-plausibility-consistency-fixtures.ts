export const CONSISTENCY_DATE_SEQUENCE_BAD = {
  invoiceDate: '2026-06-01',
  eventDate: '2026-06-01',
  dueDate: '2026-01-01',
  currency: 'EUR',
  totalGross: 1000,
};

export const CONSISTENCY_INSPECTION_DATE_SEQUENCE_BAD = {
  inspectionDate: '2026-06-01',
  validUntil: '2026-01-01',
  eventDate: '2026-06-01',
};

export const CONSISTENCY_INVOICE_NET_GROSS_BAD = {
  invoiceNumber: 'INV-1001',
  currency: 'EUR',
  subtotalNet: 10000,
  totalTax: 1900,
  totalGross: 13000,
};

export const CONSISTENCY_INVOICE_LINE_SUM_BAD = {
  invoiceNumber: 'INV-1002',
  currency: 'EUR',
  totalGross: 11900,
  lineItems: JSON.stringify([
    { description: 'Service', grossCents: 5000 },
    { description: 'Parts', grossCents: 4000 },
  ]),
};

export const CONSISTENCY_VIN_MISMATCH = {
  vin: 'WVWZZZ1KZAW999999',
  eventDate: '2026-03-01',
};

export const CONSISTENCY_PLATE_MISMATCH = {
  licensePlate: 'M-XY-9999',
  eventDate: '2026-03-01',
};

export const CONSISTENCY_BOOKING_OUTSIDE = {
  documentDate: '2026-05-15',
  eventDate: '2026-05-15',
  bookingId: 'bk-2026-0142',
};

export const CONSISTENCY_ODOMETER_BELOW_HISTORY = {
  eventDate: '2026-03-01',
  odometerKm: 1000,
};

export const CONSISTENCY_UNIT_MISSING_TIRE = {
  measurementDate: '2026-03-01',
  treadDepthMm: { fl: 4.2 },
};

export const CONSISTENCY_VALIDITY_BEFORE_INSPECTION = {
  inspectionDate: '2026-06-01',
  validUntil: '2026-05-01',
};

export const CONSISTENCY_DUPLICATE_INVOICE = {
  invoiceNumber: 'INV-EXISTING-42',
  currency: 'EUR',
  totalGross: 5000,
};

export const CONSISTENCY_DUPLICATE_REFERENCE = {
  referenceNumber: 'AZ-2026-4412',
  summary: 'Duplicate authority letter reference',
};

export const CONSISTENCY_MULTIPLE_VEHICLES = {
  vin: 'WVWZZZ1KZAW000001',
  licensePlate: 'B-AB-1234',
  mentionedEntities: JSON.stringify([
    { entityType: 'vehicle', label: 'M-CD-5678' },
    { entityType: 'vehicle', label: 'WVWZZZ1KZAW000099' },
  ]),
};
