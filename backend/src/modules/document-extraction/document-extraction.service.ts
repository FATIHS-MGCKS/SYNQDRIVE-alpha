import {
  Injectable,
  Logger,
  Inject,
  NotFoundException,
  BadRequestException,
  ServiceUnavailableException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ConfigType } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { DocumentExtractionType, Prisma } from '@prisma/client';
import documentExtractionConfig from '@config/document-extraction.config';
import { PrismaService } from '@shared/database/prisma.service';
import { QUEUE_NAMES } from '@workers/queues/queue-names';
import {
  DOCUMENT_STORAGE,
  DocumentStoragePort,
} from './storage/document-storage.interface';
import { DocumentExtractionApplyService } from './document-extraction-apply.service';
import { DocumentActionOrchestratorService } from './document-action-orchestrator.service';
import { mapApplyLifecycleToExtractionStatus } from './document-action-plan.state-machine';
import { isArchiveDocumentType } from './document-archive-extraction.rules';
import { DocumentExtractionPlausibilityService } from './document-extraction-plausibility.service';
import { DocumentFileIdentificationService } from './document-file-identification.service';
import { computeDocumentContentSha256 } from './document-content-hash.util';
import { buildDocumentExtractionFileFingerprint } from './document-extraction-fingerprint.types';
import { mergePipelinePlausibility } from './document-content-cache.util';
import { isMalwareScanDownloadAllowed } from './document-malware-scan.util';
import { DocumentUploadDuplicateService } from './document-upload-duplicate.service';
import { DocumentUploadDuplicateBlockedException } from './document-upload-duplicate.errors';
import { DocumentUploadRateLimitService } from './document-upload-rate-limit.service';
import { DocumentMalwareScanService } from './document-malware-scan.service';
import { DocumentLifecycleService } from './document-lifecycle.service';
import { DocumentRetentionService } from './document-retention.service';
import { DocumentRetentionRunOptions } from './document-retention.types';
import { DocumentUploadContextService } from './document-upload-context.service';
import { buildInitialUploadContextPipelineState } from './document-upload-context.util';
import {
  DocumentMalwareDetectedError,
  DocumentMalwareDownloadBlockedError,
  DocumentMalwareScanFailedError,
} from './document-malware-scan.errors';
import { DocumentExtractionPipelineError } from './document-extraction.errors';
import {
  ApplyDocumentExtractionType,
  AUTO_CLASSIFICATION_REQUEST,
  getFieldSchema,
  isAllowedMimeType,
  isApplyDocumentType,
  isAutoClassificationRequest,
  isRequestDocumentType,
} from './document-extraction.schemas';
import { DocumentExtractionJobData } from './document-extraction.types';
import { canEnqueueQueue } from '@shared/queue/queue-producer.util';
import {
  deriveClassificationMode,
  requireApplyDocumentType,
  resolveEffectiveDocumentType,
  DOCUMENT_EXTRACTION_ERROR_CODES,
} from './document-extraction-lifecycle.util';
import { Readable } from 'stream';
import {
  toPublicDocumentExtraction,
  toPublicDocumentExtractionSummary,
} from './document-extraction-public.mapper';
import {
  buildExtractionJobOptions,
  DOCUMENT_EXTRACTION_JOB_NAME,
  isProductionEnvironment,
  removeTerminalExtractionJob,
} from './document-extraction-queue.util';
import { DocumentExtractionEnqueueFailedException } from './document-extraction-enqueue.exception';
import { WORKERS_DISABLED_FAILURE } from './document-extraction-recovery.util';
import {
  appendDocumentTypeAudit,
  appendExtractionActionAudit,
  readContentCache,
} from './document-content-cache.util';
import { ListDocumentExtractionsQueryDto } from './dto/list-document-extractions-query.dto';
import {
  buildDocumentExtractionPaginatedResult,
  buildDocumentExtractionWhere,
  parseDocumentExtractionPagination,
} from './document-extraction-query.util';
import { sanitizeDownloadFileName } from './document-extraction-download.util';
import { DocumentExtractionObservabilityService } from './document-extraction-observability.service';

/** Extra confirmedData keys (beyond schema) that the apply layer understands. */
const APPLY_ALIAS_KEYS = new Set<string>([
  'serviceDate',
  'serviceKind',
  'scope',
  'scopeCsv',
  'serviceScope',
  'recordKind',
  'measured',
  'frontRotorWidthMm',
  'rearRotorWidthMm',
  'damageType',
  'title',
  'invoiceTitle',
  'vendorName',
  'supplier',
  'supplierName',
  'customer',
  'customerName',
  'addressee',
  'billTo',
  'notes',
  'vin',
  'licensePlate',
  'costCents',
  'subtotalNet',
  'subtotalNetCents',
  'netCents',
  'totalTax',
  'totalTaxCents',
  'taxCents',
  'totalGross',
  'totalGrossCents',
  'grossCents',
  'taxRatePercent',
  'taxRate',
  'taxLines',
  'lineItems',
  'taxExemptReason',
  'taxExemptionReason',
  'reverseCharge',
  'amountSemantics',
  'taxSemantics',
  'creditNoteReference',
  'originalInvoiceReference',
  'originalInvoiceNumber',
  'referencedInvoiceNumber',
  'creditNoteNumber',
  'documentNumber',
  'isCreditNote',
  'creditNote',
  'currency',
  'inspectionDate',
  'defectLevel',
  'defectDescription',
  'reinspectionRequired',
  'reinspectionDeadline',
  'issuingOrganization',
  'inspectionStation',
  'inspectorName',
  'certificateNumber',
  'mileage',
  'temperatureC',
  'crankingVoltage',
  'chargingVoltage',
  'eventDateTime',
  'damageDescription',
  'damageAreas',
  'damageArea',
  'damageType',
  'drivable',
  'drivableAfterIncident',
  'thirdPartyInvolved',
  'opponentInvolved',
  'policeReference',
  'policeReport',
  'insuranceReference',
  'insuranceClaimNumber',
  'bookingContext',
  'bookingReference',
  'bookingId',
  'estimatedCostGross',
  'estimatedCost',
  'estimatedCostCents',
  'accidentApplyConfirmed',
  'applyConfirmed',
  'documentKind',
  'linkedDamageId',
  'acceptedEntityLinks',
  'locationLabel',
  'locationView',
  'measurementDate',
  'treadDepthUnit',
  'pressureUnit',
  'pressureBar',
  'pressure',
  'dimension',
  'dotByPosition',
  'dotFront',
  'dotRear',
  'dimensionFront',
  'dimensionRear',
  'padThicknessUnit',
  'discThicknessUnit',
  'thicknessUnit',
  'minimumPadMm',
  'minimumPadMmFront',
  'minimumPadMmRear',
  'minimumDiscMm',
  'minimumDiscMmFront',
  'minimumDiscMmRear',
  'workshopFinding',
  'workshopReport',
  'batteryScope',
  'targetScope',
  'measurementType',
  'sohSource',
  'capacityKwh',
  'capacityAh',
  'hvCapacityKwh',
  'lvCapacityAh',
  'temperatureContext',
  'ambientTemperatureNote',
  'deviceOrWorkshop',
  'testDevice',
  'issuer',
  'chemistry',
  'archiveSubtype',
  'documentSubtype',
  'sender',
  'from',
  'issuer',
  'recipient',
  'to',
  'addressee',
  'documentDate',
  'letterDate',
  'referenceNumber',
  'caseNumber',
  'fileNumber',
  'subject',
  'deadlines',
  'deadlineItems',
  'deadline',
  'replyBy',
  'mentionedEntities',
  'entityMentions',
  'summary',
  'actionRequired',
  'requiredAction',
]);

const TERMINAL_APPLIED_STATUSES = new Set(['APPLIED', 'PARTIALLY_APPLIED']);

const TERMINAL_SKIP_STATUSES = new Set([
  'READY_FOR_REVIEW',
  'CONFIRMED',
  'APPLIED',
  'PARTIALLY_APPLIED',
  'AWAITING_DOCUMENT_TYPE',
  'CANCELLED',
]);

export interface CreateFromOrgUploadInput {
  organizationId: string;
  vehicleId?: string | null;
  requestedDocumentType?: string;
  optionalContextType?: string | null;
  optionalContextId?: string | null;
  sourceSurface?: string | null;
  originalName: string;
  mimeType: string;
  buffer: Buffer;
  userId?: string | null;
  reuploadReason?: string | null;
  relatedExtractionId?: string | null;
  invoiceNumberHint?: string | null;
  referenceNumberHint?: string | null;
  clientIp?: string | null;
  uploadSource?: string | null;
  platformRole?: string | null;
}

/** Vehicle-scoped upload input — compatibility wrapper over {@link CreateFromOrgUploadInput}. */
export interface CreateFromUploadInput {
  vehicleId: string;
  documentType: string;
  originalName: string;
  mimeType: string;
  buffer: Buffer;
  userId?: string | null;
  reuploadReason?: string | null;
  relatedExtractionId?: string | null;
  invoiceNumberHint?: string | null;
  referenceNumberHint?: string | null;
  clientIp?: string | null;
  uploadSource?: string | null;
  platformRole?: string | null;
}

export type EnqueueExtractionResult =
  | { ok: true }
  | { ok: false; reason: 'workers_disabled' | 'queue_add_failed'; message: string };

export interface DocumentExtractionDownload {
  stream: Readable;
  fileName: string;
  mimeType: string;
  sizeBytes: number | null;
}

const VEHICLE_SELECT = {
  id: true,
  licensePlate: true,
  vin: true,
  make: true,
  model: true,
  organizationId: true,
} as const;

const USER_SELECT = {
  id: true,
  name: true,
  firstName: true,
  lastName: true,
} as const;

@Injectable()
export class DocumentExtractionService implements OnModuleInit {
  private readonly logger = new Logger(DocumentExtractionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Inject(documentExtractionConfig.KEY)
    private readonly docConfig: ConfigType<typeof documentExtractionConfig>,
    @Inject(DOCUMENT_STORAGE) private readonly storage: DocumentStoragePort,
    @InjectQueue(QUEUE_NAMES.DOCUMENT_EXTRACTION) private readonly queue: Queue,
    private readonly applyService: DocumentExtractionApplyService,
    private readonly actionOrchestrator: DocumentActionOrchestratorService,
    private readonly plausibilityService: DocumentExtractionPlausibilityService,
    private readonly fileIdentification: DocumentFileIdentificationService,
    private readonly uploadDuplicate: DocumentUploadDuplicateService,
    private readonly uploadRateLimit: DocumentUploadRateLimitService,
    private readonly malwareScan: DocumentMalwareScanService,
    private readonly lifecycle: DocumentLifecycleService,
    private readonly retention: DocumentRetentionService,
    private readonly uploadContext: DocumentUploadContextService,
    private readonly observability: DocumentExtractionObservabilityService,
  ) {}

  onModuleInit(): void {
    if (isProductionEnvironment() && !this.docConfig.queueEnabled) {
      this.logger.error(
        'DOCUMENT_EXTRACTION_QUEUE_ENABLED=false in production — document uploads will be rejected',
      );
    }
  }

  // ── create (real upload) ──────────────────────────────────────────────

  /** Vehicle-scoped compatibility wrapper — delegates to {@link createFromOrgUpload}. */
  async createFromUpload(input: CreateFromUploadInput) {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: input.vehicleId },
      select: { organizationId: true },
    });
    if (!vehicle) {
      throw new NotFoundException('Vehicle not found');
    }

    return this.createFromOrgUpload({
      organizationId: vehicle.organizationId,
      vehicleId: input.vehicleId,
      requestedDocumentType: input.documentType,
      sourceSurface: input.uploadSource ?? 'vehicle_detail',
      originalName: input.originalName,
      mimeType: input.mimeType,
      buffer: input.buffer,
      userId: input.userId,
      reuploadReason: input.reuploadReason,
      relatedExtractionId: input.relatedExtractionId,
      invoiceNumberHint: input.invoiceNumberHint,
      referenceNumberHint: input.referenceNumberHint,
      clientIp: input.clientIp,
      uploadSource: input.uploadSource,
      platformRole: input.platformRole,
    });
  }

  async createFromOrgUpload(input: CreateFromOrgUploadInput) {
    this.assertQueueAcceptingUploads();

    const requestedDocumentType = input.requestedDocumentType ?? AUTO_CLASSIFICATION_REQUEST;
    if (!isRequestDocumentType(requestedDocumentType)) {
      throw new BadRequestException(`Unsupported document type: ${requestedDocumentType}`);
    }
    if (!isAllowedMimeType(input.mimeType)) {
      throw new BadRequestException(`Unsupported file type: ${input.mimeType}`);
    }

    const uploadTarget = await this.uploadContext.resolveUploadTarget({
      organizationId: input.organizationId,
      vehicleId: input.vehicleId ?? null,
      optionalContextType: input.optionalContextType,
      optionalContextId: input.optionalContextId,
      sourceSurface: input.sourceSurface ?? input.uploadSource ?? 'org_inbox',
      providedByUserId: input.userId ?? null,
    });
    const organizationId = uploadTarget.organizationId;
    const resolvedVehicleId = uploadTarget.vehicleId;

    const requestedType = requestedDocumentType as DocumentExtractionType;
    const classificationMode = deriveClassificationMode(requestedType);
    const isAuto = isAutoClassificationRequest(requestedType);
    const effectiveType: ApplyDocumentExtractionType | null = isAuto
      ? null
      : (requestedType as ApplyDocumentExtractionType);

    await this.uploadRateLimit.assertAllowed({
      organizationId,
      userId: input.userId,
      clientIp: input.clientIp,
      uploadSource: input.uploadSource,
      platformRole: input.platformRole,
      sizeBytes: input.buffer.byteLength,
    });

    let identified;
    let contentSha256: string;
    try {
      identified = await this.fileIdentification.identify({
        buffer: input.buffer,
        clientMimeType: input.mimeType,
        originalName: input.originalName,
      });
      contentSha256 = await computeDocumentContentSha256(input.buffer);
    } catch (error) {
      if (error instanceof DocumentExtractionPipelineError) {
        throw new BadRequestException({
          message: error.safeMessage,
          errorCode: error.code,
          stage: error.stage,
          identificationStatus:
            (error as DocumentExtractionPipelineError & { identificationStatus?: string })
              .identificationStatus ?? undefined,
        });
      }
      throw error;
    }

    const duplicateAssessment = await this.uploadDuplicate.assess({
      organizationId,
      contentSha256,
      reuploadReason: input.reuploadReason,
      relatedExtractionId: input.relatedExtractionId,
      invoiceNumberHint: input.invoiceNumberHint,
      referenceNumberHint: input.referenceNumberHint,
    });
    if (duplicateAssessment.blocked) {
      throw new DocumentUploadDuplicateBlockedException(duplicateAssessment);
    }

    const uploadDuplicateStatus = duplicateAssessment.status;
    const relatedExtractionId = duplicateAssessment.relatedExtractionId ?? null;
    const reuploadReason = duplicateAssessment.reuploadReason ?? null;

    const fileFingerprint = buildDocumentExtractionFileFingerprint({
      contentSha256,
      organizationId,
      sizeBytes: identified.sizeBytes,
      detectedMime: identified.detectedMime,
      displayFileName: identified.displayFileName,
      identificationStatus: identified.identificationStatus,
      pageCount: identified.pageCount,
      pixelCount: identified.pixelCount,
      rotationDegrees: identified.rotationDegrees,
    });

    const pipelineDuplicate =
      duplicateAssessment.status === 'POSSIBLE_BUSINESS_DUPLICATE'
        ? {
            status: duplicateAssessment.status,
            relatedExtractionId,
            businessMatch: duplicateAssessment.businessMatch ?? null,
            existingExtraction: duplicateAssessment.existingExtraction ?? null,
          }
        : duplicateAssessment.status === 'REUPLOAD_ALLOWED'
          ? {
              status: duplicateAssessment.status,
              relatedExtractionId,
              existingExtraction: duplicateAssessment.existingExtraction ?? null,
            }
          : undefined;

    const queueEnabled = this.docConfig.queueEnabled;

    let record = await this.prisma.vehicleDocumentExtraction.create({
      data: {
        vehicleId: resolvedVehicleId,
        organizationId,
        uploadContextType: uploadTarget.uploadContextType,
        uploadContextId: uploadTarget.uploadContextId,
        requestedDocumentType: requestedType,
        effectiveDocumentType: effectiveType,
        documentType: effectiveType,
        classificationMode,
        status: 'PENDING',
        processingStage: 'UPLOAD',
        sourceFileName: identified.displayFileName,
        mimeType: identified.detectedMime,
        sizeBytes: identified.sizeBytes,
        contentSha256,
        uploadDuplicateStatus,
        relatedExtractionId,
        reuploadReason,
        plausibility: this.lifecycle.seedLifecycleOnCreate(
          mergePipelinePlausibility(null, {
            fileFingerprint,
            uploadDuplicate: pipelineDuplicate,
            uploadContext: buildInitialUploadContextPipelineState(uploadTarget.contextCandidate),
          }),
          this.lifecycle.buildStorageCapabilitiesSnapshot(),
        ) as Prisma.InputJsonValue,
        createdById: input.userId ?? null,
        processingAttempts: 0,
      },
    });

    if (uploadDuplicateStatus === 'UNIQUE') {
      const anchorResult = await this.uploadDuplicate.claimContentAnchor({
        organizationId,
        contentSha256,
        extractionId: record.id,
      });
      if (anchorResult === 'conflict') {
        await this.prisma.vehicleDocumentExtraction.delete({ where: { id: record.id } });
        const blocked = await this.uploadDuplicate.loadBlockedAssessmentFromAnchor({
          organizationId,
          contentSha256,
        });
        throw new DocumentUploadDuplicateBlockedException(blocked);
      }
    }

    const stored = await this.malwareScan.storeScannedUpload({
      organizationId,
      vehicleId: resolvedVehicleId,
      originalName: identified.displayFileName,
      buffer: input.buffer,
      mimeType: identified.detectedMime,
    }).catch(async (error) => {
      if (error instanceof DocumentMalwareDetectedError) {
        await this.prisma.vehicleDocumentExtraction.update({
          where: { id: record.id },
          data: {
            status: 'REJECTED',
            processingStage: 'UPLOAD',
            errorPhase: 'UPLOAD',
            errorCode: DOCUMENT_EXTRACTION_ERROR_CODES.MALWARE_DETECTED,
            errorMessage: error.message,
            plausibility: mergePipelinePlausibility(record.plausibility, {
              malwareScan: error.scanState,
            }) as Prisma.InputJsonValue,
          },
        });
        throw new BadRequestException({
          message: error.message,
          errorCode: DOCUMENT_EXTRACTION_ERROR_CODES.MALWARE_DETECTED,
          stage: 'UPLOAD',
          malwareScanStatus: error.scanState.status,
        });
      }
      if (error instanceof DocumentMalwareScanFailedError) {
        await this.prisma.vehicleDocumentExtraction.update({
          where: { id: record.id },
          data: {
            status: 'FAILED',
            processingStage: 'UPLOAD',
            errorPhase: 'UPLOAD',
            errorCode: DOCUMENT_EXTRACTION_ERROR_CODES.MALWARE_SCAN_FAILED,
            errorMessage: error.message,
            plausibility: mergePipelinePlausibility(record.plausibility, {
              malwareScan: error.scanState,
            }) as Prisma.InputJsonValue,
          },
        });
        throw new BadRequestException({
          message: error.message,
          errorCode: DOCUMENT_EXTRACTION_ERROR_CODES.MALWARE_SCAN_FAILED,
          stage: 'UPLOAD',
          malwareScanStatus: error.scanState.status,
        });
      }
      throw error;
    });

    record = await this.prisma.vehicleDocumentExtraction.update({
      where: { id: record.id },
      data: {
        processingStage: 'STORAGE',
        objectKey: stored.objectKey,
        storageProvider: stored.storageProvider,
        plausibility: mergePipelinePlausibility(record.plausibility, {
          malwareScan: stored.malwareScan,
        }) as Prisma.InputJsonValue,
      },
    });

    // Pre-queue state: file identified + stored, job not yet enqueued.

    if (!queueEnabled) {
      if (this.docConfig.allowPendingWithoutQueue) {
        this.logger.warn(
          `Document extraction ${record.id} stored as PENDING (queue disabled, dev/test mode)`,
        );
        return record;
      }
      return this.markEnqueueFailure(record.id, WORKERS_DISABLED_FAILURE);
    }

    const enqueueResult = await this.enqueueExtraction(record.id, {
      extractionId: record.id,
      vehicleId: record.vehicleId ?? null,
      organizationId: record.organizationId,
      documentType: effectiveType,
      objectKey: stored.objectKey,
    });

    if (!enqueueResult.ok) {
      const failed = await this.markEnqueueFailure(record.id, {
        errorPhase: 'QUEUE',
        errorCode: DOCUMENT_EXTRACTION_ERROR_CODES.QUEUE_UNAVAILABLE,
        safeMessage: enqueueResult.message,
      });
      throw new DocumentExtractionEnqueueFailedException(this.toPublicExtraction(failed));
    }

    const queued = await this.prisma.vehicleDocumentExtraction.update({
      where: { id: record.id },
      data: {
        status: 'QUEUED',
        processingStage: 'QUEUE',
        queuedAt: new Date(),
        errorPhase: null,
        errorCode: null,
        errorMessage: null,
        nextRetryAt: null,
      },
    });
    return queued;
  }

  // ── create (legacy client-supplied flow, kept for backward compat) ──────

  /** @deprecated Use POST upload — legacy no-file create is disabled for safety. */
  createLegacy(
    _vehicleId: string,
    _body: { documentType: string; extractedData?: unknown; sourceFileName?: string; sourceFileUrl?: string },
  ): never {
    throw new BadRequestException(
      'Legacy document-extraction create is disabled. Upload a file via POST .../upload and confirm after READY_FOR_REVIEW.',
    );
  }

  // ── reads ───────────────────────────────────────────────────────────────

  private async loadRecordOrThrow(where: Prisma.VehicleDocumentExtractionWhereInput) {
    const record = await this.prisma.vehicleDocumentExtraction.findFirst({
      where,
      include: { vehicle: { select: VEHICLE_SELECT } },
    });
    if (!record) {
      throw new NotFoundException('Document extraction not found');
    }
    return this.enrichWithActors(record);
  }

  private async enrichWithActors<
    T extends {
      createdById?: string | null;
      confirmedById?: string | null;
      appliedById?: string | null;
      cancelledById?: string | null;
      fileDeletedById?: string | null;
    },
  >(record: T) {
    const userIds = [
      record.createdById,
      record.confirmedById,
      record.appliedById,
      record.cancelledById,
      record.fileDeletedById,
    ].filter((id): id is string => Boolean(id));

    if (userIds.length === 0) {
      return record;
    }

    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: USER_SELECT,
    });
    const byId = new Map(users.map((user) => [user.id, user]));

    return {
      ...record,
      createdBy: record.createdById ? byId.get(record.createdById) ?? null : null,
      confirmedBy: record.confirmedById ? byId.get(record.confirmedById) ?? null : null,
      appliedBy: record.appliedById ? byId.get(record.appliedById) ?? null : null,
      cancelledBy: record.cancelledById ? byId.get(record.cancelledById) ?? null : null,
      fileDeletedBy: record.fileDeletedById ? byId.get(record.fileDeletedById) ?? null : null,
    };
  }

  async getForVehicle(vehicleId: string, extractionId: string) {
    const record = await this.loadRecordOrThrow({ id: extractionId, vehicleId });
    if (record.vehicle && record.vehicle.organizationId && record.organizationId) {
      if (record.vehicle.organizationId !== record.organizationId) {
        throw new NotFoundException('Document extraction not found');
      }
    }
    return record;
  }

  async getForOrg(orgId: string, extractionId: string) {
    return this.loadRecordOrThrow({ id: extractionId, organizationId: orgId });
  }

  toPublicExtraction<T extends Parameters<typeof toPublicDocumentExtraction>[0]>(record: T) {
    return toPublicDocumentExtraction(record);
  }

  toPublicSummary<T extends Parameters<typeof toPublicDocumentExtractionSummary>[0]>(record: T) {
    return toPublicDocumentExtractionSummary(record);
  }

  async getPublicForVehicle(vehicleId: string, extractionId: string) {
    const record = await this.getForVehicle(vehicleId, extractionId);
    return this.toPublicExtraction(record);
  }

  async getPublicForOrg(orgId: string, extractionId: string) {
    const record = await this.getForOrg(orgId, extractionId);
    return this.toPublicExtraction(record);
  }

  async listForOrg(orgId: string, query: ListDocumentExtractionsQueryDto) {
    const pagination = parseDocumentExtractionPagination(query);
    const where = buildDocumentExtractionWhere({
      organizationId: orgId,
      vehicleId: query.vehicleId,
      status: query.status,
      documentType: query.documentType,
      createdFrom: query.createdFrom,
      createdTo: query.createdTo,
      createdBy: query.createdBy,
    });

    const [rows, total] = await Promise.all([
      this.prisma.vehicleDocumentExtraction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: pagination.skip,
        take: pagination.take,
        include: { vehicle: { select: VEHICLE_SELECT } },
      }),
      this.prisma.vehicleDocumentExtraction.count({ where }),
    ]);

    const enriched = await Promise.all(rows.map((row) => this.enrichWithActors(row)));
    return buildDocumentExtractionPaginatedResult(
      enriched.map((row) => this.toPublicSummary(row)),
      total,
      pagination.page,
      pagination.limit,
    );
  }

  async listPublicForVehicle(vehicleId: string, query: ListDocumentExtractionsQueryDto = {}) {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId },
      select: { organizationId: true },
    });
    if (!vehicle?.organizationId) {
      throw new NotFoundException('Vehicle not found');
    }

    const pagination = parseDocumentExtractionPagination(query);
    const where = buildDocumentExtractionWhere({
      organizationId: vehicle.organizationId,
      vehicleId,
      status: query.status,
      documentType: query.documentType,
      createdFrom: query.createdFrom,
      createdTo: query.createdTo,
      createdBy: query.createdBy,
    });

    const [rows, total] = await Promise.all([
      this.prisma.vehicleDocumentExtraction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: pagination.skip,
        take: pagination.take,
        include: { vehicle: { select: VEHICLE_SELECT } },
      }),
      this.prisma.vehicleDocumentExtraction.count({ where }),
    ]);

    const enriched = await Promise.all(rows.map((row) => this.enrichWithActors(row)));
    return buildDocumentExtractionPaginatedResult(
      enriched.map((row) => this.toPublicSummary(row)),
      total,
      pagination.page,
      pagination.limit,
    );
  }

  listForVehicle(vehicleId: string, query: ListDocumentExtractionsQueryDto = {}) {
    return this.listPublicForVehicle(vehicleId, query);
  }

  async getDownloadForVehicle(
    vehicleId: string,
    extractionId: string,
    userId?: string | null,
  ): Promise<DocumentExtractionDownload> {
    const record = await this.getForVehicle(vehicleId, extractionId);
    const dl = await this.buildDownload(record);
    if (userId) {
      await this.lifecycle.recordDownloadAudit({ record, userId }).catch(() => undefined);
    }
    return dl;
  }

  async getDownloadForOrg(
    orgId: string,
    extractionId: string,
    userId?: string | null,
  ): Promise<DocumentExtractionDownload> {
    const record = await this.getForOrg(orgId, extractionId);
    const dl = await this.buildDownload(record);
    if (userId) {
      await this.lifecycle.recordDownloadAudit({ record, userId }).catch(() => undefined);
    }
    return dl;
  }

  private async buildDownload(record: {
    objectKey?: string | null;
    sourceFileName?: string | null;
    mimeType?: string | null;
    sizeBytes?: number | null;
    plausibility?: unknown;
  }): Promise<DocumentExtractionDownload> {
    if (!record.objectKey) {
      throw new NotFoundException('Document file is no longer available');
    }
    if (!isMalwareScanDownloadAllowed(record.plausibility)) {
      throw new DocumentMalwareDownloadBlockedError();
    }

    try {
      const stream = await this.storage.getObjectStream(record.objectKey);
      return {
        stream,
        fileName: sanitizeDownloadFileName(record.sourceFileName),
        mimeType: record.mimeType ?? 'application/octet-stream',
        sizeBytes: record.sizeBytes ?? null,
      };
    } catch {
      throw new NotFoundException('Document file is no longer available');
    }
  }

  // ── document type selection / correction ───────────────────────────────

  async setDocumentType(
    vehicleId: string,
    extractionId: string,
    documentType: string,
    options?: { reextract?: boolean; userId?: string | null },
  ) {
    if (!isApplyDocumentType(documentType)) {
      throw new BadRequestException(`Unsupported document type: ${documentType}`);
    }
    if (isAutoClassificationRequest(documentType)) {
      throw new BadRequestException('AUTO is not a valid effective document type');
    }

    const record = await this.getForVehicle(vehicleId, extractionId);
    const applyType = documentType as ApplyDocumentExtractionType;

    if (record.status === 'APPLIED' || record.status === 'PARTIALLY_APPLIED') {
      throw new BadRequestException('Cannot change document type after data has been applied');
    }
    if (record.status === 'CONFIRMED') {
      throw new BadRequestException('Cannot change document type while apply is in progress');
    }

    const allowReextract = options?.reextract === true;
    const awaiting = record.status === 'AWAITING_DOCUMENT_TYPE';
    const reviewCorrection = record.status === 'READY_FOR_REVIEW' && allowReextract;
    const failedRetry =
      record.status === 'FAILED' && resolveEffectiveDocumentType(record) == null;

    if (!awaiting && !reviewCorrection && !failedRetry) {
      throw new BadRequestException(
        `Document type cannot be changed in status ${record.status}${
          record.status === 'READY_FOR_REVIEW' ? ' — set reextract=true to re-run extraction' : ''
        }`,
      );
    }

    if (!record.objectKey) {
      throw new BadRequestException('Cannot continue without a stored file');
    }

    const previousType = resolveEffectiveDocumentType(record);
    const auditPlausibility = appendDocumentTypeAudit(record.plausibility, {
      from: previousType ?? record.detectedDocumentType ?? record.requestedDocumentType ?? null,
      to: applyType,
      at: new Date().toISOString(),
      userId: options?.userId ?? null,
      reason: awaiting
        ? 'user_selected_document_type'
        : reviewCorrection
          ? 'user_corrected_document_type_reextract'
          : 'user_set_document_type_retry',
    });

    const cleared = await this.prisma.vehicleDocumentExtraction.update({
      where: { id: extractionId },
      data: {
        effectiveDocumentType: applyType,
        documentType: applyType,
        detectedDocumentType: record.detectedDocumentType ?? applyType,
        status: 'PENDING',
        processingStage: 'QUEUE',
        extractedData: Prisma.DbNull,
        confirmedData: reviewCorrection ? Prisma.DbNull : (record.confirmedData as Prisma.InputJsonValue),
        plausibility: auditPlausibility as Prisma.InputJsonValue,
        errorMessage: null,
        errorCode: null,
        errorPhase: null,
        nextRetryAt: null,
        extractionCompletedAt: null,
        processingCompletedAt: null,
        processedAt: null,
        extractionProvider: null,
        extractionModel: null,
      },
    });

    this.assertQueueAcceptingUploads();

    const activeJob = await removeTerminalExtractionJob(this.queue, extractionId);
    if (activeJob === 'active') {
      throw new BadRequestException('Extraction is already queued or processing');
    }

    const enqueueResult = await this.enqueueExtraction(extractionId, {
      extractionId,
      vehicleId: record.vehicleId ?? null,
      organizationId: record.organizationId,
      documentType: applyType,
      objectKey: record.objectKey,
      skipOcr: Boolean(readContentCache(cleared.plausibility, record.objectKey)),
    });

    if (!enqueueResult.ok) {
      const failed = await this.markEnqueueFailure(extractionId, {
        errorPhase: 'QUEUE',
        errorCode: DOCUMENT_EXTRACTION_ERROR_CODES.QUEUE_UNAVAILABLE,
        safeMessage: enqueueResult.message,
      });
      throw new DocumentExtractionEnqueueFailedException(this.toPublicExtraction(failed));
    }

    return this.prisma.vehicleDocumentExtraction.update({
      where: { id: extractionId },
      data: {
        status: 'QUEUED',
        processingStage: 'QUEUE',
        queuedAt: new Date(),
      },
    });
  }

  // ── retry ───────────────────────────────────────────────────────────────

  async retry(vehicleId: string, extractionId: string, userId?: string | null) {
    const record = await this.getForVehicle(vehicleId, extractionId);
    if (TERMINAL_APPLIED_STATUSES.has(record.status)) {
      throw new BadRequestException('Cannot retry an already applied extraction');
    }
    if (record.status === 'CONFIRMED') {
      throw new BadRequestException('Cannot retry an already confirmed extraction');
    }
    if (record.status === 'CANCELLED') {
      throw new BadRequestException('Cannot retry a cancelled extraction');
    }
    if (TERMINAL_SKIP_STATUSES.has(record.status)) {
      throw new BadRequestException(`Cannot retry extraction in status ${record.status}`);
    }
    if (!record.objectKey) {
      throw new BadRequestException('Cannot retry: no stored file for this extraction');
    }
    const applyType = resolveEffectiveDocumentType(record);
    if (!applyType) {
      throw new BadRequestException(
        'Cannot retry until a document type is resolved — select a document type first',
      );
    }

    this.assertQueueAcceptingUploads();

    const activeJob = await removeTerminalExtractionJob(this.queue, extractionId);
    if (activeJob === 'active') {
      throw new BadRequestException('Extraction is already queued or processing');
    }

    const updated = await this.prisma.vehicleDocumentExtraction.update({
      where: { id: extractionId },
      data: {
        status: 'PENDING',
        processingStage: 'STORAGE',
        errorMessage: null,
        errorCode: null,
        errorPhase: null,
        nextRetryAt: null,
        plausibility: appendExtractionActionAudit(record.plausibility, {
          action: 'retry',
          at: new Date().toISOString(),
          userId: userId ?? null,
        }) as Prisma.InputJsonValue,
      },
    });

    const enqueueResult = await this.enqueueExtraction(extractionId, {
      extractionId,
      vehicleId: record.vehicleId ?? null,
      organizationId: record.organizationId,
      documentType: applyType,
      objectKey: record.objectKey,
    });

    if (!enqueueResult.ok) {
      const failed = await this.markEnqueueFailure(extractionId, {
        errorPhase: 'QUEUE',
        errorCode: DOCUMENT_EXTRACTION_ERROR_CODES.QUEUE_UNAVAILABLE,
        safeMessage: enqueueResult.message,
      });
      throw new DocumentExtractionEnqueueFailedException(this.toPublicExtraction(failed));
    }

    return this.prisma.vehicleDocumentExtraction.update({
      where: { id: extractionId },
      data: {
        status: 'QUEUED',
        processingStage: 'QUEUE',
        queuedAt: new Date(),
      },
    });
  }

  // ── confirm (human confirmation → apply, idempotent) ───────────────────

  async confirm(
    vehicleId: string,
    extractionId: string,
    confirmedDataRaw: unknown,
    userId?: string | null,
  ) {
    const existing = await this.getForVehicle(vehicleId, extractionId);

    if (existing.status === 'APPLIED' || existing.status === 'PARTIALLY_APPLIED') {
      return existing;
    }

    if (existing.status !== 'READY_FOR_REVIEW') {
      throw new BadRequestException(
        `Extraction must be READY_FOR_REVIEW before confirmation (current: ${existing.status})`,
      );
    }

    const applyDocumentType = requireApplyDocumentType(existing);
    const confirmedData = this.sanitizeConfirmedData(applyDocumentType, confirmedDataRaw);

    const plausibility = await this.runConfirmPlausibility(
      vehicleId,
      applyDocumentType,
      confirmedData,
      extractionId,
    );
    if (plausibility.overallStatus === 'BLOCKER') {
      throw new BadRequestException({
        message: 'Plausibility checks failed — cannot apply data with BLOCKER status',
        plausibility,
      });
    }

    const sourceFileUrl =
      existing.sourceFileUrl ??
      (existing.objectKey ? `storage://${existing.objectKey}` : null);

    const plausibilityPayload = {
      ...(typeof existing.plausibility === 'object' &&
      existing.plausibility &&
      !Array.isArray(existing.plausibility)
        ? (existing.plausibility as Record<string, unknown>)
        : {}),
      ...(plausibility as unknown as Record<string, unknown>),
    };
    const plausibilityWithConfirmAudit = appendExtractionActionAudit(plausibilityPayload, {
      action: 'confirm',
      at: new Date().toISOString(),
      userId: userId ?? null,
    });

    const confirmUpdate = await this.prisma.vehicleDocumentExtraction.updateMany({
      where: { id: extractionId, status: 'READY_FOR_REVIEW' },
      data: {
        confirmedData: confirmedData as Prisma.InputJsonValue,
        status: 'CONFIRMED',
        processingStage: 'APPLY',
        confirmedById: userId ?? null,
        plausibility: plausibilityWithConfirmAudit as Prisma.InputJsonValue,
        errorPhase: null,
        errorCode: null,
        errorMessage: null,
      },
    });
    if (confirmUpdate.count === 0) {
      const latest = await this.getForVehicle(vehicleId, extractionId);
      if (latest.status === 'APPLIED' || latest.status === 'PARTIALLY_APPLIED') return latest;
      throw new BadRequestException(
        `Extraction must be READY_FOR_REVIEW before confirmation (current: ${latest.status})`,
      );
    }

    let applyResult: Awaited<ReturnType<DocumentExtractionApplyService['apply']>> & {
      applyLifecycle?: { status: string };
    };
    try {
      if (this.actionOrchestrator.supportsExecutorPath(applyDocumentType)) {
        applyResult = await this.actionOrchestrator.executeConfirmedPlan({
          extractionId,
          organizationId: existing.organizationId ?? null,
          vehicleId,
          documentType: applyDocumentType,
          sourceFileUrl,
          confirmedData,
          confirmedById: userId ?? null,
          plausibilityChecks: plausibility.checks,
          plausibility: plausibilityWithConfirmAudit,
        });
      } else {
        applyResult = await this.applyService.apply({
          extractionId,
          vehicleId,
          documentType: applyDocumentType,
          sourceFileUrl,
          confirmedData,
        });
      }
      this.observability.recordApply('success');
      this.observability.logEvent({
        extractionId,
        stage: 'APPLY',
        status: 'completed',
      });
    } catch (err) {
      const message = (err as Error).message?.slice(0, 500) ?? 'Apply failed';
      this.observability.recordApply('error');
      this.observability.logEvent({
        extractionId,
        stage: 'APPLY',
        status: 'failed',
        errorCode: DOCUMENT_EXTRACTION_ERROR_CODES.APPLY_FAILED,
      });
      await this.prisma.vehicleDocumentExtraction.update({
        where: { id: extractionId },
        data: {
          errorPhase: 'APPLY',
          errorCode: DOCUMENT_EXTRACTION_ERROR_CODES.APPLY_FAILED,
          errorMessage: message,
        },
      });
      this.logger.error(`Apply failed for extraction ${extractionId}: ${message}`);
      throw new BadRequestException(`Failed to apply confirmed data: ${message}`);
    }

    const extractionStatus = applyResult.applyLifecycle
      ? mapApplyLifecycleToExtractionStatus(
          applyResult.applyLifecycle.status as Parameters<
            typeof mapApplyLifecycleToExtractionStatus
          >[0],
        )
      : 'APPLIED';

    const latestAfterApply = await this.prisma.vehicleDocumentExtraction.findUnique({
      where: { id: extractionId },
      select: { plausibility: true },
    });

    const appliedUpdate = await this.prisma.vehicleDocumentExtraction.updateMany({
      where: { id: extractionId, status: 'CONFIRMED' },
      data: {
        status: extractionStatus,
        processingStage: 'APPLY',
        appliedAt: new Date(),
        appliedById: userId ?? null,
        processingCompletedAt: new Date(),
        errorPhase: null,
        errorCode: null,
        errorMessage: null,
        plausibility: appendExtractionActionAudit(
          latestAfterApply?.plausibility ?? plausibilityWithConfirmAudit,
          {
            action: 'apply',
            at: new Date().toISOString(),
            userId: userId ?? null,
            details: applyResult.applyLifecycle
              ? { applyLifecycleStatus: applyResult.applyLifecycle.status }
              : undefined,
          },
        ) as Prisma.InputJsonValue,
        ...(applyResult.serviceEventId ? { serviceEventId: applyResult.serviceEventId } : {}),
      },
    });
    if (appliedUpdate.count === 0) {
      return this.getForVehicle(vehicleId, extractionId);
    }

    const updated = await this.getForVehicle(vehicleId, extractionId);
    return applyResult.detail ? { ...updated, applyResult: applyResult.detail } : updated;
  }

  /** Used by recovery scheduler to retry apply for stuck CONFIRMED rows. */
  async retryConfirmedApply(extractionId: string): Promise<boolean> {
    const record = await this.prisma.vehicleDocumentExtraction.findUnique({
      where: { id: extractionId },
    });
    if (!record || record.status !== 'CONFIRMED' || record.appliedAt) {
      return false;
    }
    const applyDocumentType = resolveEffectiveDocumentType(record);
    if (!applyDocumentType || !record.confirmedData || !record.vehicleId) {
      return false;
    }

    const vehicleId = record.vehicleId;

    const sourceFileUrl =
      record.sourceFileUrl ??
      (record.objectKey ? `storage://${record.objectKey}` : null);

    try {
      const confirmedData = record.confirmedData as Record<string, unknown>;
      const applyResult = this.actionOrchestrator.supportsExecutorPath(applyDocumentType)
        ? await this.actionOrchestrator.executeConfirmedPlan({
            extractionId,
            organizationId: record.organizationId ?? null,
            vehicleId,
            documentType: applyDocumentType,
            sourceFileUrl,
            confirmedData,
            plausibility: record.plausibility,
          })
        : await this.applyService.apply({
            extractionId,
            vehicleId,
            documentType: applyDocumentType,
            sourceFileUrl,
            confirmedData,
          });
      const lifecycle = (applyResult as { applyLifecycle?: { status: string } }).applyLifecycle;
      const extractionStatus = lifecycle
        ? mapApplyLifecycleToExtractionStatus(
            lifecycle.status as Parameters<typeof mapApplyLifecycleToExtractionStatus>[0],
          )
        : 'APPLIED';
      await this.prisma.vehicleDocumentExtraction.updateMany({
        where: { id: extractionId, status: 'CONFIRMED' },
        data: {
          status: extractionStatus,
          processingStage: 'APPLY',
          appliedAt: new Date(),
          processingCompletedAt: new Date(),
          errorPhase: null,
          errorCode: null,
          errorMessage: null,
          ...(applyResult.serviceEventId ? { serviceEventId: applyResult.serviceEventId } : {}),
        },
      });
      return true;
    } catch (err) {
      await this.prisma.vehicleDocumentExtraction.update({
        where: { id: extractionId },
        data: {
          errorPhase: 'APPLY',
          errorCode: DOCUMENT_EXTRACTION_ERROR_CODES.APPLY_FAILED,
          errorMessage: ((err as Error).message ?? 'Apply failed').slice(0, 500),
        },
      });
      return false;
    }
  }

  async reassignVehicleForOrg(
    orgId: string,
    extractionId: string,
    newVehicleId: string,
    userId?: string | null,
  ) {
    const record = await this.prisma.vehicleDocumentExtraction.findFirst({
      where: { id: extractionId, organizationId: orgId },
      include: { vehicle: { select: { id: true, licensePlate: true, make: true, model: true, year: true } } },
    });
    if (!record) {
      throw new NotFoundException('Document extraction not found');
    }
    if (!['READY_FOR_REVIEW', 'AWAITING_DOCUMENT_TYPE'].includes(record.status)) {
      throw new BadRequestException(
        `Cannot reassign vehicle while extraction is in status ${record.status}`,
      );
    }

    const targetVehicle = await this.prisma.vehicle.findFirst({
      where: { id: newVehicleId, organizationId: orgId },
      select: { id: true, licensePlate: true, make: true, model: true, year: true },
    });
    if (!targetVehicle) {
      throw new NotFoundException('Target vehicle not found in organization');
    }
    if (targetVehicle.id === record.vehicleId) {
      return this.getPublicForOrg(orgId, extractionId);
    }

    const applyDocumentType = resolveEffectiveDocumentType(record);
    const extractedFields =
      record.extractedData && typeof record.extractedData === 'object' && !Array.isArray(record.extractedData)
        ? (record.extractedData as Record<string, unknown>)
        : {};

    let plausibilityPayload: unknown = record.plausibility;
    if (applyDocumentType) {
      const plausibility = await this.runConfirmPlausibility(
        newVehicleId,
        applyDocumentType,
        extractedFields,
      );
      plausibilityPayload = {
        ...(typeof record.plausibility === 'object' &&
        record.plausibility &&
        !Array.isArray(record.plausibility)
          ? (record.plausibility as Record<string, unknown>)
          : {}),
        ...(plausibility as unknown as Record<string, unknown>),
      } as Prisma.JsonValue;
    }

    await this.prisma.vehicleDocumentExtraction.update({
      where: { id: extractionId },
      data: {
        vehicleId: newVehicleId,
        plausibility: appendExtractionActionAudit(plausibilityPayload, {
          action: 'reassign_vehicle',
          at: new Date().toISOString(),
          userId: userId ?? null,
          details: {
            fromVehicleId: record.vehicleId,
            toVehicleId: newVehicleId,
          },
        }) as Prisma.InputJsonValue,
      },
    });

    return this.getPublicForOrg(orgId, extractionId);
  }

  async cancel(vehicleId: string, extractionId: string, userId?: string | null) {
    const record = await this.getForVehicle(vehicleId, extractionId);
    if (['APPLIED', 'PARTIALLY_APPLIED', 'CONFIRMED', 'CANCELLED'].includes(record.status)) {
      throw new BadRequestException(`Cannot cancel extraction in status ${record.status}`);
    }

    await removeTerminalExtractionJob(this.queue, extractionId);

    return this.prisma.vehicleDocumentExtraction.update({
      where: { id: extractionId },
      data: {
        status: 'CANCELLED',
        processingStage: 'REVIEW',
        cancelledAt: new Date(),
        cancelledById: userId ?? null,
        nextRetryAt: null,
        plausibility: appendExtractionActionAudit(record.plausibility, {
          action: 'cancel',
          at: new Date().toISOString(),
          userId: userId ?? null,
        }) as Prisma.InputJsonValue,
      },
    });
  }

  // ── delete stored file (keeps audit record + confirmed data) ───────────

  async deleteFile(vehicleId: string, extractionId: string, userId?: string | null) {
    const record = await this.getForVehicle(vehicleId, extractionId);
    await this.lifecycle.softDeleteFile({ record, userId });
    return this.getPublicForVehicle(vehicleId, extractionId);
  }

  async setLegalHold(
    vehicleId: string,
    extractionId: string,
    userId?: string | null,
    reason?: string,
  ) {
    const record = await this.getForVehicle(vehicleId, extractionId);
    await this.lifecycle.setLegalHold({ record, userId, reason });
    return this.getPublicForVehicle(vehicleId, extractionId);
  }

  async clearLegalHold(vehicleId: string, extractionId: string, userId?: string | null) {
    const record = await this.getForVehicle(vehicleId, extractionId);
    await this.lifecycle.clearLegalHold({ record, userId });
    return this.getPublicForVehicle(vehicleId, extractionId);
  }

  runDocumentRetention(options: DocumentRetentionRunOptions = {}) {
    return this.retention.runOnce(options);
  }

  // ── queue helpers (also used by recovery scheduler) ───────────────────

  async enqueueExtraction(
    extractionId: string,
    data: DocumentExtractionJobData,
  ): Promise<EnqueueExtractionResult> {
    if (!canEnqueueQueue(this.logger, 'document-extraction')) {
      return {
        ok: false,
        reason: 'workers_disabled',
        message: WORKERS_DISABLED_FAILURE.safeMessage,
      };
    }

    try {
      await removeTerminalExtractionJob(this.queue, extractionId);
      await this.queue.add(
        DOCUMENT_EXTRACTION_JOB_NAME,
        data,
        buildExtractionJobOptions(this.docConfig, extractionId),
      );
      return { ok: true };
    } catch (err) {
      const message = ((err as Error).message ?? 'queue add failed').slice(0, 300);
      this.logger.warn(`Failed to enqueue extraction ${extractionId}: ${message}`);
      return { ok: false, reason: 'queue_add_failed', message };
    }
  }

  async markQueuedAfterEnqueue(extractionId: string) {
    return this.prisma.vehicleDocumentExtraction.update({
      where: { id: extractionId },
      data: {
        status: 'QUEUED',
        processingStage: 'QUEUE',
        queuedAt: new Date(),
        errorPhase: null,
        errorCode: null,
        errorMessage: null,
        nextRetryAt: null,
      },
    });
  }

  async hasActiveExtractionJob(extractionId: string): Promise<boolean> {
    const job = await this.queue.getJob(`extract-${extractionId}`);
    if (!job) return false;
    const state = await job.getState();
    return state === 'active' || state === 'waiting' || state === 'delayed';
  }

  // ── helpers ─────────────────────────────────────────────────────────────

  assertQueueAcceptingUploads(): void {
    if (!isProductionEnvironment()) return;

    if (!this.docConfig.queueEnabled) {
      throw new ServiceUnavailableException({
        message: 'Document extraction queue is disabled',
        errorCode: DOCUMENT_EXTRACTION_ERROR_CODES.QUEUE_UNAVAILABLE,
      });
    }
    if (!canEnqueueQueue(this.logger, 'document-extraction')) {
      throw new ServiceUnavailableException({
        message: 'Document processing workers are not available',
        errorCode: DOCUMENT_EXTRACTION_ERROR_CODES.QUEUE_UNAVAILABLE,
      });
    }
  }

  private async markEnqueueFailure(
    extractionId: string,
    failure: { errorPhase: 'QUEUE'; errorCode: string; safeMessage: string },
  ) {
    const completedAt = new Date();
    return this.prisma.vehicleDocumentExtraction.update({
      where: { id: extractionId },
      data: {
        status: 'FAILED',
        processingStage: 'QUEUE',
        errorPhase: failure.errorPhase,
        errorCode: failure.errorCode,
        errorMessage: failure.safeMessage,
        processingCompletedAt: completedAt,
        processedAt: completedAt,
      },
    });
  }

  private async runConfirmPlausibility(
    vehicleId: string,
    documentType: ApplyDocumentExtractionType,
    confirmedData: Record<string, unknown>,
    extractionId?: string,
  ) {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: { vin: true, licensePlate: true, mileageKm: true },
    });
    const latest = await this.prisma.vehicleLatestState.findUnique({
      where: { vehicleId },
      select: { odometerKm: true },
    });
    const consistencyContext = await this.buildPlausibilityConsistencyContext(
      vehicleId,
      confirmedData,
      extractionId,
    );
    return this.plausibilityService.runChecks(
      documentType,
      confirmedData,
      {
        vin: vehicle?.vin,
        licensePlate: vehicle?.licensePlate,
        lastKnownOdometerKm: latest?.odometerKm ?? vehicle?.mileageKm ?? null,
      },
      consistencyContext,
    );
  }

  private async buildPlausibilityConsistencyContext(
    vehicleId: string,
    confirmedData: Record<string, unknown>,
    extractionId?: string,
  ) {
    const applied = await this.prisma.vehicleDocumentExtraction.findMany({
      where: {
        vehicleId,
        status: { in: ['APPLIED', 'CONFIRMED'] },
        ...(extractionId ? { id: { not: extractionId } } : {}),
      },
      select: { confirmedData: true },
    });

    const existingInvoiceNumbers: string[] = [];
    const existingReferenceNumbers: string[] = [];
    for (const row of applied) {
      const data =
        row.confirmedData != null &&
        typeof row.confirmedData === 'object' &&
        !Array.isArray(row.confirmedData)
          ? (row.confirmedData as Record<string, unknown>)
          : null;
      if (!data) continue;
      if (typeof data.invoiceNumber === 'string') {
        existingInvoiceNumbers.push(data.invoiceNumber);
      }
      const reference =
        typeof data.referenceNumber === 'string'
          ? data.referenceNumber
          : typeof data.reportNumber === 'string'
            ? data.reportNumber
            : null;
      if (reference) existingReferenceNumbers.push(reference);
    }

    let bookingStartDate: string | null = null;
    let bookingEndDate: string | null = null;
    const bookingId =
      typeof confirmedData.bookingId === 'string' ? confirmedData.bookingId : null;
    if (bookingId) {
      const booking = await this.prisma.booking.findUnique({
        where: { id: bookingId },
        select: { startDate: true, endDate: true },
      });
      bookingStartDate = booking?.startDate?.toISOString() ?? null;
      bookingEndDate = booking?.endDate?.toISOString() ?? null;
    }

    return {
      existingInvoiceNumbers,
      existingReferenceNumbers,
      bookingStartDate,
      bookingEndDate,
      currentExtractionId: extractionId ?? null,
    };
  }

  sanitizeConfirmedData(
    documentType: ApplyDocumentExtractionType,
    raw: unknown,
  ): Record<string, unknown> {
    if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new BadRequestException('confirmedData must be an object');
    }
    const data = raw as Record<string, unknown>;
    const schema = getFieldSchema(documentType);
    const out: Record<string, unknown> = {};

    const enumByKey = new Map<string, string[]>();
    const nestedParents = new Set<string>();
    for (const f of schema) {
      if (f.key.includes('.')) {
        nestedParents.add(f.key.split('.')[0]);
      }
      if (f.type === 'enum' && f.enumValues) {
        enumByKey.set(f.key, f.enumValues);
      }
    }

    const topLevelSchemaKeys = new Set(
      schema.map((f) => (f.key.includes('.') ? f.key.split('.')[0] : f.key)),
    );

    for (const [key, value] of Object.entries(data)) {
      const isKnown = topLevelSchemaKeys.has(key) || APPLY_ALIAS_KEYS.has(key);
      if (!isKnown) continue;

      if (nestedParents.has(key) && value && typeof value === 'object' && !Array.isArray(value)) {
        out[key] = { ...(value as Record<string, unknown>) };
        continue;
      }

      const allowedEnum = enumByKey.get(key);
      if (allowedEnum && typeof value === 'string' && !allowedEnum.includes(value)) {
        out[key] = null;
        continue;
      }
      out[key] = value;
    }

    return out;
  }
}
