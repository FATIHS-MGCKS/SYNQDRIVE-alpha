import { NotificationEntityType } from '@modules/notifications/notification.enums';
import { BookingDocumentOrgLegalNotificationService } from './booking-document-org-legal-notification.service';
import { DOCUMENT_TYPE } from './documents.constants';

describe('BookingDocumentOrgLegalNotificationService', () => {
  const orgId = 'org-legal-test';

  function makeService() {
    const notificationCore = {
      isEnabled: jest.fn().mockReturnValue(true),
      ingestCandidate: jest.fn().mockResolvedValue(undefined),
      resolveNotificationByFingerprint: jest.fn().mockResolvedValue(undefined),
    };
    const service = new BookingDocumentOrgLegalNotificationService(notificationCore as never);
    return { service, notificationCore };
  }

  it('ingests a central org notification when AGB templates are missing', async () => {
    const { service, notificationCore } = makeService();

    await service.syncOrgMissingLegalTemplates(orgId, [DOCUMENT_TYPE.TERMS_AND_CONDITIONS]);

    expect(notificationCore.ingestCandidate).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: orgId,
        eventType: 'REQUIRED_DOCUMENT_MISSING',
        entityType: NotificationEntityType.ORGANIZATION,
        entityId: orgId,
      }),
    );
    expect(notificationCore.ingestCandidate).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          scope: 'org-legal-template',
          missingTypes: [DOCUMENT_TYPE.TERMS_AND_CONDITIONS],
        }),
      }),
    );
  });

  it('resolves the org notification when templates are configured again', async () => {
    const { service, notificationCore } = makeService();

    await service.syncFromOrgLegalState(orgId, {
      [DOCUMENT_TYPE.TERMS_AND_CONDITIONS]: { id: 'terms-1' },
      [DOCUMENT_TYPE.CONSUMER_INFORMATION]: { id: 'withdrawal-1' },
      [DOCUMENT_TYPE.PRIVACY_POLICY]: { id: 'privacy-1' },
    });

    expect(notificationCore.resolveNotificationByFingerprint).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: orgId }),
    );
    expect(notificationCore.ingestCandidate).not.toHaveBeenCalled();
  });
});
