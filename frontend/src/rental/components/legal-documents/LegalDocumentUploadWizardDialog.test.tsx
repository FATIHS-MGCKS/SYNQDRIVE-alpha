import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { EMPTY_LEGAL_UPLOAD_WIZARD_FORM } from '../../lib/legal-document-upload-wizard.types';
import { LEGAL_DOCUMENT_TYPE } from '../../lib/legal-document-types';
import {
  LegalDocumentUploadWizardStepClassification,
  LegalDocumentUploadWizardStepFile,
  LegalDocumentUploadWizardStepReview,
  LegalDocumentUploadWizardStepVersion,
} from './LegalDocumentUploadWizardSteps';
import { LegalDocumentUploadWizardDialog } from './LegalDocumentUploadWizardDialog';

const noop = vi.fn();

const filledForm = {
  ...EMPTY_LEGAL_UPLOAD_WIZARD_FORM,
  documentType: LEGAL_DOCUMENT_TYPE.TERMS_AND_CONDITIONS,
  versionLabel: '2026-07',
  language: 'de',
  jurisdictionCountry: 'DE',
};

describe('LegalDocumentUploadWizard steps', () => {
  it('renders classification step with required fields', () => {
    const html = renderToStaticMarkup(
      <LegalDocumentUploadWizardStepClassification
        form={filledForm}
        errors={{ documentType: 'Document type is required.' }}
        onChange={noop}
        stationOptions={[{ value: 'st-1', label: 'Berlin' }]}
      />,
    );
    expect(html).toContain('data-testid="legal-upload-step-classification"');
    expect(html).toContain('Document type');
    expect(html).toContain('Document type is required.');
    expect(html).toContain('Required document for bookings');
  });

  it('renders version step with validation errors', () => {
    const html = renderToStaticMarkup(
      <LegalDocumentUploadWizardStepVersion
        form={filledForm}
        errors={{ versionLabel: 'Version label is required.' }}
        onChange={noop}
      />,
    );
    expect(html).toContain('data-testid="legal-upload-step-version"');
    expect(html).toContain('Version label is required.');
    expect(html).toContain('Responsible contact');
  });

  it('renders file step with drag-drop and selected file metadata', () => {
    const file = new File([new Uint8Array(2048)], 'agb.pdf', { type: 'application/pdf' });
    const html = renderToStaticMarkup(
      <LegalDocumentUploadWizardStepFile
        file={file}
        errors={{}}
        onFileSelected={noop}
      />,
    );
    expect(html).toContain('data-testid="legal-upload-step-file"');
    expect(html).toContain('Drop PDF here');
    expect(html).toContain('agb.pdf');
    expect(html).toContain('accept="application/pdf,.pdf"');
  });

  it('shows upload error on review step', () => {
    const html = renderToStaticMarkup(
      <LegalDocumentUploadWizardStepReview
        form={filledForm}
        file={new File(['x'], 'agb.pdf', { type: 'application/pdf' })}
        uploadedDocument={null}
        uploadProgress={null}
        uploadError="Network upload error"
        canRequestReview
      />,
    );
    expect(html).toContain('data-testid="legal-upload-step-review"');
    expect(html).toContain('Network upload error');
    expect(html).toContain('not when saving as a draft');
  });

  it('shows scan metadata after successful upload', () => {
    const html = renderToStaticMarkup(
      <LegalDocumentUploadWizardStepReview
        form={filledForm}
        file={new File(['x'], 'agb.pdf', { type: 'application/pdf' })}
        uploadedDocument={{
          id: 'doc-1',
          documentType: LEGAL_DOCUMENT_TYPE.TERMS_AND_CONDITIONS,
          title: 'AGB',
          versionLabel: '2026-07',
          language: 'de',
          status: 'DRAFT',
          fileName: 'agb.pdf',
          sizeBytes: 100,
          pageCount: 12,
          scanStatus: 'SCAN_PASSED',
          integrityStatus: 'VERIFIED',
          checksum: 'abc123',
          activeFrom: null,
          createdAt: '2026-07-22',
        }}
        uploadProgress={100}
        uploadError={null}
        canRequestReview
      />,
    );
    expect(html).toContain('SCAN_PASSED');
    expect(html).toContain('abc123');
    expect(html).toContain('12');
  });

  it('hides review permission hint when user can submit review', () => {
    const html = renderToStaticMarkup(
      <LegalDocumentUploadWizardStepReview
        form={filledForm}
        file={null}
        uploadedDocument={null}
        uploadProgress={null}
        uploadError={null}
        canRequestReview
      />,
    );
    expect(html).not.toContain('submit for review');
  });

  it('shows review permission hint when user cannot submit review', () => {
    const html = renderToStaticMarkup(
      <LegalDocumentUploadWizardStepReview
        form={filledForm}
        file={null}
        uploadedDocument={null}
        uploadProgress={null}
        uploadError={null}
        canRequestReview={false}
      />,
    );
    expect(html).toContain('submit for review');
  });
});

describe('LegalDocumentUploadWizardDialog', () => {
  it('does not render dialog body in SSR (Radix portal) — covered by step component tests', () => {
    const html = renderToStaticMarkup(
      <LegalDocumentUploadWizardDialog
        open={false}
        onOpenChange={noop}
        orgId="org-1"
        existingDocs={[]}
        canUpload
        canSubmitReview
        onSuccess={async () => {}}
      />,
    );
    expect(html).toBe('');
  });
});
