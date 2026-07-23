import {
  LEGAL_ACKNOWLEDGMENT_METHOD,
  LEGAL_DELIVERY_CHANNEL,
  LEGAL_DELIVERY_EVIDENCE_ERROR_CODE,
  LEGAL_DELIVERY_STATUS,
} from './legal-document-delivery-evidence.constants';
import { LegalDocumentDeliveryEvidenceService } from './legal-document-delivery-evidence.service';
import { DOCUMENT_TYPE } from './documents.constants';

function makePresentationInput(overrides: Record<string, unknown> = {}) {
  return {
    organizationId: 'org-1',
    bookingId: 'bk-1',
    customerId: 'cust-1',
    legalDocumentId: 'legal-1',
    generatedDocumentId: 'gen-1',
    deliveryChannel: LEGAL_DELIVERY_CHANNEL.PORTAL,
    recipientSnapshot: {
      customerId: 'cust-1',
      displayName: 'Max Mustermann',
      email: 'max@example.de',
      language: 'de',
      country: 'DE',
    },
    requestId: 'req-1',
    ...overrides,
  };
}

function makeMetadataMocks(overrides: Record<string, unknown> = {}) {
  return {
    booking: {
      findFirst: jest.fn().mockResolvedValue({ id: 'bk-1', customerId: 'cust-1' }),
    },
    generatedDocument: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'gen-1',
        documentType: DOCUMENT_TYPE.TERMS_AND_CONDITIONS,
        checksum: 'sha-abc',
        legalVersionLabel: 'AGB v1',
        ...((overrides.generatedDocument as object) ?? {}),
      }),
    },
    organizationLegalDocument: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'legal-1',
        documentType: DOCUMENT_TYPE.TERMS_AND_CONDITIONS,
        versionLabel: 'AGB v1',
        language: 'de',
        checksum: 'sha-abc',
        ...((overrides.organizationLegalDocument as object) ?? {}),
      }),
    },
    legalDocumentDeliveryEvidence: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
  };
}

describe('LegalDocumentDeliveryEvidenceService', () => {
  function makeService(prisma: any) {
    return new LegalDocumentDeliveryEvidenceService(prisma);
  }

  it('records presentation with server-derived metadata, presentedAt and actor', async () => {
    const create = jest.fn().mockResolvedValue({
      id: 'ev-1',
      organizationId: 'org-1',
      bookingId: 'bk-1',
      customerId: 'cust-1',
      legalDocumentId: 'legal-1',
      generatedDocumentId: 'gen-1',
      documentType: DOCUMENT_TYPE.TERMS_AND_CONDITIONS,
      versionLabel: 'AGB v1',
      language: 'de',
      checksum: 'sha-abc',
      presentedAt: new Date('2026-07-22T12:00:00.000Z'),
      deliveryChannel: LEGAL_DELIVERY_CHANNEL.PORTAL,
      deliveryStatus: LEGAL_DELIVERY_STATUS.PRESENTED,
      deliveredAt: null,
      acknowledgedAt: null,
      acknowledgmentMethod: null,
      signatureReference: null,
      actorUserId: 'user-1',
      recipientSnapshot: { customerId: 'cust-1' },
      requestId: 'req-1',
      outboundEmailId: null,
      createdAt: new Date('2026-07-22T12:00:00.000Z'),
    });
    const prisma = {
      ...makeMetadataMocks(),
      legalDocumentDeliveryEvidence: {
        findFirst: jest.fn().mockResolvedValue(null),
        create,
      },
    } as any;
    const svc = makeService(prisma);

    const result = await svc.recordPresentation(makePresentationInput(), { userId: 'user-1' });

    expect(result.id).toBe('ev-1');
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actorUserId: 'user-1',
          documentType: DOCUMENT_TYPE.TERMS_AND_CONDITIONS,
          versionLabel: 'AGB v1',
          language: 'de',
          checksum: 'sha-abc',
          deliveryStatus: LEGAL_DELIVERY_STATUS.PRESENTED,
          recipientSnapshot: expect.objectContaining({ customerId: 'cust-1' }),
        }),
      }),
    );
    expect(create.mock.calls[0][0].data.presentedAt).toBeInstanceOf(Date);
  });

  it('derives initial delivery status from channel and ignores client-supplied status', async () => {
    const create = jest.fn().mockImplementation(({ data }) =>
      Promise.resolve({
        id: 'ev-email',
        ...data,
        deliveredAt: null,
        acknowledgedAt: null,
        acknowledgmentMethod: null,
        signatureReference: null,
        createdAt: new Date(),
      }),
    );
    const prisma = {
      ...makeMetadataMocks({
        organizationLegalDocument: {
          documentType: DOCUMENT_TYPE.PRIVACY_POLICY,
        },
        generatedDocument: {
          documentType: DOCUMENT_TYPE.PRIVACY_POLICY,
          legalVersionLabel: 'DS v1',
        },
      }),
      legalDocumentDeliveryEvidence: {
        findFirst: jest.fn().mockResolvedValue(null),
        create,
      },
    } as any;
    const svc = makeService(prisma);

    await svc.recordPresentation(
      makePresentationInput({
        legalDocumentId: 'legal-privacy',
        generatedDocumentId: 'gen-privacy',
        deliveryChannel: LEGAL_DELIVERY_CHANNEL.EMAIL,
        requestId: 'req-email',
      }),
      { userId: 'user-1' },
    );

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          deliveryStatus: LEGAL_DELIVERY_STATUS.SENT,
          documentType: DOCUMENT_TYPE.PRIVACY_POLICY,
          versionLabel: 'DS v1',
        }),
      }),
    );
  });

  it('is idempotent by requestId', async () => {
    const existing = {
      id: 'ev-existing',
      organizationId: 'org-1',
      bookingId: 'bk-1',
      customerId: 'cust-1',
      legalDocumentId: 'legal-1',
      generatedDocumentId: 'gen-1',
      documentType: DOCUMENT_TYPE.PRIVACY_POLICY,
      versionLabel: 'DS v1',
      language: 'de',
      checksum: 'sha',
      presentedAt: new Date(),
      deliveryChannel: LEGAL_DELIVERY_CHANNEL.EMAIL,
      deliveryStatus: LEGAL_DELIVERY_STATUS.SENT,
      deliveredAt: null,
      acknowledgedAt: null,
      acknowledgmentMethod: null,
      signatureReference: null,
      actorUserId: 'user-1',
      recipientSnapshot: { customerId: 'cust-1' },
      requestId: 'req-dup',
      outboundEmailId: 'email-1',
      createdAt: new Date(),
    };
    const prisma = {
      ...makeMetadataMocks({
        generatedDocument: { documentType: DOCUMENT_TYPE.PRIVACY_POLICY },
        organizationLegalDocument: { documentType: DOCUMENT_TYPE.PRIVACY_POLICY },
      }),
      legalDocumentDeliveryEvidence: {
        findFirst: jest.fn().mockResolvedValue(existing),
        create: jest.fn(),
      },
    } as any;
    const svc = makeService(prisma);

    const result = await svc.recordPresentation(
      makePresentationInput({ requestId: 'req-dup' }),
      { userId: 'user-1' },
    );

    expect(result.id).toBe('ev-existing');
    expect(prisma.legalDocumentDeliveryEvidence.create).not.toHaveBeenCalled();
  });

  it('rejects metadata mismatch between generated and legal documents', async () => {
    const prisma = {
      ...makeMetadataMocks({
        generatedDocument: { documentType: DOCUMENT_TYPE.TERMS_AND_CONDITIONS },
        organizationLegalDocument: { documentType: DOCUMENT_TYPE.PRIVACY_POLICY },
      }),
      legalDocumentDeliveryEvidence: { findFirst: jest.fn().mockResolvedValue(null) },
    } as any;
    const svc = makeService(prisma);

    await expect(
      svc.recordPresentation(makePresentationInput(), { userId: 'user-1' }),
    ).rejects.toMatchObject({ code: LEGAL_DELIVERY_EVIDENCE_ERROR_CODE.METADATA_MISMATCH });
  });

  it('allows email delivery status updates until terminal', async () => {
    const row = {
      id: 'ev-1',
      organizationId: 'org-1',
      deliveryStatus: LEGAL_DELIVERY_STATUS.SENT,
      deliveredAt: null,
      acknowledgedAt: null,
      outboundEmailId: 'email-1',
      actorUserId: 'user-1',
    };
    const update = jest.fn().mockResolvedValue({
      ...row,
      deliveryStatus: LEGAL_DELIVERY_STATUS.DELIVERED,
      deliveredAt: new Date('2026-07-22T12:05:00.000Z'),
      bookingId: 'bk-1',
      customerId: 'cust-1',
      legalDocumentId: 'legal-1',
      generatedDocumentId: 'gen-1',
      documentType: DOCUMENT_TYPE.TERMS_AND_CONDITIONS,
      versionLabel: 'v1',
      language: 'de',
      checksum: 'sha',
      presentedAt: new Date(),
      deliveryChannel: LEGAL_DELIVERY_CHANNEL.EMAIL,
      acknowledgmentMethod: null,
      signatureReference: null,
      recipientSnapshot: { customerId: 'cust-1' },
      requestId: null,
      createdAt: new Date(),
    });
    const prisma = {
      legalDocumentDeliveryEvidence: {
        findFirst: jest.fn().mockResolvedValue(row),
        update,
      },
    } as any;
    const svc = makeService(prisma);

    const result = await svc.updateDeliveryStatus(
      {
        organizationId: 'org-1',
        evidenceId: 'ev-1',
        deliveryStatus: LEGAL_DELIVERY_STATUS.DELIVERED,
      },
      { userId: 'user-2' },
    );

    expect(result.deliveryStatus).toBe(LEGAL_DELIVERY_STATUS.DELIVERED);
    expect(result.deliveredAt).not.toBeNull();
  });

  it('rejects mutation of immutable acknowledged evidence', async () => {
    const prisma = {
      legalDocumentDeliveryEvidence: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'ev-1',
          organizationId: 'org-1',
          deliveryStatus: LEGAL_DELIVERY_STATUS.DELIVERED,
          acknowledgedAt: new Date(),
        }),
      },
    } as any;
    const svc = makeService(prisma);

    await expect(
      svc.updateDeliveryStatus(
        {
          organizationId: 'org-1',
          evidenceId: 'ev-1',
          deliveryStatus: LEGAL_DELIVERY_STATUS.FAILED,
        },
        { userId: 'user-1' },
      ),
    ).rejects.toMatchObject({ code: LEGAL_DELIVERY_EVIDENCE_ERROR_CODE.IMMUTABLE });
  });

  it('records acknowledgment as receipt proof, not consent', async () => {
    const row = {
      id: 'ev-1',
      organizationId: 'org-1',
      deliveryStatus: LEGAL_DELIVERY_STATUS.PRESENTED,
      acknowledgedAt: null,
      actorUserId: 'user-1',
      bookingId: 'bk-1',
      customerId: 'cust-1',
      legalDocumentId: 'legal-privacy',
      generatedDocumentId: 'gen-privacy',
      documentType: DOCUMENT_TYPE.PRIVACY_POLICY,
      versionLabel: 'DS v1',
      language: 'de',
      checksum: 'sha-p',
      presentedAt: new Date(),
      deliveryChannel: LEGAL_DELIVERY_CHANNEL.PORTAL,
      deliveredAt: null,
      acknowledgmentMethod: null,
      signatureReference: null,
      recipientSnapshot: { customerId: 'cust-1' },
      requestId: null,
      outboundEmailId: null,
      createdAt: new Date(),
    };
    const update = jest.fn().mockResolvedValue({
      ...row,
      acknowledgedAt: new Date('2026-07-22T12:10:00.000Z'),
      acknowledgmentMethod: LEGAL_ACKNOWLEDGMENT_METHOD.EXPLICIT_CHECKBOX,
    });
    const prisma = {
      legalDocumentDeliveryEvidence: {
        findFirst: jest.fn().mockResolvedValue(row),
        update,
      },
    } as any;
    const svc = makeService(prisma);

    const result = await svc.recordAcknowledgment(
      {
        organizationId: 'org-1',
        evidenceId: 'ev-1',
        acknowledgmentMethod: LEGAL_ACKNOWLEDGMENT_METHOD.EXPLICIT_CHECKBOX,
      },
      { userId: 'user-1' },
    );

    expect(result.acknowledgmentMethod).toBe(LEGAL_ACKNOWLEDGMENT_METHOD.EXPLICIT_CHECKBOX);
    expect(result.immutable).toBe(true);
  });

  it('rejects cross-tenant booking scope', async () => {
    const prisma = {
      booking: { findFirst: jest.fn().mockResolvedValue(null) },
    } as any;
    const svc = makeService(prisma);

    await expect(
      svc.recordPresentation(makePresentationInput(), { userId: 'user-1' }),
    ).rejects.toMatchObject({ code: LEGAL_DELIVERY_EVIDENCE_ERROR_CODE.TENANT_MISMATCH });
  });

  it('rejects recipient snapshot customerId mismatch', async () => {
    const prisma = {
      ...makeMetadataMocks(),
      legalDocumentDeliveryEvidence: { findFirst: jest.fn().mockResolvedValue(null) },
    } as any;
    const svc = makeService(prisma);

    await expect(
      svc.recordPresentation(
        makePresentationInput({
          recipientSnapshot: { customerId: 'cust-OTHER' },
        }),
        { userId: 'user-1' },
      ),
    ).rejects.toMatchObject({ code: LEGAL_DELIVERY_EVIDENCE_ERROR_CODE.MISSING_REQUIRED });
  });
});

describe('LegalDocumentDeliveryEvidenceService privacy parity', () => {
  it('treats privacy policy evidence the same as terms evidence', async () => {
    const create = jest.fn().mockImplementation(({ data }) =>
      Promise.resolve({
        id: 'ev-privacy',
        ...data,
        deliveredAt: null,
        acknowledgedAt: null,
        acknowledgmentMethod: null,
        signatureReference: null,
        createdAt: new Date(),
      }),
    );
    const prisma = {
      ...makeMetadataMocks({
        generatedDocument: {
          id: 'gen-privacy',
          documentType: DOCUMENT_TYPE.PRIVACY_POLICY,
          legalVersionLabel: 'Datenschutz v2',
        },
        organizationLegalDocument: {
          id: 'legal-privacy',
          documentType: DOCUMENT_TYPE.PRIVACY_POLICY,
          versionLabel: 'Datenschutz v2',
        },
      }),
      legalDocumentDeliveryEvidence: { findFirst: jest.fn().mockResolvedValue(null), create },
    } as any;
    const svc = new LegalDocumentDeliveryEvidenceService(prisma);

    const result = await svc.recordPresentation(
      makePresentationInput({
        legalDocumentId: 'legal-privacy',
        generatedDocumentId: 'gen-privacy',
      }),
      { userId: 'user-1' },
    );

    expect(result.documentType).toBe(DOCUMENT_TYPE.PRIVACY_POLICY);
    expect(create).toHaveBeenCalled();
  });
});

describe('LegalDocumentDeliveryEvidenceService outbound webhook bridge', () => {
  it('updates linked evidence rows on delivered webhook', async () => {
    const row = {
      id: 'ev-1',
      organizationId: 'org-1',
      outboundEmailId: 'mail-1',
      bookingId: 'bk-1',
      customerId: 'cust-1',
      legalDocumentId: 'legal-1',
      generatedDocumentId: 'gen-1',
      documentType: DOCUMENT_TYPE.TERMS_AND_CONDITIONS,
      versionLabel: 'v1',
      language: 'de',
      checksum: null,
      presentedAt: new Date(),
      deliveryChannel: LEGAL_DELIVERY_CHANNEL.EMAIL,
      deliveryStatus: LEGAL_DELIVERY_STATUS.SENT,
      deliveredAt: null,
      acknowledgedAt: null,
      acknowledgmentMethod: null,
      signatureReference: null,
      actorUserId: 'user-1',
      recipientSnapshot: { customerId: 'cust-1' },
      requestId: null,
      createdAt: new Date(),
    };
    const prisma = {
      legalDocumentDeliveryEvidence: {
        findMany: jest.fn().mockResolvedValue([row]),
        findFirst: jest.fn().mockResolvedValue(row),
        update: jest.fn().mockResolvedValue({
          ...row,
          deliveryStatus: LEGAL_DELIVERY_STATUS.DELIVERED,
          deliveredAt: new Date(),
        }),
      },
    } as any;
    const svc = new LegalDocumentDeliveryEvidenceService(prisma);
    const count = await svc.applyOutboundEmailWebhookUpdate('org-1', 'mail-1', 'DELIVERED');
    expect(count).toBe(1);
    expect(prisma.legalDocumentDeliveryEvidence.update).toHaveBeenCalled();
  });

  it('is idempotent on repeated provider webhook delivery', async () => {
    const row = {
      id: 'ev-1',
      organizationId: 'org-1',
      outboundEmailId: 'mail-1',
      deliveryStatus: LEGAL_DELIVERY_STATUS.DELIVERED,
      acknowledgedAt: null,
    };
    const prisma = {
      legalDocumentDeliveryEvidence: {
        findMany: jest.fn().mockResolvedValue([row]),
      },
    } as any;
    const svc = new LegalDocumentDeliveryEvidenceService(prisma);
    const count = await svc.applyOutboundEmailWebhookUpdate('org-1', 'mail-1', 'DELIVERED');
    expect(count).toBe(0);
  });
});
