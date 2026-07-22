import { describe, expect, it } from 'vitest';
import type { LegalDocumentDto } from '../../lib/api';
import { LEGAL_DOCUMENT_TYPE } from './legal-document-types';
import { EMPTY_LEGAL_UPLOAD_WIZARD_FORM } from './legal-document-upload-wizard.types';
import {
  hasValidationErrors,
  isDuplicateVersionLabel,
  validateLegalUploadWizardStep,
} from './legal-document-upload-wizard.validation';

function makePdfFile(name = 'agb.pdf', size = 1024): File {
  return new File([new Uint8Array(size)], name, { type: 'application/pdf' });
}

const baseForm = {
  ...EMPTY_LEGAL_UPLOAD_WIZARD_FORM,
  documentType: LEGAL_DOCUMENT_TYPE.TERMS_AND_CONDITIONS,
  versionLabel: '2026-01',
};

describe('validateLegalUploadWizardStep', () => {
  it('requires classification fields on step 1', () => {
    const errors = validateLegalUploadWizardStep(1, EMPTY_LEGAL_UPLOAD_WIZARD_FORM, null);
    expect(errors.documentType).toBeTruthy();
    expect(errors.language).toBeFalsy();
    expect(errors.customerSegment).toBeFalsy();
  });

  it('requires consumer variant for consumer information', () => {
    const errors = validateLegalUploadWizardStep(
      1,
      {
        ...baseForm,
        documentType: LEGAL_DOCUMENT_TYPE.CONSUMER_INFORMATION,
        legalVariant: '',
      },
      null,
    );
    expect(errors.legalVariant).toBeTruthy();
  });

  it('requires station ids for station-specific scope', () => {
    const errors = validateLegalUploadWizardStep(
      1,
      {
        ...baseForm,
        stationScopeMode: 'STATION_SPECIFIC',
        stationIds: [],
      },
      null,
    );
    expect(errors.stationIds).toBeTruthy();
  });

  it('validates version label pattern and duplicates on step 2', () => {
    const existing: LegalDocumentDto[] = [
      {
        id: '1',
        documentType: LEGAL_DOCUMENT_TYPE.TERMS_AND_CONDITIONS,
        versionLabel: '2026-01',
        title: 'AGB',
        language: 'de',
        status: 'DRAFT',
        fileName: 'agb.pdf',
        sizeBytes: 100,
        activeFrom: null,
        createdAt: '2026-01-01',
      },
    ];

    const invalid = validateLegalUploadWizardStep(
      2,
      { ...baseForm, versionLabel: '!!!' },
      null,
      existing,
    );
    expect(invalid.versionLabel).toContain('Buchstaben');

    const duplicate = validateLegalUploadWizardStep(2, baseForm, null, existing);
    expect(duplicate.versionLabel).toContain('existiert bereits');
  });

  it('rejects validUntil before validFrom', () => {
    const errors = validateLegalUploadWizardStep(
      2,
      {
        ...baseForm,
        validFrom: '2026-06-01T10:00',
        validUntil: '2026-01-01T10:00',
      },
      null,
    );
    expect(errors.validUntil).toBeTruthy();
  });

  it('requires PDF file on step 3', () => {
    const missing = validateLegalUploadWizardStep(2, baseForm, null);
    expect(missing.file).toBeFalsy();

    const noFile = validateLegalUploadWizardStep(3, baseForm, null);
    expect(noFile.file).toBeTruthy();

    const badType = validateLegalUploadWizardStep(
      3,
      baseForm,
      new File(['x'], 'agb.txt', { type: 'text/plain' }),
    );
    expect(badType.file).toContain('PDF');
  });

  it('accepts iOS-style PDF without mime type', () => {
    const iosFile = new File([new Uint8Array(10)], 'widerruf.pdf', { type: '' });
    const errors = validateLegalUploadWizardStep(3, baseForm, iosFile);
    expect(errors.file).toBeFalsy();
  });
});

describe('isDuplicateVersionLabel', () => {
  it('ignores archived and revoked documents', () => {
    const docs: LegalDocumentDto[] = [
      {
        id: 'a',
        documentType: LEGAL_DOCUMENT_TYPE.TERMS_AND_CONDITIONS,
        versionLabel: '2026-01',
        title: 'x',
        language: 'de',
        status: 'ARCHIVED',
        fileName: 'a.pdf',
        sizeBytes: 1,
        activeFrom: null,
        createdAt: '2026-01-01',
      },
    ];
    expect(
      isDuplicateVersionLabel('2026-01', baseForm, docs),
    ).toBe(false);
  });
});

describe('hasValidationErrors', () => {
  it('returns false for empty errors', () => {
    expect(hasValidationErrors({})).toBe(false);
    expect(hasValidationErrors({ versionLabel: 'x' })).toBe(true);
  });
});
