import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Source-level guards for DocumentUploadView status surfaces and i18n keys.
 */
describe('DocumentUploadView UI coverage guards', () => {
  const viewPath = resolve(__dirname, '../DocumentUploadView.tsx');
  const enPath = resolve(__dirname, '../../i18n/translations/en.ts');
  const source = readFileSync(viewPath, 'utf8');
  const en = readFileSync(enPath, 'utf8');

  const requiredFragments = [
    'useDocumentUploadPage',
    'awaiting_type',
    'AWAITING_DOCUMENT_TYPE',
    'docUpload.step1',
    'allowedActions',
    'set_document_type',
    'reextract',
    'min-w-0',
    'grid-cols-4',
    'sm:grid-cols-',
  ];

  it.each(requiredFragments)('includes %s', (fragment) => {
    expect(source).toContain(fragment);
  });

  it('has i18n keys for upload lifecycle states', () => {
    for (const key of [
      'docUpload.title',
      'docUpload.validation.fileTooLarge',
      'documentExtraction.status.READY_FOR_REVIEW',
      'documentExtraction.status.AWAITING_DOCUMENT_TYPE',
      'documentExtraction.status.APPLIED',
      'docUpload.confirmAndFile',
      'docUpload.retry',
    ]) {
      expect(en).toContain(key);
    }
  });
});
