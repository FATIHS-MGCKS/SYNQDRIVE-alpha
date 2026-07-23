import { NotificationEntityType } from '@modules/notifications/notification.enums';
import { BookingDocumentOrgLegalNotificationService } from '../booking-document-org-legal-notification.service';
import { LegalDocumentOperationalNotificationService } from './legal-document-operational-notification.service';
import { DOCUMENT_TYPE } from '../documents.constants';
import { LEGAL_NOTIFICATION_EVENT } from './legal-document-operational-notification.constants';

describe('LegalDocumentOperationalNotificationService', () => {
  const orgId = 'org-ops-notify';

  function makeService() {
    const notificationCore = {
      isEnabled: jest.fn().mockReturnValue(true),
      ingestCandidate: jest.fn().mockResolvedValue({ enabled: true, operation: 'created' }),
      resolveNotificationByFingerprint: jest.fn().mockResolvedValue(undefined),
    };
    const orgReadinessLoader = {
      loadOrgReadinessState: jest.fn().mockResolvedValue({
        organizationId: orgId,
        documents: [
          {
            id: 'terms-1',
            documentType: DOCUMENT_TYPE.TERMS_AND_CONDITIONS,
            versionLabel: 'v1',
            status: 'DRAFT',
            language: 'de',
            jurisdictionCountry: 'DE',
            scanStatus: 'UPLOADED',
            integrityStatus: null,
            validFrom: null,
            validUntil: null,
          },
        ],
        evaluatedAt: new Date().toISOString(),
      }),
    };
    const service = new LegalDocumentOperationalNotificationService(
      notificationCore as never,
      orgReadinessLoader as never,
    );
    return { service, notificationCore, orgReadinessLoader };
  }

  it('ingests org readiness notifications from central loader state', async () => {
    const { service, notificationCore } = makeService();
    await service.loadAndSyncOrgReadiness(orgId);
    expect(notificationCore.ingestCandidate).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: orgId,
        eventType: LEGAL_NOTIFICATION_EVENT.REQUIRED_DOCUMENT_MISSING,
        entityType: NotificationEntityType.ORGANIZATION,
      }),
    );
  });

  it('resolves stale fingerprints when scope clears', async () => {
    const notificationCore = {
      isEnabled: jest.fn().mockReturnValue(true),
      ingestCandidate: jest.fn().mockResolvedValue({ enabled: true, operation: 'created' }),
      resolveNotificationByFingerprint: jest.fn().mockResolvedValue(undefined),
    };
    const orgReadinessLoader = {
      loadOrgReadinessState: jest
        .fn()
        .mockResolvedValueOnce({
          organizationId: orgId,
          documents: [
            {
              id: 'terms-1',
              documentType: DOCUMENT_TYPE.TERMS_AND_CONDITIONS,
              versionLabel: 'v1',
              status: 'DRAFT',
              language: 'de',
              jurisdictionCountry: 'DE',
              scanStatus: 'UPLOADED',
              integrityStatus: null,
              validFrom: null,
              validUntil: null,
            },
          ],
          evaluatedAt: new Date().toISOString(),
        })
        .mockResolvedValueOnce({
          organizationId: orgId,
          documents: [
            {
              id: 'terms-2',
              documentType: DOCUMENT_TYPE.TERMS_AND_CONDITIONS,
              versionLabel: 'v2',
              status: 'ACTIVE',
              language: 'de',
              jurisdictionCountry: 'DE',
              scanStatus: 'SCAN_PASSED',
              integrityStatus: 'VERIFIED',
              validFrom: null,
              validUntil: null,
            },
            {
              id: 'consumer-1',
              documentType: DOCUMENT_TYPE.CONSUMER_INFORMATION,
              versionLabel: 'v1',
              status: 'ACTIVE',
              language: 'de',
              jurisdictionCountry: 'DE',
              scanStatus: 'SCAN_PASSED',
              integrityStatus: 'VERIFIED',
              validFrom: null,
              validUntil: null,
            },
            {
              id: 'privacy-1',
              documentType: DOCUMENT_TYPE.PRIVACY_POLICY,
              versionLabel: 'v1',
              status: 'ACTIVE',
              language: 'de',
              jurisdictionCountry: 'DE',
              scanStatus: 'SCAN_PASSED',
              integrityStatus: 'VERIFIED',
              validFrom: null,
              validUntil: null,
            },
          ],
          evaluatedAt: new Date().toISOString(),
        }),
    };
    const service = new LegalDocumentOperationalNotificationService(
      notificationCore as never,
      orgReadinessLoader as never,
    );

    await service.loadAndSyncOrgReadiness(orgId);
    await service.loadAndSyncOrgReadiness(orgId);

    expect(notificationCore.resolveNotificationByFingerprint).toHaveBeenCalled();
  });
});

describe('BookingDocumentOrgLegalNotificationService bridge', () => {
  const orgId = 'org-bridge-test';

  it('delegates to operational notification service', async () => {
    const operationalNotifications = {
      loadAndSyncOrgReadiness: jest.fn().mockResolvedValue(undefined),
    };
    const notificationCore = {
      isEnabled: jest.fn().mockReturnValue(true),
      resolveNotificationByFingerprint: jest.fn().mockResolvedValue(undefined),
    };
    const service = new BookingDocumentOrgLegalNotificationService(
      operationalNotifications as never,
      { loadOrgReadinessState: jest.fn() } as never,
      notificationCore as never,
    );

    await service.syncOrgMissingLegalTemplates(orgId, [DOCUMENT_TYPE.TERMS_AND_CONDITIONS]);
    expect(operationalNotifications.loadAndSyncOrgReadiness).toHaveBeenCalledWith(orgId);
  });
});
