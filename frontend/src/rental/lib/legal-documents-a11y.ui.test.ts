import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(process.cwd(), 'src/rental');

describe('legal documents a11y quality audit', () => {
  it('LegalDocumentsTab exposes main landmark and heading id', () => {
    const source = readFileSync(resolve(ROOT, 'components/LegalDocumentsTab.tsx'), 'utf8');
    expect(source).toContain('aria-labelledby={LEGAL_DOCS_HEADING_ID}');
    expect(source).toContain('id={LEGAL_DOCS_MAIN_ID}');
  });

  it('upload wizard has error summary and live upload status', () => {
    const source = readFileSync(
      resolve(ROOT, 'components/legal-documents/LegalDocumentUploadWizardDialog.tsx'),
      'utf8',
    );
    expect(source).toContain('FormErrorSummary');
    expect(source).toContain('LEGAL_UPLOAD_PROGRESS_STATUS_ID');
    expect(source).toContain('role="progressbar"');
    expect(source).toContain('aria-live="polite"');
  });

  it('lifecycle dialog has error summary and field aria wiring', () => {
    const source = readFileSync(
      resolve(ROOT, 'components/legal-documents/lifecycle/LegalDocumentLifecycleActionDialog.tsx'),
      'utf8',
    );
    expect(source).toContain('FormErrorSummary');
    expect(source).toContain('legalLifecycleInputA11y');
    expect(source).toContain('role="alert"');
  });

  it('version history uses DropdownMenu and aria-label on icon actions', () => {
    const source = readFileSync(
      resolve(ROOT, 'components/legal-documents/LegalDocumentTypeVersionHistory.tsx'),
      'utf8',
    );
    expect(source).toContain('DropdownMenu');
    expect(source).toContain('aria-label=');
    expect(source).toContain('md:hidden');
    expect(source).toContain('hidden md:block');
  });

  it('category cards are keyboard accessible via DataCard button semantics', () => {
    const source = readFileSync(
      resolve(ROOT, 'components/legal-documents/LegalDocumentCategoryCards.tsx'),
      'utf8',
    );
    expect(source).toContain('ariaLabel=');
  });

  it('detail drawer PDF preview is keyboard focusable', () => {
    const source = readFileSync(
      resolve(ROOT, 'components/legal-documents/LegalDocumentVersionDetailDrawer.tsx'),
      'utf8',
    );
    expect(source).toContain('tabIndex={0}');
    expect(source).toContain("t('legalDocuments.a11y.pdfPreview')");
  });
});
