import type { DocumentExtractionType } from '@prisma/client';
import type { FieldExtractionEvidence } from '@modules/ai/documents/document-extraction-merge.service';
import type { PlausibilityVehicleContext } from './document-extraction-plausibility.service';
import { makePlausibilityCheck, type PlausibilityCheck } from './document-plausibility.types';
import {
  readSubtotalNetCents,
  readTotalGrossCents,
  readTotalTaxCents,
} from './document-invoice-extraction.rules';
import { readInspectionDate, readValidUntil } from './document-inspection-extraction.rules';
import { readMentionedEntitiesRaw } from './document-archive-extraction.rules';

export interface PlausibilityConsistencyContext {
  vehicle?: PlausibilityVehicleContext;
  existingInvoiceNumbers?: string[];
  existingReferenceNumbers?: string[];
  bookingStartDate?: string | null;
  bookingEndDate?: string | null;
  currentExtractionId?: string | null;
}

export interface PlausibilityConsistencyOptions {
  extractionConflicts?: FieldExtractionEvidence[];
}

const NEGATIVE = -0.0001;
const ROUNDING_TOLERANCE_CENTS = 2;
const ODOMETER_HIGH_THRESHOLD_KM = 2_000_000;
const ODOMETER_ABOVE_BUFFER_KM = 200_000;
const ODOMETER_BELOW_BUFFER_KM = 50_000;

function toStr(value: unknown): string | null {
  if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  return null;
}

function toNum(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value.trim().replace(',', '.'));
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function toDate(value: unknown): Date | null {
  const raw = toStr(value);
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normId(value: string): string {
  return value.replace(/[\s-]/g, '').toUpperCase();
}

function normPlate(value: string): string {
  return normId(value);
}

function centsDiff(a: number, b: number): number {
  return Math.abs(Math.round(a) - Math.round(b));
}

function readDocumentDate(fields: Record<string, unknown>): Date | null {
  return (
    toDate(fields.documentDate) ??
    toDate(fields.eventDate) ??
    toDate(fields.invoiceDate) ??
    toDate(fields.inspectionDate) ??
    toDate(fields.measurementDate)
  );
}

function readInvoiceNumber(fields: Record<string, unknown>): string | null {
  return toStr(fields.invoiceNumber) ?? toStr(fields.documentNumber);
}

function readReferenceNumber(fields: Record<string, unknown>): string | null {
  return (
    toStr(fields.referenceNumber) ??
    toStr(fields.reportNumber) ??
    toStr(fields.caseNumber) ??
    toStr(fields.fileNumber)
  );
}

function readLineItemsGrossSum(fields: Record<string, unknown>): number | null {
  const raw = fields.lineItems;
  let items: unknown[] = [];
  if (Array.isArray(raw)) {
    items = raw;
  } else {
    const text = toStr(raw);
    if (!text) return null;
    try {
      const parsed = JSON.parse(text);
      items = Array.isArray(parsed) ? parsed : [];
    } catch {
      return null;
    }
  }
  if (items.length === 0) return null;
  let sum = 0;
  for (const item of items) {
    if (item == null || typeof item !== 'object') continue;
    const gross = toNum((item as Record<string, unknown>).grossCents);
    if (gross != null) sum += gross;
  }
  return sum;
}

function collectVehicleIdentifiers(
  fields: Record<string, unknown>,
): { vins: string[]; plates: string[] } {
  const vins = new Set<string>();
  const plates = new Set<string>();
  const docVin = toStr(fields.vin);
  const docPlate = toStr(fields.licensePlate);
  if (docVin) vins.add(normId(docVin));
  if (docPlate) plates.add(normPlate(docPlate));

  for (const item of readMentionedEntitiesRaw(fields)) {
    if (item == null || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const entityType = toStr(row.entityType)?.toLowerCase();
    const label = toStr(row.label) ?? toStr(row.name) ?? '';
    if (entityType !== 'vehicle' || !label) continue;
    if (/^[A-HJ-NPR-Z0-9]{11,17}$/i.test(label.replace(/[\s-]/g, ''))) {
      vins.add(normId(label));
    } else {
      plates.add(normPlate(label));
    }
  }

  return { vins: [...vins], plates: [...plates] };
}

function checkDateSequence(
  documentType: DocumentExtractionType,
  fields: Record<string, unknown>,
): PlausibilityCheck[] {
  const checks: PlausibilityCheck[] = [];
  const documentDate = readDocumentDate(fields);
  const dueDate = toDate(fields.dueDate);
  const reinspectionDeadline = toDate(fields.reinspectionDeadline);

  if (documentDate && dueDate && dueDate.getTime() < documentDate.getTime()) {
    checks.push(
      makePlausibilityCheck({
        code: 'CONSISTENCY_DATE_SEQUENCE_ORDER',
        status: 'BLOCKER',
        explanation: 'Due date is before the primary document date.',
        fieldPaths: ['documentDate', 'eventDate', 'invoiceDate', 'dueDate'],
        resolutionHint: 'Confirm which date is the invoice/document date and correct the due date.',
        source: 'DOCUMENT',
      }),
    );
  }

  if (documentDate && reinspectionDeadline && reinspectionDeadline.getTime() < documentDate.getTime()) {
    checks.push(
      makePlausibilityCheck({
        code: 'CONSISTENCY_DATE_SEQUENCE_ORDER',
        status: 'WARNING',
        explanation: 'Reinspection deadline is before the inspection/document date.',
        fieldPaths: ['inspectionDate', 'eventDate', 'reinspectionDeadline'],
        resolutionHint: 'Verify reinspection deadline against the inspection date.',
        source: 'DOCUMENT',
      }),
    );
  }

  if (documentType === 'INVOICE' && documentDate) {
  checks.push(
    makePlausibilityCheck({
      code: 'CONSISTENCY_DATE_SEQUENCE_INFO',
      status: 'INFO',
      explanation: `Primary document date resolved to ${documentDate.toISOString().slice(0, 10)}.`,
      fieldPaths: ['invoiceDate', 'eventDate', 'documentDate'],
      source: 'SYSTEM',
    }),
  );
  }

  return checks;
}

function checkAmountSums(fields: Record<string, unknown>): PlausibilityCheck[] {
  const checks: PlausibilityCheck[] = [];
  const gross = readTotalGrossCents(fields) ?? toNum(fields.totalCents);
  const lineGrossSum = readLineItemsGrossSum(fields);
  if (gross != null && lineGrossSum != null) {
    const diff = centsDiff(lineGrossSum, gross);
    if (diff > ROUNDING_TOLERANCE_CENTS) {
      checks.push(
        makePlausibilityCheck({
          code: 'CONSISTENCY_AMOUNT_SUM_MISMATCH',
          status: 'BLOCKER',
          explanation: `Line item gross sum (${lineGrossSum}) does not match total gross (${gross}).`,
          fieldPaths: ['lineItems', 'totalGross', 'totalCents', 'grossCents'],
          resolutionHint: 'Review line items and total gross — values are not auto-corrected.',
          source: 'DOCUMENT',
        }),
      );
    } else if (diff > 0) {
      checks.push(
        makePlausibilityCheck({
          code: 'CONSISTENCY_AMOUNT_SUM_ROUNDING',
          status: 'WARNING',
          explanation: `Minor rounding difference between line items and total gross (${diff} cent(s)).`,
          fieldPaths: ['lineItems', 'totalGross'],
          resolutionHint: 'Confirm whether the rounding difference is acceptable before apply.',
          source: 'DOCUMENT',
        }),
      );
    }
  }
  return checks;
}

function checkNetTaxGross(fields: Record<string, unknown>): PlausibilityCheck[] {
  const checks: PlausibilityCheck[] = [];
  const net = readSubtotalNetCents(fields);
  const tax = readTotalTaxCents(fields);
  const gross = readTotalGrossCents(fields);
  if (net == null || tax == null || gross == null) return checks;

  const expected = net + tax;
  const diff = centsDiff(expected, gross);
  if (diff > ROUNDING_TOLERANCE_CENTS) {
    checks.push(
      makePlausibilityCheck({
        code: 'CONSISTENCY_NET_TAX_GROSS_MISMATCH',
        status: 'BLOCKER',
        explanation: `Net (${net}) + tax (${tax}) does not equal gross (${gross}).`,
        fieldPaths: ['subtotalNet', 'totalTax', 'totalGross', 'netCents', 'taxCents', 'grossCents'],
        resolutionHint: 'Correct net, tax, or gross manually — no automatic amount correction is applied.',
        source: 'DOCUMENT',
      }),
    );
  }
  return checks;
}

function checkVinPlateConflicts(
  documentType: DocumentExtractionType,
  fields: Record<string, unknown>,
  context?: PlausibilityVehicleContext,
): PlausibilityCheck[] {
  const checks: PlausibilityCheck[] = [];
  const docVin = toStr(fields.vin);
  const docPlate = toStr(fields.licensePlate);

  if (docVin && context?.vin && normId(docVin) !== normId(context.vin)) {
    checks.push(
      makePlausibilityCheck({
        code: 'CONSISTENCY_VIN_MISMATCH',
        status: 'BLOCKER',
        explanation: 'VIN on the document does not match the selected vehicle.',
        fieldPaths: ['vin'],
        resolutionHint: 'Reassign the document to the correct vehicle or correct the extracted VIN.',
        source: 'SYNQDRIVE_DB',
      }),
    );
  }

  if (
    docPlate &&
    context?.licensePlate &&
    normPlate(docPlate) !== normPlate(context.licensePlate)
  ) {
    const isFine = documentType === 'FINE';
    checks.push(
      makePlausibilityCheck({
        code: 'CONSISTENCY_PLATE_MISMATCH',
        status: isFine ? 'BLOCKER' : 'WARNING',
        explanation: isFine
          ? `License plate on the document (${docPlate}) does not match the assigned vehicle (${context.licensePlate}).`
          : 'License plate on the document does not match the selected vehicle.',
        fieldPaths: ['licensePlate'],
        resolutionHint: 'Verify vehicle assignment and plate extraction before apply.',
        source: 'SYNQDRIVE_DB',
      }),
    );
  }

  return checks;
}

function checkDocumentDateVsBooking(
  fields: Record<string, unknown>,
  context: PlausibilityConsistencyContext,
): PlausibilityCheck[] {
  const checks: PlausibilityCheck[] = [];
  const documentDate = readDocumentDate(fields);
  const bookingStart = toDate(context.bookingStartDate);
  const bookingEnd = toDate(context.bookingEndDate);
  if (!documentDate || !bookingStart || !bookingEnd) return checks;

  if (
    documentDate.getTime() < bookingStart.getTime() ||
    documentDate.getTime() > bookingEnd.getTime()
  ) {
    checks.push(
      makePlausibilityCheck({
        code: 'CONSISTENCY_DOCUMENT_DATE_OUTSIDE_BOOKING',
        status: 'WARNING',
        explanation: 'Document date falls outside the linked booking period.',
        fieldPaths: ['documentDate', 'eventDate', 'bookingId', 'bookingContext'],
        resolutionHint: 'Confirm booking linkage and whether this is a historical document.',
        source: 'SYNQDRIVE_DB',
      }),
    );
  }
  return checks;
}

function checkOdometerVsHistory(
  fields: Record<string, unknown>,
  context?: PlausibilityVehicleContext,
): PlausibilityCheck[] {
  const checks: PlausibilityCheck[] = [];
  const odometer = toNum(fields.odometerKm);
  const lastKnown = context?.lastKnownOdometerKm ?? null;
  if (odometer == null) return checks;

  if (odometer < NEGATIVE) {
    checks.push(
      makePlausibilityCheck({
        code: 'CONSISTENCY_ODOMETER_NEGATIVE',
        status: 'BLOCKER',
        explanation: 'Extracted odometer reading is negative.',
        fieldPaths: ['odometerKm', 'mileage'],
        resolutionHint: 'Correct the odometer value manually.',
        source: 'DOCUMENT',
      }),
    );
    return checks;
  }

  if (odometer > ODOMETER_HIGH_THRESHOLD_KM) {
    checks.push(
      makePlausibilityCheck({
        code: 'CONSISTENCY_ODOMETER_IMPLAUSIBLE_HIGH',
        status: 'WARNING',
        explanation: 'Extracted odometer reading is implausibly high.',
        fieldPaths: ['odometerKm', 'mileage'],
        resolutionHint: 'Confirm units and decimal placement for the odometer value.',
        source: 'DOCUMENT',
      }),
    );
  }

  if (lastKnown != null) {
    if (odometer > lastKnown + ODOMETER_ABOVE_BUFFER_KM) {
      checks.push(
        makePlausibilityCheck({
          code: 'CONSISTENCY_ODOMETER_FAR_ABOVE_HISTORY',
          status: 'WARNING',
          explanation: `Odometer (${Math.round(odometer)} km) is far above last known mileage (${Math.round(lastKnown)} km).`,
          fieldPaths: ['odometerKm', 'mileage'],
          resolutionHint: 'Confirm this is not a unit mix-up and that the document belongs to this vehicle.',
          source: context?.dimoContextAvailable ? 'DIMO' : 'SYNQDRIVE_DB',
        }),
      );
    } else if (odometer < lastKnown - ODOMETER_BELOW_BUFFER_KM) {
      checks.push(
        makePlausibilityCheck({
          code: 'CONSISTENCY_ODOMETER_FAR_BELOW_HISTORY',
          status: 'WARNING',
          explanation: `Odometer (${Math.round(odometer)} km) is well below last known mileage (${Math.round(lastKnown)} km).`,
          fieldPaths: ['odometerKm', 'mileage'],
          resolutionHint: 'Confirm this is a historical document or correct the mileage reading.',
          source: context?.dimoContextAvailable ? 'DIMO' : 'SYNQDRIVE_DB',
        }),
      );
    }
  }

  return checks;
}

function checkUnits(
  documentType: DocumentExtractionType,
  fields: Record<string, unknown>,
): PlausibilityCheck[] {
  const checks: PlausibilityCheck[] = [];

  if (documentType === 'TIRE') {
    const tread = fields.treadDepthMm;
    const hasTread =
      (tread != null && typeof tread === 'object' && Object.values(tread as object).some((v) => toNum(v) != null)) ||
      Object.keys(fields).some((key) => key.startsWith('treadDepthMm.') && toNum(fields[key]) != null);
    if (hasTread && !toStr(fields.treadDepthUnit)) {
      checks.push(
        makePlausibilityCheck({
          code: 'CONSISTENCY_UNIT_MISSING',
          status: 'BLOCKER',
          explanation: 'Tread depth values are present but treadDepthUnit is missing.',
          fieldPaths: ['treadDepthUnit', 'treadDepthMm'],
          resolutionHint: 'Confirm tread depth unit (expected mm) before apply.',
          source: 'DOCUMENT',
        }),
      );
    }
    const pressure = fields.pressureBar ?? fields.pressure;
    const hasPressure =
      pressure != null &&
      typeof pressure === 'object' &&
      Object.values(pressure as object).some((v) => toNum(v) != null);
    if (hasPressure && !toStr(fields.pressureUnit)) {
      checks.push(
        makePlausibilityCheck({
          code: 'CONSISTENCY_UNIT_MISSING',
          status: 'WARNING',
          explanation: 'Tire pressure values are present but pressureUnit is missing.',
          fieldPaths: ['pressureUnit', 'pressureBar'],
          resolutionHint: 'Confirm pressure unit (bar/psi/kPa) before apply.',
          source: 'DOCUMENT',
        }),
      );
    }
  }

  if (documentType === 'BRAKE' && !toStr(fields.padThicknessUnit) && !toStr(fields.thicknessUnit)) {
    const hasThickness =
      toNum(fields.frontPadMm) != null ||
      toNum(fields.rearPadMm) != null ||
      toNum(fields.frontDiscMm) != null ||
      toNum(fields.rearDiscMm) != null;
    if (hasThickness) {
      checks.push(
        makePlausibilityCheck({
          code: 'CONSISTENCY_UNIT_MISSING',
          status: 'BLOCKER',
          explanation: 'Brake thickness values are present but padThicknessUnit is missing.',
          fieldPaths: ['padThicknessUnit', 'frontPadMm', 'rearPadMm', 'frontDiscMm', 'rearDiscMm'],
          resolutionHint: 'Confirm thickness unit (expected mm) before apply.',
          source: 'DOCUMENT',
        }),
      );
    }
  }

  if (
    (documentType === 'INVOICE' || readTotalGrossCents(fields) != null || toNum(fields.totalCents) != null) &&
    !toStr(fields.currency)
  ) {
    checks.push(
      makePlausibilityCheck({
        code: 'CONSISTENCY_UNIT_MISSING',
        status: 'WARNING',
        explanation: 'Monetary amounts are present but currency is missing.',
        fieldPaths: ['currency', 'totalGross', 'totalCents'],
        resolutionHint: 'Confirm currency explicitly — no silent EUR conversion.',
        source: 'DOCUMENT',
      }),
    );
  }

  return checks;
}

function checkValidityVsInspection(fields: Record<string, unknown>): PlausibilityCheck[] {
  const checks: PlausibilityCheck[] = [];
  const inspectionDate = toDate(readInspectionDate(fields));
  const validUntil = toDate(readValidUntil(fields));
  if (!inspectionDate || !validUntil) return checks;

  if (validUntil.getTime() < inspectionDate.getTime()) {
    checks.push(
      makePlausibilityCheck({
        code: 'CONSISTENCY_VALIDITY_BEFORE_INSPECTION',
        status: 'BLOCKER',
        explanation: 'validUntil is before the inspection date.',
        fieldPaths: ['validUntil', 'inspectionDate', 'eventDate'],
        resolutionHint: 'Correct validUntil or inspection date — dates are not auto-adjusted.',
        source: 'DOCUMENT',
      }),
    );
  }
  return checks;
}

function checkDuplicateInvoiceNumber(
  fields: Record<string, unknown>,
  context: PlausibilityConsistencyContext,
): PlausibilityCheck[] {
  const invoiceNumber = readInvoiceNumber(fields);
  if (!invoiceNumber || !context.existingInvoiceNumbers?.length) return [];
  const normalized = normId(invoiceNumber);
  const duplicate = context.existingInvoiceNumbers.some((value) => normId(value) === normalized);
  if (!duplicate) return [];
  return [
    makePlausibilityCheck({
      code: 'CONSISTENCY_DUPLICATE_INVOICE_NUMBER',
      status: 'BLOCKER',
      explanation: `Invoice number ${invoiceNumber} already exists for this vehicle.`,
      fieldPaths: ['invoiceNumber', 'documentNumber'],
      resolutionHint: 'Link to the existing invoice or correct the invoice number before apply.',
      source: 'SYNQDRIVE_DB',
    }),
  ];
}

function checkDuplicateCaseReference(
  fields: Record<string, unknown>,
  context: PlausibilityConsistencyContext,
): PlausibilityCheck[] {
  const reference = readReferenceNumber(fields);
  if (!reference || !context.existingReferenceNumbers?.length) return [];
  const normalized = normId(reference);
  const duplicate = context.existingReferenceNumbers.some((value) => normId(value) === normalized);
  if (!duplicate) return [];
  return [
    makePlausibilityCheck({
      code: 'CONSISTENCY_DUPLICATE_CASE_REFERENCE',
      status: 'WARNING',
      explanation: `Reference number ${reference} was already used on another applied document for this vehicle.`,
      fieldPaths: ['referenceNumber', 'reportNumber', 'caseNumber'],
      resolutionHint: 'Verify this is not a duplicate upload of the same case file.',
      source: 'SYNQDRIVE_DB',
    }),
  ];
}

function checkMultipleConflictingVehicles(
  fields: Record<string, unknown>,
  context?: PlausibilityVehicleContext,
): PlausibilityCheck[] {
  const { vins, plates } = collectVehicleIdentifiers(fields);
  const distinctVins = new Set(vins);
  const distinctPlates = new Set(plates);

  if (distinctVins.size > 1 || distinctPlates.size > 1) {
    return [
      makePlausibilityCheck({
        code: 'CONSISTENCY_MULTIPLE_CONFLICTING_VEHICLES',
        status: 'BLOCKER',
        explanation: 'Document mentions multiple conflicting vehicle identifiers.',
        fieldPaths: ['vin', 'licensePlate', 'mentionedEntities'],
        resolutionHint: 'Resolve which vehicle this document belongs to before apply.',
        source: 'DOCUMENT',
      }),
    ];
  }

  if (
    context?.vin &&
    vins.length === 1 &&
    vins[0] !== normId(context.vin) &&
    distinctPlates.size === 0
  ) {
    return [
      makePlausibilityCheck({
        code: 'CONSISTENCY_MULTIPLE_CONFLICTING_VEHICLES',
        status: 'WARNING',
        explanation: 'Mentioned vehicle VIN differs from the selected vehicle.',
        fieldPaths: ['mentionedEntities', 'vin'],
        resolutionHint: 'Confirm vehicle assignment against mentioned entities.',
        source: 'DOCUMENT',
      }),
    ];
  }

  return [];
}

function checkExtractionConflicts(
  options?: PlausibilityConsistencyOptions,
): PlausibilityCheck[] {
  const checks: PlausibilityCheck[] = [];
  for (const conflict of options?.extractionConflicts ?? []) {
    const leafKey = conflict.key.split('.').pop() ?? conflict.key;
    const pages =
      conflict.sourcePages.length > 0 ? ` (pages ${conflict.sourcePages.join(', ')})` : '';
    const isBlocker = ['odometerKm', 'vin', 'licensePlate'].includes(leafKey);
    checks.push(
      makePlausibilityCheck({
        code: `CONSISTENCY_FIELD_CONFLICT_${leafKey.toUpperCase()}`,
        status: isBlocker ? 'BLOCKER' : 'WARNING',
        explanation: `Conflicting extracted values for ${leafKey}${pages} — manual review required.`,
        fieldPaths: [conflict.key],
        resolutionHint: 'Choose the correct value manually — conflicts are not auto-resolved.',
        source: 'DOCUMENT',
      }),
    );
  }
  return checks;
}

function checkFutureDocumentDate(fields: Record<string, unknown>): PlausibilityCheck[] {
  const documentDate = readDocumentDate(fields);
  const now = new Date();
  if (!documentDate || documentDate.getTime() <= now.getTime() + 24 * 3600 * 1000) return [];
  return [
    makePlausibilityCheck({
      code: 'CONSISTENCY_DOCUMENT_DATE_FUTURE',
      status: 'WARNING',
      explanation: 'Document date is in the future.',
      fieldPaths: ['documentDate', 'eventDate', 'invoiceDate'],
      resolutionHint: 'Confirm the document date is correct.',
      source: 'DOCUMENT',
    }),
  ];
}

export function collectCrossDocumentConsistencyChecks(
  documentType: DocumentExtractionType,
  fields: Record<string, unknown>,
  context: PlausibilityConsistencyContext = {},
  options?: PlausibilityConsistencyOptions,
): PlausibilityCheck[] {
  const vehicle = context.vehicle;
  return [
    ...checkDateSequence(documentType, fields),
    ...checkAmountSums(fields),
    ...checkNetTaxGross(fields),
    ...checkVinPlateConflicts(documentType, fields, vehicle),
    ...checkDocumentDateVsBooking(fields, context),
    ...checkOdometerVsHistory(fields, vehicle),
    ...checkUnits(documentType, fields),
    ...checkValidityVsInspection(fields),
    ...checkDuplicateInvoiceNumber(fields, context),
    ...checkDuplicateCaseReference(fields, context),
    ...checkMultipleConflictingVehicles(fields, vehicle),
    ...checkFutureDocumentDate(fields),
    ...checkExtractionConflicts(options),
  ];
}
