import { GUARDS_METADATA } from '@nestjs/common/constants';
import { BookingPaymentRequestController } from './booking-payment-request.controller';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { PaymentsFeatureGuard } from './guards/payments-feature.guard';
import { PaymentsPermissionGuard } from './guards/payments-permission.guard';
import { PAYMENT_PERMISSION_KEY } from './decorators/require-payment-permission.decorator';
import { CreateBookingPaymentRequestDto } from './dto/booking-payment-request.dto';

describe('BookingPaymentRequestController', () => {
  it('uses org-scoped booking payment-requests route', () => {
    const path = Reflect.getMetadata('path', BookingPaymentRequestController);
    expect(path).toBe('organizations/:orgId/bookings/:bookingId/payment-requests');
  });

  it('applies payment guards', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, BookingPaymentRequestController);
    expect(guards).toEqual(
      expect.arrayContaining([OrgScopingGuard, PaymentsFeatureGuard, PaymentsPermissionGuard]),
    );
  });

  it('requires payments.create permission', () => {
    const handler = BookingPaymentRequestController.prototype.createPaymentRequest;
    expect(Reflect.getMetadata(PAYMENT_PERMISSION_KEY, handler)).toBe('payments.create');
  });
});

describe('CreateBookingPaymentRequestDto', () => {
  it('does not define client amount fields', () => {
    const keys = Object.keys(new CreateBookingPaymentRequestDto());
    expect(keys).not.toContain('amountCents');
    expect(keys).not.toContain('totalDueNowCents');
    expect(keys).not.toContain('applicationFeeAmountCents');
  });
});
