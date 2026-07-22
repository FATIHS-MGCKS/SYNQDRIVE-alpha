import { Injectable, Logger } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { Inject } from '@nestjs/common';
import { fromBuffer } from 'file-type';
import documentsConfig from '@config/documents.config';
import {
  LEGAL_DOCUMENT_VALIDATION_ERROR_CODES,
  type LegalDocumentValidationErrorCode,
} from './legal-document-scan-status.constants';
import { probeLegalPdfSecurity } from './legal-document-pdf-security-probe.util';
import {
  DocumentIdentificationTimeoutError,
  withIdentificationTimeout,
} from '@modules/document-extraction/document-identification-timeout.util';

export interface LegalDocumentPdfValidationInput {
  buffer: Buffer;
  mimeType: string;
  fileName: string;
}

export interface LegalDocumentPdfValidationSuccess {
  ok: true;
  pageCount: number;
  sizeBytes: number;
}

export interface LegalDocumentPdfValidationFailure {
  ok: false;
  code: LegalDocumentValidationErrorCode;
  detail: string;
}

export type LegalDocumentPdfValidationResult =
  | LegalDocumentPdfValidationSuccess
  | LegalDocumentPdfValidationFailure;

interface PdfParseInstance {
  getText(params?: { pageJoiner?: string }): Promise<{ total?: number; pages?: Array<{ num: number }> }>;
  destroy(): Promise<void>;
}
type PdfParseCtor = new (options: { data: Uint8Array }) => PdfParseInstance;

@Injectable()
export class LegalDocumentPdfValidationService {
  private readonly logger = new Logger(LegalDocumentPdfValidationService.name);
  private pdfParseCtor: PdfParseCtor | null = null;

  constructor(
    @Inject(documentsConfig.KEY)
    private readonly config: ConfigType<typeof documentsConfig>,
  ) {}

  async validate(input: LegalDocumentPdfValidationInput): Promise<LegalDocumentPdfValidationResult> {
    const sizeBytes = input.buffer.byteLength;
    if (sizeBytes === 0) {
      return this.fail(
        LEGAL_DOCUMENT_VALIDATION_ERROR_CODES.FILE_EMPTY,
        'The uploaded file is empty',
      );
    }

    const maxBytes = this.config.maxLegalUploadMb * 1024 * 1024;
    if (sizeBytes > maxBytes) {
      return this.fail(
        LEGAL_DOCUMENT_VALIDATION_ERROR_CODES.FILE_TOO_LARGE,
        `File exceeds maximum size of ${this.config.maxLegalUploadMb} MB`,
      );
    }

    const normalizedMime = (input.mimeType || '').split(';')[0].trim().toLowerCase();
    if (normalizedMime && normalizedMime !== 'application/pdf' && normalizedMime !== 'application/octet-stream') {
      return this.fail(
        LEGAL_DOCUMENT_VALIDATION_ERROR_CODES.MIME_UNSUPPORTED,
        'Legal documents must be PDF files',
      );
    }

    const hasPdfExtension = input.fileName.toLowerCase().endsWith('.pdf');
    if (!hasPdfExtension && normalizedMime !== 'application/pdf') {
      return this.fail(
        LEGAL_DOCUMENT_VALIDATION_ERROR_CODES.NOT_PDF,
        'File must have a .pdf extension',
      );
    }

    try {
      return await withIdentificationTimeout(
        () => this.validatePdfContent(input.buffer, normalizedMime),
        this.config.legalPdfValidationTimeoutMs,
      );
    } catch (err) {
      if (err instanceof DocumentIdentificationTimeoutError) {
        return this.fail(
          LEGAL_DOCUMENT_VALIDATION_ERROR_CODES.VALIDATION_TIMEOUT,
          'PDF validation took too long — try a smaller document',
        );
      }
      this.logger.warn(`PDF validation error: ${(err as Error).message}`);
      return this.fail(
        LEGAL_DOCUMENT_VALIDATION_ERROR_CODES.PARSE_FAILED,
        'The PDF could not be validated',
      );
    }
  }

  private async validatePdfContent(
    buffer: Buffer,
    clientMime: string,
  ): Promise<LegalDocumentPdfValidationResult> {
    const detected = await fromBuffer(buffer);
    if (!detected || detected.mime !== 'application/pdf') {
      return this.fail(
        LEGAL_DOCUMENT_VALIDATION_ERROR_CODES.NOT_PDF,
        'File content is not a valid PDF',
      );
    }

    if (clientMime && clientMime !== 'application/octet-stream' && clientMime !== 'application/pdf') {
      return this.fail(
        LEGAL_DOCUMENT_VALIDATION_ERROR_CODES.MIME_MISMATCH,
        'Declared MIME type does not match PDF content',
      );
    }

    const probe = probeLegalPdfSecurity(buffer);

    if (probe.corrupt) {
      return this.fail(
        LEGAL_DOCUMENT_VALIDATION_ERROR_CODES.CORRUPT,
        'The PDF appears to be damaged or incomplete',
      );
    }

    if (probe.passwordProtected) {
      return this.fail(
        LEGAL_DOCUMENT_VALIDATION_ERROR_CODES.PASSWORD_PROTECTED,
        'Password-protected or encrypted PDFs are not supported',
      );
    }

    if (probe.pageCount > this.config.legalPdfMaxPages) {
      return this.fail(
        LEGAL_DOCUMENT_VALIDATION_ERROR_CODES.TOO_MANY_PAGES,
        `PDF exceeds maximum page count of ${this.config.legalPdfMaxPages}`,
      );
    }

    if (
      probe.objectCount > this.config.legalPdfMaxObjects ||
      probe.streamCount > this.config.legalPdfMaxStreams ||
      probe.estimatedDecompressedBytes > this.config.legalPdfMaxDecompressedBytes
    ) {
      return this.fail(
        LEGAL_DOCUMENT_VALIDATION_ERROR_CODES.TOO_COMPLEX,
        'PDF structure is too complex to process safely',
      );
    }

    if (probe.hasEmbeddedFiles) {
      return this.fail(
        LEGAL_DOCUMENT_VALIDATION_ERROR_CODES.EMBEDDED_FILES,
        'PDFs with embedded files are not allowed',
      );
    }

    if (probe.hasJavaScript) {
      return this.fail(
        LEGAL_DOCUMENT_VALIDATION_ERROR_CODES.ACTIVE_JAVASCRIPT,
        'PDFs with JavaScript are not allowed',
      );
    }

    if (probe.hasLaunchActions) {
      return this.fail(
        LEGAL_DOCUMENT_VALIDATION_ERROR_CODES.ACTIVE_LAUNCH_ACTION,
        'PDFs with launch actions or active content are not allowed',
      );
    }

    const parseResult = await this.parsePdf(buffer);
    if (!parseResult.ok) {
      return parseResult;
    }

    const pageCount = Math.max(parseResult.pageCount, probe.pageCount, 1);
    if (pageCount > this.config.legalPdfMaxPages) {
      return this.fail(
        LEGAL_DOCUMENT_VALIDATION_ERROR_CODES.TOO_MANY_PAGES,
        `PDF exceeds maximum page count of ${this.config.legalPdfMaxPages}`,
      );
    }

    return { ok: true, pageCount, sizeBytes: buffer.byteLength };
  }

  private async parsePdf(
    buffer: Buffer,
  ): Promise<LegalDocumentPdfValidationResult | { ok: true; pageCount: number }> {
    const PdfParse = await this.loadPdfParse();
    let parser: PdfParseInstance | null = null;
    try {
      parser = new PdfParse({ data: new Uint8Array(buffer) });
      const result = await parser.getText({ pageJoiner: '\n' });
      const pageCount = result.total ?? result.pages?.length ?? 0;
      if (pageCount <= 0) {
        return this.fail(
          LEGAL_DOCUMENT_VALIDATION_ERROR_CODES.PARSE_FAILED,
          'The PDF could not be parsed — no pages found',
        );
      }
      return { ok: true, pageCount };
    } catch (err) {
      const message = (err as Error).message ?? '';
      if (/password|encrypt/i.test(message)) {
        return this.fail(
          LEGAL_DOCUMENT_VALIDATION_ERROR_CODES.PASSWORD_PROTECTED,
          'Password-protected or encrypted PDFs are not supported',
        );
      }
      return this.fail(
        LEGAL_DOCUMENT_VALIDATION_ERROR_CODES.PARSE_FAILED,
        'The PDF could not be parsed',
      );
    } finally {
      await parser?.destroy().catch(() => undefined);
    }
  }

  private async loadPdfParse(): Promise<PdfParseCtor> {
    if (this.pdfParseCtor) return this.pdfParseCtor;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('pdf-parse');
    const ctor = (mod.PDFParse ?? mod.default?.PDFParse ?? mod.default ?? mod) as PdfParseCtor;
    this.pdfParseCtor = ctor;
    return ctor;
  }

  private fail(code: LegalDocumentValidationErrorCode, detail: string): LegalDocumentPdfValidationFailure {
    return { ok: false, code, detail };
  }
}
