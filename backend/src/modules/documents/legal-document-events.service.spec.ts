import { NotFoundException } from '@nestjs/common';
import { DOCUMENT_TYPE } from './documents.constants';
import { LegalDocumentEventsService } from './legal-document-events.service';
import { LEGAL_DOCUMENT_EVENT_TYPE } from './legal-document-events.constants';
import { LEGAL_STATUS } from './documents.constants';

describe('LegalDocumentEventsService', () => {
  const baseDoc = {
    id: 'doc-1',
    organizationId: 'org-1',
    documentType: 'TERMS_AND_CONDITIONS',
    title: 'AGB',
    versionLabel: '2026-01',
    language: 'de',
    status: LEGAL_STATUS.DRAFT,
    fileName: 'agb.pdf',
    mimeType: 'application/pdf',
    storageProvider: 'local',
    objectKey: 'k/agb.pdf',
    checksum: 'abc123',
    sizeBytes: 100,
    validFrom: null,
    validUntil: null,
    submittedForReviewAt: null,
    submittedForReviewByUserId: null,
    approvedAt: null,
    approvedByUserId: null,
    activatedAt: null,
    activatedByUserId: null,
    revokedAt: null,
    revokedByUserId: null,
    statusReason: null,
    changeSummary: 'Initial upload',
    legalOwnerName: null,
    uploadedByUserId: 'user-1',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };

  it('appends events in transaction without storing document content', async () => {
    const created: any[] = [];
    const tx = {
      organizationLegalDocumentEvent: {
        create: jest.fn(async ({ data }) => {
          created.push(data);
          return { id: 'evt-1', ...data, createdAt: new Date() };
        }),
      },
    };
    const prisma = {} as any;
    const svc = new LegalDocumentEventsService(prisma);

    await svc.appendInTransaction(tx as any, {
      organizationId: 'org-1',
      legalDocument: baseDoc as any,
      previousStatus: null,
      newStatus: LEGAL_STATUS.DRAFT,
      actor: { userId: 'user-1', displayName: 'Admin User', correlationId: 'corr-1' },
    });

    expect(created[0]).toEqual(
      expect.objectContaining({
        eventType: LEGAL_DOCUMENT_EVENT_TYPE.UPLOADED,
        previousStatus: null,
        newStatus: LEGAL_STATUS.DRAFT,
        actorUserId: 'user-1',
        actorDisplayName: 'Admin User',
        correlationId: 'corr-1',
        checksum: 'abc123',
        jurisdiction: 'DE',
        versionLabel: '2026-01',
      }),
    );
    expect(created[0].objectKey).toBeUndefined();
    expect(created[0].fileName).toBeUndefined();
  });

  it('lists document events chronologically with tenant scoping', async () => {
    const prisma = {
      organizationLegalDocument: {
        findFirst: jest.fn().mockResolvedValue({ id: 'doc-1' }),
      },
      organizationLegalDocumentEvent: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'e1',
            organizationId: 'org-1',
            legalDocumentId: 'doc-1',
            eventType: LEGAL_DOCUMENT_EVENT_TYPE.UPLOADED,
            previousStatus: null,
            newStatus: LEGAL_STATUS.DRAFT,
            actorUserId: null,
            actorDisplayName: null,
            reason: null,
            changeSummary: null,
            versionLabel: 'v1',
            checksum: null,
            documentType: DOCUMENT_TYPE.TERMS_AND_CONDITIONS,
            legalVariant: null,
            language: 'de',
            jurisdiction: 'DE',
            validFrom: null,
            validUntil: null,
            correlationId: null,
            createdAt: new Date('2026-01-01T00:00:00.000Z'),
          },
        ]),
        count: jest.fn().mockResolvedValue(1),
      },
    } as any;
    const svc = new LegalDocumentEventsService(prisma);

    const result = await svc.listForDocument('org-1', 'doc-1', { page: 1, limit: 20 });

    expect(prisma.organizationLegalDocument.findFirst).toHaveBeenCalledWith({
      where: { id: 'doc-1', organizationId: 'org-1' },
      select: { id: true },
    });
    expect(prisma.organizationLegalDocumentEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: 'org-1', legalDocumentId: 'doc-1' },
        orderBy: { createdAt: 'asc' },
      }),
    );
    expect(result.data).toHaveLength(1);
    expect(result.meta.total).toBe(1);
  });

  it('throws NotFound when document is outside tenant', async () => {
    const prisma = {
      organizationLegalDocument: { findFirst: jest.fn().mockResolvedValue(null) },
    } as any;
    const svc = new LegalDocumentEventsService(prisma);
    await expect(svc.listForDocument('org-1', 'foreign-doc', {})).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
