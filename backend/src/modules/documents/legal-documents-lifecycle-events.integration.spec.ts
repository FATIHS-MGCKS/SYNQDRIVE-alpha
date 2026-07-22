import { Readable } from 'stream';
import { LegalDocumentEventsService } from './legal-document-events.service';
import { LegalDocumentsService } from './legal-documents.service';
import { DOCUMENT_TYPE, LEGAL_STATUS } from './documents.constants';
import { LEGAL_DOCUMENT_EVENT_TYPE, resolveLegalDocumentEventType } from './legal-document-events.constants';
import { createLegalDocumentActivationHarness } from './legal-documents-activation.integration.harness';
import { createNoopLegalDocumentFourEyesService } from './legal-document-four-eyes.test-utils';
import { createNoopLegalDocumentScopeService } from './legal-document-scope.test-utils';

const storage = {
  putObject: jest.fn().mockResolvedValue({
    objectKey: 'organizations/org-a/legal/x.pdf',
    storageProvider: 'local',
    sizeBytes: 100,
    mimeType: 'application/pdf',
  }),
  getObjectStream: jest.fn().mockResolvedValue(Readable.from([Buffer.from('%PDF')])),
} as any;

function createEventsHarness() {
  const events: any[] = [];
  const eventsService = {
    appendInTransaction: jest.fn(async (_tx: any, input: any) => {
      const row = {
        id: `evt-${events.length + 1}`,
        organizationId: input.organizationId,
        legalDocumentId: input.legalDocument.id,
        eventType:
          input.eventType ??
          resolveLegalDocumentEventType(input.previousStatus, input.newStatus),
        previousStatus: input.previousStatus,
        newStatus: input.newStatus,
        actorUserId: input.actor?.userId ?? null,
        actorDisplayName: input.actor?.displayName ?? null,
        reason: input.reason ?? null,
        changeSummary: input.changeSummary ?? null,
        versionLabel: input.legalDocument.versionLabel,
        checksum: input.legalDocument.checksum,
        language: input.legalDocument.language,
        jurisdiction: 'DE',
        validFrom: input.validFrom ?? input.legalDocument.validFrom ?? null,
        validUntil: input.validUntil ?? input.legalDocument.validUntil ?? null,
        correlationId: input.actor?.correlationId ?? null,
        createdAt: new Date(),
      };
      events.push(row);
      return row;
    }),
    listForDocument: jest.fn(),
    listForOrganization: jest.fn(),
    toDto: (e: any) => e,
  } as unknown as LegalDocumentEventsService;

  return { eventsService, events };
}

describe('LegalDocumentsService lifecycle events (integration)', () => {
  const actor = { userId: 'user-1', displayName: 'Org Admin', correlationId: 'req-42' };

  function makeSvc(h: ReturnType<typeof createLegalDocumentActivationHarness>) {
    const { eventsService, events } = createEventsHarness();
    const svc = new LegalDocumentsService(h.prisma as any, eventsService, createNoopLegalDocumentScopeService(), createNoopLegalDocumentFourEyesService() as any, storage);
    return { svc, events, eventsService };
  }

  it('records UPLOADED event atomically with document creation', async () => {
    const h = createLegalDocumentActivationHarness();
    const { svc, events } = makeSvc(h);

    const doc = await svc.upload({
      organizationId: 'org-a',
      documentType: DOCUMENT_TYPE.TERMS_AND_CONDITIONS,
      versionLabel: '2026-01',
      fileName: 'agb.pdf',
      buffer: Buffer.from('%PDF'),
      mimeType: 'application/pdf',
      actor,
    });

    expect(doc.status).toBe(LEGAL_STATUS.DRAFT);
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual(
      expect.objectContaining({
        eventType: LEGAL_DOCUMENT_EVENT_TYPE.UPLOADED,
        legalDocumentId: doc.id,
        previousStatus: null,
        newStatus: LEGAL_STATUS.DRAFT,
        actorUserId: 'user-1',
        correlationId: 'req-42',
      }),
    );
  });

  it('records full review → approve → activate chain plus SUPERSEDED on replacement', async () => {
    const h = createLegalDocumentActivationHarness();
    h.seedApproved({
      id: 'v1',
      organizationId: 'org-a',
      documentType: DOCUMENT_TYPE.TERMS_AND_CONDITIONS,
      versionLabel: '2026-01',
    });
    const draft = h.seedDraft({
      id: 'v2',
      organizationId: 'org-a',
      documentType: DOCUMENT_TYPE.TERMS_AND_CONDITIONS,
      versionLabel: '2026-02',
    });
    const { svc, events } = makeSvc(h);

    await svc.submitForReview('org-a', draft.id, { ...actor, changeSummary: 'Ready for legal' });
    await svc.approve('org-a', draft.id, { ...actor, changeSummary: 'Legal sign-off' });
    await svc.activate('org-a', 'v1', actor);
    await svc.activate('org-a', draft.id, actor);

    const types = events.map((e) => e.eventType);
    expect(types).toEqual([
      LEGAL_DOCUMENT_EVENT_TYPE.SUBMITTED_FOR_REVIEW,
      LEGAL_DOCUMENT_EVENT_TYPE.APPROVED,
      LEGAL_DOCUMENT_EVENT_TYPE.ACTIVATED,
      LEGAL_DOCUMENT_EVENT_TYPE.SUPERSEDED,
      LEGAL_DOCUMENT_EVENT_TYPE.ACTIVATED,
    ]);
    expect(h.rows.get('v1')?.status).toBe(LEGAL_STATUS.SUPERSEDED);
    expect(h.rows.get('v2')?.status).toBe(LEGAL_STATUS.ACTIVE);
  });

  it('records SCHEDULED, REVOKED, and ARCHIVED events', async () => {
    const h = createLegalDocumentActivationHarness();
    const approved = h.seedApproved({
      id: 'sched',
      organizationId: 'org-a',
      documentType: DOCUMENT_TYPE.PRIVACY_POLICY,
      versionLabel: '2026-Q3',
    });
    const active = h.seedApproved({
      id: 'active',
      organizationId: 'org-a',
      documentType: DOCUMENT_TYPE.WITHDRAWAL_INFORMATION,
      versionLabel: 'w-1',
    });
    active.status = LEGAL_STATUS.ACTIVE;
    active.activatedAt = new Date();

    const { svc, events } = makeSvc(h);
    const scheduledFor = new Date('2026-08-01T00:00:00.000Z');

    await svc.schedule('org-a', approved.id, {
      validFrom: scheduledFor,
      ...actor,
      changeSummary: 'Planned go-live',
    });
    await svc.revoke('org-a', active.id, {
      ...actor,
      statusReason: 'Legal withdrawal requested',
    });
    await svc.archive('org-a', approved.id, {
      ...actor,
      statusReason: 'Superseded planning cancelled',
    });

    expect(events.map((e) => e.eventType)).toEqual([
      LEGAL_DOCUMENT_EVENT_TYPE.SCHEDULED,
      LEGAL_DOCUMENT_EVENT_TYPE.REVOKED,
      LEGAL_DOCUMENT_EVENT_TYPE.ARCHIVED,
    ]);
    expect(events[0].validFrom).toEqual(scheduledFor);
    expect(events[1].reason).toBe('Legal withdrawal requested');
  });

  it('rolls back status change when event append fails', async () => {
    const h = createLegalDocumentActivationHarness();
    const draft = h.seedDraft({
      id: 'fail-doc',
      organizationId: 'org-a',
      documentType: DOCUMENT_TYPE.TERMS_AND_CONDITIONS,
      versionLabel: 'x',
    });
    const { eventsService } = createEventsHarness();
    (eventsService.appendInTransaction as jest.Mock).mockRejectedValue(
      new Error('audit write failed'),
    );
    const svc = new LegalDocumentsService(h.prisma as any, eventsService, createNoopLegalDocumentScopeService(), createNoopLegalDocumentFourEyesService() as any, storage);

    await expect(
      svc.submitForReview('org-a', draft.id, actor),
    ).rejects.toThrow('audit write failed');
    expect(h.rows.get('fail-doc')?.status).toBe(LEGAL_STATUS.DRAFT);
  });
});
