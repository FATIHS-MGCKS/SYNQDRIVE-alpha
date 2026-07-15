import { Module } from '@nestjs/common';
import { OutboundEmailModule } from '@modules/outbound-email/outbound-email.module';
import { BillingController } from './billing.controller';
import { StripeWebhookController } from './stripe-webhook.controller';
import { BillingService } from './billing.service';
import { PricebookService } from './pricebook.service';
import { BillingUsageService } from './billing-usage.service';
import { BillingAuditService } from './billing-audit.service';
import { BillableVehiclesService } from './billable-vehicles.service';
import { BillingPriceResolutionService } from './billing-price-resolution.service';
import { BillingSummaryService } from './billing-summary.service';
import { TenantSubscriptionOverviewService } from './tenant-subscription-overview.service';
import { TenantBillingInvoicesService } from './tenant-billing-invoices.service';
import { TenantBillingPaymentsService } from './tenant-billing-payments.service';
import { TenantBillingPaymentMethodsService } from './tenant-billing-payment-methods.service';
import { TenantBillingVehicleLicensesService } from './tenant-billing-vehicle-licenses.service';
import { TenantBillingTariffService } from './tenant-billing-tariff.service';
import { TenantBillableVehiclesListService } from './tenant-billable-vehicles-list.service';
import { TenantVehicleBillingChangesService } from './tenant-vehicle-billing-changes.service';
import { TenantBillingPaymentsListService } from './tenant-billing-payments-list.service';
import { TenantBillingContractHistoryService } from './tenant-billing-contract-history.service';
import { TenantBillingEmailHistoryService } from './tenant-billing-email-history.service';
import { BillingAdminService } from './billing-admin.service';
import { StripePreparedService } from './stripe-prepared.service';
import { StripeBillingService } from './stripe-billing.service';
import { StripeInvoiceMirrorService } from './stripe-invoice-mirror.service';
import { StripeWebhookService } from './stripe-webhook.service';
import { StripeBillingAdapter } from './adapters/stripe-billing.adapter';
import { BillingEventPublisher } from './events/billing-event.publisher';
import { BillingStripeSyncListenerService } from './events/billing-stripe-sync.listener.service';
import {
  DiscountResolverService,
  EntitlementResolverService,
  InvoiceResolverService,
  PricingResolverService,
  QuantityResolverService,
  SubscriptionResolverService,
} from './resolvers';
import { BillingLegacyBackfillService } from './migration/billing-legacy-backfill.service';
import { SubscriptionPricePreviewService } from './subscription-price-preview.service';
import { BillingQuantityService } from './billing-quantity.service';
import { BillingQuantityVehicleIntegration } from './billing-quantity-vehicle.integration';
import { BillingPeriodResolverService } from './billing-period-resolver.service';
import { UsageSnapshotService } from './usage-snapshot.service';
import { SubscriptionLifecycleService } from './subscription-lifecycle.service';
import { MasterSubscriptionController } from './master-subscription.controller';
import { BillingSubscriptionAdminService } from './billing-subscription-admin.service';
import { BillingCommandService } from './billing-command.service';
import { BillingCommandOrchestratorService } from './billing-command-orchestrator.service';
import { BillingDomainEventOutboxService } from './billing-domain-event-outbox.service';
import { BillingDomainEventOutboxRepository } from './billing-domain-event-outbox.repository';
import { BillingDomainEventOutboxProcessorService } from './billing-domain-event-outbox.processor.service';
import { BillingDomainEventOutboxWorkerService } from './billing-domain-event-outbox.worker.service';
import { BillingEmailContextService } from './email/billing-email-context.service';
import { BillingEmailSenderService } from './email/billing-email-sender.service';
import { BillingDomainEventEmailProcessorService } from './email/billing-domain-event-email.processor.service';
import { BillingDomainEventEmailWorkerService } from './email/billing-domain-event-email.worker.service';
import { BillingEmailRecipientService } from './email/billing-email-recipient.service';
import { BillingEmailSuppressionService } from './email/billing-email-suppression.service';
import { BillingEmailDeliveryAuditService } from './email/billing-email-delivery-audit.service';
import { BillingEmailResendService } from './email/billing-email-resend.service';
import { BillingEmailDeliveryController } from './email/billing-email-delivery.controller';
import { BillingEntitlementResolver } from './billing-entitlement-resolver.service';
import { StripeCatalogMappingService } from './stripe-catalog-mapping.service';
import { StripeCatalogMappingController } from './stripe-catalog-mapping.controller';
import { StripeCatalogSyncService } from './stripe-catalog-sync.service';
import { StripeSubscriptionOrchestratorService } from './stripe-subscription-orchestrator.service';
import { StripePaymentMethodService } from './stripe-payment-method.service';
import { StripeWebhookDispatcherService } from './stripe-webhook-dispatcher.service';
import { StripePaymentLedgerService } from './stripe-payment-ledger.service';
import { BillingPaymentLedgerService } from './billing-payment-ledger.service';
import { BillingManualPaymentService } from './billing-manual-payment.service';
import { BillingReconciliationService } from './billing-reconciliation.service';
import { BillingMonitoringService } from './billing-monitoring.service';
import { StripeWebhookProcessorService } from './stripe-webhook.processor';

@Module({
  imports: [OutboundEmailModule],
  controllers: [BillingController, StripeWebhookController, MasterSubscriptionController, StripeCatalogMappingController, BillingEmailDeliveryController],
  providers: [
    BillingService,
    PricebookService,
    BillingUsageService,
    BillingAuditService,
    BillableVehiclesService,
    BillingPriceResolutionService,
    BillingSummaryService,
    TenantSubscriptionOverviewService,
    TenantBillingInvoicesService,
    TenantBillingPaymentsService,
    TenantBillingPaymentMethodsService,
    TenantBillingVehicleLicensesService,
    TenantBillingTariffService,
    TenantBillableVehiclesListService,
    TenantVehicleBillingChangesService,
    TenantBillingPaymentsListService,
    TenantBillingContractHistoryService,
    TenantBillingEmailHistoryService,
    BillingAdminService,
    StripeBillingService,
    StripeInvoiceMirrorService,
    StripeWebhookService,
    StripePreparedService,
    SubscriptionResolverService,
    PricingResolverService,
    QuantityResolverService,
    DiscountResolverService,
    InvoiceResolverService,
    EntitlementResolverService,
    StripeBillingAdapter,
    BillingEventPublisher,
    BillingStripeSyncListenerService,
    BillingLegacyBackfillService,
    SubscriptionPricePreviewService,
    BillingQuantityService,
    BillingQuantityVehicleIntegration,
    BillingPeriodResolverService,
    UsageSnapshotService,
    SubscriptionLifecycleService,
    BillingSubscriptionAdminService,
    BillingCommandService,
    BillingCommandOrchestratorService,
    BillingDomainEventOutboxService,
    BillingDomainEventOutboxRepository,
    BillingDomainEventOutboxProcessorService,
    BillingDomainEventOutboxWorkerService,
    BillingEmailContextService,
    BillingEmailSenderService,
    BillingEmailRecipientService,
    BillingEmailSuppressionService,
    BillingEmailDeliveryAuditService,
    BillingEmailResendService,
    BillingDomainEventEmailProcessorService,
    BillingDomainEventEmailWorkerService,
    BillingEntitlementResolver,
    StripeCatalogMappingService,
    StripeCatalogSyncService,
    StripeSubscriptionOrchestratorService,
    StripePaymentMethodService,
    StripeWebhookDispatcherService,
    BillingPaymentLedgerService,
    BillingManualPaymentService,
    BillingReconciliationService,
    BillingMonitoringService,
    StripePaymentLedgerService,
    StripeWebhookProcessorService,
  ],
  exports: [
    BillingService,
    PricebookService,
    BillingUsageService,
    BillingAuditService,
    BillableVehiclesService,
    BillingPriceResolutionService,
    BillingSummaryService,
    TenantSubscriptionOverviewService,
    TenantBillingInvoicesService,
    TenantBillingPaymentsService,
    TenantBillingPaymentMethodsService,
    TenantBillingVehicleLicensesService,
    TenantBillingTariffService,
    TenantBillableVehiclesListService,
    TenantVehicleBillingChangesService,
    TenantBillingPaymentsListService,
    TenantBillingContractHistoryService,
    TenantBillingEmailHistoryService,
    BillingAdminService,
    StripeBillingService,
    StripeInvoiceMirrorService,
    StripeWebhookService,
    StripePreparedService,
    SubscriptionResolverService,
    PricingResolverService,
    QuantityResolverService,
    DiscountResolverService,
    InvoiceResolverService,
    EntitlementResolverService,
    StripeBillingAdapter,
    BillingEventPublisher,
    BillingStripeSyncListenerService,
    BillingLegacyBackfillService,
    SubscriptionPricePreviewService,
    BillingQuantityService,
    BillingQuantityVehicleIntegration,
    BillingPeriodResolverService,
    UsageSnapshotService,
    SubscriptionLifecycleService,
    BillingSubscriptionAdminService,
    BillingCommandService,
    BillingCommandOrchestratorService,
    BillingDomainEventOutboxService,
    BillingDomainEventOutboxRepository,
    BillingDomainEventOutboxProcessorService,
    BillingDomainEventOutboxWorkerService,
    BillingEmailContextService,
    BillingEmailSenderService,
    BillingEmailRecipientService,
    BillingEmailSuppressionService,
    BillingEmailDeliveryAuditService,
    BillingEmailResendService,
    BillingDomainEventEmailProcessorService,
    BillingDomainEventEmailWorkerService,
    BillingEntitlementResolver,
    StripeCatalogMappingService,
    StripeCatalogSyncService,
    StripeSubscriptionOrchestratorService,
    StripePaymentMethodService,
    StripeWebhookDispatcherService,
    BillingPaymentLedgerService,
    BillingManualPaymentService,
    BillingReconciliationService,
    BillingMonitoringService,
    StripePaymentLedgerService,
    StripeWebhookProcessorService,
  ],
})
export class BillingModule {}
