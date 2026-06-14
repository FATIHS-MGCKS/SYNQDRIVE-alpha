import {
  Injectable,
  Logger,
  Inject,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { DocumentExtractionType, Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { QUEUE_NAMES } from '@workers/queues/queue-names';
import {
  DOCUMENT_STORAGE,
  DocumentStoragePort,
} from './storage/document-storage.interface';
import { DocumentExtractionApplyService } from './document-extraction-apply.service';
import { DocumentExtractionPlausibilityService } from './document-extraction-plausibility.service';
import {
  getFieldSchema,
  isSupportedDocumentType,
  isAllowedMimeType,
} from './document-extraction.schemas';
import { DocumentExtractionJobData } from './document-extraction.types';

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
  'notes',
  'vin',
  'licensePlate',
  'costCents',
  'temperatureC',
  'crankingVoltage',
  'chargingVoltage',
]);

export interface CreateFromUploadInput {
  vehicleId: string;
  documentType: string;
  originalName: string;
  mimeType: string;
  buffer: Buffer;
  userId?: string | null;
}

@Injectable()
export class DocumentExtractionService {
  private readonly logger = new Logger(DocumentExtractionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Inject(DOCUMENT_STORAGE) private readonly storage: DocumentStoragePort,
    @InjectQueue(QUEUE_NAMES.DOCUMENT_EXTRACTION) private readonly queue: Queue,
    private readonly applyService: DocumentExtractionApplyService,
    private readonly plausibilityService: DocumentExtractionPlausibilityService,
  ) {}

  // ── create (real upload) ──────────────────────────────────────────────

  async createFromUpload(input: CreateFromUploadInput) {
    if (!isSupportedDocumentType(input.documentType)) {
      throw new BadRequestException(`Unsupported document type: ${input.documentType}`);
    }
    if (!isAllowedMimeType(input.mimeType)) {
      throw new BadRequestException(`Unsupported file type: ${input.mimeType}`);
    }
    const documentType = input.documentType as DocumentExtractionType;

    // Org is derived from the vehicle (authoritative) — never trusted from the client.
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

    const queueEnabled = this.config.get<boolean>('documentExtraction.queueEnabled', true);

    const record = await this.prisma.vehicleDocumentExtraction.create({
      data: {
        vehicleId: input.vehicleId,
        organizationId,
        documentType,
        status: queueEnabled ? 'QUEUED' : 'PENDING',
        sourceFileName: input.originalName?.slice(0, 255),
        objectKey: stored.objectKey,
        storageProvider: stored.storageProvider,
        mimeType: stored.mimeType,
        sizeBytes: stored.sizeBytes,
        createdById: input.userId ?? null,
        queuedAt: queueEnabled ? new Date() : null,
      },
    });

    if (queueEnabled) {
      await this.enqueue(record.id, {
        extractionId: record.id,
        vehicleId: record.vehicleId,
        organizationId: record.organizationId,
        documentType,
        objectKey: stored.objectKey,
      });
    }

    return record;
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

  // ── reads (vehicle-scoped) ──────────────────────────────────────────────

  listForVehicle(vehicleId: string) {
    return this.prisma.vehicleDocumentExtraction.findMany({
      where: { vehicleId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async getForVehicle(vehicleId: string, extractionId: string) {
    const record = await this.prisma.vehicleDocumentExtraction.findUnique({
      where: { id: extractionId },
    });
    // Cross-vehicle IDOR guard — VehicleOwnershipGuard only validates the path
    // vehicleId; the extractionId is not implicitly scoped to that vehicle.
    if (!record || record.vehicleId !== vehicleId) {
      throw new NotFoundException('Document extraction not found');
    }
    return record;
  }

  // ── retry ───────────────────────────────────────────────────────────────

  async retry(vehicleId: string, extractionId: string) {
    const record = await this.getForVehicle(vehicleId, extractionId);
    if (record.status === 'CONFIRMED' || record.status === 'APPLIED') {
      throw new BadRequestException('Cannot retry an already confirmed extraction');
    }
    if (!record.objectKey) {
      throw new BadRequestException('Cannot retry: no stored file for this extraction');
    }
    const updated = await this.prisma.vehicleDocumentExtraction.update({
      where: { id: extractionId },
      data: { status: 'QUEUED', errorMessage: null, queuedAt: new Date() },
    });
    await this.enqueue(extractionId, {
      extractionId,
      vehicleId: record.vehicleId,
      organizationId: record.organizationId,
      documentType: record.documentType,
      objectKey: record.objectKey,
    });
    return updated;
  }

  // ── confirm (human confirmation → apply, idempotent) ───────────────────

  async confirm(vehicleId: string, extractionId: string, confirmedDataRaw: unknown) {
    const existing = await this.getForVehicle(vehicleId, extractionId);

    // Idempotency: never apply twice.
    if (existing.status === 'APPLIED') {
      return existing;
    }

    if (existing.status !== 'READY_FOR_REVIEW') {
      throw new BadRequestException(
        `Extraction must be READY_FOR_REVIEW before confirmation (current: ${existing.status})`,
      );
    }

    const confirmedData = this.sanitizeConfirmedData(existing.documentType, confirmedDataRaw);

    const plausibility = await this.runConfirmPlausibility(vehicleId, existing.documentType, confirmedData);
    if (plausibility.overallStatus === 'BLOCKER') {
      throw new BadRequestException({
        message: 'Plausibility checks failed — cannot apply data with BLOCKER status',
        plausibility,
      });
    }

    const sourceFileUrl =
      existing.sourceFileUrl ??
      (existing.objectKey ? `storage://${existing.objectKey}` : null);

    // Mark human-confirmed first (keeps original extractedData intact for audit).
    await this.prisma.vehicleDocumentExtraction.update({
      where: { id: extractionId },
      data: {
        confirmedData: confirmedData as Prisma.InputJsonValue,
        status: 'CONFIRMED',
        plausibility: plausibility as unknown as Prisma.InputJsonValue,
      },
    });

    let applyResult: Awaited<ReturnType<DocumentExtractionApplyService['apply']>>;
    try {
      applyResult = await this.applyService.apply({
        extractionId,
        vehicleId,
        documentType: existing.documentType,
        sourceFileUrl,
        confirmedData,
      });
    } catch (err) {
      this.logger.error(
        `Apply failed for extraction ${extractionId}: ${(err as Error).message}`,
      );
      throw new BadRequestException(
        `Failed to apply confirmed data: ${(err as Error).message}`,
      );
    }

    const updated = await this.prisma.vehicleDocumentExtraction.update({
      where: { id: extractionId },
      data: {
        status: 'APPLIED',
        appliedAt: new Date(),
        ...(applyResult.serviceEventId ? { serviceEventId: applyResult.serviceEventId } : {}),
      },
    });

    return applyResult.detail ? { ...updated, applyResult: applyResult.detail } : updated;
  }

  // ── delete stored file (keeps audit record + confirmed data) ───────────

  async deleteFile(vehicleId: string, extractionId: string) {
    const record = await this.getForVehicle(vehicleId, extractionId);
    if (record.objectKey) {
      await this.storage.deleteObject(record.objectKey).catch(() => undefined);
    }
    // Only the binary is removed — extractedData/confirmedData stay for audit.
    return this.prisma.vehicleDocumentExtraction.update({
      where: { id: extractionId },
      data: { objectKey: null, sizeBytes: null, mimeType: null },
    });
  }

  // ── helpers ─────────────────────────────────────────────────────────────

  private async runConfirmPlausibility(
    vehicleId: string,
    documentType: DocumentExtractionType,
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

  private async enqueue(extractionId: string, data: DocumentExtractionJobData) {
    try {
      await this.queue.add('extract', data, {
        jobId: `extract-${extractionId}`,
        removeOnComplete: true,
        removeOnFail: { count: 100, age: 7 * 24 * 3600 },
      });
    } catch (err) {
      // Redis/queue unavailable — leave the record in QUEUED so a retry can pick it up.
      this.logger.warn(`Failed to enqueue extraction ${extractionId}: ${(err as Error).message}`);
    }
  }

  /**
   * Validates confirmedData against the document-type schema: only known schema
   * keys (+ apply-compatible aliases) are retained, enum fields are coerced to
   * allowed values (or null). Unknown keys are dropped.
   */
  sanitizeConfirmedData(
    documentType: DocumentExtractionType,
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
        // Keep nested measurement objects (e.g. treadDepthMm.{fl,fr,rl,rr})
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
