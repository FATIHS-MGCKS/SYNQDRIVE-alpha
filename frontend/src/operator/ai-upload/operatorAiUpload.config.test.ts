import { describe, expect, it } from 'vitest';
import {
  CONTEXT_DEFAULT_DOC_TYPE,
  CRITICAL_REVIEW_FIELD_KEYS,
  OPERATOR_UPLOAD_SOURCE,
  docTypeLabel,
  isCriticalReviewField,
} from './operatorAiUpload.config';

describe('operator AI upload config', () => {
  it('tags operator uploads with dedicated source for backend rate limits and observability', () => {
    expect(OPERATOR_UPLOAD_SOURCE).toBe('operator_app');
  });

  it('defaults all context modes to AUTO classification', () => {
    for (const mode of Object.keys(CONTEXT_DEFAULT_DOC_TYPE)) {
      expect(CONTEXT_DEFAULT_DOC_TYPE[mode as keyof typeof CONTEXT_DEFAULT_DOC_TYPE]).toBe('AUTO');
    }
  });

  it('flags safety-critical review fields including tread depths', () => {
    expect(isCriticalReviewField('treadDepthMm.fl')).toBe(true);
    expect(isCriticalReviewField('odometerKm')).toBe(true);
    expect(isCriticalReviewField('notes')).toBe(false);
    expect(CRITICAL_REVIEW_FIELD_KEYS.has('severity')).toBe(true);
  });

  it('resolves human labels for known document types', () => {
    expect(docTypeLabel('TIRE')).toContain('Reifen');
  });
});
