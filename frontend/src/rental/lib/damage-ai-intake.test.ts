import { describe, expect, it } from 'vitest';
import {
  AI_DAMAGE_LOW_CONFIDENCE_THRESHOLD,
  isLowConfidenceSuggestion,
  normalizeSuggestionCoords,
  suggestionToCreateInput,
} from './damage-ai-intake';

describe('damage-ai-intake', () => {
  it('marks low confidence below threshold', () => {
    expect(isLowConfidenceSuggestion(AI_DAMAGE_LOW_CONFIDENCE_THRESHOLD - 0.01)).toBe(true);
    expect(isLowConfidenceSuggestion(0.9)).toBe(false);
  });

  it('clears invalid coordinates to unplaced damage', () => {
    expect(normalizeSuggestionCoords(150, 50)).toEqual({
      locationX: null,
      locationY: null,
    });
  });

  it('maps confirmed suggestion without customer liability or charges', () => {
    const input = suggestionToCreateInput({
      suggestedDamageType: 'SCRATCH',
      suggestedSeverity: 'MODERATE',
      suggestedLocationView: 'LEFT',
      suggestedLocationX: 40,
      suggestedLocationY: 55,
      suggestedLocationLabel: 'Door',
      suggestedDescription: 'Scratch on rear door',
      suggestedRentalImpact: 'WATCH',
    });
    expect(input.source).toBe('AI_UPLOAD');
    expect(input.liabilityStatus).toBe('NEEDS_REVIEW');
    expect(input.chargedToCustomerCents).toBeUndefined();
    expect(input.depositHoldCents).toBeUndefined();
    expect(input.locationX).toBe(40);
  });

  it('uses UNKNOWN view when coordinates missing', () => {
    const input = suggestionToCreateInput({
      suggestedDamageType: 'DENT',
      suggestedSeverity: 'MINOR',
      suggestedLocationView: 'FRONT',
      suggestedLocationX: null,
      suggestedLocationY: null,
      suggestedLocationLabel: null,
      suggestedDescription: null,
      suggestedRentalImpact: 'NONE',
    });
    expect(input.locationView).toBe('UNKNOWN');
    expect(input.locationX).toBeUndefined();
  });
});
