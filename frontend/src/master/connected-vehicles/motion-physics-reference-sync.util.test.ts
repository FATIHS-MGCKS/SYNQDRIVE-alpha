import { describe, expect, it } from 'vitest';
import {
  buildMotionPhysicsReferenceCreateBody,
  canConfirmManualMotionValues,
  hasMotionPhysicsFormValues,
  isMotionPhysicsReferenceReadOnly,
  motionPhysicsReferenceSourceForSave,
  parseMotionPhysicsNumericField,
  shouldSyncMotionPhysicsReferenceOnSave,
} from './motion-physics-reference-sync.util';
import { shouldApplyAiSpecToEmptyField } from './ai-spec-field-merge.util';

describe('motion-physics-reference-sync.util', () => {
  it('does not sync on routine edit without in-session Mistral apply', () => {
    expect(
      shouldSyncMotionPhysicsReferenceOnSave({
        evidenceTier: null,
        referenceId: null,
        pendingCreateSource: null,
        hasMotionValues: true,
      }),
    ).toBe(false);
  });

  it('syncs ESTIMATED reference only after Mistral fields were applied in session', () => {
    expect(
      shouldSyncMotionPhysicsReferenceOnSave({
        evidenceTier: null,
        referenceId: null,
        pendingCreateSource: 'MISTRAL_AI',
        hasMotionValues: true,
      }),
    ).toBe(true);
    expect(motionPhysicsReferenceSourceForSave('MISTRAL_AI')).toBe('MISTRAL_AI');
  });

  it('does not overwrite an existing ESTIMATED reference on save', () => {
    expect(
      shouldSyncMotionPhysicsReferenceOnSave({
        evidenceTier: 'ESTIMATED',
        referenceId: 'ref-1',
        pendingCreateSource: 'MISTRAL_AI',
        hasMotionValues: true,
      }),
    ).toBe(false);
  });

  it('protects CONFIRMED and VERIFIED tiers from save-side sync', () => {
    expect(
      shouldSyncMotionPhysicsReferenceOnSave({
        evidenceTier: 'CONFIRMED',
        referenceId: 'ref-1',
        pendingCreateSource: 'MISTRAL_AI',
        hasMotionValues: true,
      }),
    ).toBe(false);
    expect(
      shouldSyncMotionPhysicsReferenceOnSave({
        evidenceTier: 'VERIFIED',
        referenceId: 'ref-1',
        pendingCreateSource: 'MISTRAL_AI',
        hasMotionValues: true,
      }),
    ).toBe(false);
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
