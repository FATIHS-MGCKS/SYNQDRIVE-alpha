import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '@shared/database/prisma.module';
import { PaymentStatusService } from './payment-status.service';
import { PaymentsAccessService } from './payments-access.service';
import { PaymentPolicyService } from './payment-policy.service';
import { PaymentFeeService } from './payment-fee.service';
import { PaymentsFeatureGuard } from './guards/payments-feature.guard';
import { PaymentsPermissionGuard } from './guards/payments-permission.guard';
import { OrganizationPaymentAccountRepository } from './repositories/organization-payment-account.repository';
import { BookingPaymentRequestRepository } from './repositories/booking-payment-request.repository';
import { PaymentTransactionRepository } from './repositories/payment-transaction.repository';
import { StripeConnectWebhookEventRepository } from './repositories/stripe-connect-webhook-event.repository';

@Module({
  imports: [PrismaModule, ConfigModule],
  providers: [
    PaymentStatusService,
    PaymentsAccessService,
    PaymentPolicyService,
    PaymentFeeService,
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
    PaymentPolicyService,
    PaymentFeeService,
    PaymentsFeatureGuard,
    PaymentsPermissionGuard,
    OrganizationPaymentAccountRepository,
    BookingPaymentRequestRepository,
    PaymentTransactionRepository,
    StripeConnectWebhookEventRepository,
  ],
})
export class PaymentsModule {}
