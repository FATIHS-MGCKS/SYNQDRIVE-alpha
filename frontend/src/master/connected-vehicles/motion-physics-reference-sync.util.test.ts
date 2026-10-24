import { describe, expect, it } from 'vitest';
import {
  hasMotionPhysicsFormValues,
  motionPhysicsReferenceSourceForSave,
  shouldSyncMotionPhysicsReferenceOnSave,
} from './motion-physics-reference-sync.util';

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

  it('detects motion form values', () => {
    expect(
      hasMotionPhysicsFormValues({ curbWeight: '', systemMotorPowerKw: '150', accel0To100S: '' }),
    ).toBe(true);
    expect(
      hasMotionPhysicsFormValues({ curbWeight: '', systemMotorPowerKw: '', accel0To100S: '' }),
    ).toBe(false);
  });
});
