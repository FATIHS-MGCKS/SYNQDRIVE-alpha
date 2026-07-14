import { Module } from '@nestjs/common';
import { PrismaModule } from '@shared/database/prisma.module';
import { PaymentStatusService } from './payment-status.service';
import { PaymentsAccessService } from './payments-access.service';
import { PaymentsFeatureGuard } from './guards/payments-feature.guard';
import { PaymentsPermissionGuard } from './guards/payments-permission.guard';
import { OrganizationPaymentAccountRepository } from './repositories/organization-payment-account.repository';
import { BookingPaymentRequestRepository } from './repositories/booking-payment-request.repository';
import { PaymentTransactionRepository } from './repositories/payment-transaction.repository';
import { StripeConnectWebhookEventRepository } from './repositories/stripe-connect-webhook-event.repository';

@Module({
  imports: [PrismaModule],
  providers: [
    PaymentStatusService,
    PaymentsAccessService,
    PaymentsFeatureGuard,
    PaymentsPermissionGuard,
    OrganizationPaymentAccountRepository,
    BookingPaymentRequestRepository,
    PaymentTransactionRepository,
    StripeConnectWebhookEventRepository,
  ],
  exports: [
    PaymentStatusService,
    PaymentsAccessService,
    PaymentsFeatureGuard,
    PaymentsPermissionGuard,
    OrganizationPaymentAccountRepository,
    BookingPaymentRequestRepository,
    PaymentTransactionRepository,
    StripeConnectWebhookEventRepository,
  ],
})
export class PaymentsModule {}
