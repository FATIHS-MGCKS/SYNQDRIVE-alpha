import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import {
  LEGAL_DOCUMENT_SCAN_STATUSES,
} from './legal-document-scan-status.constants';
import { LegalDocumentPdfValidationService } from './legal-document-pdf-validation.service';
import { LegalDocumentMalwareScanService } from './legal-document-malware-scan.service';
import { normalizeLegalPdfMimeType } from './legal-documents.util';
import {
  LegalDocumentPdfValidationError,
  LegalDocumentScanFailedError,
} from './legal-documents-api.errors';

export interface LegalDocumentIngestionInput {
  organizationId: string;
  documentType: string;
  fileName: string;
  buffer: Buffer;
  mimeType: string;
}

export interface LegalDocumentIngestionSuccess {
  ok: true;
  objectKey: string;
  storageProvider: string;
  sizeBytes: number;
  mimeType: string;
  checksum: string;
  pageCount: number;
  scanStatus: string;
  validatedAt: Date;
  malwareScannedAt: Date | null;
  malwareScannerId: string | null;
  malwareEngineVersion: string | null;
  malwareThreatName: string | null;
  malwareScanDetail: string | null;
  malwareScanAttempts: number | null;
  quarantineObjectKey: string | null;
}

export type LegalDocumentIngestionResult = LegalDocumentIngestionSuccess;

@Injectable()
export class LegalDocumentIngestionService {
  private readonly logger = new Logger(LegalDocumentIngestionService.name);

  constructor(
    private readonly pdfValidation: LegalDocumentPdfValidationService,
    private readonly malwareScan: LegalDocumentMalwareScanService,
  ) {}

  async ingest(input: LegalDocumentIngestionInput): Promise<LegalDocumentIngestionResult> {
    const validation = await this.pdfValidation.validate({
      buffer: input.buffer,
      mimeType: input.mimeType,
      fileName: input.fileName,
    });

    if (!validation.ok) {
      throw new LegalDocumentPdfValidationError(validation.detail, validation.code);
    }

    const mimeType = normalizeLegalPdfMimeType(input.mimeType, input.fileName);
    const scan = await this.malwareScan.scanAndStore({
      organizationId: input.organizationId,
      documentType: input.documentType,
      originalName: input.fileName,
      mimeType,
      buffer: input.buffer,
    });

    if (!scan.ok) {
      throw new LegalDocumentScanFailedError(scan.detail, scan.code, scan.scannerId);
    }

    const checksum = createHash('sha256').update(input.buffer).digest('hex');
    const now = new Date();

    return {
      ok: true,
      objectKey: scan.stored.objectKey,
      storageProvider: scan.stored.storageProvider,
      sizeBytes: scan.stored.sizeBytes,
      mimeType,
      checksum,
      pageCount: validation.pageCount,
      scanStatus: LEGAL_DOCUMENT_SCAN_STATUSES.SCAN_PASSED,
      validatedAt: now,
      malwareScannedAt: scan.scannedAt,
      malwareScannerId: scan.scannerId,
      malwareEngineVersion: scan.engineVersion,
      malwareThreatName: scan.threatName,
      malwareScanDetail: scan.scanDetail,
      malwareScanAttempts: scan.scanAttempts,
      quarantineObjectKey: scan.quarantineObjectKey,
    };
  }
}
