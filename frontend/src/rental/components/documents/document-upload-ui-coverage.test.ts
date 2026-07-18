import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Source-level guards for document intake three-tab shell and i18n keys.
 */
describe('DocumentUploadView UI coverage guards', () => {
  const viewPath = resolve(__dirname, '../DocumentUploadView.tsx');
  const reviewPanelPath = resolve(__dirname, './DocumentReviewInboxPanel.tsx');
  const reviewUtilPath = resolve(__dirname, '../../lib/document-review-inbox.util.ts');
  const archivePanelPath = resolve(__dirname, './DocumentArchivePanel.tsx');
  const archiveHookPath = resolve(__dirname, '../../hooks/useDocumentArchiveList.ts');
  const enPath = resolve(__dirname, '../../i18n/translations/en.ts');
  const source = readFileSync(viewPath, 'utf8');
  const reviewPanelSource = readFileSync(reviewPanelPath, 'utf8');
  const reviewUtilSource = readFileSync(reviewUtilPath, 'utf8');
  const archivePanelSource = readFileSync(archivePanelPath, 'utf8');
  const archiveHookSource = readFileSync(archiveHookPath, 'utf8');
  const en = readFileSync(enPath, 'utf8');

  const shellFragments = [
    'useDocumentUploadPage',
    'DocumentIntakeTabBar',
    'DocumentReviewInboxPanel',
    'DocumentArchivePanel',
    'readDocumentIntakeTab',
    'awaiting_type',
    'docUpload.step1',
    'allowedActions',
    'reextract',
    'min-w-0',
    'grid-cols-4',
    'sm:grid-cols-',
  ];

  it('wires archive read model in archive hook', () => {
    expect(archiveHookSource).toContain('listArchiveByOrg');
  });

  it.each(shellFragments)('DocumentUploadView includes %s', (fragment) => {
    expect(source).toContain(fragment);
  });

  it('review inbox covers review reason filters', () => {
    expect(reviewPanelSource).toContain('plausibility_conflict');
    expect(reviewPanelSource).toContain('apply_failed');
    expect(reviewPanelSource).toContain('deriveReviewReasonsFromArchiveItem');
    expect(reviewUtilSource).toContain('AWAITING_DOCUMENT_TYPE');
    expect(reviewUtilSource).toContain('unclear_type');
  });

  it('archive panel covers search, pagination, and audit trail', () => {
    expect(archivePanelSource).toContain('useDocumentArchiveList');
    expect(archivePanelSource).toContain('docUpload.archive.auditTrail');
    expect(archivePanelSource).toContain('totalPages');
  });

  it('has i18n keys for upload lifecycle states', () => {
    for (const key of [
      'docUpload.title',
      'docUpload.tab.upload',
      'docUpload.tab.review',
      'docUpload.tab.archive',
      'docUpload.review.reason.unclearType',
      'docUpload.archive.search',
      'docUpload.archive.auditTrail',
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
