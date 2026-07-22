import { LegalDocumentDeliveryEvidenceController } from './legal-document-delivery-evidence.controller';
import { DOCUMENT_TYPE } from './documents.constants';
import {
  LEGAL_ACKNOWLEDGMENT_METHOD,
  LEGAL_DELIVERY_CHANNEL,
  LEGAL_DELIVERY_STATUS,
} from './legal-document-delivery-evidence.constants';

describe('LegalDocumentDeliveryEvidenceController (integration)', () => {
  const evidence = {
    listForBooking: jest.fn(),
    getById: jest.fn(),
    recordPresentation: jest.fn(),
    updateDeliveryStatus: jest.fn(),
    recordAcknowledgment: jest.fn(),
  };
  const controller = new LegalDocumentDeliveryEvidenceController(evidence as any);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('lists evidence for a booking', async () => {
    evidence.listForBooking.mockResolvedValue([{ id: 'ev-1' }]);
    const result = await controller.list('org-1', 'bk-1');
    expect(evidence.listForBooking).toHaveBeenCalledWith('org-1', 'bk-1');
    expect(result).toEqual([{ id: 'ev-1' }]);
  });

  it('records presentation with server-derived actor', async () => {
    evidence.recordPresentation.mockResolvedValue({ id: 'ev-new' });
    await controller.recordPresentation(
      'org-1',
      'bk-1',
      {
        customerId: 'cust-1',
        legalDocumentId: 'legal-1',
        generatedDocumentId: 'gen-1',
        documentType: DOCUMENT_TYPE.TERMS_AND_CONDITIONS,
        versionLabel: 'v1',
        language: 'de',
        deliveryChannel: LEGAL_DELIVERY_CHANNEL.PORTAL,
        recipientSnapshot: { customerId: 'cust-1' },
      } as any,
      'user-1',
    );
    expect(evidence.recordPresentation).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'org-1', bookingId: 'bk-1' }),
      { userId: 'user-1' },
    );
  });

  it('updates delivery status for email lifecycle', async () => {
    evidence.updateDeliveryStatus.mockResolvedValue({
      deliveryStatus: LEGAL_DELIVERY_STATUS.DELIVERED,
    });
    await controller.updateDeliveryStatus(
      'org-1',
      'ev-1',
      { deliveryStatus: LEGAL_DELIVERY_STATUS.DELIVERED } as any,
      'user-1',
    );
    expect(evidence.updateDeliveryStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        evidenceId: 'ev-1',
        deliveryStatus: LEGAL_DELIVERY_STATUS.DELIVERED,
      }),
      { userId: 'user-1' },
    );
  });

  it('records acknowledgment separately from consent domains', async () => {
    evidence.recordAcknowledgment.mockResolvedValue({
      acknowledgmentMethod: LEGAL_ACKNOWLEDGMENT_METHOD.EXPLICIT_CHECKBOX,
    });
    await controller.recordAcknowledgment(
      'org-1',
      'ev-1',
      { acknowledgmentMethod: LEGAL_ACKNOWLEDGMENT_METHOD.EXPLICIT_CHECKBOX } as any,
      'user-1',
    );
    expect(evidence.recordAcknowledgment).toHaveBeenCalledWith(
      expect.objectContaining({
        acknowledgmentMethod: LEGAL_ACKNOWLEDGMENT_METHOD.EXPLICIT_CHECKBOX,
      }),
      { userId: 'user-1' },
    );
  });
});
