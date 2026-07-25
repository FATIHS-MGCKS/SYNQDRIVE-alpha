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
import { BookingEligibilityGatekeeperService } from './booking-eligibility-gatekeeper/booking-eligibility-gatekeeper.service';
import { BookingEligibilityEnforcementService } from './booking-eligibility-gatekeeper/booking-eligibility-enforcement.service';
import { BookingEligibilityAuditLogger } from './booking-eligibility-gatekeeper/booking-eligibility-audit.logger';
import { BookingEligibilityApprovalService } from './booking-eligibility-approval/booking-eligibility-approval.service';
import { BookingEligibilityDecisionService } from './booking-eligibility-decision/booking-eligibility-decision.service';
import { BookingEligibilityRecheckService } from './booking-eligibility-recheck/booking-eligibility-recheck.service';
import { BookingEligibilityRecheckSchedulerService } from './booking-eligibility-recheck/booking-eligibility-recheck.scheduler.service';
import { VehicleBookingContextService } from './vehicle-booking-context/vehicle-booking-context.service';
import { OperatorUploadModule } from '@modules/operator-upload/operator-upload.module';
import { TechnicalObservationsModule } from '@modules/technical-observations/technical-observations.module';
import { BookingsHandoverSessionService } from './handover-session/bookings-handover-session.service';
import { CompletePickupHandoverService } from './handover-session/complete-pickup-handover.service';
import { CompleteReturnHandoverService } from './handover-session/complete-return-handover.service';
import { CorrectHandoverCompletionService } from './handover-session/correct-handover-completion.service';
import { HandoverCompletionRecordQueryService } from './handover-session/handover-completion-record-query.service';
import { BookingsHandoverDraftService } from './handover-session/bookings-handover-draft.service';

@Module({
  imports: [
    RentalDrivingAnalysisModule,
    forwardRef(() => InvoicesModule),
    forwardRef(() => RentalHealthModule),
    forwardRef(() => DocumentsModule),
    BookingPickupGateModule,
    TasksModule,
    forwardRef(() => CustomersModule),
    CustomerVerificationModule,
    WorkflowsModule,
    PricingModule,
    DepositResolverModule,
    StationsModule,
    RentalRulesModule,
    OutboundEmailModule,
    forwardRef(() => PaymentsModule),
    forwardRef(() => VehiclesModule),
    ActivityLogModule,
    OperatorUploadModule,
    TechnicalObservationsModule,
  ],
  controllers: [BookingsController],
  providers: [
    BookingsService,
    BookingsHandoverService,
    BookingsHandoverSessionService,
    CompletePickupHandoverService,
    CompleteReturnHandoverService,
    CorrectHandoverCompletionService,
    HandoverCompletionRecordQueryService,
    BookingsHandoverDraftService,
    VehicleBookingContextService,
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
  ],
  exports: [
    BookingsService,
    BookingsHandoverService,
    BookingsHandoverSessionService,
    CompletePickupHandoverService,
    CompleteReturnHandoverService,
    CorrectHandoverCompletionService,
    HandoverCompletionRecordQueryService,
    BookingsHandoverDraftService,
    BookingRentalEligibilityService,
    BookingEligibilityGatekeeperService,
    BookingEligibilityEnforcementService,
    BookingWizardDraftService,
    BookingAllowedDriversService,
    BookingEligibilityApprovalService,
    BookingEligibilityDecisionService,
    BookingEligibilityRecheckService,
    BookingEligibilityRecheckSchedulerService,
    VehicleBookingContextService,
  ],
  exports: [BookingsService],
})
export class BookingsModule {}
