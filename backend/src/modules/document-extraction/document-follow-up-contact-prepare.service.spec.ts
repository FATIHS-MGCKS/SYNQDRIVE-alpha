import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentFollowUpContactPrepareService } from './document-follow-up-contact-prepare.service';
import {
  DOCUMENT_FOLLOW_UP_SUGGESTION_STATUSES,
  DOCUMENT_FOLLOW_UP_SUGGESTION_TYPES,
} from './document-follow-up-suggestion.types';
import { DOCUMENT_STORAGE } from './storage/document-storage.interface';

describe('DocumentFollowUpContactPrepareService', () => {
  const contactSuggestion = {
    suggestionId: 'sug-contact',
    extractionId: 'ext-1',
    actionPlanId: 'plan-1',
    type: DOCUMENT_FOLLOW_UP_SUGGESTION_TYPES.PREPARE_CUSTOMER_CONTACT,
    title: 'Kundenkontakt vorbereiten',
    rationale: 'Kein Kunde verknüpft.',
    suggestedDueAt: null,
    targetEntity: null,
    status: DOCUMENT_FOLLOW_UP_SUGGESTION_STATUSES.SUGGESTED,
    generatedByRule: 'registry:MISSING_CUSTOMER',
    acceptedByUserId: null,
    resultingEntityId: null,
    createdAt: '2026-07-17T00:00:00.000Z',
    updatedAt: '2026-07-17T00:00:00.000Z',
  };

  const record = {
    id: 'ext-1',
    organizationId: 'org-1',
    vehicleId: 'veh-1',
    sourceFileName: 'fine.pdf',
    effectiveDocumentType: 'FINE',
    documentType: 'FINE',
    detectedDocumentSubtype: null,
    objectKey: 'org/ext-1/fine.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 1024,
    confirmedData: {
      acceptedEntityLinks: [{ entityType: 'customer', entityId: 'cust-1' }],
      reportNumber: 'BV-99',
      iban: 'DE89370400440532013000',
    },
    plausibility: {
      _pipeline: {
        followUpSuggestions: [contactSuggestion],
        malwareScan: { status: 'CLEAN' },
      },
    },
  };

  function makeService() {
    const prisma = {
      customer: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'cust-1',
          firstName: 'Max',
          lastName: 'Muster',
          companyName: null,
          email: 'max@example.com',
        }),
      },
      organization: {
        findUnique: jest.fn().mockResolvedValue({
          emailSignature: null,
          orgEmailSettings: { signatureHtml: null },
        }),
      },
      outboundEmail: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue({
          id: 'mail-1',
          toEmail: 'max@example.com',
          ccEmails: [],
          bccEmails: [],
          subject: 'Test',
          attachments: [],
          events: [],
        }),
        update: jest.fn().mockResolvedValue({
          id: 'mail-1',
          status: 'SENT_SIMULATED',
          attachments: [],
          events: [],
        }),
      },
      vehicleDocumentExtraction: {
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const policy = {
      isValidEmail: jest.fn(() => true),
      validateRecipientEmails: jest.fn(),
      resolveIdentity: jest.fn().mockResolvedValue({
        fromEmail: 'noreply@synqdrive.eu',
        fromName: 'SynqDrive',
        replyToEmail: 'info@synqdrive.eu',
        mode: 'SYNQDRIVE_DEFAULT',
        domainId: null,
      }),
    };
    const outboundEmail = { recordEvent: jest.fn(), toDto: jest.fn((x) => x) };
    const sendEmail = jest.fn().mockResolvedValue({
      provider: 'dev',
      providerMessageId: 'dev_1',
      status: 'SENT_SIMULATED',
    });
    const providers = {
      resolve: jest.fn(() => ({ sendEmail })),
    };
    const activityLog = { log: jest.fn() };
    const storage = { getObject: jest.fn().mockResolvedValue(Buffer.from('pdf')) };
    const config = {
      get: jest.fn((_key: string, fallback?: unknown) => fallback),
    };

    const service = new DocumentFollowUpContactPrepareService(
      prisma as any,
      config as unknown as ConfigService,
      policy as any,
      outboundEmail as any,
      providers as any,
      activityLog as any,
      storage as any,
    );

    return { service, prisma, policy, providers, activityLog, storage, sendEmail };
  }

  it('builds contact prepare preview from confirmed entity link', async () => {
    const { service } = makeService();
    const preview = await service.buildPreparePreview({
      orgId: 'org-1',
      record,
      suggestionId: 'sug-contact',
    });

    expect(preview.contactTarget).toBe('CUSTOMER');
    expect(preview.recipient.email).toBe('max@example.com');
    expect(preview.sender.fromEmail).toBe('noreply@synqdrive.eu');
    expect(preview.attachmentOffer.defaultSelected).toBe(false);
    expect(preview.excludedSensitiveFields).toContain('iban');
    expect(preview.preparedOnly).toBe(true);
    expect(preview.canSend).toBe(true);
  });

  it('records prepare opened audit without sending', async () => {
    const { service, activityLog, prisma } = makeService();
    await service.recordPrepareOpened({
      orgId: 'org-1',
      record,
      suggestionId: 'sug-contact',
      userId: 'user-1',
    });

    expect(prisma.vehicleDocumentExtraction.update).toHaveBeenCalled();
    expect(activityLog.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'CREATE',
        metaJson: expect.objectContaining({ preparedOnly: true }),
      }),
    );
  });

  it('sends only after explicit user payload and optional attachment', async () => {
    const { service, storage, activityLog, sendEmail } = makeService();

    await service.sendPreparedContact({
      orgId: 'org-1',
      record,
      suggestionId: 'sug-contact',
      userId: 'user-1',
      payload: {
        toEmail: 'max@example.com',
        subject: 'Rückfrage',
        bodyHtml: '<p>Bitte prüfen</p>',
        attachDocument: true,
      },
    });

    expect(storage.getObject).toHaveBeenCalledWith('org/ext-1/fine.pdf');
    expect(sendEmail).toHaveBeenCalled();
    expect(activityLog.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'SEND',
        metaJson: expect.objectContaining({ attachDocument: true }),
      }),
    );
  });

  it('does not attach document unless explicitly requested', async () => {
    const { service, storage } = makeService();

    await service.sendPreparedContact({
      orgId: 'org-1',
      record,
      suggestionId: 'sug-contact',
      userId: 'user-1',
      payload: {
        toEmail: 'max@example.com',
        subject: 'Rückfrage',
        bodyHtml: '<p>Bitte prüfen</p>',
        attachDocument: false,
      },
    });

    expect(storage.getObject).not.toHaveBeenCalled();
  });

  it('rejects non-contact suggestion types', async () => {
    const { service } = makeService();
    const nonContactRecord = {
      ...record,
      plausibility: {
        _pipeline: {
          followUpSuggestions: [
            {
              ...contactSuggestion,
              type: DOCUMENT_FOLLOW_UP_SUGGESTION_TYPES.VEHICLE_INSPECTION,
            },
          ],
        },
      },
    };

    await expect(
      service.buildPreparePreview({
        orgId: 'org-1',
        record: nonContactRecord,
        suggestionId: 'sug-contact',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
