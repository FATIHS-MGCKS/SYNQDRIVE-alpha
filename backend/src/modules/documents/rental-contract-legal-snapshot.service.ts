import { Injectable } from '@nestjs/common';
import type { BookingDocumentBundle, GeneratedDocument, OrganizationLegalDocument, RentalContract } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { DOCUMENT_STATUS, DOCUMENT_TYPE, legalDocumentTitleDe, type DocumentType } from './documents.constants';
import { bundlePointerValue } from './booking-document-bundle-pointer.mapping';
import { LegalDocumentResolverService } from './legal-document-resolver.service';
import type { LegalDocumentResolverResult } from './legal-document-resolver.types';
import { isDocumentValidAt } from './legal-document-resolver.matching';
import {
  RENTAL_CONTRACT_ERROR_CODE,
  RentalContractLegalSnapshotError,
  RentalContractMissingMandatoryLegalTextError,
} from './rental-contract.errors';
import {
  RENTAL_CONTRACT_MANDATORY_LEGAL_TYPES,
  RENTAL_CONTRACT_SLOT_BY_DOCUMENT_TYPE,
  type RentalContractLegalRefSnapshot,
  type RentalContractLegalRefsSnapshot,
  type RentalContractMandatoryLegalType,
} from './rental-contract-legal-snapshot.types';

export interface ResolvedRentalContractLegalRef {
  slot: RentalContractLegalRefSnapshot['slot'];
  documentType: DocumentType;
  generatedDocumentId: string;
  legalDocumentId: string;
  legalVariant: string | null;
  versionLabel: string;
  language: string;
  jurisdictionCountry: string;
  checksum: string | null;
  validFrom: Date | null;
  validUntil: Date | null;
  validAtContractTime: boolean;
  selectionReason: string | null;
  resolverVersion: string | null;
}

@Injectable()
export class RentalContractLegalSnapshotService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly legalResolver: LegalDocumentResolverService,
  ) {}

  isFrozen(contract: Pick<RentalContract, 'legalSnapshotFrozenAt'>): boolean {
    return contract.legalSnapshotFrozenAt != null;
  }

  parseSnapshot(raw: unknown): RentalContractLegalRefsSnapshot | null {
    if (!raw || typeof raw !== 'object') return null;
    const snapshot = raw as RentalContractLegalRefsSnapshot;
    if (snapshot.schemaVersion !== 1) return null;
    if (!Array.isArray(snapshot.refs) || snapshot.refs.length === 0) return null;
    return snapshot;
  }

  getFrozenRefs(contract: RentalContract): ResolvedRentalContractLegalRef[] {
    const snapshot = this.parseSnapshot(contract.legalRefsSnapshot);
    if (!snapshot) {
      throw new RentalContractLegalSnapshotError(
        RENTAL_CONTRACT_ERROR_CODE.GENERATED_DOCUMENT_MISSING,
        'Rental contract is marked frozen but legalRefsSnapshot is missing or invalid',
        { rentalContractId: contract.id, bookingId: contract.bookingId },
      );
    }
    return snapshot.refs.map((ref) => ({
      slot: ref.slot,
      documentType: ref.documentType,
      generatedDocumentId: ref.generatedDocumentId,
      legalDocumentId: ref.legalDocumentId,
      legalVariant: ref.legalVariant,
      versionLabel: ref.versionLabel,
      language: ref.language,
      jurisdictionCountry: ref.jurisdictionCountry,
      checksum: ref.checksum,
      validFrom: ref.validFrom ? new Date(ref.validFrom) : null,
      validUntil: ref.validUntil ? new Date(ref.validUntil) : null,
      validAtContractTime: ref.validAtContractTime,
      selectionReason: ref.selectionReason,
      resolverVersion: ref.resolverVersion,
    }));
  }

  /**
   * Resolve mandatory legal references exclusively via bundle frozen pointers + central resolver.
   * Never uses findFirst to pick a version.
   */
  async resolveMandatoryLegalRefs(
    orgId: string,
    bookingId: string,
    bundle: BookingDocumentBundle,
    options: { contract?: RentalContract | null } = {},
  ): Promise<{
    refs: ResolvedRentalContractLegalRef[];
    resolution: LegalDocumentResolverResult;
    frozenAt: Date;
  }> {
    if (options.contract && this.isFrozen(options.contract)) {
      return {
        refs: this.getFrozenRefs(options.contract),
        resolution: await this.legalResolver.resolveForBooking(orgId, bookingId, {
          documentTypes: [...RENTAL_CONTRACT_MANDATORY_LEGAL_TYPES],
        }),
        frozenAt: options.contract.legalSnapshotFrozenAt!,
      };
    }

    const resolution = await this.legalResolver.resolveForBooking(orgId, bookingId, {
      documentTypes: [...RENTAL_CONTRACT_MANDATORY_LEGAL_TYPES],
    });

    if (resolution.conflicts.length > 0) {
      throw new RentalContractLegalSnapshotError(
        RENTAL_CONTRACT_ERROR_CODE.RESOLVER_CONFLICT,
        `Legal document resolver conflict for rental contract on booking ${bookingId}`,
        {
          organizationId: orgId,
          bookingId,
          conflicts: resolution.conflicts.map((c) => ({
            documentType: c.documentType,
            code: c.reason,
            documentAId: c.documentAId,
            documentBId: c.documentBId,
          })),
        },
      );
    }

    const missingTypes = this.collectMissingMandatoryTypes(resolution);
    if (missingTypes.length > 0) {
      throw new RentalContractMissingMandatoryLegalTextError(orgId, bookingId, missingTypes);
    }

    const selectionByType = new Map(
      resolution.selectedDocuments.map((selection) => [selection.documentType, selection]),
    );
    const contractAt = new Date(resolution.evaluatedContext.effectiveTimestamp);
    const refs: ResolvedRentalContractLegalRef[] = [];

    for (const documentType of RENTAL_CONTRACT_MANDATORY_LEGAL_TYPES) {
      const selection = selectionByType.get(documentType);
      if (!selection) {
        throw new RentalContractMissingMandatoryLegalTextError(orgId, bookingId, [documentType]);
      }

      const generatedDocumentId = bundlePointerValue(bundle, documentType);
      if (!generatedDocumentId) {
        throw new RentalContractMissingMandatoryLegalTextError(orgId, bookingId, [documentType]);
      }

      const generated = await this.loadGeneratedDocument(orgId, bookingId, generatedDocumentId);
      const legal = await this.loadLegalDocument(orgId, generated.legalDocumentId);

      if (legal.id !== selection.legalDocumentId) {
        throw new RentalContractLegalSnapshotError(
          RENTAL_CONTRACT_ERROR_CODE.TENANT_MISMATCH,
          `Bundle pointer legal document ${legal.id} does not match resolver selection ${selection.legalDocumentId} for ${documentType}`,
          {
            organizationId: orgId,
            bookingId,
            documentType,
            bundleGeneratedDocumentId: generatedDocumentId,
            bundleLegalDocumentId: legal.id,
            resolverLegalDocumentId: selection.legalDocumentId,
          },
        );
      }

      this.assertTenantAlignment(orgId, bookingId, generated, legal);

      refs.push({
        slot: RENTAL_CONTRACT_SLOT_BY_DOCUMENT_TYPE[documentType],
        documentType: legal.documentType as DocumentType,
        generatedDocumentId: generated.id,
        legalDocumentId: legal.id,
        legalVariant: legal.legalVariant,
        versionLabel: legal.versionLabel,
        language: legal.language,
        jurisdictionCountry: legal.jurisdictionCountry,
        checksum: legal.checksum,
        validFrom: legal.validFrom,
        validUntil: legal.validUntil,
        validAtContractTime: isDocumentValidAt(legal, contractAt),
        selectionReason: selection.selectionReason,
        resolverVersion: resolution.resolverVersion,
      });
    }

    return { refs, resolution, frozenAt: new Date() };
  }

  buildSnapshot(
    orgId: string,
    bookingId: string,
    refs: ResolvedRentalContractLegalRef[],
    resolution: LegalDocumentResolverResult,
    frozenAt: Date,
  ): RentalContractLegalRefsSnapshot {
    return {
      schemaVersion: 1,
      bookingId,
      organizationId: orgId,
      frozenAt: frozenAt.toISOString(),
      resolverVersion: resolution.resolverVersion,
      refs: refs.map((ref) => this.toRefSnapshot(ref, frozenAt)),
    };
  }

  toLegalRefsForRendering(refs: ResolvedRentalContractLegalRef[]) {
    return refs.map((ref) => ({
      label:
        ref.documentType === DOCUMENT_TYPE.TERMS_AND_CONDITIONS
          ? 'AGB'
          : legalDocumentTitleDe(ref.documentType, ref.legalVariant),
      versionLabel: ref.versionLabel,
      present: true,
    }));
  }

  toContractPointerIds(refs: ResolvedRentalContractLegalRef[]) {
    const bySlot = new Map(refs.map((ref) => [ref.slot, ref]));
    return {
      termsDocumentId: bySlot.get('TERMS')?.generatedDocumentId ?? null,
      withdrawalDocumentId: bySlot.get('CONSUMER')?.generatedDocumentId ?? null,
      privacyDocumentId: bySlot.get('PRIVACY')?.generatedDocumentId ?? null,
    };
  }

  private toRefSnapshot(
    ref: ResolvedRentalContractLegalRef,
    frozenAt: Date,
  ): RentalContractLegalRefSnapshot {
    return {
      slot: ref.slot,
      generatedDocumentId: ref.generatedDocumentId,
      legalDocumentId: ref.legalDocumentId,
      documentType: ref.documentType,
      legalVariant: ref.legalVariant,
      versionLabel: ref.versionLabel,
      language: ref.language,
      jurisdictionCountry: ref.jurisdictionCountry,
      checksum: ref.checksum,
      validFrom: ref.validFrom ? ref.validFrom.toISOString() : null,
      validUntil: ref.validUntil ? ref.validUntil.toISOString() : null,
      validAtContractTime: ref.validAtContractTime,
      snapshotAt: frozenAt.toISOString(),
      resolverVersion: ref.resolverVersion,
      selectionReason: ref.selectionReason,
    };
  }

  private collectMissingMandatoryTypes(
    resolution: LegalDocumentResolverResult,
  ): DocumentType[] {
    const missing = new Set<DocumentType>();
    for (const entry of resolution.missingMandatoryDocuments) {
      if (RENTAL_CONTRACT_MANDATORY_LEGAL_TYPES.includes(entry.documentType as RentalContractMandatoryLegalType)) {
        missing.add(entry.documentType as DocumentType);
      }
    }
    for (const documentType of RENTAL_CONTRACT_MANDATORY_LEGAL_TYPES) {
      const selected = resolution.selectedDocuments.some((s) => s.documentType === documentType);
      if (!selected) missing.add(documentType);
    }
    return [...missing];
  }

  private async loadGeneratedDocument(
    orgId: string,
    bookingId: string,
    generatedDocumentId: string,
  ): Promise<GeneratedDocument> {
    const generated = await this.prisma.generatedDocument.findUnique({
      where: { id: generatedDocumentId },
    });
    if (
      !generated ||
      generated.organizationId !== orgId ||
      generated.bookingId !== bookingId ||
      generated.status === DOCUMENT_STATUS.VOID ||
      !generated.legalDocumentId
    ) {
      throw new RentalContractLegalSnapshotError(
        RENTAL_CONTRACT_ERROR_CODE.GENERATED_DOCUMENT_MISSING,
        `Generated legal document ${generatedDocumentId} is missing or not scoped to booking`,
        { organizationId: orgId, bookingId, generatedDocumentId },
      );
    }
    return generated;
  }

  private async loadLegalDocument(
    orgId: string,
    legalDocumentId: string | null,
  ): Promise<OrganizationLegalDocument> {
    if (!legalDocumentId) {
      throw new RentalContractLegalSnapshotError(
        RENTAL_CONTRACT_ERROR_CODE.LEGAL_DOCUMENT_MISSING,
        'Generated document has no legalDocumentId',
        { organizationId: orgId },
      );
    }
    const legal = await this.prisma.organizationLegalDocument.findUnique({
      where: { id: legalDocumentId },
    });
    if (!legal || legal.organizationId !== orgId) {
      throw new RentalContractLegalSnapshotError(
        RENTAL_CONTRACT_ERROR_CODE.LEGAL_DOCUMENT_MISSING,
        `Legal document ${legalDocumentId} is missing or not scoped to organization`,
        { organizationId: orgId, legalDocumentId },
      );
    }
    return legal;
  }

  private assertTenantAlignment(
    orgId: string,
    bookingId: string,
    generated: GeneratedDocument,
    legal: OrganizationLegalDocument,
  ): void {
    if (
      generated.organizationId !== orgId ||
      generated.bookingId !== bookingId ||
      legal.organizationId !== orgId
    ) {
      throw new RentalContractLegalSnapshotError(
        RENTAL_CONTRACT_ERROR_CODE.TENANT_MISMATCH,
        'Rental contract legal pointers are not aligned with organization/booking scope',
        {
          organizationId: orgId,
          bookingId,
          generatedDocumentId: generated.id,
          legalDocumentId: legal.id,
        },
      );
    }
  }
}
