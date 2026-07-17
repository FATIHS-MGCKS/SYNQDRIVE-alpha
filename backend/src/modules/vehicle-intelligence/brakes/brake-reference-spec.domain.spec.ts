import { BrakeReferenceSpecEvidenceCategory } from '@prisma/client';
import {
  adaptLegacyRotorWidth,
  compareEvidenceCategoryPriority,
  detectReferenceSpecConflict,
  inferEvidenceCategoryFromSourceType,
  isAnchorEligibleCategory,
  normalizeReferenceSpecWriteInput,
  pickPreferredReferenceSpec,
  resolveAnchorEligibleThicknessMm,
  resolveNominalThickness,
  validateSpecVehicleFit,
  validateThicknessPlausibility,
} from './brake-reference-spec.domain';

describe('brake-reference-spec.domain', () => {
  describe('manufacturer confirmed source', () => {
    it('resolves anchor-eligible disc nominal thickness', () => {
      const resolved = resolveNominalThickness(
        {
          sourceType: 'manufacturer',
          frontDiscNominalThicknessMm: 28,
          frontDiscEvidenceCategory: BrakeReferenceSpecEvidenceCategory.MANUFACTURER_CONFIRMED,
        },
        'FRONT_DISCS',
      );
      expect(resolved).toMatchObject({
        thicknessMm: 28,
        evidenceCategory: BrakeReferenceSpecEvidenceCategory.MANUFACTURER_CONFIRMED,
        anchorEligible: true,
        sourceField: 'nominal',
      });
      expect(resolveAnchorEligibleThicknessMm(
        {
          sourceType: 'manufacturer',
          frontDiscNominalThicknessMm: 28,
          frontDiscEvidenceCategory: BrakeReferenceSpecEvidenceCategory.MANUFACTURER_CONFIRMED,
        },
        'FRONT_DISCS',
      )).toBe(28);
    });
  });

  describe('part catalog source', () => {
    it('infers PART_CATALOG_CONFIRMED from sourceType', () => {
      expect(inferEvidenceCategoryFromSourceType('part_catalog')).toBe(
        BrakeReferenceSpecEvidenceCategory.PART_CATALOG_CONFIRMED,
      );
    });
  });

  describe('AI estimated source', () => {
    it('never becomes anchor-eligible without user confirmation', () => {
      const resolved = resolveNominalThickness(
        {
          sourceType: 'ai_vehicle_spec',
          frontPadNominalThicknessMm: 10.5,
          frontPadEvidenceCategory: BrakeReferenceSpecEvidenceCategory.AI_ESTIMATED,
        },
        'FRONT_PADS',
      );
      expect(resolved?.anchorEligible).toBe(false);
      expect(isAnchorEligibleCategory(BrakeReferenceSpecEvidenceCategory.AI_ESTIMATED)).toBe(false);
    });

    it('rejects auto-confirmed AI disc nominal on write', () => {
      expect(() =>
        normalizeReferenceSpecWriteInput({
          sourceType: 'ai',
          frontDiscNominalThicknessMm: 28,
          frontDiscEvidenceCategory: BrakeReferenceSpecEvidenceCategory.AI_ESTIMATED,
        }),
      ).toThrow(/cannot be auto-confirmed/i);
    });
  });

  describe('user confirmation', () => {
    it('marks user confirmed registration pads as anchor-eligible', () => {
      const { data } = normalizeReferenceSpecWriteInput({
        sourceType: 'manual_registration',
        frontPadThickness: 10.2,
        userConfirmedAt: '2026-06-01T10:00:00Z',
        userConfirmedBy: 'user-1',
      });
      expect(data.frontPadEvidenceCategory).toBe(
        BrakeReferenceSpecEvidenceCategory.USER_CONFIRMED,
      );
      expect(resolveAnchorEligibleThicknessMm(
        {
          frontPadNominalThicknessMm: 10.2,
          frontPadEvidenceCategory: BrakeReferenceSpecEvidenceCategory.USER_CONFIRMED,
        },
        'FRONT_PADS',
      )).toBe(10.2);
    });
  });

  describe('legacy rotor width', () => {
    it('adapts legacy rotor width as LEGACY_UNVERIFIED and not anchor-eligible', () => {
      const adaptation = adaptLegacyRotorWidth(30, 'front');
      expect(adaptation.evidenceCategory).toBe(
        BrakeReferenceSpecEvidenceCategory.LEGACY_UNVERIFIED,
      );
      expect(adaptation.anchorEligible).toBe(false);

      const resolved = resolveNominalThickness(
        { frontRotorWidth: 30, frontDiscEvidenceCategory: BrakeReferenceSpecEvidenceCategory.LEGACY_UNVERIFIED },
        'FRONT_DISCS',
      );
      expect(resolved).toMatchObject({
        thicknessMm: 30,
        anchorEligible: false,
        sourceField: 'legacy_rotor_width_rejected',
      });
      expect(resolveAnchorEligibleThicknessMm({ frontRotorWidth: 30 }, 'FRONT_DISCS')).toBeNull();
    });

    it('stores legacy rotor width separately on write without populating disc nominal', () => {
      const { data, warnings } = normalizeReferenceSpecWriteInput({
        sourceType: 'manual_registration',
        frontRotorWidth: 30,
      });
      expect(data.frontRotorWidth).toBe(30);
      expect(data.frontDiscNominalThicknessMm).toBeUndefined();
      expect(data.frontDiscEvidenceCategory).toBe(
        BrakeReferenceSpecEvidenceCategory.LEGACY_UNVERIFIED,
      );
      expect(warnings.join(' ')).toMatch(/legacy rotor width/i);
    });
  });

  describe('conflict detection', () => {
    it('detects conflicting anchor-eligible manufacturer specs', () => {
      const left = {
        frontDiscNominalThicknessMm: 28,
        frontDiscEvidenceCategory: BrakeReferenceSpecEvidenceCategory.MANUFACTURER_CONFIRMED,
      };
      const right = {
        frontDiscNominalThicknessMm: 30,
        frontDiscEvidenceCategory: BrakeReferenceSpecEvidenceCategory.MANUFACTURER_CONFIRMED,
      };
      expect(detectReferenceSpecConflict(left, right, 'FRONT_DISCS')).toBe(true);
    });
  });

  describe('wrong axle', () => {
    it('rejects rear part number on front component fit check', () => {
      const fit = validateSpecVehicleFit(
        { sourcePartNumber: 'REAR-BRAKE-DISC-123' },
        { make: 'VW', model: 'ID.4' },
        'FRONT_DISCS',
      );
      expect(fit.valid).toBe(false);
      expect(fit.errors.join(' ')).toMatch(/rear axle/i);
    });
  });

  describe('unrealistic value', () => {
    it('rejects pad thickness in disc range', () => {
      const result = validateThicknessPlausibility('FRONT_PADS', 28);
      expect(result.valid).toBe(false);
      expect(result.errors.join(' ')).toMatch(/disc thickness/i);
    });

    it('rejects disc thickness in pad range', () => {
      const result = validateThicknessPlausibility('FRONT_DISCS', 10);
      expect(result.valid).toBe(false);
      expect(result.errors.join(' ')).toMatch(/pad thickness/i);
    });
  });

  describe('wrong vehicle fit', () => {
    it('flags provider year mismatch against vehicle model year', () => {
      const fit = validateSpecVehicleFit(
        { sourcePartNumber: 'PAD-123', sourceProvider: 'Catalog 2018' },
        { make: 'VW', model: 'ID.4', modelYear: 2024 },
      );
      expect(fit.valid).toBe(false);
      expect(fit.errors.join(' ')).toMatch(/model year/i);
    });
  });

  describe('source priority', () => {
    it('prefers manufacturer over AI when picking reference spec', () => {
      const preferred = pickPreferredReferenceSpec([
        {
          createdAt: '2026-06-01T00:00:00Z',
          sourceType: 'ai',
          frontPadNominalThicknessMm: 9.8,
          frontPadEvidenceCategory: BrakeReferenceSpecEvidenceCategory.AI_ESTIMATED,
        },
        {
          createdAt: '2026-05-01T00:00:00Z',
          sourceType: 'manufacturer',
          frontPadNominalThicknessMm: 10.5,
          frontPadEvidenceCategory: BrakeReferenceSpecEvidenceCategory.MANUFACTURER_CONFIRMED,
        },
      ]);
      expect(preferred?.sourceType).toBe('manufacturer');
    });

    it('orders categories deterministically', () => {
      expect(
        compareEvidenceCategoryPriority(
          BrakeReferenceSpecEvidenceCategory.MANUFACTURER_CONFIRMED,
          BrakeReferenceSpecEvidenceCategory.AI_ESTIMATED,
        ),
      ).toBeLessThan(0);
    });
  });
});
