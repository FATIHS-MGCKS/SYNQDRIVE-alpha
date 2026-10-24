import { describe, expect, it } from 'vitest';
import {
  isMotionPhysicsTierLockedForAiMerge,
  shouldApplyAiSpecToEmptyField,
} from './ai-spec-field-merge.util';

describe('ai-spec-field-merge.util', () => {
  it('does not overwrite confirmed manual HV field values', () => {
    expect(shouldApplyAiSpecToEmptyField('NMC', 'LFP')).toBe(false);
    expect(shouldApplyAiSpecToEmptyField('  77  ', 80)).toBe(false);
  });

  it('fills empty fields from AI specs', () => {
    expect(shouldApplyAiSpecToEmptyField('', 150)).toBe(true);
    expect(shouldApplyAiSpecToEmptyField('   ', 'LFP')).toBe(true);
  });

  it('locks motion physics fields when tier is confirmed or verified', () => {
    expect(isMotionPhysicsTierLockedForAiMerge('CONFIRMED')).toBe(true);
    expect(isMotionPhysicsTierLockedForAiMerge('VERIFIED')).toBe(true);
    expect(isMotionPhysicsTierLockedForAiMerge('ESTIMATED')).toBe(false);
    expect(isMotionPhysicsTierLockedForAiMerge(null)).toBe(false);
  });
});
