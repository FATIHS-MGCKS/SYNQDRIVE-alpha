import { Module } from '@nestjs/common';
import { PrismaModule } from '@shared/database/prisma.module';
import { OrganizationPaymentAccountRepository } from './repositories/organization-payment-account.repository';
import { BookingPaymentRequestRepository } from './repositories/booking-payment-request.repository';
import { PaymentTransactionRepository } from './repositories/payment-transaction.repository';
import { StripeConnectWebhookEventRepository } from './repositories/stripe-connect-webhook-event.repository';

@Module({
  imports: [PrismaModule],
  providers: [
    OrganizationPaymentAccountRepository,
    BookingPaymentRequestRepository,
    PaymentTransactionRepository,
    StripeConnectWebhookEventRepository,
  ],
  exports: [
    OrganizationPaymentAccountRepository,
    BookingPaymentRequestRepository,
    PaymentTransactionRepository,
    StripeConnectWebhookEventRepository,
  ],
})
export class PaymentsModule {}
