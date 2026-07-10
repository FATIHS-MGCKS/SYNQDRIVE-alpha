import { describe, expect, it } from 'vitest';
import { fr } from '../i18n/translations/fr';
import { en } from '../i18n/translations/en';

const DOC_UPLOAD_FLOW_KEYS = [
  'docUpload.flow.queued',
  'docUpload.flow.awaiting_type',
  'docUpload.flow.ready',
  'docUpload.awaitingTypeTitle',
  'documentExtraction.status.AWAITING_DOCUMENT_TYPE',
  'documentExtraction.status.READY_FOR_REVIEW',
] as const;

describe('French document upload i18n', () => {
  it('overrides lifecycle flow keys with French (not English fallbacks)', () => {
    for (const key of DOC_UPLOAD_FLOW_KEYS) {
      expect(fr[key]).toBeTruthy();
      expect(fr[key]).not.toBe(en[key]);
    }
  });

  it('uses French accents/words for confirm action', () => {
    expect(fr['docUpload.confirmAndFile']).toMatch(/confirmer/i);
    expect(fr['docUpload.successFiled']).toMatch(/succ/i);
  });

  it('documents supported upload formats aligned with backend metadata', () => {
    expect(fr['docUpload.supportedFormats']).toMatch(/PDF/i);
    expect(fr['docUpload.supportedFormats']).not.toMatch(/DOCX|XLSX/i);
    expect(fr['docUpload.supportedFormats']).toMatch(/10\s*Mo/i);
  });
});
