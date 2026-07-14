import { BookingWizardPaymentFlowService } from './booking-wizard-payment-flow.service';

describe('BookingWizardPaymentFlowService', () => {
  const bookingPaymentRequestService = {
    createRentalPaymentRequest: jest.fn(),
  };

  const stripeCheckoutService = {
    createCheckoutSessionForPaymentRequest: jest.fn(),
  };

  const paymentEmailEnqueue = {
    maybeEnqueueAfterCheckout: jest.fn(),
    isEnabled: jest.fn(),
  };

  const service = new BookingWizardPaymentFlowService(
    bookingPaymentRequestService as never,
    stripeCheckoutService as never,
    paymentEmailEnqueue as never,
  );

  const actor = { id: 'user-1', organizationId: 'org-1' };

  beforeEach(() => {
    jest.clearAllMocks();
    bookingPaymentRequestService.createRentalPaymentRequest.mockResolvedValue({
      request: { id: 'pr-1' },
    });
    stripeCheckoutService.createCheckoutSessionForPaymentRequest.mockResolvedValue({
      checkoutUrl: 'https://checkout.stripe.test/session',
    });
    paymentEmailEnqueue.isEnabled.mockReturnValue(true);
    paymentEmailEnqueue.maybeEnqueueAfterCheckout.mockResolvedValue('outbox-1');
  });

  it('creates payment request, checkout and queues email without marking paid', async () => {
    const result = await service.executePaymentLinkFlow({
      organizationId: 'org-1',
      bookingId: 'bk-1',
      actor,
      recipientEmail: 'customer@example.com',
    });

    expect(result.bookingConfirmed).toBe(true);
    expect(result.paymentRequestCreated).toBe(true);
    expect(result.checkoutCreated).toBe(true);
    expect(result.emailQueued).toBe(true);
    expect(result.partialFailures).toHaveLength(0);
    expect(bookingPaymentRequestService.createRentalPaymentRequest).toHaveBeenCalled();
    expect(stripeCheckoutService.createCheckoutSessionForPaymentRequest).toHaveBeenCalled();
  });

  it('returns partial failure when checkout fails but keeps payment request', async () => {
    stripeCheckoutService.createCheckoutSessionForPaymentRequest.mockRejectedValue(
      new Error('Checkout unavailable'),
    );

    const result = await service.executePaymentLinkFlow({
      organizationId: 'org-1',
      bookingId: 'bk-1',
      actor,
    });

    expect(result.paymentRequestCreated).toBe(true);
    expect(result.checkoutCreated).toBe(false);
    expect(result.emailQueued).toBe(false);
    expect(result.partialFailures).toEqual([
      expect.objectContaining({ step: 'checkout', message: 'Checkout unavailable' }),
    ]);
  });

  it('returns partial failure when email enqueue fails', async () => {
    paymentEmailEnqueue.maybeEnqueueAfterCheckout.mockRejectedValue(new Error('SMTP down'));

    const result = await service.executePaymentLinkFlow({
      organizationId: 'org-1',
      bookingId: 'bk-1',
      actor,
    });

    expect(result.paymentRequestCreated).toBe(true);
    expect(result.checkoutCreated).toBe(true);
    expect(result.emailQueued).toBe(false);
    expect(result.partialFailures).toEqual([
      expect.objectContaining({ step: 'email', message: 'SMTP down' }),
    ]);
  });

  it('returns early when payment request creation fails', async () => {
    bookingPaymentRequestService.createRentalPaymentRequest.mockRejectedValue(
      new Error('No pricing snapshot'),
    );

    const result = await service.executePaymentLinkFlow({
      organizationId: 'org-1',
      bookingId: 'bk-1',
      actor,
    });

    expect(result.paymentRequestCreated).toBe(false);
    expect(result.checkoutCreated).toBe(false);
    expect(result.partialFailures).toEqual([
      expect.objectContaining({ step: 'payment_request' }),
    ]);
    expect(stripeCheckoutService.createCheckoutSessionForPaymentRequest).not.toHaveBeenCalled();
  });
});
