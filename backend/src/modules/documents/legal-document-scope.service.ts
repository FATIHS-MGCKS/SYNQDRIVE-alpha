import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { LEGAL_STATUS } from './documents.constants';
import {
  detectScopeConflicts,
  findConflictsForCandidate,
  scopeFingerprint,
  type LegalDocumentScopeShape,
  type LegalScopeConflict,
} from './legal-document-scope.conflicts';
import { toLegalDocumentScopeShape } from './legal-document-scope.util';
import { LegalDocumentScopeConflictError } from './legal-documents-api.errors';

const ACTIVE_SCOPE_STATUSES = [LEGAL_STATUS.ACTIVE, LEGAL_STATUS.SCHEDULED, LEGAL_STATUS.APPROVED];

@Injectable()
export class LegalDocumentScopeService {
  constructor(private readonly prisma: PrismaService) {}

  async loadScopeDocuments(
    orgId: string,
    options?: {
      documentType?: string;
      statuses?: string[];
      excludeId?: string;
    },
  ) {
    return this.prisma.organizationLegalDocument.findMany({
      where: {
        organizationId: orgId,
        ...(options?.documentType ? { documentType: options.documentType } : {}),
        ...(options?.statuses ? { status: { in: options.statuses } } : {}),
        ...(options?.excludeId ? { id: { not: options.excludeId } } : {}),
      },
      include: { stations: { select: { stationId: true } } },
    });
  }

  async assertStationsBelongToOrg(orgId: string, stationIds: string[]): Promise<void> {
    if (stationIds.length === 0) return;
    const count = await this.prisma.station.count({
      where: { organizationId: orgId, id: { in: stationIds } },
    });
    if (count !== stationIds.length) {
      throw new NotFoundException('One or more stationIds do not belong to this organization');
    }
  }

  async detectConflictsForCandidate(
    orgId: string,
    candidate: LegalDocumentScopeShape,
    options?: { statuses?: string[]; excludeId?: string },
  ): Promise<LegalScopeConflict[]> {
    const statuses = options?.statuses ?? ACTIVE_SCOPE_STATUSES;
    const docs = await this.loadScopeDocuments(orgId, {
      documentType: candidate.documentType,
      statuses,
      excludeId: options?.excludeId,
    });
    const shapes = docs.map(toLegalDocumentScopeShape);
    return findConflictsForCandidate(candidate, shapes);
  }

  async assertNoScopeConflicts(
    orgId: string,
    candidate: LegalDocumentScopeShape,
    options?: { statuses?: string[]; excludeId?: string },
  ): Promise<void> {
    const conflicts = await this.detectConflictsForCandidate(orgId, candidate, options);
    if (conflicts.length === 0) return;

    throw new LegalDocumentScopeConflictError(orgId, conflicts);
  }

  findIdenticalScopePeers(
    candidate: LegalDocumentScopeShape,
    existing: LegalDocumentScopeShape[],
  ): LegalDocumentScopeShape[] {
    const fp = scopeFingerprint(candidate);
    return existing.filter((doc) => scopeFingerprint(doc) === fp);
  }

  async replaceStationScope(
    tx: Prisma.TransactionClient,
    orgId: string,
    legalDocumentId: string,
    stationIds: string[],
  ): Promise<void> {
    await tx.organizationLegalDocumentStation.deleteMany({
      where: { legalDocumentId },
    });
    if (stationIds.length === 0) return;
    await tx.organizationLegalDocumentStation.createMany({
      data: stationIds.map((stationId) => ({
        organizationId: orgId,
        legalDocumentId,
        stationId,
      })),
    });
  }

  detectConflictsAmong(documents: LegalDocumentScopeShape[]): LegalScopeConflict[] {
    return detectScopeConflicts(documents);
  }
}
