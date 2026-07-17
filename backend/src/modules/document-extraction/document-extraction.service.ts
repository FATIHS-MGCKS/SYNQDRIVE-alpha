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
import { DocumentExtractionPlausibilityService } from './document-extraction-plausibility.service';
import {
  ApplyDocumentExtractionType,
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

const TERMINAL_SKIP_STATUSES = new Set([
  'READY_FOR_REVIEW',
  'CONFIRMED',
  'APPLIED',
  'AWAITING_DOCUMENT_TYPE',
  'CANCELLED',
]);

export interface CreateFromUploadInput {
  vehicleId: string;
  documentType: string;
  originalName: string;
  mimeType: string;
  buffer: Buffer;
  userId?: string | null;
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
    private readonly plausibilityService: DocumentExtractionPlausibilityService,
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

  async createFromUpload(input: CreateFromUploadInput) {
    this.assertQueueAcceptingUploads();

    if (!isRequestDocumentType(input.documentType)) {
      throw new BadRequestException(`Unsupported document type: ${input.documentType}`);
    }
    if (!isAllowedMimeType(input.mimeType)) {
      throw new BadRequestException(`Unsupported file type: ${input.mimeType}`);
    }

    const requestedType = input.documentType as DocumentExtractionType;
    const classificationMode = deriveClassificationMode(requestedType);
    const isAuto = isAutoClassificationRequest(requestedType);
    const effectiveType: ApplyDocumentExtractionType | null = isAuto
      ? null
      : (requestedType as ApplyDocumentExtractionType);

    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: input.vehicleId },
      select: { organizationId: true },
    });
    if (!vehicle) {
      throw new NotFoundException('Vehicle not found');
    }
    const organizationId = vehicle.organizationId;

    const stored = await this.storage.putObject({
      organizationId,
      vehicleId: input.vehicleId,
      originalName: input.originalName,
      buffer: input.buffer,
      mimeType: input.mimeType,
    });

    const queueEnabled = this.docConfig.queueEnabled;

    // Pre-queue state: file stored, job not yet enqueued.
    const record = await this.prisma.vehicleDocumentExtraction.create({
      data: {
        vehicleId: input.vehicleId,
        organizationId,
        requestedDocumentType: requestedType,
        effectiveDocumentType: effectiveType,
        documentType: effectiveType,
        classificationMode,
        status: 'PENDING',
        processingStage: 'STORAGE',
        sourceFileName: input.originalName?.slice(0, 255),
        objectKey: stored.objectKey,
        storageProvider: stored.storageProvider,
        mimeType: stored.mimeType,
        sizeBytes: stored.sizeBytes,
        createdById: input.userId ?? null,
        processingAttempts: 0,
      },
    });

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
      vehicleId: record.vehicleId,
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

  async getDownloadForVehicle(vehicleId: string, extractionId: string): Promise<DocumentExtractionDownload> {
    const record = await this.getForVehicle(vehicleId, extractionId);
    return this.buildDownload(record);
  }

  async getDownloadForOrg(orgId: string, extractionId: string): Promise<DocumentExtractionDownload> {
    const record = await this.getForOrg(orgId, extractionId);
    return this.buildDownload(record);
  }

  private async buildDownload(record: {
    objectKey?: string | null;
    sourceFileName?: string | null;
    mimeType?: string | null;
    sizeBytes?: number | null;
  }): Promise<DocumentExtractionDownload> {
    if (!record.objectKey) {
      throw new NotFoundException('Document file is no longer available');
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

    if (record.status === 'APPLIED') {
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
      vehicleId: record.vehicleId,
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
    if (record.status === 'APPLIED') {
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
      vehicleId: record.vehicleId,
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

    if (existing.status === 'APPLIED') {
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
      if (latest.status === 'APPLIED') return latest;
      throw new BadRequestException(
        `Extraction must be READY_FOR_REVIEW before confirmation (current: ${latest.status})`,
      );
    }

    let applyResult: Awaited<ReturnType<DocumentExtractionApplyService['apply']>>;
    try {
      applyResult = await this.applyService.apply({
        extractionId,
        vehicleId,
        documentType: applyDocumentType,
        sourceFileUrl,
        confirmedData,
      });
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

    const appliedUpdate = await this.prisma.vehicleDocumentExtraction.updateMany({
      where: { id: extractionId, status: 'CONFIRMED' },
      data: {
        status: 'APPLIED',
        processingStage: 'APPLY',
        appliedAt: new Date(),
        appliedById: userId ?? null,
        processingCompletedAt: new Date(),
        errorPhase: null,
        errorCode: null,
        errorMessage: null,
        plausibility: appendExtractionActionAudit(plausibilityWithConfirmAudit, {
          action: 'apply',
          at: new Date().toISOString(),
          userId: userId ?? null,
        }) as Prisma.InputJsonValue,
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
    if (!applyDocumentType || !record.confirmedData) {
      return false;
    }

    const sourceFileUrl =
      record.sourceFileUrl ??
      (record.objectKey ? `storage://${record.objectKey}` : null);

    try {
      const applyResult = await this.applyService.apply({
        extractionId,
        vehicleId: record.vehicleId,
        documentType: applyDocumentType,
        sourceFileUrl,
        confirmedData: record.confirmedData as Record<string, unknown>,
      });
      await this.prisma.vehicleDocumentExtraction.updateMany({
        where: { id: extractionId, status: 'CONFIRMED' },
        data: {
          status: 'APPLIED',
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
    if (['APPLIED', 'CONFIRMED', 'CANCELLED'].includes(record.status)) {
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
    if (record.objectKey) {
      await this.storage.deleteObject(record.objectKey).catch(() => undefined);
    }
    return this.prisma.vehicleDocumentExtraction.update({
      where: { id: extractionId },
      data: {
        objectKey: null,
        sizeBytes: null,
        mimeType: null,
        fileDeletedAt: new Date(),
        fileDeletedById: userId ?? null,
        plausibility: appendExtractionActionAudit(record.plausibility, {
          action: 'delete_file',
          at: new Date().toISOString(),
          userId: userId ?? null,
        }) as Prisma.InputJsonValue,
      },
    });
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
  ) {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: { vin: true, licensePlate: true, mileageKm: true },
    });
    const latest = await this.prisma.vehicleLatestState.findUnique({
      where: { vehicleId },
      select: { odometerKm: true },
    });
    return this.plausibilityService.runChecks(documentType, confirmedData, {
      vin: vehicle?.vin,
      licensePlate: vehicle?.licensePlate,
      lastKnownOdometerKm: latest?.odometerKm ?? vehicle?.mileageKm ?? null,
    });
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
