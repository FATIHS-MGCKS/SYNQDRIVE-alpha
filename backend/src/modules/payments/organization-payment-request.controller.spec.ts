import { GUARDS_METADATA } from '@nestjs/common/constants';
import { OrganizationPaymentRequestController } from './organization-payment-request.controller';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { PaymentsFeatureGuard } from './guards/payments-feature.guard';
import { PaymentsPermissionGuard } from './guards/payments-permission.guard';
import { PAYMENT_PERMISSION_KEY } from './decorators/require-payment-permission.decorator';
import { CreateBookingPaymentRefundDto } from './dto/create-booking-payment-refund.dto';

describe('OrganizationPaymentRequestController', () => {
  it('uses org-scoped payment-requests refund route', () => {
    const path = Reflect.getMetadata('path', OrganizationPaymentRequestController);
    expect(path).toBe('organizations/:orgId/payment-requests');
  });

  it('applies payment guards', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, OrganizationPaymentRequestController);
    expect(guards).toEqual(
      expect.arrayContaining([OrgScopingGuard, PaymentsFeatureGuard, PaymentsPermissionGuard]),
    );
  });

  it('requires payments.refund permission', () => {
    const handler = OrganizationPaymentRequestController.prototype.refundPaymentRequest;
    expect(Reflect.getMetadata(PAYMENT_PERMISSION_KEY, handler)).toBe('payments.refund');
  });
});

describe('CreateBookingPaymentRefundDto', () => {
  it('does not define client currency field', () => {
    const keys = Object.keys(new CreateBookingPaymentRefundDto());
    expect(keys).not.toContain('currency');
  });
});
