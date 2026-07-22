import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { OrganizationLegalDocument, Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
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
  toLegacyDocumentType,
} from './legal-document-type.compat';
import { DocumentDownload } from './generated-documents.service';
import { isLegalPdfUpload, normalizeLegalPdfMimeType } from './legal-documents.util';
import {
  LEGAL_DOCUMENT_ERROR_CODES,
  type LegalDocumentConflictBody,
} from './legal-documents.errors';
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
  scopeToDto,
  toLegalDocumentScopeShape,
  type LegalDocumentApplicationScopeDto,
  type LegalDocumentWithStations,
} from './legal-document-scope.util';
import { scopeFingerprint } from './legal-document-scope.conflicts';
import {
  LegalDocumentActorContext,
  LegalDocumentEventsService,
} from './legal-document-events.service';

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

export interface LegalDocumentDto {
  id: string;
  documentType: string;
  /** Set when documentType is CONSUMER_INFORMATION. */
  legalVariant: string | null;
  /**
   * @deprecated Legacy API alias (e.g. WITHDRAWAL_INFORMATION) when applicable.
   * New clients should use documentType + legalVariant.
   */
  legacyDocumentType: string | null;
  title: string;
  versionLabel: string;
  language: string;
  status: string;
  fileName: string;
  sizeBytes: number | null;
  /** @deprecated Use activatedAt — kept for API backward compatibility. */
  activeFrom: string | null;
  activatedAt: string | null;
  validFrom: string | null;
  validUntil: string | null;
  legalOwnerName: string | null;
  changeSummary: string | null;
  statusReason: string | null;
  applicationScope: LegalDocumentApplicationScopeDto;
  createdAt: string;
  updatedAt: string;
}

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
    @Inject(DOCUMENTS_STORAGE) private readonly storage: DocumentStoragePort,
  ) {}

  async upload(input: UploadLegalDocumentInput): Promise<OrganizationLegalDocument> {
    if (!isLegalDocumentType(input.documentType)) {
      throw new BadRequestException(
        'documentType must be one of: TERMS_AND_CONDITIONS, CONSUMER_INFORMATION, PRIVACY_POLICY (legacy: WITHDRAWAL_INFORMATION)',
      );
    }
    if (!isLegalPdfUpload({ mimetype: input.mimeType, originalname: input.fileName })) {
      throw new BadRequestException('Legal documents must be PDF files');
    }
    const versionLabel = (input.versionLabel || '').trim();
    if (!versionLabel) {
      throw new BadRequestException('versionLabel is required');
    }

    const canonicalType = normalizeLegalDocumentType(input.documentType);
    let legalVariant: string | null = null;
    if (canonicalType === DOCUMENT_TYPE.CONSUMER_INFORMATION) {
      try {
        legalVariant = resolveLegalVariantInput(input.documentType, input.legalVariant);
      } catch {
        throw new BadRequestException(
          `legalVariant must be one of: ${CONSUMER_INFORMATION_VARIANTS.join(', ')}`,
        );
      }
    }


    const mimeType = normalizeLegalPdfMimeType(input.mimeType, input.fileName);
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
        throw new BadRequestException(err.message);
      }
      throw err;
    }

    await this.scope.assertStationsBelongToOrg(input.organizationId, scopeInput.stationIds);

    const stored = await this.storage.putObject({
      organizationId: input.organizationId,
      bookingId: null,
      documentType: canonicalType,
      originalName: input.fileName,
      buffer: input.buffer,
      mimeType,
    });
    const checksum = createHash('sha256').update(input.buffer).digest('hex');
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
          mimeType,
          storageProvider: stored.storageProvider,
          objectKey: stored.objectKey,
          checksum,
          sizeBytes: stored.sizeBytes,
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

  async getById(orgId: string, id: string): Promise<LegalDocumentWithStations> {
    const doc = await this.prisma.organizationLegalDocument.findFirst({
      where: { id, organizationId: orgId },
      include: { stations: { select: { stationId: true } } },
    });
    if (!doc) throw new NotFoundException('Legal document not found');
    return doc;
  }

  async updateApplicationScope(
    orgId: string,
    id: string,
    input: UpdateLegalDocumentApplicationScopeInput,
  ): Promise<LegalDocumentWithStations> {
    const doc = await this.getById(orgId, id);
    if (doc.status === LEGAL_STATUS.ACTIVE || doc.status === LEGAL_STATUS.SUPERSEDED) {
      throw new BadRequestException(
        'Application scope cannot be changed on ACTIVE or SUPERSEDED legal documents',
      );
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
        throw new BadRequestException(err.message);
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
    const actor = this.resolveActor(input);
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
      throw new BadRequestException('validFrom must be a valid date');
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
      throw new BadRequestException({
        message: `Legal document must be APPROVED or SCHEDULED before activation (current: ${doc.status})`,
        code: LEGAL_DOCUMENT_ERROR_CODES.NOT_ACTIVATABLE,
      });
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const current = await tx.organizationLegalDocument.findFirst({
          where: { id: doc.id, organizationId: orgId },
        });
        if (!current) throw new NotFoundException('Legal document not found');

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
          throw new BadRequestException({
            message: `Legal document must be APPROVED or SCHEDULED before activation (current: ${current.status})`,
            code: LEGAL_DOCUMENT_ERROR_CODES.NOT_ACTIVATABLE,
          });
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
      throw new BadRequestException('statusReason is required when revoking a legal document');
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
    const stream = await this.storage.getObjectStream(doc.objectKey);
    return { stream, fileName: doc.fileName, mimeType: doc.mimeType, sizeBytes: doc.sizeBytes };
  }

  toDto(doc: OrganizationLegalDocument & { stations?: { stationId: string }[] }): LegalDocumentDto {
    const activatedAt = doc.activatedAt ? doc.activatedAt.toISOString() : null;
    return {
      id: doc.id,
      documentType: doc.documentType,
      legalVariant: doc.legalVariant,
      legacyDocumentType: toLegacyDocumentType(doc.documentType, doc.legalVariant),
      title: doc.title,
      versionLabel: doc.versionLabel,
      language: doc.language,
      status: doc.status,
      fileName: doc.fileName,
      sizeBytes: doc.sizeBytes,
      activeFrom: activatedAt,
      activatedAt,
      validFrom: doc.validFrom ? doc.validFrom.toISOString() : null,
      validUntil: doc.validUntil ? doc.validUntil.toISOString() : null,
      legalOwnerName: doc.legalOwnerName,
      changeSummary: doc.changeSummary,
      statusReason: doc.statusReason,
      applicationScope: scopeToDto(doc),
      createdAt: doc.createdAt.toISOString(),
      updatedAt: doc.updatedAt.toISOString(),
    };
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
      throw new BadRequestException({
        message: `Illegal legal document status transition: ${doc.status} → ${toStatus}`,
        code: LEGAL_DOCUMENT_ERROR_CODES.INVALID_STATUS_TRANSITION,
        fromStatus: doc.status,
        toStatus,
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const current = await tx.organizationLegalDocument.findFirst({
        where: { id: doc.id, organizationId: orgId },
      });
      if (!current) throw new NotFoundException('Legal document not found');
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
      err instanceof NotFoundException ||
      err instanceof BadRequestException ||
      err instanceof ConflictException
    ) {
      throw err;
    }
    if (isLegalDocumentSingleActiveViolation(err)) {
      const body: LegalDocumentConflictBody = {
        message:
          'Another legal document version is already active for this organization, document type, and language',
        code: LEGAL_DOCUMENT_ERROR_CODES.ACTIVE_CONFLICT,
        organizationId: orgId,
        documentType: doc.documentType,
        language: doc.language,
      };
      throw new ConflictException(body);
    }
    throw err;
  }
}
