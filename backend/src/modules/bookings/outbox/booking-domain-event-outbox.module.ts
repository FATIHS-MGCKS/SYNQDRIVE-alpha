import { Module } from '@nestjs/common';
import { WorkflowsModule } from '@modules/workflows/workflows.module';
import { InvoicesModule } from '@modules/invoices/invoices.module';
import { DocumentsModule } from '@modules/documents/documents.module';
import { TasksModule } from '@modules/tasks/tasks.module';
import { NotificationsModule } from '@modules/notifications/notifications.module';
import { OutboundEmailModule } from '@modules/outbound-email/outbound-email.module';
import { PaymentsModule } from '@modules/payments/payments.module';
import { BookingDomainEventOutboxCoreModule } from './booking-domain-event-outbox-core.module';
import { BookingDomainEventConsumerService } from './booking-domain-event-consumer.service';
import { BookingDomainEventOutboxProcessorService } from './booking-domain-event-outbox-processor.service';
import { BookingDomainEventConsumerRouterService } from './consumers/booking-domain-event-consumer-router.service';
import { BookingInvoiceConsumer } from './consumers/booking-invoice.consumer';
import { BookingDocumentBundleConsumer } from './consumers/booking-document-bundle.consumer';
import { BookingRentalAgreementConsumer } from './consumers/booking-rental-agreement.consumer';
import { BookingPickupReturnTaskConsumer } from './consumers/booking-pickup-return-task.consumer';
import { BookingNotificationConsumer } from './consumers/booking-notification.consumer';
import { BookingCustomerEmailConsumer } from './consumers/booking-customer-email.consumer';
import { BookingInternalEmailConsumer } from './consumers/booking-internal-email.consumer';
import { BookingPaymentLinkConsumer } from './consumers/booking-payment-link.consumer';

@Module({
  imports: [
    BookingDomainEventOutboxCoreModule,
    WorkflowsModule,
    InvoicesModule,
    DocumentsModule,
    TasksModule,
    NotificationsModule,
    OutboundEmailModule,
    PaymentsModule,
  ],
  providers: [
    BookingDomainEventConsumerService,
    BookingDomainEventOutboxProcessorService,
    BookingDomainEventConsumerRouterService,
    BookingInvoiceConsumer,
    BookingDocumentBundleConsumer,
    BookingRentalAgreementConsumer,
    BookingPickupReturnTaskConsumer,
    BookingNotificationConsumer,
    BookingCustomerEmailConsumer,
    BookingInternalEmailConsumer,
    BookingPaymentLinkConsumer,
  ],
  exports: [
    BookingDomainEventOutboxCoreModule,
    BookingDomainEventConsumerService,
    BookingDomainEventOutboxProcessorService,
    BookingDomainEventConsumerRouterService,
  ],
})
export class BookingDomainEventOutboxModule {}
