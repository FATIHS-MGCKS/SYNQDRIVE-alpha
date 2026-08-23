import { describe, expect, it } from 'vitest';
import {
  AXLE_DIFF_WARN_MM,
  LEGAL_MIN_MM,
  deriveTirePlausibilityWarnings,
  extractTreadFromAiReviewFields,
  parseTreadMm,
  validateTireMeasureStep,
} from './operatorTireMeasure.utils';

describe('operator tire measurement utils', () => {
  it('parses tread depth with comma decimals', () => {
    expect(parseTreadMm('3,5')).toBe(3.5);
    expect(parseTreadMm('')).toBeUndefined();
  });

  it('warns when tread is below legal minimum', () => {
    const warnings = deriveTirePlausibilityWarnings({ fl: '1.5', fr: '', rl: '', rr: '' });
    expect(warnings.some((w) => w.id === 'fl-legal')).toBe(true);
  });

  it('warns on large axle difference', () => {
    const warnings = deriveTirePlausibilityWarnings({ fl: '6', fr: '3', rl: '', rr: '' });
    expect(warnings.some((w) => w.id === 'front-axle-diff')).toBe(true);
    const diffWarning = warnings.find((w) => w.id === 'front-axle-diff');
    expect(diffWarning?.code).toBe('FRONT_AXLE_DIFF');
    expect(diffWarning?.params.diff).toBe(3);
    expect(AXLE_DIFF_WARN_MM).toBe(2);
  });

  it('requires at least one tread value on tread step', () => {
    expect(
      validateTireMeasureStep('tread', { fl: '', fr: '', rl: '', rr: '' }, { measuredAt: '', odometerKm: '' }),
    ).toBe('TREAD_REQUIRED');
    expect(
      validateTireMeasureStep('tread', { fl: '4', fr: '', rl: '', rr: '' }, { measuredAt: '', odometerKm: '' }),
    ).toBeNull();
  });

  it('extracts tread depths from AI review fields', () => {
    const tread = extractTreadFromAiReviewFields([
      { key: 'treadDepthMm.fl', value: '4.2' },
      { key: 'treadDepthMm.rr', value: '3.9' },
    ]);
    expect(tread.fl).toBe('4.2');
    expect(tread.rr).toBe('3.9');
  });

  it('documents legal minimum constant used for warnings', () => {
    expect(LEGAL_MIN_MM).toBe(1.6);
  });
});
