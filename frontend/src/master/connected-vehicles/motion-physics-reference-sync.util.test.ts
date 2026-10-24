import { describe, expect, it } from 'vitest';
import {
  buildMotionPhysicsReferenceCreateBody,
  canConfirmManualMotionValues,
  hasMotionPhysicsFormValues,
  isMotionPhysicsReferenceReadOnly,
  motionPhysicsReferenceSourceForSave,
  parseMotionPhysicsNumericField,
  resolveMotionPhysicsPendingAfterAiApply,
  shouldSyncMotionPhysicsReferenceOnSave,
} from './motion-physics-reference-sync.util';
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

  it('parses numeric fields safely', () => {
    expect(parseMotionPhysicsNumericField('1.234,5')).toBeNull();
    expect(parseMotionPhysicsNumericField('150')).toBe(150);
  });
});

describe('AI override protection (manual precedence)', () => {
  it('does not overwrite non-empty manual motion fields on AI re-fetch', () => {
    expect(shouldApplyAiSpecToEmptyField('210', 150)).toBe(false);
    expect(shouldApplyAiSpecToEmptyField('', 150)).toBe(true);
  });
});
