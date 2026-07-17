import { evaluateDocumentApplySafety } from './document-apply-safety.policy';
import type {
  DocumentApplyFeatureFlags,
  DocumentApplySafetyInput,
} from './document-apply-safety.types';

const defaultFlags: DocumentApplyFeatureFlags = {
  masterApplyEnabled: true,
  perTypeApplyEnabled: {},
  strictIdempotency: false,
};

const baseInput = (
  overrides: Partial<DocumentApplySafetyInput> = {},
): DocumentApplySafetyInput => ({
  documentType: 'SERVICE',
  confirmedData: {},
  vehicleId: 'veh-1',
  featureFlags: defaultFlags,
  ...overrides,
});

describe('evaluateDocumentApplySafety', () => {
  describe('SERVICE', () => {
    it('APPLY_ALLOWED when eventDate present', () => {
      const result = evaluateDocumentApplySafety(
        baseInput({
          documentType: 'SERVICE',
          confirmedData: { eventDate: '2026-01-15', odometerKm: 45000 },
        }),
      );
      expect(result.decision).toBe('APPLY_ALLOWED');
      expect(result.implementationStatus).toBe('implemented');
    });

    it('DRAFT_ONLY when eventDate missing', () => {
      const result = evaluateDocumentApplySafety(
        baseInput({
          documentType: 'SERVICE',
          confirmedData: { odometerKm: 45000 },
        }),
      );
      expect(result.decision).toBe('DRAFT_ONLY');
      expect(result.reasons).toContain('EVENT_DATE_REQUIRED');
    });
  });

  describe('OIL_CHANGE', () => {
    it('APPLY_ALLOWED with eventDate', () => {
      const result = evaluateDocumentApplySafety(
        baseInput({
          documentType: 'OIL_CHANGE',
          confirmedData: { eventDate: '2026-01-15', oilType: '5W-30' },
        }),
      );
      expect(result.decision).toBe('APPLY_ALLOWED');
    });
  });

  describe('TIRE', () => {
    it('APPLY_ALLOWED with tread measurements', () => {
      const result = evaluateDocumentApplySafety(
        baseInput({
          documentType: 'TIRE',
          confirmedData: {
            eventDate: '2026-01-15',
            treadDepthMm: { fl: 5.2, fr: 5.1, rl: 4.8, rr: 4.9 },
          },
        }),
      );
      expect(result.decision).toBe('APPLY_ALLOWED');
      expect(result.downstreamIdempotency).toBe('strong');
    });

    it('DRAFT_ONLY without tread measurements', () => {
      const result = evaluateDocumentApplySafety(
        baseInput({
          documentType: 'TIRE',
          confirmedData: { eventDate: '2026-01-15' },
        }),
      );
      expect(result.decision).toBe('DRAFT_ONLY');
      expect(result.reasons).toContain('TIRE_MEASUREMENT_REQUIRED');
    });
  });

  describe('BRAKE', () => {
    it('APPLY_ALLOWED with service date and explicit serviceKind', () => {
      const result = evaluateDocumentApplySafety(
        baseInput({
          documentType: 'BRAKE',
          confirmedData: { eventDate: '2026-01-15', frontPadMm: 8, serviceKind: 'pads_service' },
        }),
      );
      expect(result.decision).toBe('APPLY_ALLOWED');
    });

    it('DRAFT_ONLY without serviceKind', () => {
      const result = evaluateDocumentApplySafety(
        baseInput({
          documentType: 'BRAKE',
          confirmedData: { eventDate: '2026-01-15', frontPadMm: 8 },
        }),
      );
      expect(result.decision).toBe('DRAFT_ONLY');
      expect(result.reasons).toContain('BRAKE_SERVICE_KIND_REQUIRED');
      expect(result.missingFields).toContain('serviceKind');
    });

    it('DRAFT_ONLY without service date', () => {
      const result = evaluateDocumentApplySafety(
        baseInput({
          documentType: 'BRAKE',
          confirmedData: { frontPadMm: 8 },
        }),
      );
      expect(result.decision).toBe('DRAFT_ONLY');
      expect(result.reasons).toContain('BRAKE_SERVICE_DATE_REQUIRED');
    });
  });

  describe('BATTERY', () => {
    it('APPLY_ALLOWED with valid health evidence measurements', () => {
      const result = evaluateDocumentApplySafety(
        baseInput({
          documentType: 'BATTERY',
          confirmedData: {
            eventDate: '2026-01-15',
            voltageV: 12.4,
            sohPercent: 85,
          },
        }),
      );
      expect(result.decision).toBe('APPLY_ALLOWED');
      expect(result.implementationStatus).toBe('implemented');
    });

    it('DRAFT_ONLY without valid measurement', () => {
      const result = evaluateDocumentApplySafety(
        baseInput({
          documentType: 'BATTERY',
          confirmedData: { eventDate: '2026-01-15' },
        }),
      );
      expect(result.decision).toBe('DRAFT_ONLY');
      expect(result.reasons).toContain('BATTERY_VALID_MEASUREMENT_REQUIRED');
    });

    it('APPLY_ALLOWED for replacement with event date', () => {
      const result = evaluateDocumentApplySafety(
        baseInput({
          documentType: 'BATTERY',
          confirmedData: {
            recordKind: 'replacement',
            eventDate: '2026-01-15',
          },
        }),
      );
      expect(result.decision).toBe('APPLY_ALLOWED');
    });
  });

  describe('TUV_REPORT', () => {
    it('APPLY_ALLOWED with inspection date and validUntil', () => {
      const result = evaluateDocumentApplySafety(
        baseInput({
          documentType: 'TUV_REPORT',
          confirmedData: { eventDate: '2026-01-15', validUntil: '2028-01-15', result: 'PASSED' },
        }),
      );
      expect(result.decision).toBe('APPLY_ALLOWED');
    });

    it('DRAFT_ONLY without validUntil', () => {
      const result = evaluateDocumentApplySafety(
        baseInput({
          documentType: 'TUV_REPORT',
          confirmedData: { eventDate: '2026-01-15', result: 'PASSED' },
        }),
      );
      expect(result.decision).toBe('DRAFT_ONLY');
      expect(result.reasons).toContain('TUV_VALID_UNTIL_REQUIRED');
      expect(result.missingFields).toContain('validUntil');
    });
  });

  describe('BOKRAFT_REPORT', () => {
    it('APPLY_ALLOWED with inspection date and validUntil', () => {
      const result = evaluateDocumentApplySafety(
        baseInput({
          documentType: 'BOKRAFT_REPORT',
          confirmedData: { eventDate: '2026-01-15', validUntil: '2027-01-15' },
        }),
      );
      expect(result.decision).toBe('APPLY_ALLOWED');
    });

    it('DRAFT_ONLY without validUntil', () => {
      const result = evaluateDocumentApplySafety(
        baseInput({
          documentType: 'BOKRAFT_REPORT',
          confirmedData: { eventDate: '2026-01-15' },
        }),
      );
      expect(result.decision).toBe('DRAFT_ONLY');
      expect(result.reasons).toContain('BOKRAFT_VALID_UNTIL_REQUIRED');
    });
  });

  describe('VEHICLE_CONDITION', () => {
    it('ARCHIVE_ONLY — no domain apply', () => {
      const result = evaluateDocumentApplySafety(
        baseInput({
          documentType: 'VEHICLE_CONDITION',
          confirmedData: { eventDate: '2026-01-15' },
        }),
      );
      expect(result.decision).toBe('ARCHIVE_ONLY');
      expect(result.allowsDownstreamApply).toBe(false);
      expect(result.implementationStatus).toBe('archive_only');
    });
  });

  describe('INVOICE', () => {
    it('APPLY_ALLOWED with explicit line items and tax semantics', () => {
      const result = evaluateDocumentApplySafety(
        baseInput({
          documentType: 'INVOICE',
          confirmedData: {
            invoiceDate: '2026-01-15',
            totalCents: 11900,
            lineItems: [
              { description: 'Service', quantity: 1, unitPriceNetCents: 10000, taxRate: 19 },
            ],
          },
        }),
      );
      expect(result.decision).toBe('APPLY_ALLOWED');
      expect(result.downstreamIdempotency).toBe('strong');
    });

    it('DRAFT_ONLY without line items', () => {
      const result = evaluateDocumentApplySafety(
        baseInput({
          documentType: 'INVOICE',
          confirmedData: {
            invoiceDate: '2026-01-15',
            totalCents: 11900,
            taxRate: 19,
          },
        }),
      );
      expect(result.decision).toBe('DRAFT_ONLY');
      expect(result.reasons).toContain('INVOICE_LINE_ITEMS_REQUIRED');
    });

    it('DRAFT_ONLY without positive total', () => {
      const result = evaluateDocumentApplySafety(
        baseInput({
          documentType: 'INVOICE',
          confirmedData: { eventDate: '2026-01-15', totalCents: 0 },
        }),
      );
      expect(result.decision).toBe('DRAFT_ONLY');
      expect(result.reasons).toContain('INVOICE_TOTAL_REQUIRED');
    });
  });

  describe('ACCIDENT', () => {
    it('APPLY_ALLOWED with description, damageType and severity', () => {
      const result = evaluateDocumentApplySafety(
        baseInput({
          documentType: 'ACCIDENT',
          confirmedData: {
            eventDate: '2026-01-15',
            description: 'Rear collision',
            damageType: 'DENT',
            severity: 'MODERATE',
          },
        }),
      );
      expect(result.decision).toBe('APPLY_ALLOWED');
    });

    it('DRAFT_ONLY without severity', () => {
      const result = evaluateDocumentApplySafety(
        baseInput({
          documentType: 'ACCIDENT',
          confirmedData: {
            eventDate: '2026-01-15',
            description: 'Rear collision',
            damageType: 'DENT',
          },
        }),
      );
      expect(result.decision).toBe('DRAFT_ONLY');
      expect(result.reasons).toContain('DAMAGE_SEVERITY_REQUIRED');
    });
  });

  describe('DAMAGE', () => {
    it('APPLY_ALLOWED with confirmed description, damageType and severity', () => {
      const result = evaluateDocumentApplySafety(
        baseInput({
          documentType: 'DAMAGE',
          confirmedData: {
            eventDate: '2026-01-15',
            damageArea: 'Front bumper',
            damageType: 'SCRATCH',
            severity: 'MODERATE',
            description: 'Scratch on door',
          },
        }),
      );
      expect(result.decision).toBe('APPLY_ALLOWED');
    });

    it('DRAFT_ONLY without damageType', () => {
      const result = evaluateDocumentApplySafety(
        baseInput({
          documentType: 'DAMAGE',
          confirmedData: {
            eventDate: '2026-01-15',
            description: 'Some damage',
            severity: 'MODERATE',
          },
        }),
      );
      expect(result.decision).toBe('DRAFT_ONLY');
      expect(result.reasons).toContain('DAMAGE_TYPE_REQUIRED');
    });

    it('DRAFT_ONLY without severity', () => {
      const result = evaluateDocumentApplySafety(
        baseInput({
          documentType: 'DAMAGE',
          confirmedData: {
            eventDate: '2026-01-15',
            description: 'Some damage',
            damageType: 'SCRATCH',
          },
        }),
      );
      expect(result.decision).toBe('DRAFT_ONLY');
      expect(result.reasons).toContain('DAMAGE_SEVERITY_REQUIRED');
    });

    it('BLOCKED without description or damage area', () => {
      const result = evaluateDocumentApplySafety(
        baseInput({
          documentType: 'DAMAGE',
          confirmedData: {
            eventDate: '2026-01-15',
            severity: 'MODERATE',
          },
        }),
      );
      expect(result.decision).toBe('BLOCKED');
      expect(result.reasons).toContain('DAMAGE_DESCRIPTION_OR_AREA_REQUIRED');
    });
  });

  describe('FINE', () => {
    it('APPLY_ALLOWED with offense date and positive amount', () => {
      const result = evaluateDocumentApplySafety(
        baseInput({
          documentType: 'FINE',
          confirmedData: {
            eventDate: '2026-01-15',
            totalCents: 5000,
            offenseType: 'Parkverstoß',
          },
        }),
      );
      expect(result.decision).toBe('APPLY_ALLOWED');
    });

    it('BLOCKED without offense type', () => {
      const result = evaluateDocumentApplySafety(
        baseInput({
          documentType: 'FINE',
          confirmedData: { eventDate: '2026-01-15', totalCents: 5000 },
        }),
      );
      expect(result.decision).toBe('BLOCKED');
      expect(result.reasons).toContain('FINE_OFFENSE_TYPE_REQUIRED');
      expect(result.missingFields).toContain('offenseType');
    });

    it('BLOCKED without offense date', () => {
      const result = evaluateDocumentApplySafety(
        baseInput({
          documentType: 'FINE',
          confirmedData: { totalCents: 5000 },
        }),
      );
      expect(result.decision).toBe('BLOCKED');
      expect(result.reasons).toContain('FINE_OFFENSE_DATE_REQUIRED');
    });

    it('BLOCKED without positive amount', () => {
      const result = evaluateDocumentApplySafety(
        baseInput({
          documentType: 'FINE',
          confirmedData: {
            eventDate: '2026-01-15',
            offenseType: 'Parkverstoß',
            totalCents: 0,
          },
        }),
      );
      expect(result.decision).toBe('BLOCKED');
      expect(result.reasons).toContain('FINE_POSITIVE_AMOUNT_REQUIRED');
    });

    it('BLOCKED on plausibility BLOCKER', () => {
      const result = evaluateDocumentApplySafety(
        baseInput({
          documentType: 'FINE',
          confirmedData: {
            eventDate: '2026-01-15',
            totalCents: 5000,
            licensePlate: 'B-XX 999',
          },
          plausibility: {
            overallStatus: 'BLOCKER',
            checks: [],
            recommendedHumanReviewNotes: [],
          },
        }),
      );
      expect(result.decision).toBe('BLOCKED');
      expect(result.reasons).toContain('PLAUSIBILITY_BLOCKER');
    });
  });

  describe('OTHER (general letter)', () => {
    it('ARCHIVE_ONLY', () => {
      const result = evaluateDocumentApplySafety(
        baseInput({
          documentType: 'OTHER',
          confirmedData: { eventDate: '2026-01-15' },
        }),
      );
      expect(result.decision).toBe('ARCHIVE_ONLY');
      expect(result.implementationStatus).toBe('archive_only');
    });
  });

  describe('feature flags', () => {
    it('LEGACY_DISABLED when global apply disabled', () => {
      const result = evaluateDocumentApplySafety(
        baseInput({
          featureFlags: { ...defaultFlags, masterApplyEnabled: false },
          confirmedData: { eventDate: '2026-01-15' },
        }),
      );
      expect(result.decision).toBe('LEGACY_DISABLED');
      expect(result.reasons).toContain('DOCUMENT_APPLY_DISABLED');
    });

    it('LEGACY_DISABLED when per-type apply disabled', () => {
      const result = evaluateDocumentApplySafety(
        baseInput({
          documentType: 'FINE',
          featureFlags: {
            ...defaultFlags,
            perTypeApplyEnabled: { FINE: false },
          },
          confirmedData: { eventDate: '2026-01-15', totalCents: 5000 },
        }),
      );
      expect(result.decision).toBe('LEGACY_DISABLED');
    });

    it('DRAFT_ONLY when strict idempotency blocks weak downstream types', () => {
      const result = evaluateDocumentApplySafety(
        baseInput({
          documentType: 'SERVICE',
          featureFlags: { ...defaultFlags, strictIdempotency: true },
          confirmedData: { eventDate: '2026-01-15' },
        }),
      );
      expect(result.decision).toBe('DRAFT_ONLY');
      expect(result.reasons).toContain('DOWNSTREAM_IDEMPOTENCY_WEAK');
    });
  });

  describe('entity assignment', () => {
    it('BLOCKED without vehicleId', () => {
      const result = evaluateDocumentApplySafety(
        baseInput({
          vehicleId: null,
          confirmedData: { eventDate: '2026-01-15' },
        }),
      );
      expect(result.decision).toBe('BLOCKED');
      expect(result.reasons).toContain('VEHICLE_ASSIGNMENT_REQUIRED');
    });
  });
});
