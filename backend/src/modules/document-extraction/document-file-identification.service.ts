import { basename } from 'node:path';
import { Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { Inject } from '@nestjs/common';
import { fromBuffer } from 'file-type';
import documentExtractionConfig from '@config/document-extraction.config';
import {
  ALLOWED_MIME_TYPES,
  AllowedDocumentMimeType,
  isAllowedMimeType,
  normalizeClientMimeType,
  resolveMaxUploadBytes,
} from './document-upload.constants';
import {
  DOCUMENT_PIPELINE_ERROR_CODES,
  DocumentExtractionPipelineError,
} from './document-extraction.errors';
import {
  DOCUMENT_FILE_IDENTIFICATION_STATUSES,
  type DocumentFileIdentificationStatus,
  type DocumentFilePreprocessLimits,
} from './document-file-identification-status.types';
import { probePdfBuffer } from './document-pdf-probe.util';
import { probeJpegBuffer, probePngBuffer, probeWebpBuffer } from './document-image-probe.util';
import {
  DocumentIdentificationTimeoutError,
  withIdentificationTimeout,
} from './document-identification-timeout.util';

export type DetectedDocumentKind = 'pdf' | 'jpeg' | 'png' | 'webp' | 'plain-text';

const KIND_TO_MIME: Record<DetectedDocumentKind, AllowedDocumentMimeType> = {
  pdf: 'application/pdf',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  'plain-text': 'text/plain',
};

const MIME_TO_KIND: Partial<Record<AllowedDocumentMimeType, DetectedDocumentKind>> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpeg',
  'image/jpg': 'jpeg',
  'image/png': 'png',
  'image/webp': 'webp',
  'text/plain': 'plain-text',
};

export interface DocumentFileIdentificationInput {
  buffer: Buffer;
  clientMimeType: string;
  originalName?: string;
}

export interface IdentifiedDocumentFile {
  detectedKind: DetectedDocumentKind;
  detectedMime: AllowedDocumentMimeType;
  clientMime: string;
  displayFileName: string;
  sizeBytes: number;
  identificationStatus: DocumentFileIdentificationStatus;
  pageCount?: number;
  pixelCount?: number;
  rotationDegrees?: number;
}

@Injectable()
export class DocumentFileIdentificationService {
  constructor(
    @Inject(documentExtractionConfig.KEY)
    private readonly config: ConfigType<typeof documentExtractionConfig>,
  ) {}

  async identify(input: DocumentFileIdentificationInput): Promise<IdentifiedDocumentFile> {
    const sizeBytes = input.buffer.byteLength;
    if (sizeBytes === 0) {
      throw new DocumentExtractionPipelineError({
        code: DOCUMENT_PIPELINE_ERROR_CODES.FILE_EMPTY,
        safeMessage: 'The uploaded file is empty',
        stage: 'UPLOAD',
      });
    }

    const maxBytes = resolveMaxUploadBytes(this.config.maxUploadMb);
    if (sizeBytes > maxBytes) {
      throw new DocumentExtractionPipelineError({
        code: DOCUMENT_PIPELINE_ERROR_CODES.FILE_TOO_LARGE,
        safeMessage: 'The uploaded file exceeds the maximum allowed size',
        stage: 'UPLOAD',
      });
    }

    const clientMime = normalizeClientMimeType(input.clientMimeType);
    if (!isAllowedMimeType(clientMime)) {
      throw new DocumentExtractionPipelineError({
        code: DOCUMENT_PIPELINE_ERROR_CODES.MIME_UNSUPPORTED,
        safeMessage: 'This file type is not supported for document upload',
        stage: 'UPLOAD',
      });
    }

    const displayFileName = sanitizeUploadFileName(input.originalName);
    const detected = await fromBuffer(input.buffer);

    if (!detected) {
      return this.identifyWithoutMagicBytes(input.buffer, clientMime, displayFileName, sizeBytes);
    }

    const detectedKind = this.kindFromDetectedMime(detected.mime);
    if (!detectedKind) {
      throw new DocumentExtractionPipelineError({
        code: DOCUMENT_PIPELINE_ERROR_CODES.MIME_UNSUPPORTED,
        safeMessage: 'This file type is not supported for document upload',
        stage: 'UPLOAD',
      });
    }

    const detectedMime = KIND_TO_MIME[detectedKind];
    this.assertCompatibleMime(clientMime, detectedMime, detectedKind);

    const limits = this.resolvePreprocessLimits();
    try {
      const preprocessed = await withIdentificationTimeout(
        async () => this.preprocessDetectedFile(input.buffer, detectedKind, limits),
        limits.timeoutMs,
      );
      return {
        detectedKind,
        detectedMime,
        clientMime,
        displayFileName,
        sizeBytes,
        ...preprocessed,
      };
    } catch (error) {
      if (error instanceof DocumentExtractionPipelineError) {
        throw error;
      }
      if (error instanceof DocumentIdentificationTimeoutError) {
        throw new DocumentExtractionPipelineError({
          code: DOCUMENT_PIPELINE_ERROR_CODES.FILE_IDENTIFICATION_TIMEOUT,
          safeMessage: 'File identification took too long — try a smaller document',
          stage: 'UPLOAD',
        });
      }
      throw error;
    }
  }

  private resolvePreprocessLimits(): DocumentFilePreprocessLimits {
    return {
      timeoutMs: this.config.identifyTimeoutMs,
      maxPdfPages: this.config.identifyMaxPdfPages,
      maxImagePixels: this.config.identifyMaxImagePixels,
      maxDecompressedBytes: this.config.identifyMaxDecompressedBytes,
      maxPdfObjects: this.config.identifyMaxPdfObjects,
      maxPdfStreams: this.config.identifyMaxPdfStreams,
    };
  }

  private preprocessDetectedFile(
    buffer: Buffer,
    detectedKind: DetectedDocumentKind,
    limits: DocumentFilePreprocessLimits,
  ): Pick<
    IdentifiedDocumentFile,
    'identificationStatus' | 'pageCount' | 'pixelCount' | 'rotationDegrees'
  > {
    if (detectedKind === 'pdf') {
      return this.preprocessPdf(buffer, limits);
    }
    if (detectedKind === 'jpeg' || detectedKind === 'png' || detectedKind === 'webp') {
      return this.preprocessImage(buffer, detectedKind, limits);
    }
    return { identificationStatus: DOCUMENT_FILE_IDENTIFICATION_STATUSES.ACCEPTED };
  }

  private preprocessPdf(
    buffer: Buffer,
    limits: DocumentFilePreprocessLimits,
  ): Pick<IdentifiedDocumentFile, 'identificationStatus' | 'pageCount'> {
    const probe = probePdfBuffer(buffer);

    if (probe.corrupt) {
      throw this.rejectionError(
        DOCUMENT_FILE_IDENTIFICATION_STATUSES.REJECTED_CORRUPT,
        DOCUMENT_PIPELINE_ERROR_CODES.FILE_CORRUPTED,
        'The PDF file appears to be damaged or incomplete',
      );
    }

    if (probe.passwordProtected) {
      throw this.rejectionError(
        DOCUMENT_FILE_IDENTIFICATION_STATUSES.REQUIRES_PASSWORD,
        DOCUMENT_PIPELINE_ERROR_CODES.PDF_PASSWORD_REQUIRED,
        'Password-protected PDFs are not supported — remove the password and try again',
      );
    }

    if (probe.pageCount > limits.maxPdfPages) {
      throw this.rejectionError(
        DOCUMENT_FILE_IDENTIFICATION_STATUSES.REJECTED_TOO_MANY_PAGES,
        DOCUMENT_PIPELINE_ERROR_CODES.FILE_TOO_MANY_PAGES,
        `The PDF has too many pages (maximum ${limits.maxPdfPages})`,
      );
    }

    if (
      probe.objectCount > limits.maxPdfObjects ||
      probe.streamCount > limits.maxPdfStreams ||
      probe.estimatedDecompressedBytes > limits.maxDecompressedBytes
    ) {
      throw this.rejectionError(
        DOCUMENT_FILE_IDENTIFICATION_STATUSES.REJECTED_TOO_COMPLEX,
        DOCUMENT_PIPELINE_ERROR_CODES.FILE_TOO_COMPLEX,
        'The PDF structure is too complex to process safely',
      );
    }

    const looksScanned = probe.streamCount > 0 && probe.pageCount >= 1;
    return {
      identificationStatus: looksScanned
        ? DOCUMENT_FILE_IDENTIFICATION_STATUSES.OCR_REQUIRED
        : DOCUMENT_FILE_IDENTIFICATION_STATUSES.ACCEPTED,
      pageCount: probe.pageCount,
    };
  }

  private preprocessImage(
    buffer: Buffer,
    detectedKind: Extract<DetectedDocumentKind, 'jpeg' | 'png' | 'webp'>,
    limits: DocumentFilePreprocessLimits,
  ): Pick<IdentifiedDocumentFile, 'identificationStatus' | 'pixelCount' | 'rotationDegrees'> {
    const probe =
      detectedKind === 'jpeg'
        ? probeJpegBuffer(buffer)
        : detectedKind === 'png'
          ? probePngBuffer(buffer)
          : probeWebpBuffer(buffer);

    if (probe.corrupt) {
      throw this.rejectionError(
        DOCUMENT_FILE_IDENTIFICATION_STATUSES.REJECTED_CORRUPT,
        DOCUMENT_PIPELINE_ERROR_CODES.FILE_CORRUPTED,
        'The image file appears to be damaged or incomplete',
      );
    }

    if (probe.pixelCount > limits.maxImagePixels) {
      throw this.rejectionError(
        DOCUMENT_FILE_IDENTIFICATION_STATUSES.REJECTED_TOO_COMPLEX,
        DOCUMENT_PIPELINE_ERROR_CODES.FILE_TOO_COMPLEX,
        'The image resolution is too large to process safely',
      );
    }

    const needsRotationOcr = probe.rotationDegrees !== 0;
    return {
      identificationStatus: needsRotationOcr
        ? DOCUMENT_FILE_IDENTIFICATION_STATUSES.OCR_REQUIRED
        : DOCUMENT_FILE_IDENTIFICATION_STATUSES.ACCEPTED,
      pixelCount: probe.pixelCount,
      rotationDegrees: probe.rotationDegrees,
    };
  }

  private rejectionError(
    identificationStatus: DocumentFileIdentificationStatus,
    code: string,
    safeMessage: string,
  ): DocumentExtractionPipelineError {
    const err = new DocumentExtractionPipelineError({
      code,
      safeMessage,
      stage: 'UPLOAD',
    });
    (err as DocumentExtractionPipelineError & { identificationStatus?: string }).identificationStatus =
      identificationStatus;
    return err;
  }

  private identifyWithoutMagicBytes(
    buffer: Buffer,
    clientMime: AllowedDocumentMimeType,
    displayFileName: string,
    sizeBytes: number,
  ): IdentifiedDocumentFile {
    if (clientMime !== 'text/plain') {
      throw new DocumentExtractionPipelineError({
        code: DOCUMENT_PIPELINE_ERROR_CODES.MIME_MISMATCH,
        safeMessage: 'File content does not match the declared file type',
        stage: 'UPLOAD',
      });
    }

    if (!this.isLikelyUtf8Text(buffer)) {
      throw new DocumentExtractionPipelineError({
        code: DOCUMENT_PIPELINE_ERROR_CODES.FILE_CORRUPTED,
        safeMessage: 'The text file could not be read',
        stage: 'UPLOAD',
      });
    }

    return {
      detectedKind: 'plain-text',
      detectedMime: 'text/plain',
      clientMime,
      displayFileName,
      sizeBytes,
      identificationStatus: DOCUMENT_FILE_IDENTIFICATION_STATUSES.ACCEPTED,
    };
  }

  private kindFromDetectedMime(mime: string): DetectedDocumentKind | null {
    const normalized = normalizeClientMimeType(mime);
    return MIME_TO_KIND[normalized as AllowedDocumentMimeType] ?? null;
  }

  private assertCompatibleMime(
    clientMime: AllowedDocumentMimeType,
    detectedMime: AllowedDocumentMimeType,
    detectedKind: DetectedDocumentKind,
  ): void {
    const clientKind = MIME_TO_KIND[clientMime];
    if (!clientKind) {
      throw new DocumentExtractionPipelineError({
        code: DOCUMENT_PIPELINE_ERROR_CODES.MIME_UNSUPPORTED,
        safeMessage: 'This file type is not supported for document upload',
        stage: 'UPLOAD',
      });
    }

    if (clientKind !== detectedKind) {
      const harmless =
        (clientMime === 'image/jpg' && detectedMime === 'image/jpeg') ||
        (clientMime === 'application/pdf' && detectedKind === 'pdf');
      if (!harmless) {
        throw new DocumentExtractionPipelineError({
          code: DOCUMENT_PIPELINE_ERROR_CODES.MIME_MISMATCH,
          safeMessage: 'File content does not match the declared file type',
          stage: 'UPLOAD',
        });
      }
    }
  }

  private isLikelyUtf8Text(buffer: Buffer): boolean {
    if (buffer.includes(0)) return false;
    const sample = buffer.subarray(0, Math.min(buffer.length, 4096)).toString('utf8');
    if (sample.includes('\uFFFD')) return false;
    const printable = sample.replace(/\s/g, '');
    return printable.length > 0;
  }
}

export function sanitizeUploadFileName(originalName: string | undefined): string {
  const base = basename((originalName ?? 'document').replace(/\\/g, '/'));
  const sanitized = base.replace(/[^\w.\-()+\s]/g, '_').trim();
  return (sanitized || 'document').slice(0, 255);
}

export function listAllowedMimeTypes(): readonly string[] {
  return ALLOWED_MIME_TYPES;
}
