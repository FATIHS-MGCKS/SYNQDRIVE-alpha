import { HttpException, HttpStatus, NotFoundException } from '@nestjs/common';
import { LEGAL_DOCUMENT_ERROR_CODES } from './legal-documents.errors';

export type LegalDocumentApiErrorCode =
  (typeof LEGAL_DOCUMENT_ERROR_CODES)[keyof typeof LEGAL_DOCUMENT_ERROR_CODES];

export interface LegalDocumentApiErrorBody {
  message: string;
  code: LegalDocumentApiErrorCode;
  field?: string;
  details?: Record<string, unknown>;
}

export class LegalDocumentDomainError extends HttpException {
  constructor(
    message: string,
    public readonly code: LegalDocumentApiErrorCode,
    status: HttpStatus = HttpStatus.BAD_REQUEST,
    extras?: Omit<LegalDocumentApiErrorBody, 'message' | 'code'>,
  ) {
    super({ message, code, ...extras }, status);
    this.name = 'LegalDocumentDomainError';
  }
}

export class LegalDocumentValidationError extends LegalDocumentDomainError {
  constructor(message: string, field?: string) {
    super(
      message,
      LEGAL_DOCUMENT_ERROR_CODES.VALIDATION_FAILED,
      HttpStatus.UNPROCESSABLE_ENTITY,
      field ? { field } : undefined,
    );
    this.name = 'LegalDocumentValidationError';
  }
}

export class LegalDocumentNotActivatableError extends LegalDocumentDomainError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(
      message,
      LEGAL_DOCUMENT_ERROR_CODES.NOT_ACTIVATABLE,
      HttpStatus.UNPROCESSABLE_ENTITY,
      details ? { details } : undefined,
    );
    this.name = 'LegalDocumentNotActivatableError';
  }
}

export class LegalDocumentInvalidTransitionError extends LegalDocumentDomainError {
  constructor(fromStatus: string, toStatus: string) {
    super(
      `Illegal legal document status transition: ${fromStatus} → ${toStatus}`,
      LEGAL_DOCUMENT_ERROR_CODES.INVALID_STATUS_TRANSITION,
      HttpStatus.UNPROCESSABLE_ENTITY,
      { details: { fromStatus, toStatus } },
    );
    this.name = 'LegalDocumentInvalidTransitionError';
  }
}

export class LegalDocumentScopeLockedError extends LegalDocumentDomainError {
  constructor() {
    super(
      'Application scope cannot be changed on ACTIVE or SUPERSEDED legal documents',
      LEGAL_DOCUMENT_ERROR_CODES.SCOPE_LOCKED,
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
    this.name = 'LegalDocumentScopeLockedError';
  }
}

export class LegalDocumentActiveConflictError extends LegalDocumentDomainError {
  constructor(
    organizationId: string,
    documentType: string,
    language: string,
  ) {
    super(
      'Another legal document version is already active for this organization, document type, and language',
      LEGAL_DOCUMENT_ERROR_CODES.ACTIVE_CONFLICT,
      HttpStatus.CONFLICT,
      {
        details: { organizationId, documentType, language },
      },
    );
    this.name = 'LegalDocumentActiveConflictError';
  }
}

export class LegalDocumentScopeConflictError extends LegalDocumentDomainError {
  constructor(
    organizationId: string,
    conflicts: unknown[],
  ) {
    super(
      'Legal document application scope conflicts with an existing rule',
      LEGAL_DOCUMENT_ERROR_CODES.SCOPE_CONFLICT,
      HttpStatus.CONFLICT,
      { details: { organizationId, conflicts } },
    );
    this.name = 'LegalDocumentScopeConflictError';
  }
}

export class LegalDocumentNotFoundError extends NotFoundException {
  constructor() {
    super({
      message: 'Legal document not found',
      code: LEGAL_DOCUMENT_ERROR_CODES.NOT_FOUND,
    });
    this.name = 'LegalDocumentNotFoundError';
  }
}

export class LegalDocumentForbiddenError extends HttpException {
  constructor(
    message: string,
    public readonly code: string = LEGAL_DOCUMENT_ERROR_CODES.FORBIDDEN,
  ) {
    super({ message, code }, HttpStatus.FORBIDDEN);
    this.name = 'LegalDocumentForbiddenError';
  }
}

export class LegalDocumentPdfValidationError extends LegalDocumentDomainError {
  constructor(
    message: string,
    public readonly validationCode: string,
    field = 'file',
  ) {
    super(
      message,
      LEGAL_DOCUMENT_ERROR_CODES.PDF_VALIDATION_FAILED,
      HttpStatus.UNPROCESSABLE_ENTITY,
      { field, details: { validationCode } },
    );
    this.name = 'LegalDocumentPdfValidationError';
  }
}

export class LegalDocumentScanFailedError extends LegalDocumentDomainError {
  constructor(
    message: string,
    public readonly validationCode: string,
    scannerId?: string | null,
  ) {
    super(
      message,
      LEGAL_DOCUMENT_ERROR_CODES.MALWARE_SCAN_FAILED,
      HttpStatus.UNPROCESSABLE_ENTITY,
      { details: { validationCode, scannerId: scannerId ?? null } },
    );
    this.name = 'LegalDocumentScanFailedError';
  }
}

export class LegalDocumentScanNotPassedError extends LegalDocumentDomainError {
  constructor(scanStatus: string) {
    super(
      'Legal document must pass PDF validation and malware scanning before review or activation',
      LEGAL_DOCUMENT_ERROR_CODES.SCAN_NOT_PASSED,
      HttpStatus.UNPROCESSABLE_ENTITY,
      { details: { scanStatus } },
    );
    this.name = 'LegalDocumentScanNotPassedError';
  }
}

export function isLegalDocumentDomainError(err: unknown): err is LegalDocumentDomainError {
  return err instanceof LegalDocumentDomainError;
}
