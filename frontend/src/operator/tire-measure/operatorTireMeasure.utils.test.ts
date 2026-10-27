import { describe, expect, it } from 'vitest';
import {
  AXLE_DIFF_WARN_MM,
  LEGAL_MIN_MM,
  deriveOperatorV3EvidenceWarnings,
  deriveTirePlausibilityWarnings,
  extractTreadFromAiReviewFields,
  parseTreadMm,
  validateTireMeasureStep,
} from './operatorTireMeasure.utils';
import type { OperatorTireContextForm } from './operatorTireMeasure.types';

const baseContext: OperatorTireContextForm = {
  measuredAt: '',
  odometerKm: '',
  confirmOdometerKm: false,
  source: 'manual',
  workshopName: '',
  note: '',
};

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
    expect(diffWarning?.message).toContain('3.0 mm');
    expect(AXLE_DIFF_WARN_MM).toBe(2);
  });

  it('requires at least one tread value on tread step', () => {
    expect(
      validateTireMeasureStep('tread', { fl: '', fr: '', rl: '', rr: '' }, baseContext),
    ).toContain('Profiltiefe');
    expect(
      validateTireMeasureStep('tread', { fl: '4', fr: '', rl: '', rr: '' }, baseContext),
    ).toBeNull();
  });

  it('warns on V3 insufficient odometer without blocking ai_confirmed source', () => {
    expect(
      validateTireMeasureStep('context', { fl: '4', fr: '', rl: '', rr: '' }, {
        ...baseContext,
        source: 'ai_confirmed',
      }),
    ).toBeNull();
    const warnings = deriveOperatorV3EvidenceWarnings(
      { fl: '4', fr: '', rl: '', rr: '' },
      { ...baseContext, source: 'ai_confirmed' },
    );
    expect(warnings.some((w) => w.id === 'v3-ai-source')).toBe(true);
  });

  it('warns when manual odometer is not confirmed for V3', () => {
    const warnings = deriveOperatorV3EvidenceWarnings(
      { fl: '4', fr: '', rl: '', rr: '' },
      { ...baseContext, odometerKm: '12000' },
    );
    expect(warnings.some((w) => w.id === 'v3-odo-unconfirmed')).toBe(true);
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
