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
import { OrganizationPaymentAccountService } from './organization-payment-account.service';
import { StripeConnectAccountService } from './stripe-connect-account.service';
import { StripeConnectV1Adapter } from './stripe/stripe-connect-v1.adapter';
import { StripeConnectV2Adapter } from './stripe/stripe-connect-v2.adapter';
import {
  StripeConnectAdapterFactory,
  stripeConnectAdapterProvider,
} from './stripe/stripe-connect-adapter.factory';

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
    OrganizationPaymentAccountService,
    StripeConnectAccountService,
    StripeConnectV1Adapter,
    StripeConnectV2Adapter,
    StripeConnectAdapterFactory,
    stripeConnectAdapterProvider,
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
    OrganizationPaymentAccountService,
    StripeConnectAccountService,
    stripeConnectAdapterProvider,
  ],
})
export class PaymentsModule {}
