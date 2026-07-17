import {
  CONSISTENCY_BOOKING_OUTSIDE,
  CONSISTENCY_DATE_SEQUENCE_BAD,
  CONSISTENCY_DUPLICATE_INVOICE,
  CONSISTENCY_DUPLICATE_REFERENCE,
  CONSISTENCY_INVOICE_LINE_SUM_BAD,
  CONSISTENCY_INVOICE_NET_GROSS_BAD,
  CONSISTENCY_MULTIPLE_VEHICLES,
  CONSISTENCY_ODOMETER_BELOW_HISTORY,
  CONSISTENCY_PLATE_MISMATCH,
  CONSISTENCY_UNIT_MISSING_TIRE,
  CONSISTENCY_INSPECTION_DATE_SEQUENCE_BAD,
  CONSISTENCY_VALIDITY_BEFORE_INSPECTION,
  CONSISTENCY_VIN_MISMATCH,
} from './__fixtures__/document-plausibility-consistency-fixtures';
import { collectCrossDocumentConsistencyChecks } from './document-plausibility-consistency.rules';
import { gateActionPlanOnPlausibility } from './document-plausibility-gate.util';
import { makePlausibilityCheck } from './document-plausibility.types';
import { assessTechnicalPlan } from './document-action-planner.technical-rules';
import { TIRE_COMPLETE } from './__fixtures__/document-tire-fixtures';

const baseVehicle = {
  vin: 'WVWZZZ1KZAW000001',
  licensePlate: 'B-AB-1234',
  lastKnownOdometerKm: 120_000,
};

function codes(
  documentType: Parameters<typeof collectCrossDocumentConsistencyChecks>[0],
  fields: Record<string, unknown>,
  context: Parameters<typeof collectCrossDocumentConsistencyChecks>[2] = { vehicle: baseVehicle },
) {
  return collectCrossDocumentConsistencyChecks(documentType, fields, context).map((check) => check.code);
}

describe('document-plausibility-consistency.rules', () => {
  it('CONSISTENCY_DATE_SEQUENCE_ORDER blocks due date before document date', () => {
    expect(codes('INVOICE', CONSISTENCY_DATE_SEQUENCE_BAD)).toContain(
      'CONSISTENCY_DATE_SEQUENCE_ORDER',
    );
  });

  it('CONSISTENCY_NET_TAX_GROSS_MISMATCH blocks net + tax != gross', () => {
    expect(codes('INVOICE', CONSISTENCY_INVOICE_NET_GROSS_BAD)).toContain(
      'CONSISTENCY_NET_TAX_GROSS_MISMATCH',
    );
  });

  it('CONSISTENCY_AMOUNT_SUM_MISMATCH blocks line item gross mismatch', () => {
    expect(codes('INVOICE', CONSISTENCY_INVOICE_LINE_SUM_BAD)).toContain(
      'CONSISTENCY_AMOUNT_SUM_MISMATCH',
    );
  });

  it('CONSISTENCY_VIN_MISMATCH blocks VIN conflicts', () => {
    expect(codes('SERVICE', CONSISTENCY_VIN_MISMATCH)).toContain('CONSISTENCY_VIN_MISMATCH');
  });

  it('CONSISTENCY_PLATE_MISMATCH warns on plate conflicts for non-fine docs', () => {
    expect(codes('SERVICE', CONSISTENCY_PLATE_MISMATCH)).toContain('CONSISTENCY_PLATE_MISMATCH');
  });

  it('CONSISTENCY_DOCUMENT_DATE_OUTSIDE_BOOKING warns outside booking period', () => {
    expect(
      codes('OTHER', CONSISTENCY_BOOKING_OUTSIDE, {
        vehicle: baseVehicle,
        bookingStartDate: '2026-04-01T00:00:00.000Z',
        bookingEndDate: '2026-04-30T00:00:00.000Z',
      }),
    ).toContain('CONSISTENCY_DOCUMENT_DATE_OUTSIDE_BOOKING');
  });

  it('CONSISTENCY_ODOMETER_FAR_BELOW_HISTORY warns on historical mileage', () => {
    expect(codes('SERVICE', CONSISTENCY_ODOMETER_BELOW_HISTORY)).toContain(
      'CONSISTENCY_ODOMETER_FAR_BELOW_HISTORY',
    );
  });

  it('CONSISTENCY_UNIT_MISSING blocks tire tread without unit', () => {
    expect(codes('TIRE', CONSISTENCY_UNIT_MISSING_TIRE)).toContain('CONSISTENCY_UNIT_MISSING');
  });

  it('CONSISTENCY_VALIDITY_BEFORE_INSPECTION blocks invalid validity order', () => {
    expect(codes('TUV_REPORT', CONSISTENCY_INSPECTION_DATE_SEQUENCE_BAD)).toContain(
      'CONSISTENCY_VALIDITY_BEFORE_INSPECTION',
    );
  });

  it('CONSISTENCY_DUPLICATE_INVOICE_NUMBER blocks duplicate invoice numbers', () => {
    expect(
      codes('INVOICE', CONSISTENCY_DUPLICATE_INVOICE, {
        vehicle: baseVehicle,
        existingInvoiceNumbers: ['INV-EXISTING-42'],
      }),
    ).toContain('CONSISTENCY_DUPLICATE_INVOICE_NUMBER');
  });

  it('CONSISTENCY_DUPLICATE_CASE_REFERENCE warns on duplicate references', () => {
    expect(
      codes('OTHER', CONSISTENCY_DUPLICATE_REFERENCE, {
        vehicle: baseVehicle,
        existingReferenceNumbers: ['AZ-2026-4412'],
      }),
    ).toContain('CONSISTENCY_DUPLICATE_CASE_REFERENCE');
  });

  it('CONSISTENCY_MULTIPLE_CONFLICTING_VEHICLES blocks multiple vehicle identifiers', () => {
    expect(codes('OTHER', CONSISTENCY_MULTIPLE_VEHICLES)).toContain(
      'CONSISTENCY_MULTIPLE_CONFLICTING_VEHICLES',
    );
  });

  it('emits structured output with explanation, fieldPaths, and resolutionHint', () => {
    const [check] = collectCrossDocumentConsistencyChecks(
      'INVOICE',
      CONSISTENCY_INVOICE_NET_GROSS_BAD,
      { vehicle: baseVehicle },
    ).filter((row) => row.code === 'CONSISTENCY_NET_TAX_GROSS_MISMATCH');
    expect(check.explanation).toContain('does not equal gross');
    expect(check.fieldPaths).toEqual(expect.arrayContaining(['totalGross']));
    expect(check.resolutionHint).toMatch(/no automatic amount correction/i);
  });
});

describe('document-plausibility-gate.util', () => {
  it('blocks action plans when unresolved plausibility BLOCKERs exist', () => {
    const plan = assessTechnicalPlan({
      effectiveDocumentType: 'TIRE',
      confirmedData: TIRE_COMPLETE,
      plausibilityChecks: [
        makePlausibilityCheck({
          code: 'CONSISTENCY_VIN_MISMATCH',
          status: 'BLOCKER',
          explanation: 'VIN mismatch',
          fieldPaths: ['vin'],
          resolutionHint: 'Fix VIN',
          source: 'SYNQDRIVE_DB',
        }),
      ],
    });
    expect(plan.planOutcome).toBe('BLOCKED');
    expect(plan.missingRequirements.some((req) => req.code === 'CONSISTENCY_VIN_MISMATCH')).toBe(
      true,
    );
  });

  it('does not block action plans when only INFO/WARNING checks exist', () => {
    const readyPlan = assessTechnicalPlan({
      effectiveDocumentType: 'TIRE',
      confirmedData: TIRE_COMPLETE,
      plausibilityChecks: [
        makePlausibilityCheck({
          code: 'CONSISTENCY_DATE_SEQUENCE_INFO',
          status: 'INFO',
          explanation: 'Date resolved',
          source: 'SYSTEM',
        }),
      ],
    });
    expect(readyPlan.planOutcome).not.toBe('BLOCKED');

    const gated = gateActionPlanOnPlausibility(
      { planOutcome: 'READY', missingRequirements: [] },
      [
        makePlausibilityCheck({
          code: 'CONSISTENCY_DUPLICATE_CASE_REFERENCE',
          status: 'WARNING',
          explanation: 'Duplicate reference',
          source: 'SYNQDRIVE_DB',
        }),
      ],
    );
    expect(gated.planOutcome).toBe('READY');
  });
});
