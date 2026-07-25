import { describe, expect, it } from 'vitest';
import {
  deriveTirePlausibilityWarnings,
  parseTreadMm,
  validateTireMeasureStep,
} from './operatorTireMeasure.utils';
import type { OperatorTireContextForm, OperatorTireTreadForm } from './operatorTireMeasure.types';

describe('operatorTireMeasure.utils', () => {
  const tread: OperatorTireTreadForm = { fl: '5,8', fr: '5.5', rl: '', rr: '' };
  const context: OperatorTireContextForm = {
    measuredAt: '2026-07-25T10:00',
    odometerKm: '120000',
    source: 'manual',
    workshopName: '',
    note: '',
  };

  it('parses comma decimal tread values', () => {
    expect(parseTreadMm('5,8')).toBe(5.8);
    expect(parseTreadMm('4.2')).toBe(4.2);
  });

  it('derives plausibility warnings without blocking', () => {
    const warnings = deriveTirePlausibilityWarnings({
      fl: '1.5',
      fr: '5',
      rl: '',
      rr: '',
    });
    expect(warnings.some((w) => w.message.includes('VL'))).toBe(true);
  });

  it('validates tread step requires at least one wheel', () => {
    expect(
      validateTireMeasureStep('tread', { fl: '', fr: '', rl: '', rr: '' }, context),
    ).toMatch(/Mindestens/);
    expect(validateTireMeasureStep('tread', tread, context)).toBeNull();
  });
});
