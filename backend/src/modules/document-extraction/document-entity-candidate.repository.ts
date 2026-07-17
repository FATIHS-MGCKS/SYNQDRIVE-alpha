import { BadRequestException, Injectable } from '@nestjs/common';
import type { DocumentEntityCandidate, Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  normalizeConflicts,
  normalizeMatchReasons,
  rankDocumentEntityCandidates,
} from './document-entity-candidate.ranking';
import { assertExtractionInOrganization } from './document-entity.scope';
import type { ReplaceDocumentEntityCandidatesInput } from './document-entity.types';
import { DOCUMENT_ENTITY_RESOLVER_VERSION } from './document-entity.types';

@Injectable()
export class DocumentEntityCandidateRepository {
  constructor(private readonly prisma: PrismaService) {}

  listByExtraction(organizationId: string, extractionId: string, entityType?: DocumentEntityCandidate['entityType']) {
    return this.prisma.documentEntityCandidate.findMany({
      where: {
        organizationId,
        extractionId,
        ...(entityType ? { entityType } : {}),
      },
      orderBy: [{ entityType: 'asc' }, { rank: 'asc' }],
    });
  }

  listProposedByExtraction(organizationId: string, extractionId: string) {
    return this.prisma.documentEntityCandidate.findMany({
      where: {
        organizationId,
        extractionId,
        status: 'PROPOSED',
      },
      orderBy: [{ entityType: 'asc' }, { rank: 'asc' }],
    });
  }

  findById(organizationId: string, candidateId: string) {
    return this.prisma.documentEntityCandidate.findFirst({
      where: { id: candidateId, organizationId },
    });
  }

  /**
   * Replace proposed candidates for an extraction resolver run.
   * Prior PROPOSED rows are marked SUPERSEDED; confirmed/rejected history remains.
   */
  async replaceProposedCandidates(
    input: ReplaceDocumentEntityCandidatesInput,
  ): Promise<DocumentEntityCandidate[]> {
    const extraction = await assertExtractionInOrganization(
      this.prisma,
      input.organizationId,
      input.extractionId,
    );
    const organizationId = extraction.organizationId ?? input.organizationId;
    const resolverVersion = input.resolverVersion ?? DOCUMENT_ENTITY_RESOLVER_VERSION;
    const ranked = rankDocumentEntityCandidates(input.candidates);

    if (ranked.some((candidate) => candidate.entityId == null)) {
      throw new BadRequestException('Candidate entityId is required for persisted proposals');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.documentEntityCandidate.updateMany({
        where: {
          organizationId,
          extractionId: input.extractionId,
          status: 'PROPOSED',
        },
        data: { status: 'SUPERSEDED' },
      });

      const created: DocumentEntityCandidate[] = [];
      for (const candidate of ranked) {
        const row = await tx.documentEntityCandidate.create({
          data: {
            organizationId,
            extractionId: input.extractionId,
            entityType: candidate.entityType,
            entityId: candidate.entityId,
            confidence: candidate.confidence ?? undefined,
            matchReasons: normalizeMatchReasons(candidate.matchReasons) as Prisma.InputJsonValue,
            conflicts: normalizeConflicts(candidate.conflicts) as Prisma.InputJsonValue,
            rank: candidate.rank,
            status: 'PROPOSED',
            resolverVersion,
          },
        });
        created.push(row);
      }
      return created;
    });
  }
}
