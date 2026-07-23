import { NotificationEntityType } from '@modules/notifications/notification.enums';
import { BookingDocumentOrgLegalNotificationService } from './booking-document-org-legal-notification.service';
import { DOCUMENT_TYPE } from './documents.constants';

describe('BookingDocumentOrgLegalNotificationService', () => {
  const orgId = 'org-legal-test';

  function makeService() {
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
    return { service, operationalNotifications, notificationCore };
  }

  it('syncs central org readiness when AGB templates are missing', async () => {
    const { service, operationalNotifications } = makeService();

    await service.syncOrgMissingLegalTemplates(orgId, [DOCUMENT_TYPE.TERMS_AND_CONDITIONS]);

    expect(operationalNotifications.loadAndSyncOrgReadiness).toHaveBeenCalledWith(orgId);
  });

  it('resolves legacy notification and reloads readiness when templates are configured', async () => {
    const { service, operationalNotifications, notificationCore } = makeService();

    await service.syncFromOrgLegalState(orgId, {
      [DOCUMENT_TYPE.TERMS_AND_CONDITIONS]: { id: 'terms-1' },
      [DOCUMENT_TYPE.CONSUMER_INFORMATION]: { id: 'withdrawal-1' },
      [DOCUMENT_TYPE.PRIVACY_POLICY]: { id: 'privacy-1' },
    });

    expect(notificationCore.resolveNotificationByFingerprint).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: orgId }),
    );
    expect(operationalNotifications.loadAndSyncOrgReadiness).toHaveBeenCalledWith(orgId);
  });
});
