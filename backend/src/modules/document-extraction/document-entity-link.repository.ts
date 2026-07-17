import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { DocumentEntityLink, Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { DocumentEntityCandidateRepository } from './document-entity-candidate.repository';
import {
  assertDocumentEntityInOrganization,
  assertExtractionInOrganization,
} from './document-entity.scope';
import type {
  ConfirmDocumentEntityCandidateInput,
  DocumentEntityLinkSource,
  SupersedeDocumentEntityLinkInput,
} from './document-entity.types';
import {
  DOCUMENT_ENTITY_LINK_SOURCES,
  assertEntityTypeAllowsConfirmation,
  isContextDocumentEntityType,
} from './document-entity.types';

export type CreateManualDocumentEntityLinkInput = {
  organizationId: string;
  extractionId: string;
  entityType: DocumentEntityLink['entityType'];
  entityId: string;
  confirmedByUserId: string;
  source?: DocumentEntityLinkSource;
};

@Injectable()
export class DocumentEntityLinkRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly candidateRepository: DocumentEntityCandidateRepository,
  ) {}

  findById(organizationId: string, linkId: string) {
    return this.prisma.documentEntityLink.findFirst({
      where: { id: linkId, organizationId },
    });
  }

  findActiveByExtractionAndEntityType(
    organizationId: string,
    extractionId: string,
    entityType: DocumentEntityLink['entityType'],
  ) {
    return this.prisma.documentEntityLink.findFirst({
      where: {
        organizationId,
        extractionId,
        entityType,
        status: 'ACTIVE',
        supersededAt: null,
      },
      orderBy: { confirmedAt: 'desc' },
    });
  }

  listActiveByExtraction(organizationId: string, extractionId: string) {
    return this.prisma.documentEntityLink.findMany({
      where: {
        organizationId,
        extractionId,
        status: 'ACTIVE',
        supersededAt: null,
      },
      orderBy: [{ entityType: 'asc' }, { confirmedAt: 'desc' }],
    });
  }

  /**
   * Confirm a proposed candidate into an auditable active link.
   * Supersedes any prior active link for the same entity type on this extraction.
   */
  async confirmCandidate(
    input: ConfirmDocumentEntityCandidateInput,
  ): Promise<{ link: DocumentEntityLink; supersededLinkId: string | null }> {
    const candidate = await this.candidateRepository.findById(
      input.organizationId,
      input.candidateId,
    );
    if (!candidate || candidate.extractionId !== input.extractionId) {
      throw new NotFoundException('Document entity candidate not found for organization');
    }
    if (candidate.status !== 'PROPOSED') {
      throw new BadRequestException('Only PROPOSED candidates can be confirmed');
    }
    if (!candidate.entityId) {
      throw new BadRequestException('Candidate entityId is required for confirmation');
    }

    const source = input.source ?? DOCUMENT_ENTITY_LINK_SOURCES.CANDIDATE_CONFIRMATION;
    assertEntityTypeAllowsConfirmation(candidate.entityType, source);

    await assertExtractionInOrganization(
      this.prisma,
      input.organizationId,
      input.extractionId,
    );
    await assertDocumentEntityInOrganization(
      this.prisma,
      input.organizationId,
      candidate.entityType,
      candidate.entityId,
    );

    return this.prisma.$transaction(async (tx) => {
      const existingActive = await tx.documentEntityLink.findFirst({
        where: {
          organizationId: input.organizationId,
          extractionId: input.extractionId,
          entityType: candidate.entityType,
          status: 'ACTIVE',
          supersededAt: null,
        },
      });

      let supersededLinkId: string | null = null;
      if (existingActive) {
        supersededLinkId = existingActive.id;
        await tx.documentEntityLink.update({
          where: { id: existingActive.id },
          data: {
            status: 'SUPERSEDED',
            supersededAt: new Date(),
          },
        });
      }

      const link = await tx.documentEntityLink.create({
        data: {
          organizationId: input.organizationId,
          extractionId: input.extractionId,
          entityType: candidate.entityType,
          entityId: candidate.entityId!,
          source,
          status: 'ACTIVE',
          confirmedByUserId: input.confirmedByUserId,
          confirmedAt: new Date(),
          sourceCandidateId: candidate.id,
        },
      });

      await tx.documentEntityCandidate.update({
        where: { id: candidate.id },
        data: { status: 'CONFIRMED' },
      });

      return { link, supersededLinkId };
    });
  }

  async createManualLink(
    input: CreateManualDocumentEntityLinkInput,
  ): Promise<{ link: DocumentEntityLink; supersededLinkId: string | null }> {
    const source = input.source ?? DOCUMENT_ENTITY_LINK_SOURCES.MANUAL_CONFIRMATION;
    assertEntityTypeAllowsConfirmation(input.entityType, source);

    if (isContextDocumentEntityType(input.entityType) && !input.confirmedByUserId) {
      throw new BadRequestException('Context entity links require confirmedByUserId');
    }

    await assertExtractionInOrganization(
      this.prisma,
      input.organizationId,
      input.extractionId,
    );
    await assertDocumentEntityInOrganization(
      this.prisma,
      input.organizationId,
      input.entityType,
      input.entityId,
    );

    return this.prisma.$transaction(async (tx) => {
      const existingActive = await tx.documentEntityLink.findFirst({
        where: {
          organizationId: input.organizationId,
          extractionId: input.extractionId,
          entityType: input.entityType,
          status: 'ACTIVE',
          supersededAt: null,
        },
      });

      let supersededLinkId: string | null = null;
      if (existingActive) {
        supersededLinkId = existingActive.id;
        await tx.documentEntityLink.update({
          where: { id: existingActive.id },
          data: {
            status: 'SUPERSEDED',
            supersededAt: new Date(),
          },
        });
      }

      try {
        const link = await tx.documentEntityLink.create({
          data: {
            organizationId: input.organizationId,
            extractionId: input.extractionId,
            entityType: input.entityType,
            entityId: input.entityId,
            source,
            status: 'ACTIVE',
            confirmedByUserId: input.confirmedByUserId,
            confirmedAt: new Date(),
          },
        });
        return { link, supersededLinkId };
      } catch (error) {
        if (
          error instanceof Error &&
          'code' in error &&
          (error as { code?: string }).code === 'P2002'
        ) {
          throw new ConflictException('Active link already exists for extraction entity type');
        }
        throw error;
      }
    });
  }

  async supersedeLink(input: SupersedeDocumentEntityLinkInput): Promise<DocumentEntityLink> {
    const link = await this.findById(input.organizationId, input.linkId);
    if (!link) {
      throw new NotFoundException('Document entity link not found for organization');
    }
    if (link.supersededAt != null || link.status !== 'ACTIVE') {
      throw new BadRequestException('Only active links can be superseded');
    }

    return this.prisma.documentEntityLink.update({
      where: { id: link.id },
      data: {
        status: 'SUPERSEDED',
        supersededAt: input.supersededAt ?? new Date(),
      },
    });
  }
}
