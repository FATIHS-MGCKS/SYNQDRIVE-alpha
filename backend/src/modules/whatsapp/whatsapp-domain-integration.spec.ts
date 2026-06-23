import { BadRequestException, NotFoundException } from '@nestjs/common';
import { WhatsAppQuickActionsService } from './whatsapp-quick-actions.service';
import { WhatsAppBookingReminderService } from './whatsapp-booking-reminder.service';
import { WhatsAppConsentBlockedException } from './utils/whatsapp-errors';

describe('WhatsAppQuickActionsService', () => {
  const prisma = {
    whatsAppConversation: { findFirst: jest.fn(), update: jest.fn() },
    booking: { findFirst: jest.fn() },
    customer: { findFirst: jest.fn() },
  };
  const whatsapp = { sendMessage: jest.fn() };
  const reminders = { sendMissingDocumentsReminderWhatsApp: jest.fn() };
  const tasks = { createManualTask: jest.fn().mockResolvedValue({ id: 'task-1' }) };
  const aiRouter = { requestHumanReview: jest.fn() };
  const aiContext = { load: jest.fn() };
  const aiTools = { getPickupInstructions: jest.fn() };
  const audit = { record: jest.fn() };

  let service: WhatsAppQuickActionsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new WhatsAppQuickActionsService(
      prisma as any,
      whatsapp as any,
      reminders as any,
      tasks as any,
      aiRouter as any,
      aiContext as any,
      aiTools as any,
      audit as any,
    );
  });

  it('cross-org booking cannot be linked', async () => {
    prisma.whatsAppConversation.findFirst.mockResolvedValue({
      id: 'convo-1',
      organizationId: 'org-1',
    });
    prisma.booking.findFirst.mockResolvedValue(null);

    await expect(service.linkBooking('org-1', 'convo-1', 'bk-other-org')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('task from conversation is org-scoped', async () => {
    prisma.whatsAppConversation.findFirst.mockResolvedValue({
      id: 'convo-1',
      organizationId: 'org-1',
      customerId: 'cust-1',
      contactPhone: '+491701234567',
      contactName: 'Max',
      assignedTo: null,
      lastDetectedIntent: 'SUPPORT',
    });
    aiContext.load.mockResolvedValue({
      customer: { id: 'cust-1' },
      booking: { id: 'bk-1' },
      vehicle: null,
    });

    await service.createTaskFromConversation('org-1', 'convo-1', {});

    expect(tasks.createManualTask).toHaveBeenCalledWith(
      'org-1',
      expect.objectContaining({
        source: 'WHATSAPP',
        customerId: 'cust-1',
        bookingId: 'bk-1',
        metadata: { whatsappConversationId: 'convo-1' },
      }),
      undefined,
    );
  });

  it('handover link requires matching org booking', async () => {
    prisma.whatsAppConversation.findFirst.mockResolvedValue({
      id: 'convo-1',
      organizationId: 'org-1',
      bookingId: null,
    });

    await expect(
      service.execute('org-1', 'convo-1', 'send_handover_link', {}),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('WhatsAppBookingReminderService consent', () => {
  const prisma = {
    orgWhatsAppConfig: {
      findUnique: jest.fn().mockResolvedValue({
        organizationId: 'org-1',
        isConnected: true,
        isActive: true,
        accessTokenConfigured: true,
        phoneNumberId: 'pn-1',
      }),
    },
    whatsAppConversation: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    whatsAppMessage: { create: jest.fn(), update: jest.fn(), findUnique: jest.fn() },
    whatsAppTemplate: { findFirst: jest.fn().mockResolvedValue(null) },
  };
  const bookings = {
    findDetail: jest.fn().mockResolvedValue({
      core: { bookingId: 'bk-1', bookingNumber: 'B-1', status: 'Confirmed', startDate: '2026-06-01', endDate: '2026-06-10', pickupStationName: 'Kassel' },
      customer: { customerId: 'cust-1', fullName: 'Max Mustermann', phone: '+491701234567' },
      vehicle: { vehicleId: 'veh-1' },
      stations: { pickup: null, return: null },
      finance: { depositStatus: null, paymentStatus: 'PAID' },
    }),
  };
  const documentBundle = { getBundleView: jest.fn() };
  const damages = {};
  const provider = { isConfigured: jest.fn().mockReturnValue(true), sendTextMessage: jest.fn() };
  const consent = {
    assertCanSend: jest.fn().mockRejectedValue(new WhatsAppConsentBlockedException('opted out')),
  };
  const policy = {
    canSendFreeText: jest.fn().mockReturnValue({ allowed: true }),
    canSendTemplate: jest.fn(),
  };
  const templates = { sendTemplateMessage: jest.fn() };
  const audit = { record: jest.fn() };

  it('booking reminder requires consent', async () => {
    const service = new WhatsAppBookingReminderService(
      prisma as any,
      bookings as any,
      documentBundle as any,
      damages as any,
      provider as any,
      consent as any,
      policy as any,
      templates as any,
      audit as any,
    );

    await expect(service.sendPickupReminderWhatsApp('org-1', 'bk-1')).rejects.toBeInstanceOf(
      WhatsAppConsentBlockedException,
    );
  });

  it('missing documents reminder uses document source', async () => {
    documentBundle.getBundleView.mockResolvedValue({
      missingLegalDocuments: ['TERMS_AND_CONDITIONS'],
      legal: { missing: [] },
    });
    consent.assertCanSend.mockRejectedValue(new WhatsAppConsentBlockedException('opted out'));

    const service = new WhatsAppBookingReminderService(
      prisma as any,
      bookings as any,
      documentBundle as any,
      damages as any,
      provider as any,
      consent as any,
      policy as any,
      templates as any,
      audit as any,
    );

    await expect(
      service.sendMissingDocumentsReminderWhatsApp('org-1', 'bk-1'),
    ).rejects.toBeInstanceOf(WhatsAppConsentBlockedException);

    expect(documentBundle.getBundleView).toHaveBeenCalledWith('org-1', 'bk-1');
  });
});
