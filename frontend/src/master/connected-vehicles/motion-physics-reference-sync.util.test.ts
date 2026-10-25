import { describe, expect, it } from 'vitest';
import {
  buildMotionPhysicsReferenceCreateBody,
  canConfirmManualMotionValues,
  hasMotionPhysicsFormValues,
  isMotionPhysicsReferenceReadOnly,
  motionPhysicsReferenceSourceForSave,
  parseMotionPhysicsCurbMassField,
  parseMotionPhysicsDecimalField,
  parseMotionPhysicsNumericField,
  canConfirmEstimatedAiMotionReference,
  hasUnconfirmedManualMotionPhysicsEdits,
  motionPhysicsFormMatchesSnapshot,
  resolveMotionPhysicsPendingAfterAiApply,
  resolveMotionPhysicsCurbMassKg,
  shouldSyncMotionPhysicsReferenceOnSave,
  snapshotMotionPhysicsFromActiveReference,
} from './motion-physics-reference-sync.util';
import { buildMasterVehiclePhysicsSpecPatch, parseCurbWeightKgFromForm } from './master-vehicle-registration';
import type { RegisteredVehicle } from '../data/platform-data';
import { shouldApplyAiSpecToEmptyField } from './ai-spec-field-merge.util';

const baseSyncInput = {
  evidenceTier: null as const,
  referenceId: null,
  pendingCreateSource: 'MISTRAL_AI' as const,
  hasMotionValues: true,
  manualMotionEdited: false,
};

describe('motion-physics-reference-sync.util', () => {
  it('does not sync on routine edit without eligible live Mistral pending', () => {
    expect(
      shouldSyncMotionPhysicsReferenceOnSave({
        ...baseSyncInput,
        pendingCreateSource: null,
      }),
    ).toBe(false);
  });

  it('syncs ESTIMATED reference only after eligible live Mistral apply', () => {
    expect(shouldSyncMotionPhysicsReferenceOnSave(baseSyncInput)).toBe(true);
    expect(motionPhysicsReferenceSourceForSave('MISTRAL_AI')).toBe('MISTRAL_AI');
  });

  it('does not sync when user edited motion fields after Mistral apply', () => {
    expect(
      shouldSyncMotionPhysicsReferenceOnSave({
        ...baseSyncInput,
        manualMotionEdited: true,
      }),
    ).toBe(false);
  });

  it('does not overwrite an existing ESTIMATED reference on save', () => {
    expect(
      shouldSyncMotionPhysicsReferenceOnSave({
        ...baseSyncInput,
        evidenceTier: 'ESTIMATED',
        referenceId: 'ref-1',
      }),
    ).toBe(false);
  });

  it('protects CONFIRMED and VERIFIED tiers from save-side sync', () => {
    expect(
      shouldSyncMotionPhysicsReferenceOnSave({
        ...baseSyncInput,
        evidenceTier: 'CONFIRMED',
        referenceId: 'ref-1',
      }),
    ).toBe(false);
    expect(
      shouldSyncMotionPhysicsReferenceOnSave({
        ...baseSyncInput,
        evidenceTier: 'VERIFIED',
        referenceId: 'ref-1',
      }),
    ).toBe(false);
  });

  describe('resolveMotionPhysicsPendingAfterAiApply (provenance)', () => {
    it('queues MISTRAL_AI only for successful live apply into previously empty motion fields', () => {
      expect(
        resolveMotionPhysicsPendingAfterAiApply({
          provenance: 'mistral_live',
          appliedMotionFromAi: true,
          motionFieldsHadValuesBeforeApply: false,
          manualEditedAfterApply: false,
        }),
      ).toBe('MISTRAL_AI');
    });

    it('never queues MISTRAL_AI for local fallback data', () => {
      expect(
        resolveMotionPhysicsPendingAfterAiApply({
          provenance: 'local_fallback',
          appliedMotionFromAi: true,
          motionFieldsHadValuesBeforeApply: false,
          manualEditedAfterApply: false,
        }),
      ).toBeNull();
    });

    it('does not queue MISTRAL_AI when stock/mixed values existed before AI fill', () => {
      expect(
        resolveMotionPhysicsPendingAfterAiApply({
          provenance: 'mistral_live',
          appliedMotionFromAi: true,
          motionFieldsHadValuesBeforeApply: true,
          manualEditedAfterApply: false,
        }),
      ).toBeNull();
    });

    it('does not queue MISTRAL_AI after manual correction post-apply', () => {
      expect(
        resolveMotionPhysicsPendingAfterAiApply({
          provenance: 'mistral_live',
          appliedMotionFromAi: true,
          motionFieldsHadValuesBeforeApply: false,
          manualEditedAfterApply: true,
        }),
      ).toBeNull();
    });
  });

  it('detects motion form values including power definition', () => {
    expect(
      hasMotionPhysicsFormValues({
        curbWeight: '',
        systemMotorPowerKw: '',
        accel0To100S: '',
        systemPowerDefinition: 'OEM_RATED_SYSTEM_KW',
      }),
    ).toBe(true);
    expect(
      hasMotionPhysicsFormValues({ curbWeight: '', systemMotorPowerKw: '', accel0To100S: '' }),
    ).toBe(false);
  });

  it('blocks manual confirm when VERIFIED; allows re-confirm when CONFIRMED', () => {
    expect(canConfirmManualMotionValues('VERIFIED')).toBe(false);
    expect(canConfirmManualMotionValues('CONFIRMED')).toBe(true);
    expect(isMotionPhysicsReferenceReadOnly('VERIFIED')).toBe(true);
    expect(isMotionPhysicsReferenceReadOnly('CONFIRMED')).toBe(false);
  });

  it('builds manual confirm payload with MANUAL_ENTRY + operator confirm flag', () => {
    const body = buildMotionPhysicsReferenceCreateBody({
      curbWeight: '1760',
      systemMotorPowerKw: '150',
      accel0To100S: '5,2',
      variantAssumption: 'RWD',
      systemPowerDefinition: 'OEM_RATED_SYSTEM_KW',
      source: 'MANUAL_ENTRY',
      manualOperatorConfirm: true,
    });
    expect(body.source).toBe('MANUAL_ENTRY');
    expect(body.manualOperatorConfirm).toBe(true);
    expect(body.curbMassKg).toBe(1760);
    expect(body.accel0To100S).toBe(5.2);
    expect(body.systemPowerDefinition).toBe('OEM_RATED_SYSTEM_KW');
  });

  it('parses decimal power/accel fields (comma dot) without thousand grouping', () => {
    expect(parseMotionPhysicsDecimalField('5,2')).toBe(5.2);
    expect(parseMotionPhysicsDecimalField('5.2')).toBe(5.2);
    expect(parseMotionPhysicsDecimalField('150')).toBe(150);
    expect(parseMotionPhysicsDecimalField('1.234,5')).toBeNull();
    expect(parseMotionPhysicsNumericField('1.234,5')).toBeNull();
  });

  describe('curb mass locale parsing', () => {
    it('accepts German thousands and decimal comma', () => {
      expect(parseMotionPhysicsCurbMassField('1.760')).toEqual({ status: 'valid', kg: 1760 });
      expect(parseMotionPhysicsCurbMassField('1.760,5')).toEqual({ status: 'valid', kg: 1760.5 });
      expect(parseMotionPhysicsCurbMassField('1760')).toEqual({ status: 'valid', kg: 1760 });
      expect(parseMotionPhysicsCurbMassField('1760,5')).toEqual({ status: 'valid', kg: 1760.5 });
    });

    it('rejects ambiguous or implausible curb mass', () => {
      expect(parseMotionPhysicsCurbMassField('1,760').status).toBe('invalid');
      expect(parseMotionPhysicsCurbMassField('12.34.56').status).toBe('invalid');
      expect(parseMotionPhysicsCurbMassField('abc').status).toBe('invalid');
      expect(parseMotionPhysicsCurbMassField('50').status).toBe('invalid');
      expect(parseMotionPhysicsCurbMassField('')).toEqual({ status: 'empty' });
      expect(parseMotionPhysicsCurbMassField('1.234,5')).toEqual({ status: 'valid', kg: 1234.5 });
    });

    it('throws on invalid non-empty curb mass for reference create (no silent null)', () => {
      expect(() => resolveMotionPhysicsCurbMassKg('1,760')).toThrow('CURB_MASS_INVALID');
    });

    it('PATCH and MANUAL_ENTRY reference store the same kg for identical curb input', () => {
      const curbInput = '1.760,5';
      const refBody = buildMotionPhysicsReferenceCreateBody({
        curbWeight: curbInput,
        systemMotorPowerKw: '',
        accel0To100S: '',
        variantAssumption: '',
        systemPowerDefinition: '',
        source: 'MANUAL_ENTRY',
        manualOperatorConfirm: true,
      });
      expect(refBody.curbMassKg).toBe(1760.5);
      expect(parseCurbWeightKgFromForm(curbInput)).toBe(1760.5);

      const baseline = { curbWeight: '1700' } as RegisteredVehicle;
      const current = { curbWeight: curbInput } as RegisteredVehicle;
      expect(buildMasterVehiclePhysicsSpecPatch(current, baseline)).toEqual({ curbWeightKg: 1760.5 });
    });
  });

  describe('ESTIMATED reference vs form (manual confirmation consistency)', () => {
    const baseline = snapshotMotionPhysicsFromActiveReference({
      curbMassKg: 1760,
      systemMotorPowerKw: 150,
      accel0To100S: 5.2,
      variantAssumption: 'RWD',
      systemPowerDefinition: 'OEM_RATED_SYSTEM_KW',
    });

    const tierInput = {
      evidenceTier: 'ESTIMATED' as const,
      referenceId: 'ref-est-1',
      loadedReferenceBaseline: baseline,
    };

    it('allows AI estimate confirm only when form matches loaded reference', () => {
      expect(
        canConfirmEstimatedAiMotionReference({
          ...tierInput,
          currentForm: { ...baseline },
        }),
      ).toBe(true);
      expect(
        canConfirmEstimatedAiMotionReference({
          ...tierInput,
          currentForm: { ...baseline, systemMotorPowerKw: '160' },
        }),
      ).toBe(false);
    });

    it('flags unconfirmed manual edits against ESTIMATED reference', () => {
      expect(
        hasUnconfirmedManualMotionPhysicsEdits({
          ...tierInput,
          currentForm: { ...baseline, curbWeight: '1800' },
        }),
      ).toBe(true);
      expect(
        hasUnconfirmedManualMotionPhysicsEdits({
          ...tierInput,
          currentForm: { ...baseline },
        }),
      ).toBe(false);
    });

    it('treats trimmed fields as equal', () => {
      expect(
        motionPhysicsFormMatchesSnapshot(
          { ...baseline, curbWeight: ' 1760 ' },
          baseline,
        ),
      ).toBe(true);
    });
  });
});

describe('AI override protection (manual precedence)', () => {
  it('does not overwrite non-empty manual motion fields on AI re-fetch', () => {
    expect(shouldApplyAiSpecToEmptyField('210', 150)).toBe(false);
    expect(shouldApplyAiSpecToEmptyField('', 150)).toBe(true);
  });
});
