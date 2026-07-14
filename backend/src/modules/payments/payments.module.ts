import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '@shared/database/prisma.module';
import { InvoicesModule } from '@modules/invoices/invoices.module';
import { ConnectPaymentAuditService } from './audit/connect-payment-audit.service';
import { PaymentConnectReconciliationService } from './payment-connect-reconciliation.service';
import { PaymentMetricsService } from './observability/payment-metrics.service';
import { PaymentsConnectController } from './payments-connect.controller';
import { BookingPaymentRequestController } from './booking-payment-request.controller';
import { OrganizationPaymentRequestController } from './organization-payment-request.controller';
import { BookingPaymentRefundService } from './booking-payment-refund.service';
import { BookingPaymentRequestService } from './booking-payment-request.service';
import { BookingPaymentCardService } from './booking-payment-card.service';
import { StripeCheckoutService } from './stripe-checkout.service';
import { PaymentStatusService } from './payment-status.service';
import { PaymentsAccessService } from './payments-access.service';
import { PaymentPolicyService } from './payment-policy.service';
import { PaymentFeeService } from './payment-fee.service';
import { PaymentsFeatureGuard } from './guards/payments-feature.guard';
import { PaymentsPermissionGuard } from './guards/payments-permission.guard';
import { OrganizationPaymentAccountRepository } from './repositories/organization-payment-account.repository';
import { BookingPaymentRequestRepository } from './repositories/booking-payment-request.repository';
import { PaymentTransactionRepository } from './repositories/payment-transaction.repository';
import { StripeConnectWebhookController } from './stripe-connect-webhook.controller';
import { StripeConnectWebhookService } from './stripe-connect-webhook.service';
import { StripeConnectWebhookProcessorService } from './stripe-connect-webhook.processor';
import { PaymentReconciliationService } from './payment-reconciliation.service';
import { PaymentConfirmationNotifierService } from './payment-confirmation-notifier.service';
import { PaymentDisputeNotifierService } from './payment-dispute-notifier.service';
import { PaymentEmailModule } from './email/payment-email.module';
import { PaymentEmailProcessorService } from './email/payment-email-processor.service';
import { PaymentEmailResendService } from './email/payment-email-resend.service';
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
  imports: [PrismaModule, ConfigModule, InvoicesModule, PaymentEmailModule],
  controllers: [
    PaymentsConnectController,
    BookingPaymentRequestController,
    OrganizationPaymentRequestController,
    StripeConnectWebhookController,
  ],
  providers: [
    PaymentStatusService,
    PaymentsAccessService,
    PaymentPolicyService,
    PaymentFeeService,
    BookingPaymentRequestService,
    BookingPaymentRefundService,
    BookingPaymentCardService,
    StripeCheckoutService,
    StripeConnectWebhookService,
    StripeConnectWebhookProcessorService,
    PaymentReconciliationService,
    PaymentConnectReconciliationService,
    PaymentMetricsService,
    ConnectPaymentAuditService,
    PaymentConfirmationNotifierService,
    PaymentDisputeNotifierService,
    PaymentEmailProcessorService,
    PaymentEmailResendService,
    PaymentsFeatureGuard,
    PaymentsPermissionGuard,
    OrganizationPaymentAccountRepository,
    OrganizationPaymentAccountService,
    StripeConnectAccountService,
    BookingPaymentRequestService,
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
    BookingPaymentRequestService,
    BookingPaymentRefundService,
    BookingPaymentCardService,
    StripeCheckoutService,
    StripeConnectWebhookService,
    PaymentReconciliationService,
    PaymentConnectReconciliationService,
    PaymentMetricsService,
    ConnectPaymentAuditService,
    PaymentEmailProcessorService,
    PaymentEmailModule,
    stripeConnectAdapterProvider,
  ],
})
export class PaymentsModule {}
