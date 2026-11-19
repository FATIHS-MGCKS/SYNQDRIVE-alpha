import { WhatsAppAiToolsService } from './whatsapp-ai-tools.service';
import type { WhatsAppBookingOperationalReadPort } from './ports/whatsapp-booking-operational-read.port';
import type { WhatsAppAiContextSnapshot } from './whatsapp-ai.types';

describe('WhatsAppAiToolsService — booking operational port', () => {
  const bookingRead: WhatsAppBookingOperationalReadPort = {
    getOperationalRead: jest.fn(),
  };

  const service = new WhatsAppAiToolsService(
    { vehicle: { findFirst: jest.fn() } } as never,
    bookingRead,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );

  const ctx = {
    booking: { id: 'b1' },
  } as WhatsAppAiContextSnapshot;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('getBookingSummary forwards org and booking id', async () => {
    (bookingRead.getOperationalRead as jest.Mock).mockResolvedValue({
      core: {
        bookingNumber: 'BN-9',
        status: 'ACTIVE',
        startDate: '2026-03-01',
        endDate: '2026-03-05',
        pickupStationName: 'Berlin',
      },
      vehicle: { displayName: 'Tesla' },
      stations: { pickup: null, return: null },
    });
    const result = await service.getBookingSummary('org-1', ctx);
    expect(bookingRead.getOperationalRead).toHaveBeenCalledWith('org-1', 'b1');
    expect(result.ok).toBe(true);
    expect(result.summary).toContain('BN-9');
  });

  it('getPaymentDepositStatus preserves nullable finance', async () => {
    (bookingRead.getOperationalRead as jest.Mock).mockResolvedValue({
      finance: { depositStatus: null, paymentStatus: null },
      customer: { openInvoiceCount: 0 },
    });
    const result = await service.getPaymentDepositStatus('org-1', ctx);
    expect(result.ok).toBe(false);
  });
});