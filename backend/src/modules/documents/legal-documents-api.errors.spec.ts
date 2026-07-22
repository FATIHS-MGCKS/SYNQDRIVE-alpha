import { HttpStatus } from '@nestjs/common';
import { LEGAL_DOCUMENT_ERROR_CODES } from './legal-documents.errors';
import {
  LegalDocumentActiveConflictError,
  LegalDocumentInvalidTransitionError,
  LegalDocumentNotActivatableError,
  LegalDocumentNotFoundError,
  LegalDocumentScopeConflictError,
  LegalDocumentScopeLockedError,
  LegalDocumentValidationError,
} from './legal-documents-api.errors';

describe('legal-documents-api.errors', () => {
  it('maps validation failures to HTTP 422 with structured code', () => {
    const err = new LegalDocumentValidationError('versionLabel is required', 'versionLabel');
    expect(err.getStatus()).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(err.getResponse()).toEqual({
      message: 'versionLabel is required',
      code: LEGAL_DOCUMENT_ERROR_CODES.VALIDATION_FAILED,
      field: 'versionLabel',
    });
  });

  it('maps activation conflicts to HTTP 409', () => {
    const err = new LegalDocumentActiveConflictError('org-1', 'TERMS_AND_CONDITIONS', 'de');
    expect(err.getStatus()).toBe(HttpStatus.CONFLICT);
    expect(err.getResponse()).toEqual(
      expect.objectContaining({
        code: LEGAL_DOCUMENT_ERROR_CODES.ACTIVE_CONFLICT,
        details: {
          organizationId: 'org-1',
          documentType: 'TERMS_AND_CONDITIONS',
          language: 'de',
        },
      }),
    );
  });

  it('maps scope conflicts to HTTP 409 with conflict payload', () => {
    const conflicts = [{ documentId: 'doc-a', reason: 'overlap' }];
    const err = new LegalDocumentScopeConflictError('org-1', conflicts);
    expect(err.getStatus()).toBe(HttpStatus.CONFLICT);
    expect(err.getResponse()).toEqual(
      expect.objectContaining({
        code: LEGAL_DOCUMENT_ERROR_CODES.SCOPE_CONFLICT,
        details: { organizationId: 'org-1', conflicts },
      }),
    );
  });

  it('maps lifecycle transition errors to HTTP 422', () => {
    const err = new LegalDocumentInvalidTransitionError('DRAFT', 'ACTIVE');
    expect(err.getStatus()).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(err.getResponse()).toEqual(
      expect.objectContaining({
        code: LEGAL_DOCUMENT_ERROR_CODES.INVALID_STATUS_TRANSITION,
        details: { fromStatus: 'DRAFT', toStatus: 'ACTIVE' },
      }),
    );
  });

  it('maps not-activatable errors to HTTP 422', () => {
    const err = new LegalDocumentNotActivatableError('must be APPROVED', { status: 'DRAFT' });
    expect(err.getStatus()).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(err.getResponse()).toEqual(
      expect.objectContaining({
        code: LEGAL_DOCUMENT_ERROR_CODES.NOT_ACTIVATABLE,
        details: { status: 'DRAFT' },
      }),
    );
  });

  it('maps scope locked errors to HTTP 422', () => {
    const err = new LegalDocumentScopeLockedError();
    expect(err.getStatus()).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(err.getResponse()).toEqual(
      expect.objectContaining({
        code: LEGAL_DOCUMENT_ERROR_CODES.SCOPE_LOCKED,
      }),
    );
  });

  it('returns tenant-safe 404 without cross-org hints', () => {
    const err = new LegalDocumentNotFoundError();
    expect(err.getStatus()).toBe(HttpStatus.NOT_FOUND);
    expect(err.getResponse()).toEqual({
      message: 'Legal document not found',
      code: LEGAL_DOCUMENT_ERROR_CODES.NOT_FOUND,
    });
  });
});
