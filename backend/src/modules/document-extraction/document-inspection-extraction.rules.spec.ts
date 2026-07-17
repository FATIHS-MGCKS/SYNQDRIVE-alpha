import {
  BOKRAFT_MISSING_VALIDITY,
  BOKRAFT_NO_DEFECT,
  BOKRAFT_WITH_DEFECT,
  TUV_MISSING_VALIDITY,
  TUV_NO_DEFECT,
  TUV_VALIDITY_BEFORE_INSPECTION,
  TUV_WITH_DEFECT,
} from './__fixtures__/document-inspection-fixtures';
import {
  assessInspectionApplyGate,
  buildInspectionApplyPayload,
  buildInspectionVehicleComplianceUpdate,
  collectInspectionPlausibilityChecks,
  hasDefects,
  hasExplicitValidUntil,
  INSPECTION_DOCUMENT_TYPES,
  readInspectionDate,
  readIssuingOrganization,
  readMileageKm,
  readValidUntil,
  resolveInspectionValidUntilDate,
} from './document-inspection-extraction.rules';
import { DocumentExtractionPlausibilityService } from './document-extraction-plausibility.service';

describe('document-inspection-extraction.rules', () => {
  describe('field readers', () => {
    it('reads canonical inspection fields and aliases', () => {
      expect(readInspectionDate(TUV_NO_DEFECT)).toBe('2026-06-01');
      expect(readValidUntil(TUV_NO_DEFECT)).toBe('2028-06-01');
      expect(readIssuingOrganization(TUV_NO_DEFECT)).toBe('DEKRA Stuttgart');
      expect(readMileageKm(TUV_NO_DEFECT)).toBe(45230);
    });

    it('never derives validUntil from inspection date', () => {
      expect(resolveInspectionValidUntilDate(TUV_MISSING_VALIDITY)).toBeNull();
      expect(hasExplicitValidUntil(TUV_MISSING_VALIDITY)).toBe(false);
    });
  });

  describe('defect detection', () => {
    it('detects no-defect TÜV', () => {
      expect(hasDefects(TUV_NO_DEFECT)).toBe(false);
    });

    it('detects defect TÜV with follow-up fields', () => {
      expect(hasDefects(TUV_WITH_DEFECT)).toBe(true);
      expect(TUV_WITH_DEFECT.reinspectionRequired).toBe(true);
    });
  });

  describe('vehicle compliance update', () => {
    it('uses explicit validUntil for next compliance date', () => {
      const update = buildInspectionVehicleComplianceUpdate(
        INSPECTION_DOCUMENT_TYPES.TUV,
        TUV_NO_DEFECT,
      );
      expect(update?.nextValidUntilDate.toISOString().slice(0, 10)).toBe('2028-06-01');
    });

    it('returns null when validUntil is missing', () => {
      expect(
        buildInspectionVehicleComplianceUpdate(
          INSPECTION_DOCUMENT_TYPES.TUV,
          TUV_MISSING_VALIDITY,
        ),
      ).toBeNull();
    });
  });

  describe('plausibility checks', () => {
    it('warns when validUntil is missing', () => {
      const checks = collectInspectionPlausibilityChecks(
        INSPECTION_DOCUMENT_TYPES.TUV,
        TUV_MISSING_VALIDITY,
      );
      expect(checks.some((check) => check.code === 'INSPECTION_MISSING_VALID_UNTIL')).toBe(true);
    });

    it('warns on defects without hard-blocking archive', () => {
      const checks = collectInspectionPlausibilityChecks(
        INSPECTION_DOCUMENT_TYPES.TUV,
        TUV_WITH_DEFECT,
      );
      expect(checks.some((check) => check.code === 'INSPECTION_DEFECTS_PRESENT')).toBe(true);
      expect(checks.every((check) => check.status !== 'BLOCKER')).toBe(true);
    });

    it('blocks validity before inspection date', () => {
      const checks = collectInspectionPlausibilityChecks(
        INSPECTION_DOCUMENT_TYPES.TUV,
        TUV_VALIDITY_BEFORE_INSPECTION,
      );
      expect(checks.some((check) => check.code === 'VALIDITY_BEFORE_INSPECTION')).toBe(true);
    });

    it('integrates with plausibility service', () => {
      const svc = new DocumentExtractionPlausibilityService();
      const result = svc.runChecks('TUV_REPORT', TUV_MISSING_VALIDITY, {});
      expect(result.checks.some((check) => check.code === 'INSPECTION_MISSING_VALID_UNTIL')).toBe(
        true,
      );
    });
  });

  describe('apply gate', () => {
    it('allows archive but blocks vehicle update without validUntil', () => {
      const gate = assessInspectionApplyGate({
        documentType: INSPECTION_DOCUMENT_TYPES.TUV,
        fields: TUV_MISSING_VALIDITY,
      });
      expect(gate.canArchive).toBe(true);
      expect(gate.canUpdateVehicleMasterData).toBe(false);
      expect(gate.vehicleMasterDataBlockers.some((b) => b.code === 'MISSING_VALID_UNTIL')).toBe(
        true,
      );
    });

    it('allows vehicle update when validUntil is present', () => {
      const gate = assessInspectionApplyGate({
        documentType: INSPECTION_DOCUMENT_TYPES.BOKRAFT,
        fields: BOKRAFT_NO_DEFECT,
      });
      expect(gate.canArchive).toBe(true);
      expect(gate.canUpdateVehicleMasterData).toBe(true);
    });

    it('hard-blocks only via compliance readiness policy', () => {
      const gate = assessInspectionApplyGate({
        documentType: INSPECTION_DOCUMENT_TYPES.TUV,
        fields: TUV_WITH_DEFECT,
        complianceReadinessBlocked: true,
      });
      expect(gate.canArchive).toBe(false);
      expect(gate.blockers.some((b) => b.code === 'COMPLIANCE_READINESS_BLOCKED')).toBe(true);
    });

    it('does not hard-block defects alone', () => {
      const gate = assessInspectionApplyGate({
        documentType: INSPECTION_DOCUMENT_TYPES.TUV,
        fields: TUV_WITH_DEFECT,
      });
      expect(gate.canArchive).toBe(true);
    });
  });

  describe('buildInspectionApplyPayload', () => {
    it('includes compliance update only with confirmed validUntil', () => {
      const payload = buildInspectionApplyPayload(INSPECTION_DOCUMENT_TYPES.TUV, TUV_NO_DEFECT);
      expect(payload?.canUpdateVehicleMasterData).toBe(true);
      expect(payload?.complianceUpdate?.nextValidUntilDate).toEqual(new Date('2028-06-01'));
    });

    it('blocks vehicle compliance update when validUntil is missing', () => {
      const payload = buildInspectionApplyPayload(
        INSPECTION_DOCUMENT_TYPES.TUV,
        TUV_MISSING_VALIDITY,
      );
      expect(payload?.canUpdateVehicleMasterData).toBe(false);
      expect(payload?.complianceUpdate).toBeNull();
    });
  });
});
