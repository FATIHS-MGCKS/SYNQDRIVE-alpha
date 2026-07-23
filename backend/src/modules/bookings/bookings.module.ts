import { Module, forwardRef } from '@nestjs/common';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';
import { BookingsHandoverService } from './bookings-handover.service';
import { RentalDrivingAnalysisModule } from '../rental-driving-analysis/rental-driving-analysis.module';
import { InvoicesModule } from '@modules/invoices/invoices.module';
import { RentalHealthModule } from '@modules/rental-health/rental-health.module';
import { DocumentsModule } from '@modules/documents/documents.module';
import { TasksModule } from '@modules/tasks/tasks.module';
import { CustomersModule } from '@modules/customers/customers.module';
import { WorkflowsModule } from '@modules/workflows/workflows.module';
import { PricingModule } from '@modules/pricing/pricing.module';
import { StationsModule } from '@modules/stations/stations.module';
import { RentalRulesModule } from '@modules/rental-rules/rental-rules.module';
import { OutboundEmailModule } from '@modules/outbound-email/outbound-email.module';
import { CustomerVerificationModule } from '@modules/customer-verification/customer-verification.module';
import { PaymentsModule } from '@modules/payments/payments.module';
import { BookingRentalEligibilityService } from './booking-rental-eligibility.service';
import { BookingWizardDraftService } from './booking-wizard-draft.service';
import { BookingWizardCheckoutContextService } from './booking-wizard-checkout-context.service';
import { BookingWizardPaymentFlowService } from './booking-wizard-payment-flow.service';
import { DepositResolverModule } from '@modules/deposit/deposit-resolver.module';
import { ActivityLogModule } from '@modules/activity-log/activity-log.module';
import { VehiclesModule } from '@modules/vehicles/vehicles.module';
import { BookingAllowedDriversService } from './booking-allowed-drivers/booking-allowed-drivers.service';
import { BookingPickupGateModule } from './booking-pickup-gate/booking-pickup-gate.module';
import { BookingLegalAcceptanceModule } from './legal-acceptance/booking-legal-acceptance.module';
import { BookingLegalConfirmationModule } from './legal-confirmation/booking-legal-confirmation.module';
import { BookingHandoverSignatureModule } from './signature/booking-handover-signature.module';
import { BookingDetailProjectionService } from './read-model/booking-detail-projection.service';
import { BookingReadContextService } from './read-model/booking-read-context.service';
import { BookingTimelineAssemblerService } from './read-model/booking-timeline-assembler.service';
import { BookingEligibilityGatekeeperService } from './booking-eligibility-gatekeeper/booking-eligibility-gatekeeper.service';
import { BookingEligibilityEnforcementService } from './booking-eligibility-gatekeeper/booking-eligibility-enforcement.service';
import { BookingEligibilityAuditLogger } from './booking-eligibility-gatekeeper/booking-eligibility-audit.logger';
import { BookingEligibilityApprovalService } from './booking-eligibility-approval/booking-eligibility-approval.service';
import { BookingEligibilityDecisionService } from './booking-eligibility-decision/booking-eligibility-decision.service';
import { BookingEligibilityRecheckService } from './booking-eligibility-recheck/booking-eligibility-recheck.service';
import { BookingEligibilityRecheckSchedulerService } from './booking-eligibility-recheck/booking-eligibility-recheck.scheduler.service';

@Module({
  imports: [
    RentalDrivingAnalysisModule,
    forwardRef(() => InvoicesModule),
    forwardRef(() => RentalHealthModule),
    forwardRef(() => DocumentsModule),
    BookingPickupGateModule,
    BookingLegalAcceptanceModule,
    BookingLegalConfirmationModule,
    BookingHandoverSignatureModule,
    TasksModule,
    CustomersModule,
    CustomerVerificationModule,
    WorkflowsModule,
    PricingModule,
    DepositResolverModule,
    StationsModule,
    RentalRulesModule,
    OutboundEmailModule,
    forwardRef(() => PaymentsModule),
    VehiclesModule,
    ActivityLogModule,
  ],
  controllers: [BookingsController],
  providers: [
    BookingsService,
    BookingsHandoverService,
    BookingAllowedDriversService,
    BookingRentalEligibilityService,
    BookingEligibilityGatekeeperService,
    BookingEligibilityEnforcementService,
    BookingEligibilityAuditLogger,
    BookingEligibilityApprovalService,
    BookingEligibilityDecisionService,
    BookingEligibilityRecheckService,
    BookingEligibilityRecheckSchedulerService,
    BookingWizardDraftService,
    BookingWizardCheckoutContextService,
    BookingWizardPaymentFlowService,
    BookingDetailProjectionService,
    BookingReadContextService,
    BookingTimelineAssemblerService,
  ],
  exports: [
    BookingsService,
    BookingsHandoverService,
    BookingRentalEligibilityService,
    BookingEligibilityGatekeeperService,
    BookingEligibilityEnforcementService,
    BookingWizardDraftService,
    BookingAllowedDriversService,
    BookingEligibilityApprovalService,
    BookingEligibilityDecisionService,
    BookingEligibilityRecheckService,
    BookingEligibilityRecheckSchedulerService,
    BookingReadContextService,
    BookingTimelineAssemblerService,
  ],
})
export class BookingsModule {}
