import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import documentsConfig from '@config/documents.config';
import { OrganizationLegalDocument, Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  buildPaginatedResult,
  PaginatedResult,
  parsePagination,
} from '@shared/utils/pagination';
import {
  DOCUMENTS_STORAGE,
  DocumentStoragePort,
} from './storage/document-storage.interface';
import {
  DOCUMENT_TYPE,
  legalDocumentTitleDe,
  LEGAL_STATUS,
  isLegalDocumentType,
  type LegalStatus,
} from './documents.constants';
import {
  CONSUMER_INFORMATION_VARIANTS,
  legalDocumentLookupKeys,
  normalizeLegalDocumentType,
  resolveLegalVariantInput,
} from './legal-document-type.compat';
import { DocumentDownload } from './generated-documents.service';
import {
  LegalDocumentActiveConflictError,
  LegalDocumentDomainError,
  LegalDocumentForbiddenError,
  LegalDocumentIntegrityUnavailableError,
  LegalDocumentInvalidTransitionError,
  LegalDocumentNotActivatableError,
  LegalDocumentNotFoundError,
  LegalDocumentPdfValidationError,
  LegalDocumentScanFailedError,
  LegalDocumentScanNotPassedError,
  LegalDocumentScopeLockedError,
  LegalDocumentValidationError,
} from './legal-documents-api.errors';
import {
  collectLegalDocumentActorUserIds,
  LegalDocumentActorRef,
  LegalDocumentApiResponse,
  mapLegalDocumentToApiResponse,
} from './legal-document-api.mapper';
import type { LegalDocumentListQueryDto } from './dto/legal-document-list-query.dto';
import { buildUserDisplayName } from '@modules/tasks/task-detail-view.builder';
import { isLegalDocumentSingleActiveViolation } from './legal-documents-prisma.util';
import {
  LEGAL_ACTIVATABLE_STATUSES,
  assertLegalStatusTransition,
  isLegalStatusTransitionAllowed,
} from './legal-document-lifecycle.transitions';
import {
  deriveNoticePurpose,
} from './legal-document-scope.constants';
import {
  LegalScopeValidationError,
  validateLegalScopeInput,
  type RawLegalScopeInput,
} from './legal-document-scope.validation';
import { LegalDocumentScopeService } from './legal-document-scope.service';
import {
  toLegalDocumentScopeShape,
  type LegalDocumentWithStations,
} from './legal-document-scope.util';
import { scopeFingerprint } from './legal-document-scope.conflicts';
import {
  LegalDocumentActorContext,
  LegalDocumentEventsService,
} from './legal-document-events.service';
import { LegalDocumentFourEyesService } from './legal-document-four-eyes.service';
import { LegalDocumentIngestionService } from './legal-document-ingestion.service';
import { isLegalDocumentScanPassed, isLegalDocumentUnknownScanStatus } from './legal-document-scan-status.constants';
import { LegalDocumentChecksumVerificationService } from './integrity/legal-document-checksum-verification.service';
import { LegalDocumentIntegrityPersistenceService } from './integrity/legal-document-integrity-persistence.service';
import { isLegalDocumentIntegrityBlocking } from './integrity/legal-document-integrity.constants';
import { createChecksumVerifyingTransform } from './integrity/legal-document-checksum-stream.util';
import { LEGAL_DOCUMENT_INTEGRITY_STATUS } from './integrity/legal-document-integrity.constants';
import { pipeline } from 'stream/promises';
import { PassThrough } from 'stream';
import { LegalDocumentRetentionPolicyService } from './retention/legal-document-retention-policy.service';
import { LEGAL_MASTER_PURGEABLE_STATUSES, LEGAL_DOCUMENT_RETENTION_CLASS } from './retention/legal-document-retention.constants';
import { LegalDocumentOperationalNotificationService } from './notifications/legal-document-operational-notification.service';

export interface UploadLegalDocumentInput {
  organizationId: string;
  documentType: string;
  versionLabel: string;
  title?: string | null;
  language?: string | null;
  fileName: string;
  buffer: Buffer;
  mimeType: string;
  uploadedByUserId?: string | null;
  legalOwnerName?: string | null;
  changeSummary?: string | null;
  legalVariant?: string | null;
  actor?: LegalDocumentActorContext;
  applicationScope?: RawLegalScopeInput;
}

export interface UpdateLegalDocumentApplicationScopeInput extends RawLegalScopeInput {
  actor?: LegalDocumentActorContext;
}

export interface LegalDocumentStatusChangeInput {
  userId?: string | null;
  displayName?: string | null;
  correlationId?: string | null;
  statusReason?: string | null;
  changeSummary?: string | null;
}

export interface ScheduleLegalDocumentInput extends LegalDocumentStatusChangeInput {
  validFrom: Date;
}

export interface LegalDocumentDto extends LegalDocumentApiResponse {}

type Tx = Prisma.TransactionClient;

/**
 * Legal texts (AGB, consumer information, privacy) are uploaded and versioned by
 * the rental company — SynqDrive does not generate binding legal content.
 * Exactly one ACTIVE document per identical application-scope fingerprint is expected;
 * overlapping scopes with the same priority are rejected at activation (Prompt 7/32).
 */
@Injectable()
export class LegalDocumentsService {
  private readonly logger = new Logger(LegalDocumentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: LegalDocumentEventsService,
    private readonly scope: LegalDocumentScopeService,
    private readonly fourEyes: LegalDocumentFourEyesService,
    private readonly ingestion: LegalDocumentIngestionService,
    private readonly checksumVerification: LegalDocumentChecksumVerificationService,
    private readonly integrityPersistence: LegalDocumentIntegrityPersistenceService,
    private readonly retentionPolicy: LegalDocumentRetentionPolicyService,
    private readonly operationalNotifications: LegalDocumentOperationalNotificationService,
    @Inject(documentsConfig.KEY)
    private readonly config: ConfigType<typeof documentsConfig>,
    @Inject(DOCUMENTS_STORAGE) private readonly storage: DocumentStoragePort,
  ) {}

  async upload(input: UploadLegalDocumentInput): Promise<OrganizationLegalDocument> {
    if (!isLegalDocumentType(input.documentType)) {
      throw new LegalDocumentValidationError(
        'documentType must be one of: TERMS_AND_CONDITIONS, CONSUMER_INFORMATION, PRIVACY_POLICY (legacy: WITHDRAWAL_INFORMATION)',
        'documentType',
      );
    }
    const versionLabel = (input.versionLabel || '').trim();
    if (!versionLabel) {
      throw new LegalDocumentValidationError('versionLabel is required', 'versionLabel');
    }

    const canonicalType = normalizeLegalDocumentType(input.documentType);
    let legalVariant: string | null = null;
    if (canonicalType === DOCUMENT_TYPE.CONSUMER_INFORMATION) {
      try {
        legalVariant = resolveLegalVariantInput(input.documentType, input.legalVariant);
      } catch {
        throw new LegalDocumentValidationError(
          `legalVariant must be one of: ${CONSUMER_INFORMATION_VARIANTS.join(', ')}`,
          'legalVariant',
        );
      }
    }


    const defaultTitle = legalDocumentTitleDe(canonicalType, legalVariant);

    let scopeInput;
    try {
      scopeInput = validateLegalScopeInput({
        language: input.language ?? input.applicationScope?.language,
        jurisdictionCountry: input.applicationScope?.jurisdictionCountry,
        customerSegment: input.applicationScope?.customerSegment,
        bookingChannel: input.applicationScope?.bookingChannel,
        productScope: input.applicationScope?.productScope,
        stationScopeMode: input.applicationScope?.stationScopeMode,
        stationIds: input.applicationScope?.stationIds,
        priority: input.applicationScope?.priority,
        isMandatory: input.applicationScope?.isMandatory,
        noticePurpose:
          input.applicationScope?.noticePurpose ??
          deriveNoticePurpose(canonicalType, legalVariant),
        validFrom: input.applicationScope?.validFrom,
        validUntil: input.applicationScope?.validUntil,
      });
    } catch (err) {
      if (err instanceof LegalScopeValidationError) {
        throw new LegalDocumentValidationError(err.message, err.field);
      }
      throw err;
    }

    await this.scope.assertStationsBelongToOrg(input.organizationId, scopeInput.stationIds);

    let ingested;
    try {
      ingested = await this.ingestion.ingest({
        organizationId: input.organizationId,
        documentType: canonicalType,
        fileName: input.fileName,
        buffer: input.buffer,
        mimeType: input.mimeType,
      });
    } catch (err) {
      if (
        err instanceof LegalDocumentPdfValidationError ||
        err instanceof LegalDocumentScanFailedError
      ) {
        throw err;
      }
      throw err;
    }

    const actor = this.resolveActor(input.actor, input.uploadedByUserId);

    return this.prisma.$transaction(async (tx) => {
      const doc = await tx.organizationLegalDocument.create({
        data: {
          organizationId: input.organizationId,
          documentType: canonicalType,
          legalVariant,
          title: input.title?.trim() || defaultTitle,
          versionLabel,
          language: scopeInput.language,
          jurisdictionCountry: scopeInput.jurisdictionCountry,
          customerSegment: scopeInput.customerSegment as never,
          bookingChannel: scopeInput.bookingChannel as never,
          productScope: scopeInput.productScope as never,
          stationScopeMode: scopeInput.stationScopeMode as never,
          priority: scopeInput.priority,
          isMandatory: scopeInput.isMandatory,
          noticePurpose: scopeInput.noticePurpose as never,
          status: LEGAL_STATUS.DRAFT,
          fileName: input.fileName,
          mimeType: ingested.mimeType,
          storageProvider: ingested.storageProvider,
          objectKey: ingested.objectKey,
          checksum: ingested.checksum,
          sizeBytes: ingested.sizeBytes,
          pageCount: ingested.pageCount,
          scanStatus: ingested.scanStatus,
          validatedAt: ingested.validatedAt,
          malwareScannedAt: ingested.malwareScannedAt,
          malwareScannerId: ingested.malwareScannerId,
          malwareEngineVersion: ingested.malwareEngineVersion,
          malwareThreatName: ingested.malwareThreatName,
          malwareScanDetail: ingested.malwareScanDetail,
          malwareScanAttempts: ingested.malwareScanAttempts,
          quarantineObjectKey: ingested.quarantineObjectKey,
          integrityStatus: LEGAL_DOCUMENT_INTEGRITY_STATUS.VERIFIED,
          integrityCheckedAt: new Date(),
          uploadedByUserId: input.uploadedByUserId ?? null,
          legalOwnerName: input.legalOwnerName?.trim() || null,
          changeSummary: input.changeSummary?.trim() || null,
        },
      });

      await this.scope.replaceStationScope(
        tx,
        input.organizationId,
        doc.id,
        scopeInput.stationIds,
      );

      await this.events.appendInTransaction(tx, {
        organizationId: doc.organizationId,
        legalDocument: doc,
        previousStatus: null,
        newStatus: LEGAL_STATUS.DRAFT,
        actor,
        changeSummary: input.changeSummary,
      });

      return doc;
    });
  }

  async list(orgId: string): Promise<OrganizationLegalDocument[]> {
    return this.prisma.organizationLegalDocument.findMany({
      where: { organizationId: orgId },
      include: { stations: { select: { stationId: true } } },
      orderBy: [{ documentType: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async listPaginated(
    orgId: string,
    query: LegalDocumentListQueryDto,
  ): Promise<LegalDocumentApiResponse[] | PaginatedResult<LegalDocumentApiResponse>> {
    const where = this.buildListWhere(orgId, query);
    const orderBy = this.buildListOrderBy(query);
    const include = { stations: { select: { stationId: true } } } as const;

    if (query.page == null && query.limit == null) {
      const docs = await this.prisma.organizationLegalDocument.findMany({
        where,
        include,
        orderBy,
      });
      return this.mapManyToApiResponse(docs);
    }

    const { skip, take } = parsePagination(query);
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));

    const [docs, total] = await Promise.all([
      this.prisma.organizationLegalDocument.findMany({
        where,
        include,
        orderBy,
        skip,
        take,
      }),
      this.prisma.organizationLegalDocument.count({ where }),
    ]);

    const data = await this.mapManyToApiResponse(docs);
    return buildPaginatedResult(data, total, { page, limit });
  }

  async getDetail(orgId: string, id: string): Promise<LegalDocumentApiResponse> {
    const doc = await this.getById(orgId, id);
    const [snapshotCount, usersById] = await Promise.all([
      this.countSnapshots(orgId, id),
      this.loadActorUsers([doc]),
    ]);
    return mapLegalDocumentToApiResponse(doc, { snapshotCount, usersById });
  }

  async getById(orgId: string, id: string): Promise<LegalDocumentWithStations> {
    const doc = await this.prisma.organizationLegalDocument.findFirst({
      where: { id, organizationId: orgId },
      include: { stations: { select: { stationId: true } } },
    });
    if (!doc) throw new LegalDocumentNotFoundError();
    return doc;
  }

  async updateApplicationScope(
    orgId: string,
    id: string,
    input: UpdateLegalDocumentApplicationScopeInput,
  ): Promise<LegalDocumentWithStations> {
    const doc = await this.getById(orgId, id);
    if (doc.status === LEGAL_STATUS.ACTIVE || doc.status === LEGAL_STATUS.SUPERSEDED) {
      throw new LegalDocumentScopeLockedError();
    }

    let scopeInput;
    try {
      scopeInput = validateLegalScopeInput({
        language: input.language ?? doc.language,
        jurisdictionCountry: input.jurisdictionCountry ?? doc.jurisdictionCountry,
        customerSegment: input.customerSegment ?? doc.customerSegment,
        bookingChannel: input.bookingChannel ?? doc.bookingChannel,
        productScope: input.productScope ?? doc.productScope,
        stationScopeMode: input.stationScopeMode ?? doc.stationScopeMode,
        stationIds: input.stationIds ?? doc.stations?.map((s) => s.stationId) ?? [],
        priority: input.priority ?? doc.priority,
        isMandatory: input.isMandatory ?? doc.isMandatory,
        noticePurpose: input.noticePurpose ?? doc.noticePurpose,
        validFrom: input.validFrom ?? doc.validFrom,
        validUntil: input.validUntil ?? doc.validUntil,
      });
    } catch (err) {
      if (err instanceof LegalScopeValidationError) {
        throw new LegalDocumentValidationError(err.message, err.field);
      }
      throw err;
    }

    await this.scope.assertStationsBelongToOrg(orgId, scopeInput.stationIds);

    const candidate = toLegalDocumentScopeShape({
      ...doc,
      language: scopeInput.language,
      jurisdictionCountry: scopeInput.jurisdictionCountry,
      customerSegment: scopeInput.customerSegment as LegalDocumentWithStations['customerSegment'],
      bookingChannel: scopeInput.bookingChannel as LegalDocumentWithStations['bookingChannel'],
      productScope: scopeInput.productScope as LegalDocumentWithStations['productScope'],
      stationScopeMode: scopeInput.stationScopeMode as LegalDocumentWithStations['stationScopeMode'],
      priority: scopeInput.priority,
      noticePurpose: scopeInput.noticePurpose as LegalDocumentWithStations['noticePurpose'],
      stations: scopeInput.stationIds.map((stationId) => ({ stationId })),
      validFrom:
        input.validFrom != null ? new Date(input.validFrom) : doc.validFrom,
      validUntil:
        input.validUntil != null ? new Date(input.validUntil) : doc.validUntil,
    });

    await this.scope.assertNoScopeConflicts(orgId, candidate, {
      excludeId: doc.id,
      statuses: [LEGAL_STATUS.ACTIVE, LEGAL_STATUS.SCHEDULED, LEGAL_STATUS.APPROVED],
    });

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.organizationLegalDocument.update({
        where: { id: doc.id },
        data: {
          language: scopeInput.language,
          jurisdictionCountry: scopeInput.jurisdictionCountry,
          customerSegment: scopeInput.customerSegment as never,
          bookingChannel: scopeInput.bookingChannel as never,
          productScope: scopeInput.productScope as never,
          stationScopeMode: scopeInput.stationScopeMode as never,
          priority: scopeInput.priority,
          isMandatory: scopeInput.isMandatory,
          noticePurpose: scopeInput.noticePurpose as never,
          ...(input.validFrom != null ? { validFrom: new Date(input.validFrom) } : {}),
          ...(input.validUntil != null ? { validUntil: new Date(input.validUntil) } : {}),
        },
        include: { stations: { select: { stationId: true } } },
      });

      await this.scope.replaceStationScope(tx, orgId, doc.id, scopeInput.stationIds);
      return updated;
    });
  }

  async submitForReview(
    orgId: string,
    id: string,
    input: LegalDocumentStatusChangeInput = {},
  ): Promise<OrganizationLegalDocument> {
    const doc = await this.getById(orgId, id);
    this.assertScanPassed(doc);
    const actor = this.resolveActor(input);
    return this.transitionStatus(
      orgId,
      id,
      LEGAL_STATUS.IN_REVIEW,
      actor,
      (now) => ({
        submittedForReviewAt: now,
        submittedForReviewByUserId: actor.userId ?? null,
        changeSummary: input.changeSummary?.trim() ?? undefined,
      }),
      { changeSummary: input.changeSummary, reason: input.statusReason },
    );
  }

  async approve(
    orgId: string,
    id: string,
    input: LegalDocumentStatusChangeInput = {},
  ): Promise<OrganizationLegalDocument> {
    const doc = await this.getById(orgId, id);
    const actor = this.resolveActor(input);
    await this.fourEyes.assertSeparation(orgId, doc, actor.userId, 'approve');
    return this.transitionStatus(
      orgId,
      id,
      LEGAL_STATUS.APPROVED,
      actor,
      (now) => ({
        approvedAt: now,
        approvedByUserId: actor.userId ?? null,
        changeSummary: input.changeSummary?.trim() ?? undefined,
      }),
      { changeSummary: input.changeSummary, reason: input.statusReason },
    );
  }

  async schedule(
    orgId: string,
    id: string,
    input: ScheduleLegalDocumentInput,
  ): Promise<OrganizationLegalDocument> {
    if (!(input.validFrom instanceof Date) || Number.isNaN(input.validFrom.getTime())) {
      throw new LegalDocumentValidationError('validFrom must be a valid date', 'validFrom');
    }
    const actor = this.resolveActor(input);
    return this.transitionStatus(
      orgId,
      id,
      LEGAL_STATUS.SCHEDULED,
      actor,
      () => ({
        validFrom: input.validFrom,
        changeSummary: input.changeSummary?.trim() ?? undefined,
      }),
      {
        changeSummary: input.changeSummary,
        reason: input.statusReason,
        validFrom: input.validFrom,
      },
    );
  }

  /** Activates an approved or scheduled version and supersedes any other ACTIVE version. */
  async activate(
    orgId: string,
    id: string,
    input: LegalDocumentStatusChangeInput = {},
  ): Promise<OrganizationLegalDocument> {
    const doc = await this.getById(orgId, id);
    const actor = this.resolveActor(input);

    if (
      doc.status !== LEGAL_STATUS.ACTIVE &&
      !LEGAL_ACTIVATABLE_STATUSES.has(doc.status as LegalStatus)
    ) {
      throw new LegalDocumentNotActivatableError(
        `Legal document must be APPROVED or SCHEDULED before activation (current: ${doc.status})`,
        { status: doc.status },
      );
    }

    this.assertScanPassed(doc);

    await this.fourEyes.assertSeparation(orgId, doc, actor.userId, 'activate');

    try {
      return await this.prisma.$transaction(async (tx) => {
        const current = await tx.organizationLegalDocument.findFirst({
          where: { id: doc.id, organizationId: orgId },
        });
        if (!current) throw new LegalDocumentNotFoundError();

        const otherActiveCount = await tx.organizationLegalDocument.count({
          where: {
            organizationId: orgId,
            documentType: current.documentType,
            language: current.language,
            status: LEGAL_STATUS.ACTIVE,
            id: { not: current.id },
          },
        });

        if (current.status === LEGAL_STATUS.ACTIVE && otherActiveCount === 0) {
          return current;
        }

        if (
          current.status !== LEGAL_STATUS.ACTIVE &&
          !LEGAL_ACTIVATABLE_STATUSES.has(current.status as LegalStatus)
        ) {
          throw new LegalDocumentNotActivatableError(
            `Legal document must be APPROVED or SCHEDULED before activation (current: ${current.status})`,
            { status: current.status },
          );
        }

        if (current.status !== LEGAL_STATUS.ACTIVE) {
          const withStations = await tx.organizationLegalDocument.findFirst({
            where: { id: current.id },
            include: { stations: { select: { stationId: true } } },
          });
          if (withStations) {
            await this.scope.assertNoScopeConflicts(
              orgId,
              { ...toLegalDocumentScopeShape(withStations), status: LEGAL_STATUS.ACTIVE },
              { statuses: [LEGAL_STATUS.ACTIVE], excludeId: current.id },
            );
          }
        }

        if (otherActiveCount > 0) {
          await this.supersedeActivePeers(tx, orgId, current, actor);
        }

        if (current.status === LEGAL_STATUS.ACTIVE) {
          return current;
        }

        const now = new Date();
        const activationTime =
          current.status === LEGAL_STATUS.SCHEDULED && current.validFrom && current.validFrom > now
            ? current.validFrom
            : now;

        return this.applyStatusTransition(
          tx,
          current,
          LEGAL_STATUS.ACTIVE,
          {
            activatedAt: activationTime,
            activatedByUserId: actor.userId ?? null,
            validFrom: current.validFrom ?? activationTime,
          },
          actor,
          {
            changeSummary: input.changeSummary,
            reason: input.statusReason,
            validFrom: current.validFrom ?? activationTime,
          },
        );
      });
    } catch (err) {
      throw this.rethrowActivationError(err, orgId, doc);
    }
  }

  async revoke(
    orgId: string,
    id: string,
    input: LegalDocumentStatusChangeInput = {},
  ): Promise<OrganizationLegalDocument> {
    const reason = input.statusReason?.trim();
    if (!reason) {
      throw new LegalDocumentValidationError(
        'statusReason is required when revoking a legal document',
        'statusReason',
      );
    }
    const actor = this.resolveActor(input);
    return this.transitionStatus(
      orgId,
      id,
      LEGAL_STATUS.REVOKED,
      actor,
      (now) => ({
        revokedAt: now,
        revokedByUserId: actor.userId ?? null,
        statusReason: reason,
      }),
      { reason, changeSummary: input.changeSummary },
    );
  }

  async archive(
    orgId: string,
    id: string,
    input: LegalDocumentStatusChangeInput = {},
  ): Promise<OrganizationLegalDocument> {
    const actor = this.resolveActor(input);
    return this.transitionStatus(
      orgId,
      id,
      LEGAL_STATUS.ARCHIVED,
      actor,
      () => ({
        statusReason: input.statusReason?.trim() ?? undefined,
      }),
      { reason: input.statusReason, changeSummary: input.changeSummary },
    );
  }

  async requestChanges(
    orgId: string,
    id: string,
    input: LegalDocumentStatusChangeInput = {},
  ): Promise<OrganizationLegalDocument> {
    const reason = input.statusReason?.trim();
    if (!reason) {
      throw new LegalDocumentValidationError(
        'statusReason is required when requesting changes',
        'statusReason',
      );
    }
    const actor = this.resolveActor(input);
    return this.transitionStatus(
      orgId,
      id,
      LEGAL_STATUS.DRAFT,
      actor,
      () => ({
        statusReason: reason,
        changeSummary: input.changeSummary?.trim() ?? undefined,
      }),
      { reason, changeSummary: input.changeSummary },
    );
  }

  /** Returns resolvable active legal documents per type (excludes expired / not-yet-valid). */
  async getActiveByType(
    orgId: string,
    language = 'de',
  ): Promise<Record<string, OrganizationLegalDocument | undefined>> {
    const now = new Date();
    const active = await this.prisma.organizationLegalDocument.findMany({
      where: {
        organizationId: orgId,
        language,
        status: LEGAL_STATUS.ACTIVE,
        AND: [
          { OR: [{ validFrom: null }, { validFrom: { lte: now } }] },
          { OR: [{ validUntil: null }, { validUntil: { gt: now } }] },
        ],
      },
      orderBy: { activatedAt: 'desc' },
    });
    const map: Record<string, OrganizationLegalDocument | undefined> = {};
    for (const doc of active) {
      for (const key of legalDocumentLookupKeys(doc.documentType, doc.legalVariant)) {
        if (!map[key]) map[key] = doc;
      }
    }
    return map;
  }

  async getDownload(orgId: string, id: string): Promise<DocumentDownload> {
    const doc = await this.getById(orgId, id);

    if (doc.integrityUnavailable || isLegalDocumentIntegrityBlocking(doc.integrityStatus)) {
      throw new LegalDocumentIntegrityUnavailableError(
        doc.integrityStatus,
        doc.integrityDetail ?? undefined,
      );
    }

    if (this.config.integrityVerifyOnDownload) {
      const result = await this.checksumVerification.verify({
        organizationId: doc.organizationId,
        legalDocumentId: doc.id,
        objectKey: doc.objectKey,
        checksum: doc.checksum,
        sizeBytes: doc.sizeBytes,
      });

      if (result.status !== LEGAL_DOCUMENT_INTEGRITY_STATUS.VERIFIED) {
        await this.integrityPersistence.applyVerificationResult(doc, result, {
          source: 'download',
        });
        throw new LegalDocumentIntegrityUnavailableError(result.status, result.detail);
      }

      if (doc.integrityStatus !== LEGAL_DOCUMENT_INTEGRITY_STATUS.VERIFIED) {
        await this.integrityPersistence.applyVerificationResult(doc, result, {
          source: 'download',
        });
      }
    }

    const sourceStream = await this.storage.getObjectStream(doc.objectKey);
    const output = new PassThrough();
    const verifier = createChecksumVerifyingTransform(doc.checksum);

    void pipeline(sourceStream, verifier.stream, output).catch(async (err) => {
      output.destroy(err as Error);
    });

    verifier.stream.on('end', () => {
      if (doc.checksum && !verifier.verify()) {
        void this.integrityPersistence.applyVerificationResult(
          doc,
          {
            status: LEGAL_DOCUMENT_INTEGRITY_STATUS.CHECKSUM_MISMATCH,
            detail: 'Checksum mismatch during download stream',
            expectedChecksum: doc.checksum,
            actualChecksum: verifier.getDigest(),
            checkedAt: new Date(),
          },
          { source: 'download' },
        );
        output.destroy(new Error('Checksum mismatch'));
      }
    });

    return {
      stream: output,
      fileName: doc.fileName,
      mimeType: doc.mimeType,
      sizeBytes: doc.sizeBytes,
    };
  }

  async getWorkflowSettings(orgId: string): Promise<{ fourEyesEnabled: boolean }> {
    return { fourEyesEnabled: await this.fourEyes.isEnabled(orgId) };
  }

  toDto(doc: OrganizationLegalDocument & { stations?: { stationId: string }[] }): LegalDocumentDto {
    return mapLegalDocumentToApiResponse(doc);
  }

  private async transitionStatus(
    orgId: string,
    id: string,
    toStatus: string,
    actor: LegalDocumentActorContext,
    patch: (now: Date) => Prisma.OrganizationLegalDocumentUpdateInput,
    audit?: {
      reason?: string | null;
      changeSummary?: string | null;
      validFrom?: Date | null;
      validUntil?: Date | null;
    },
  ): Promise<OrganizationLegalDocument> {
    const doc = await this.getById(orgId, id);
    if (!isLegalStatusTransitionAllowed(doc.status, toStatus)) {
      throw new LegalDocumentInvalidTransitionError(doc.status, toStatus);
    }

    return this.prisma.$transaction(async (tx) => {
      const current = await tx.organizationLegalDocument.findFirst({
        where: { id: doc.id, organizationId: orgId },
      });
      if (!current) throw new LegalDocumentNotFoundError();
      return this.applyStatusTransition(tx, current, toStatus, patch(new Date()), actor, audit);
    });
  }

  private async applyStatusTransition(
    tx: Tx,
    current: OrganizationLegalDocument,
    toStatus: string,
    data: Prisma.OrganizationLegalDocumentUpdateInput,
    actor: LegalDocumentActorContext,
    audit?: {
      reason?: string | null;
      changeSummary?: string | null;
      validFrom?: Date | null;
      validUntil?: Date | null;
    },
  ): Promise<OrganizationLegalDocument> {
    assertLegalStatusTransition(current.status, toStatus);
    const updated = await tx.organizationLegalDocument.update({
      where: { id: current.id },
      data: { status: toStatus, ...data },
    });

    await this.events.appendInTransaction(tx, {
      organizationId: updated.organizationId,
      legalDocument: updated,
      previousStatus: current.status,
      newStatus: toStatus,
      actor,
      reason: audit?.reason ?? updated.statusReason,
      changeSummary: audit?.changeSummary,
      validFrom: audit?.validFrom,
      validUntil: audit?.validUntil,
    });

    if (
      (LEGAL_MASTER_PURGEABLE_STATUSES as readonly string[]).includes(toStatus) &&
      !updated.legalHold
    ) {
      const anchorDate =
        toStatus === LEGAL_STATUS.REVOKED
          ? updated.revokedAt ?? new Date()
          : toStatus === LEGAL_STATUS.SUPERSEDED
            ? updated.validUntil ?? new Date()
            : new Date();
      const classPolicy = await this.retentionPolicy.resolveClassPolicy(
        updated.organizationId,
        LEGAL_DOCUMENT_RETENTION_CLASS.LEGAL_MASTER,
      );
      const deletionEligibleAt = this.retentionPolicy.computeDeletionEligibleAt(
        LEGAL_DOCUMENT_RETENTION_CLASS.LEGAL_MASTER,
        anchorDate,
        classPolicy.retentionDays,
      );
      if (deletionEligibleAt) {
        return tx.organizationLegalDocument.update({
          where: { id: updated.id },
          data: { deletionEligibleAt },
        });
      }
    }

    void this.operationalNotifications
      .loadAndSyncOrgReadiness(updated.organizationId)
      .catch((err) =>
        this.logger.debug(
          `operational notification sync after status ${toStatus}: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );

    return updated;
  }

  private async supersedeActivePeers(
    tx: Tx,
    orgId: string,
    current: OrganizationLegalDocument,
    actor: LegalDocumentActorContext,
  ): Promise<void> {
    const currentWithStations = await tx.organizationLegalDocument.findFirst({
      where: { id: current.id },
      include: { stations: { select: { stationId: true } } },
    });
    const currentScope = currentWithStations
      ? toLegalDocumentScopeShape(currentWithStations)
      : toLegalDocumentScopeShape(current);
    const currentFp = scopeFingerprint(currentScope);

    const peers = await tx.organizationLegalDocument.findMany({
      where: {
        organizationId: orgId,
        documentType: current.documentType,
        language: current.language,
        status: LEGAL_STATUS.ACTIVE,
        id: { not: current.id },
      },
      include: { stations: { select: { stationId: true } } },
    });
    const now = new Date();
    for (const peer of peers) {
      if (scopeFingerprint(toLegalDocumentScopeShape(peer)) !== currentFp) {
        continue;
      }
      const reason =
        peer.statusReason ?? 'Superseded by a newer active legal document version';
      await this.applyStatusTransition(
        tx,
        peer,
        LEGAL_STATUS.SUPERSEDED,
        {
          validUntil: peer.validUntil ?? now,
          statusReason: reason,
        },
        actor,
        { reason, validUntil: peer.validUntil ?? now },
      );
    }
  }

  private resolveActor(
    input?: LegalDocumentActorContext | LegalDocumentStatusChangeInput,
    fallbackUserId?: string | null,
  ): LegalDocumentActorContext {
    return {
      userId: input?.userId ?? fallbackUserId ?? null,
      displayName:
        ('displayName' in (input ?? {}) ? input?.displayName : undefined) ?? null,
      correlationId: input?.correlationId ?? null,
    };
  }

  private rethrowActivationError(
    err: unknown,
    orgId: string,
    doc: OrganizationLegalDocument,
  ): never {
    if (
      err instanceof LegalDocumentNotFoundError ||
      err instanceof LegalDocumentDomainError
    ) {
      throw err;
    }
    if (isLegalDocumentSingleActiveViolation(err)) {
      throw new LegalDocumentActiveConflictError(orgId, doc.documentType, doc.language);
    }
    throw err;
  }

  private buildListWhere(
    orgId: string,
    query: LegalDocumentListQueryDto,
  ): Prisma.OrganizationLegalDocumentWhereInput {
    const search = query.search?.trim();
    const createdAt: Prisma.DateTimeFilter | undefined =
      query.from || query.to
        ? {
            ...(query.from ? { gte: new Date(query.from) } : {}),
            ...(query.to ? { lte: new Date(query.to) } : {}),
          }
        : undefined;

    return {
      organizationId: orgId,
      ...(query.documentType ? { documentType: query.documentType } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.language ? { language: query.language } : {}),
      ...(query.jurisdiction ? { jurisdictionCountry: query.jurisdiction.toUpperCase() } : {}),
      ...(query.customerSegment ? { customerSegment: query.customerSegment as never } : {}),
      ...(query.channelScope ? { bookingChannel: query.channelScope as never } : {}),
      ...(createdAt ? { createdAt } : {}),
      ...(search
        ? {
            OR: [
              { title: { contains: search, mode: 'insensitive' } },
              { versionLabel: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
  }

  private buildListOrderBy(
    query: LegalDocumentListQueryDto,
  ): Prisma.OrganizationLegalDocumentOrderByWithRelationInput[] {
    const direction = query.order === 'asc' ? 'asc' : 'desc';
    const sort = query.sort ?? 'createdAt';
    return [{ [sort]: direction }];
  }

  private async mapManyToApiResponse(
    docs: LegalDocumentWithStations[],
  ): Promise<LegalDocumentApiResponse[]> {
    if (docs.length === 0) return [];
    const ids = docs.map((d) => d.id);
    const [snapshotCounts, usersById] = await Promise.all([
      this.loadSnapshotCounts(docs[0]!.organizationId, ids),
      this.loadActorUsers(docs),
    ]);
    return docs.map((doc) =>
      mapLegalDocumentToApiResponse(doc, {
        snapshotCount: snapshotCounts.get(doc.id) ?? 0,
        usersById,
      }),
    );
  }

  private async countSnapshots(orgId: string, legalDocumentId: string): Promise<number> {
    return this.prisma.generatedDocument.count({
      where: { organizationId: orgId, legalDocumentId },
    });
  }

  private async loadSnapshotCounts(
    orgId: string,
    legalDocumentIds: string[],
  ): Promise<Map<string, number>> {
    if (legalDocumentIds.length === 0) return new Map();
    const rows = await this.prisma.generatedDocument.groupBy({
      by: ['legalDocumentId'],
      where: {
        organizationId: orgId,
        legalDocumentId: { in: legalDocumentIds },
      },
      _count: { _all: true },
    });
    return new Map(
      rows
        .filter((row) => row.legalDocumentId != null)
        .map((row) => [row.legalDocumentId as string, row._count._all]),
    );
  }

  private async loadActorUsers(
    docs: Array<
      Pick<
        OrganizationLegalDocument,
        'uploadedByUserId' | 'approvedByUserId' | 'activatedByUserId'
      >
    >,
  ): Promise<Map<string, LegalDocumentActorRef>> {
    const ids = collectLegalDocumentActorUserIds(docs);
    if (ids.length === 0) return new Map();

    const rows = await this.prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, firstName: true, lastName: true, email: true },
    });

    return new Map(
      rows.map((row) => [
        row.id,
        { id: row.id, displayName: buildUserDisplayName(row) },
      ]),
    );
  }

  private assertScanPassed(doc: Pick<OrganizationLegalDocument, 'scanStatus'>): void {
    if (isLegalDocumentUnknownScanStatus(doc.scanStatus)) {
      throw new LegalDocumentScanNotPassedError(doc.scanStatus ?? 'UNKNOWN');
    }
    if (!isLegalDocumentScanPassed(doc.scanStatus)) {
      throw new LegalDocumentScanNotPassedError(doc.scanStatus);
    }
  }
}
