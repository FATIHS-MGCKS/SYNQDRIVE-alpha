import {
  ACCIDENT_COMPLETE,
  ACCIDENT_DRAFT_ONLY,
  APPRAISAL_GUTACHTEN,
  DAMAGE_COMPLETE,
  DAMAGE_INCOMPLETE,
  DAMAGE_UNKNOWN_TYPE,
} from './__fixtures__/document-damage-fixtures';
import {
  assessDamageApplyGate,
  buildDamageCreatePayload,
  buildDamageDraftPayload,
  buildDamageLocationLabel,
  collectDamagePlausibilityChecks,
  DAMAGE_DOCUMENT_MODES,
  DAMAGE_DOCUMENT_TYPES,
  findDuplicateDamageCandidate,
  findLinkableDamageCandidate,
  hasTraceableDamageArea,
  isAccidentApplyConfirmed,
  isDamageSeverityConfirmed,
  isDamageTypeConfirmed,
  readDamageAreas,
  readDamageDescription,
  readDamageSeverity,
  readDamageType,
  readEstimatedCostCents,
  readEventDateTime,
  readInsuranceReference,
  readPoliceReference,
  readThirdPartyInvolved,
  resolveDamageDocumentMode,
} from './document-damage-extraction.rules';
import { DocumentExtractionPlausibilityService } from './document-extraction-plausibility.service';

const EXISTING_DAMAGE = {
  id: 'damage-existing-1',
  damageType: 'DENT',
  severity: 'MAJOR',
  description: 'Heckschaden',
  locationLabel: 'rear_bumper, tailgate',
  createdAt: new Date('2026-01-06T00:00:00.000Z'),
};

describe('document-damage-extraction.rules', () => {
  describe('field readers', () => {
    it('reads canonical damage fields and aliases', () => {
      expect(readEventDateTime(DAMAGE_COMPLETE)).toBe('2026-02-01T14:30:00.000Z');
      expect(readDamageDescription(DAMAGE_COMPLETE)).toBe('Lackschaden an der hinteren linken Tür');
      expect(readDamageAreas(DAMAGE_COMPLETE)).toEqual(
        expect.arrayContaining(['rear_left_door', 'rear_left_panel']),
      );
      expect(readDamageType(DAMAGE_COMPLETE)).toBe('PAINT_DAMAGE');
      expect(readDamageSeverity(DAMAGE_COMPLETE)).toBe('MODERATE');
      expect(readThirdPartyInvolved(DAMAGE_COMPLETE)).toBe(false);
      expect(readPoliceReference(ACCIDENT_COMPLETE)).toBe('POL-2026-00123');
      expect(readInsuranceReference(ACCIDENT_COMPLETE)).toBe('INS-CLAIM-9988');
      expect(readEstimatedCostCents(DAMAGE_COMPLETE)).toBe(85000);
      expect(buildDamageLocationLabel(DAMAGE_COMPLETE)).toContain('rear_left_door');
    });

    it('does not default missing type or severity to SCRATCH/MODERATE', () => {
      expect(readDamageType(DAMAGE_INCOMPLETE)).toBeNull();
      expect(readDamageSeverity(DAMAGE_INCOMPLETE)).toBeNull();
      expect(isDamageTypeConfirmed(DAMAGE_INCOMPLETE)).toBe(false);
      expect(isDamageSeverityConfirmed(DAMAGE_INCOMPLETE)).toBe(false);
    });

    it('treats UNKNOWN extraction values as unconfirmed', () => {
      expect(readDamageType(DAMAGE_UNKNOWN_TYPE)).toBe('UNKNOWN');
      expect(readDamageSeverity(DAMAGE_UNKNOWN_TYPE)).toBe('UNKNOWN');
      expect(isDamageTypeConfirmed(DAMAGE_UNKNOWN_TYPE)).toBe(false);
      expect(isDamageSeverityConfirmed(DAMAGE_UNKNOWN_TYPE)).toBe(false);
    });
  });

  describe('document mode resolution', () => {
    it('resolves damage, accident, and appraisal modes', () => {
      expect(resolveDamageDocumentMode(DAMAGE_DOCUMENT_TYPES.DAMAGE, DAMAGE_COMPLETE)).toBe(
        DAMAGE_DOCUMENT_MODES.DAMAGE_REPORT,
      );
      expect(resolveDamageDocumentMode(DAMAGE_DOCUMENT_TYPES.ACCIDENT, ACCIDENT_COMPLETE)).toBe(
        DAMAGE_DOCUMENT_MODES.ACCIDENT_REPORT,
      );
      expect(resolveDamageDocumentMode(DAMAGE_DOCUMENT_TYPES.DAMAGE, APPRAISAL_GUTACHTEN)).toBe(
        DAMAGE_DOCUMENT_MODES.APPRAISAL,
      );
    });
  });

  describe('plausibility checks', () => {
    it('blocks incomplete damage without traceable area', () => {
      const checks = collectDamagePlausibilityChecks(
        DAMAGE_DOCUMENT_TYPES.DAMAGE,
        { damageDescription: 'Kratzer' },
      );
      expect(checks.some((check) => check.code === 'DAMAGE_AREA_NOT_TRACEABLE')).toBe(true);
      expect(checks.find((check) => check.code === 'DAMAGE_AREA_NOT_TRACEABLE')?.status).toBe(
        'BLOCKER',
      );
    });

    it('warns when type or severity remain UNKNOWN', () => {
      const checks = collectDamagePlausibilityChecks(
        DAMAGE_DOCUMENT_TYPES.DAMAGE,
        DAMAGE_UNKNOWN_TYPE,
      );
      expect(checks.some((check) => check.code === 'DAMAGE_TYPE_UNKNOWN')).toBe(true);
      expect(checks.some((check) => check.code === 'DAMAGE_SEVERITY_UNKNOWN')).toBe(true);
    });

    it('warns for accident draft-only until explicit apply confirmation', () => {
      const checks = collectDamagePlausibilityChecks(
        DAMAGE_DOCUMENT_TYPES.ACCIDENT,
        ACCIDENT_DRAFT_ONLY,
      );
      expect(checks.some((check) => check.code === 'ACCIDENT_DRAFT_ONLY')).toBe(true);
      expect(isAccidentApplyConfirmed(ACCIDENT_DRAFT_ONLY)).toBe(false);
      expect(isAccidentApplyConfirmed(ACCIDENT_COMPLETE)).toBe(true);
    });

    it('warns for appraisal/gutachten without direct create', () => {
      const checks = collectDamagePlausibilityChecks(
        DAMAGE_DOCUMENT_TYPES.DAMAGE,
        APPRAISAL_GUTACHTEN,
      );
      expect(checks.some((check) => check.code === 'APPRAISAL_DRAFT_ONLY')).toBe(true);
    });

    it('integrates with plausibility service for DAMAGE documents', () => {
      const svc = new DocumentExtractionPlausibilityService();
      const result = svc.runChecks('DAMAGE', DAMAGE_UNKNOWN_TYPE, {});
      expect(result.checks.some((check) => check.code === 'DAMAGE_TYPE_UNKNOWN')).toBe(true);
      expect(result.checks.some((check) => check.code === 'DAMAGE_SEVERITY_UNKNOWN')).toBe(true);
    });
  });

  describe('duplicate detection', () => {
    it('detects overlapping damage areas with same type', () => {
      const payload = buildDamageCreatePayload(ACCIDENT_COMPLETE);
      expect(payload).not.toBeNull();
      const duplicate = findDuplicateDamageCandidate(
        [EXISTING_DAMAGE],
        payload!,
        readDamageAreas(ACCIDENT_COMPLETE),
      );
      expect(duplicate?.id).toBe('damage-existing-1');
    });

    it('finds linkable candidate for appraisal by linkedDamageId or area overlap', () => {
      expect(
        findLinkableDamageCandidate([EXISTING_DAMAGE], APPRAISAL_GUTACHTEN)?.id,
      ).toBe('damage-existing-1');
      expect(
        findLinkableDamageCandidate([EXISTING_DAMAGE], {
          damageAreas: ['rear_bumper'],
          damageDescription: 'Heckschaden',
        })?.id,
      ).toBe('damage-existing-1');
    });
  });

  describe('apply gate', () => {
    it('allows complete damage report', () => {
      const gate = assessDamageApplyGate({
        documentType: DAMAGE_DOCUMENT_TYPES.DAMAGE,
        fields: DAMAGE_COMPLETE,
      });
      expect(gate.canApply).toBe(true);
      expect(gate.blockers).toHaveLength(0);
      expect(buildDamageCreatePayload(DAMAGE_COMPLETE)).not.toBeNull();
    });

    it('blocks incomplete damage without confirmed type/severity', () => {
      const gate = assessDamageApplyGate({
        documentType: DAMAGE_DOCUMENT_TYPES.DAMAGE,
        fields: DAMAGE_INCOMPLETE,
      });
      expect(gate.canApply).toBe(false);
      expect(gate.blockers.some((blocker) => blocker.code === 'DAMAGE_TYPE_NOT_CONFIRMED')).toBe(
        true,
      );
      expect(
        gate.blockers.some((blocker) => blocker.code === 'DAMAGE_SEVERITY_NOT_CONFIRMED'),
      ).toBe(true);
    });

    it('blocks accident apply until explicit confirmation', () => {
      const gate = assessDamageApplyGate({
        documentType: DAMAGE_DOCUMENT_TYPES.ACCIDENT,
        fields: ACCIDENT_DRAFT_ONLY,
      });
      expect(gate.canApply).toBe(false);
      expect(gate.blockers.some((blocker) => blocker.code === 'ACCIDENT_APPLY_NOT_CONFIRMED')).toBe(
        true,
      );
      expect(gate.canCreateDraft).toBe(true);
    });

    it('blocks appraisal direct apply', () => {
      const gate = assessDamageApplyGate({
        documentType: DAMAGE_DOCUMENT_TYPES.DAMAGE,
        fields: APPRAISAL_GUTACHTEN,
      });
      expect(gate.canApply).toBe(false);
      expect(gate.blockers.some((blocker) => blocker.code === 'APPRAISAL_NO_DIRECT_APPLY')).toBe(
        true,
      );
    });

    it('blocks duplicate damage case on re-upload', () => {
      const gate = assessDamageApplyGate({
        documentType: DAMAGE_DOCUMENT_TYPES.ACCIDENT,
        fields: ACCIDENT_COMPLETE,
        duplicateDamageId: EXISTING_DAMAGE.id,
      });
      expect(gate.canApply).toBe(false);
      expect(gate.blockers.some((blocker) => blocker.code === 'DUPLICATE_DAMAGE_CASE')).toBe(true);
    });

    it('requires traceable damage area for draft/create payload', () => {
      expect(hasTraceableDamageArea({ damageDescription: 'ohne Bereich' })).toBe(false);
      expect(buildDamageCreatePayload({ damageDescription: 'ohne Bereich', damageType: 'DENT', severity: 'MINOR' })).toBeNull();
    });
  });

  describe('draft payload', () => {
    it('keeps UNKNOWN type and severity in draft payload', () => {
      const payload = buildDamageDraftPayload(DAMAGE_UNKNOWN_TYPE);
      expect(payload).toMatchObject({
        damageType: 'UNKNOWN',
        severity: 'UNKNOWN',
        description: expect.any(String),
      });
    });

    it('returns null when description or area is missing', () => {
      expect(
        buildDamageDraftPayload({ damageDescription: 'ohne Bereich', damageType: 'DENT' }),
      ).toBeNull();
      expect(buildDamageDraftPayload({ damageDescription: 'ohne Bereich' })).toBeNull();
    });
  });
});
