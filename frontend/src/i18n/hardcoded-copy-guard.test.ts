import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import inventory from './hardcoded-copy-inventory.json';

const __dirname = dirname(fileURLToPath(import.meta.url));

const P21_ENFORCE_CLEAN_EXACT = [
  'pages/LoginPage.tsx',
  'pages/VerificationDonePage.tsx',
  'i18n/components/LanguageSelector.tsx',
  'App.tsx',
  'rental/components/TopBar.tsx',
  'rental/components/Sidebar.tsx',
  'rental/components/DashboardView.tsx',
];

const P21_ENFORCE_CLEAN_PREFIXES = ['rental/components/dashboard/'];

const P22_ENFORCE_CLEAN_PREFIXES = [
  'rental/components/fleet/',
  'rental/components/fleet-operator/',
  'rental/components/fleet-connectivity/',
  'rental/components/fleet-health-service/',
  'rental/components/vehicle-detail/',
  'rental/components/health/',
  'rental/components/battery/',
  'rental/components/trips/',
  'rental/components/service-center/',
  'rental/components/vehicle-bookings/',
  'rental/components/rental-health/',
  'rental/lib/vehicle-',
  'rental/lib/fleet',
  'rental/lib/health-',
  'rental/lib/tire-',
  'rental/lib/brake-',
  'rental/lib/battery-',
  'rental/lib/service-',
  'rental/lib/rental-health-',
];

const P22_ENFORCE_CLEAN_EXACT = [
  'rental/components/FleetHubView.tsx',
  'rental/components/FleetView.tsx',
  'rental/components/FleetConditionView.tsx',
  'rental/components/FleetConditionDetailView.tsx',
  'rental/components/FleetConditionVirtualizedVehicleRows.tsx',
  'rental/components/FleetMapControls.tsx',
  'rental/components/LiveMapOverview.tsx',
  'rental/components/StatInlineDetail.tsx',
  'rental/components/HealthErrorsView.tsx',
  'rental/components/VehicleBookingsView.tsx',
  'rental/components/VehicleTasksView.tsx',
  'rental/components/VehicleStressPanel.tsx',
  'rental/components/BatteryDataQualityBadge.tsx',
  'rental/components/BatteryConditionBars.tsx',
  'rental/components/DashboardWarningLightsPanel.tsx',
  'rental/components/DashboardWarningLightsQuickView.tsx',
  'rental/rental-health-ui.ts',
  'rental/components/vehicle/vehicle-i18n.ts',
];

const P23_ENFORCE_CLEAN_EXACT = [
  'rental/components/BookingsView.tsx',
  'rental/components/NewBookingView.tsx',
  'rental/components/BookingDocumentsSection.tsx',
  'rental/components/CustomersView.tsx',
  'rental/components/CustomerDetailView.tsx',
  'rental/components/CustomerDetailModal.tsx',
  'rental/components/CustomerDocumentUploadBox.tsx',
];

const P23_ENFORCE_CLEAN_PREFIXES = [
  'rental/components/bookings/',
  'rental/components/booking-detail/',
  'rental/components/new-booking/',
  'rental/components/booking-payment/',
  'rental/components/customer-list/',
  'rental/components/customer-detail/',
  'rental/components/customer-verification/',
  'rental/components/add-customer/',
  'rental/components/customer/',
  'rental/components/bookings-customers/',
  'rental/lib/booking-',
  'rental/lib/bookingHandoverGates.ts',
  'rental/lib/stationBookingUtils.ts',
  'rental/lib/customer-',
  'rental/lib/add-customer-wizard.ts',
];

function isP23EnforceCleanPath(relPath: string): boolean {
  if (P23_ENFORCE_CLEAN_EXACT.includes(relPath)) return true;
  return P23_ENFORCE_CLEAN_PREFIXES.some((prefix) => relPath.startsWith(prefix));
}

const P24_ENFORCE_CLEAN_EXACT = [
  'rental/components/TasksView.tsx',
  'rental/components/SettingsView.tsx',
];

const P24_ENFORCE_CLEAN_PREFIXES = [
  'rental/components/tasks/',
  'rental/components/settings/',
  'rental/components/tasks-settings/',
  'rental/lib/task-list.utils.ts',
  'rental/lib/task-create.utils.ts',
  'rental/lib/tasks-page.utils.ts',
  'rental/lib/task-display.utils.ts',
  'rental/lib/task-create-form.utils.ts',
  'rental/lib/taskBulkActions.utils.ts',
];

function isP24EnforceCleanPath(relPath: string): boolean {
  if (P24_ENFORCE_CLEAN_EXACT.includes(relPath)) return true;
  return P24_ENFORCE_CLEAN_PREFIXES.some((prefix) => relPath.startsWith(prefix));
}

const P25_ENFORCE_CLEAN_EXACT = [
  'rental/components/WorkflowAutomationView.tsx',
];

const P25_ENFORCE_CLEAN_PREFIXES = [
  'rental/components/workflow-automation/',
];

const P26_ENFORCE_CLEAN_PREFIXES = [
  'rental/components/stations/',
];

const P27A_ENFORCE_CLEAN_EXACT = [
  'rental/components/VoiceAssistantView.tsx',
  'rental/components/voice-assistant/VoiceAssistantBuilder.tsx',
  'rental/components/voice-assistant/VoiceConversationsPanel.tsx',
  'rental/components/voice-assistant/VoiceAnalyticsView.tsx',
  'rental/components/voice-assistant/VoicePermissionsMatrix.tsx',
  'rental/components/voice-assistant/VoiceCommandHeader.tsx',
  'rental/components/voice-assistant/VoiceSelectorField.tsx',
  'rental/components/voice-assistant/VoiceLaunchChecklist.tsx',
  'rental/components/voice-assistant/VoiceOnboardingWizard.tsx',
  'rental/components/voice-assistant/VoiceSectionNav.tsx',
];

const P27B_ENFORCE_CLEAN_EXACT = [
  'rental/components/voice-assistant/VoiceTelephonyWizard.tsx',
  'rental/components/voice-assistant/VoiceTestCenter.tsx',
  'rental/components/voice-assistant/voice-test-scenarios.ts',
];

const P28_ENFORCE_CLEAN_EXACT = [
  'rental/components/WhatsAppBusinessView.tsx',
  'rental/components/whatsapp/WhatsAppChatPanel.tsx',
  'rental/components/whatsapp/WhatsAppContextDrawer.tsx',
  'rental/components/whatsapp/WhatsAppConversationInbox.tsx',
  'rental/components/whatsapp/WhatsAppInboxLayout.tsx',
  'rental/components/whatsapp/WhatsAppKpiCards.tsx',
  'rental/components/whatsapp/WhatsAppMessageBubble.tsx',
  'rental/components/whatsapp/WhatsAppMessageComposer.tsx',
  'rental/components/whatsapp/WhatsAppOperationsHeader.tsx',
  'rental/components/whatsapp/WhatsAppOverviewTab.tsx',
  'rental/components/whatsapp/WhatsAppQuickActions.tsx',
  'rental/components/whatsapp/WhatsAppReadinessStrip.tsx',
  'rental/components/whatsapp/WhatsAppSectionNav.tsx',
  'rental/components/whatsapp/WhatsAppSettingsPanel.tsx',
  'rental/components/whatsapp/WhatsAppSetupWizard.tsx',
  'rental/components/whatsapp/WhatsAppTemplateManager.tsx',
  'rental/components/whatsapp/whatsapp.ops.ts',
  'rental/components/whatsapp/whatsapp-i18n.ts',
];

const P29_ENFORCE_CLEAN_EXACT = [
  'rental/components/SupportView.tsx',
  'rental/components/support/SupportCenterHero.tsx',
  'rental/components/support/SupportTicketInbox.tsx',
  'rental/components/support/SupportTicketDetailPanel.tsx',
  'rental/components/support/SupportCreateTicketDialog.tsx',
  'rental/components/support/support-center.utils.ts',
  'rental/components/support/support-i18n.ts',
  'components/support/CreateSupportTicketDialog.tsx',
];

const P210_ENFORCE_CLEAN_EXACT = [
  'master/components/support-ops/support-ops.utils.ts',
  'master/components/support-ops/SupportOpsWorkspace.tsx',
  'master/components/support-ops/SupportOpsInbox.tsx',
  'master/components/support-ops/SupportOpsQueue.tsx',
  'master/components/support-ops/SupportOpsKpis.tsx',
  'components/support/SupportTechnicalContextCard.tsx',
];

const P211_ENFORCE_CLEAN_EXACT = [
  'rental/components/handover/HandoverProtocolDialog.tsx',
  'rental/components/handover/SignaturePad.tsx',
  'rental/components/booking-detail/BookingHandoverTab.tsx',
  'rental/lib/bookingHandoverGates.ts',
  'rental/components/handover/handover-i18n.ts',
];

const P212_ENFORCE_CLEAN_EXACT = [
  'rental/components/FinesView.tsx',
  'rental/lib/fines-i18n.ts',
];

const P213_ENFORCE_CLEAN_EXACT = [
  'operator/handover/OperatorHandoverFlow.tsx',
  'operator/handover/OperatorHandoverStepVehicle.tsx',
  'operator/handover/OperatorHandoverStepCondition.tsx',
  'operator/handover/OperatorHandoverStepDamages.tsx',
  'operator/handover/OperatorHandoverStepDocuments.tsx',
  'operator/handover/OperatorHandoverStepSignatures.tsx',
  'operator/handover/OperatorHandoverStepReview.tsx',
  'operator/handover/OperatorHandoverTechnicalObservationsSection.tsx',
  'operator/handover/operatorHandoverPayload.ts',
  'operator/handover/operatorHandoverTechnicalObservations.ts',
  'operator/handover/operator-handover-i18n.ts',
];

const P214_ENFORCE_CLEAN_EXACT = [
  'rental/components/invoices/InvoicesPage.tsx',
  'rental/components/invoices/InvoiceList.tsx',
  'rental/components/invoices/InvoiceListTable.tsx',
  'rental/components/invoices/InvoiceListMobileCards.tsx',
  'rental/components/invoices/InvoiceListPagination.tsx',
  'rental/components/invoices/InvoiceFilters.tsx',
  'rental/components/invoices/InvoiceKpiGrid.tsx',
  'rental/components/invoices/InvoiceKpiCard.tsx',
  'rental/components/invoices/hooks/useInvoices.ts',
  'rental/components/invoices/invoiceListLabels.ts',
  'rental/components/invoices/invoiceConstants.ts',
  'rental/lib/invoice-list-i18n.ts',
];

const P215_ENFORCE_CLEAN_EXACT = [
  'rental/components/VendorManagementView.tsx',
  'rental/components/VendorDetailView.tsx',
  'rental/components/vendors/VendorOperationalTasks.tsx',
  'rental/components/vendors/VendorDirectoryCard.tsx',
  'rental/lib/vendor-directory.utils.ts',
  'rental/lib/vendor-directory-i18n.ts',
];

const P216A_ENFORCE_CLEAN_EXACT = [
  'rental/lib/service-task-semantics.ts',
  'lib/tasks/service-task-presentation-i18n.ts',
  'rental/components/vendors/VendorOperationalTasks.tsx',
  'rental/components/VehicleTasksView.tsx',
  'rental/components/EntityTasksSection.tsx',
  'rental/components/vehicle-detail/VehicleServiceContextPanel.tsx',
  'rental/components/fleet-health-service/fleet-health-service-case-list.ts',
  'rental/components/service-center/ServiceTaskCard.tsx',
  'rental/components/service-center/ServiceScheduleRow.tsx',
  'rental/components/service-center/ServiceSchedulePanel.tsx',
  'rental/components/service-center/ServiceTasksCalendar.tsx',
  'rental/components/service-center/ServiceHistoryTimelineRow.tsx',
  'rental/components/service-center/ServiceTasksBoard.tsx',
  'rental/components/service-center/ServiceTaskCreateModal.tsx',
  'rental/components/service-center/ServiceHistoryPanel.tsx',
  'rental/components/service-center/ServiceTasksPanel.tsx',
  'rental/components/service-center/ServiceCenterContextBar.tsx',
];

const P216B1_ENFORCE_CLEAN_EXACT = [
  'lib/tasks/taskTimeline.utils.ts',
  'lib/tasks/task-timeline-presentation-i18n.ts',
];

const P216B2_ENFORCE_CLEAN_EXACT = [
  'lib/tasks/taskDetailView.utils.ts',
  'lib/tasks/taskTimeline.utils.ts',
  'lib/tasks/task-timeline-presentation-i18n.ts',
  'rental/components/tasks/GlobalTaskDetailPanel.tsx',
  'rental/components/tasks/VehicleTaskDetailDrawer.tsx',
  'operator/tasks/OperatorTaskDetail.tsx',
];

const P216C1_ENFORCE_CLEAN_EXACT = [
  'lib/tasks/taskDetailView.utils.ts',
  'lib/tasks/taskDetailChecklist.utils.ts',
  'lib/tasks/components/TaskDetailBody.tsx',
  'lib/tasks/components/TaskDetailShell.tsx',
  'lib/tasks/components/TaskDetailNotesActivitySection.tsx',
  'lib/tasks/components/TaskDetailChecklistSection.tsx',
  'rental/lib/task-detail.utils.ts',
  'operator/components/OperatorTaskSheet.tsx',
];

const P216C2A_ENFORCE_CLEAN_EXACT = [
  'lib/tasks/taskDetailActions.utils.ts',
  'lib/tasks/taskDetailCompletion.utils.ts',
  'lib/tasks/taskCompleteForm.utils.ts',
  'lib/tasks/taskResolution.utils.ts',
  'lib/tasks/hooks/useTaskDetailActions.ts',
  'lib/tasks/components/TaskDetailActionBar.tsx',
  'lib/tasks/components/TaskDetailActionsHost.tsx',
  'lib/tasks/components/TaskDetailCompleteDialog.tsx',
  'lib/tasks/components/TaskDetailCompletionSummary.tsx',
];

const P216C2B_ENFORCE_CLEAN_EXACT = [
  'rental/components/tasks/VehicleTaskDetailDrawer.tsx',
  'operator/tasks/OperatorTaskDetail.tsx',
];

const P217_ENFORCE_CLEAN_EXACT = [
  'rental/components/new-booking/VehiclePickerStep.tsx',
  'rental/lib/booking-vehicle-preflight.ts',
];

const P218_ENFORCE_CLEAN_EXACT = [
  'rental/components/settings/data-authorization/DataAuthorizationTab.tsx',
];

const P219_ENFORCE_CLEAN_EXACT = [
  'rental/components/InsurancesView.tsx',
  'rental/lib/insurances-i18n.ts',
];

const P220_ENFORCE_CLEAN_EXACT = [
  'rental/components/PartsAccessoriesView.tsx',
  'rental/lib/parts-accessories-i18n.ts',
];

const P221_ENFORCE_CLEAN_EXACT = [
  'rental/components/invoices/CreateInvoiceDialog.tsx',
  'rental/lib/create-invoice-i18n.ts',
];

const P222_ENFORCE_CLEAN_EXACT = [
  'rental/components/invoices/SendInvoiceDialog.tsx',
  'rental/lib/send-invoice-i18n.ts',
];

const P223_ENFORCE_CLEAN_EXACT = [
  'rental/components/invoices/InvoiceDocuments.tsx',
  'rental/lib/invoice-documents-i18n.ts',
  'rental/components/invoices/invoiceDocuments.mapper.ts',
];

const P224_ENFORCE_CLEAN_EXACT = [
  'operator/damages/OperatorDamageCaptureFlow.tsx',
  'operator/damages/OperatorDamagePhotoStep.tsx',
  'operator/damages/OperatorDamageDetailsStep.tsx',
  'operator/damages/OperatorDamageReviewStep.tsx',
  'operator/damages/operatorDamagePayload.ts',
  'operator/lib/operator-damage-capture-i18n.ts',
];

const P225_ENFORCE_CLEAN_EXACT = [
  'operator/verification/OperatorPickupCheckSheet.tsx',
  'operator/lib/operator-pickup-check-i18n.ts',
  'operator/verification/operatorPickupCheckPayload.ts',
];

const P226_ENFORCE_CLEAN_EXACT = [
  'operator/tire-measure/OperatorTireMeasureFlow.tsx',
  'operator/tire-measure/OperatorTireMeasureTreadGrid.tsx',
  'operator/tire-measure/operatorTireMeasure.utils.ts',
  'operator/tire-measure/operatorTireMeasurePayload.ts',
  'operator/tire-measure/useOperatorTireMeasureData.ts',
  'operator/lib/operator-tire-measure-i18n.ts',
];

const P227_ENFORCE_CLEAN_EXACT = [
  'operator/components/OperatorVehicleQuickViewTasks.tsx',
  'operator/lib/operator-vehicle-quick-view-i18n.ts',
];

const P228_ENFORCE_CLEAN_EXACT = [
  'operator/components/OperatorVehicleQuickViewHeader.tsx',
  'operator/lib/operator-vehicle-quick-view-i18n.ts',
];

const P229_ENFORCE_CLEAN_EXACT = [
  'operator/components/OperatorVehicleQuickViewQuickActions.tsx',
  'operator/lib/operator-vehicle-quick-view-i18n.ts',
];

const P230_ENFORCE_CLEAN_EXACT = [
  'operator/components/OperatorVehicleQuickViewToolActions.tsx',
  'operator/lib/operator-vehicle-quick-view-i18n.ts',
];

const P231_ENFORCE_CLEAN_EXACT = [
  'operator/components/OperatorVehicleQuickViewBookingContext.tsx',
  'operator/lib/operator-vehicle-quick-view-i18n.ts',
];

const P232_ENFORCE_CLEAN_EXACT = [
  'operator/components/OperatorVehicleQuickViewRentalHealth.tsx',
  'operator/lib/operator-vehicle-quick-view-i18n.ts',
];

const P233_ENFORCE_CLEAN_EXACT = [
  'operator/components/OperatorVehicleQuickViewActiveDamages.tsx',
  'operator/lib/operator-vehicle-quick-view-i18n.ts',
];

const P234_ENFORCE_CLEAN_EXACT = [
  'operator/components/OperatorVehicleQuickViewTireProfile.tsx',
  'operator/lib/operator-vehicle-quick-view-i18n.ts',
];

const P235_ENFORCE_CLEAN_EXACT = [
  'operator/components/OperatorVehicleQuickViewDocuments.tsx',
  'operator/lib/operator-vehicle-quick-view-i18n.ts',
];

const P236_ENFORCE_CLEAN_EXACT = [
  'operator/bookings/OperatorBookingFormSheet.tsx',
  'operator/lib/operator-booking-form-i18n.ts',
];

const P237_ENFORCE_CLEAN_EXACT = [
  'operator/bookings/OperatorBookingCancelSheet.tsx',
  'operator/bookings/OperatorBookingNoShowSheet.tsx',
  'operator/bookings/operatorBookingSheetShell.tsx',
  'operator/lib/operator-booking-cancel-noshow-i18n.ts',
];

const P238_ENFORCE_CLEAN_EXACT = [
  'operator/documents/OperatorBookingDocumentsPanel.tsx',
  'operator/documents/operatorBookingDocuments.utils.ts',
  'operator/lib/operator-booking-documents-i18n.ts',
];

const P239_ENFORCE_CLEAN_EXACT = [
  'operator/views/OperatorMoreView.tsx',
  'operator/lib/operator-more-i18n.ts',
];

const P240_ENFORCE_CLEAN_EXACT = [
  'operator/components/OperatorBookingDetailSheet.tsx',
  'operator/lib/operator-booking-detail-i18n.ts',
];

const P241_ENFORCE_CLEAN_EXACT = [
  'operator/components/OperatorBookingCard.tsx',
  'operator/components/OperatorScanBookingCard.tsx',
  'operator/lib/operator-booking-card-i18n.ts',
];

const P242_ENFORCE_CLEAN_EXACT = [
  'operator/views/OperatorScanView.tsx',
  'operator/lib/operator-scan-search-i18n.ts',
];

const P243_ENFORCE_CLEAN_EXACT = [
  'operator/components/OperatorBottomNav.tsx',
  'operator/lib/operator-shell-navigation-i18n.ts',
];

const P244_ENFORCE_CLEAN_EXACT = [
  'operator/components/OperatorHeader.tsx',
  'operator/components/OperatorConnectivityBanner.tsx',
  'operator/lib/operator-shell-top-chrome-i18n.ts',
];

const P245_ENFORCE_CLEAN_EXACT = [
  'operator/views/OperatorTodayView.tsx',
  'operator/views/operatorTodayView.utils.ts',
  'operator/components/OperatorTodayTaskFeed.tsx',
  'operator/lib/operator-today-i18n.ts',
];

const P246_ENFORCE_CLEAN_EXACT = [
  'operator/tasks/OperatorTaskCard.tsx',
  'operator/tasks/operatorTaskCard.utils.ts',
  'operator/tasks/OperatorTaskCardConnected.tsx',
  'operator/lib/operator-task-card-i18n.ts',
];

const P247_ENFORCE_CLEAN_EXACT = [
  'operator/views/OperatorTasksView.tsx',
  'operator/lib/operator-tasks-tab-i18n.ts',
];

const P248_ENFORCE_CLEAN_EXACT = [
  'operator/components/OperatorEntryModal.tsx',
  'operator/components/OperatorDesktopOnlyNotice.tsx',
  'operator/components/OperatorAccessDeniedScreen.tsx',
  'operator/components/OperatorAccessGuard.tsx',
  'operator/components/OperatorEntryButton.tsx',
  'operator/components/OperatorLinkCard.tsx',
  'operator/lib/operatorAccess.ts',
  'operator/components/OperatorAccessLoadingScreen.tsx',
  'operator/lib/operator-entry-access-i18n.ts',
];

const P249_ENFORCE_CLEAN_EXACT = [
  'rental/components/invoices/InvoiceDetailSecondary.tsx',
  'rental/components/invoices/InvoiceNotes.tsx',
  'rental/components/invoices/InvoiceTimeline.tsx',
  'rental/components/invoices/invoiceDetailSecondary.mapper.ts',
  'rental/lib/rental-invoice-detail-secondary-i18n.ts',
];

const P250_ENFORCE_CLEAN_EXACT = [
  'rental/components/invoices/InvoiceDetailHeader.tsx',
  'rental/components/invoices/InvoiceHeaderMoreMenu.tsx',
  'rental/components/invoices/invoiceDetail.mapper.ts',
  'rental/components/invoices/invoiceUtils.ts',
  'rental/lib/rental-invoice-detail-header-i18n.ts',
];

const P251_ENFORCE_CLEAN_EXACT = [
  'rental/components/invoices/InvoiceRelations.tsx',
  'rental/components/invoices/InvoiceRelationRow.tsx',
  'rental/components/invoices/invoiceRelations.mapper.ts',
  'rental/lib/rental-invoice-relations-i18n.ts',
];

const P252_ENFORCE_CLEAN_EXACT = [
  'rental/components/invoices/InvoicePayments.tsx',
  'rental/components/invoices/InvoicePaymentDetailDialog.tsx',
  'rental/components/invoices/RecordPaymentDialog.tsx',
  'rental/components/invoices/invoicePayments.mapper.ts',
  'rental/lib/rental-invoice-payments-i18n.ts',
];

const P253_ENFORCE_CLEAN_EXACT = [
  'rental/components/invoices/InvoiceLineItems.tsx',
  'rental/components/invoices/invoiceLineItems.mapper.ts',
  'rental/lib/rental-invoice-line-items-i18n.ts',
];

const P257_ENFORCE_CLEAN_EXACT = [
  'rental/components/billing/TenantBillingPaymentMethodTab.tsx',
  'rental/components/billing/TenantPaymentMethodsSection.tsx',
  'rental/components/billing/tenant-payment-methods.utils.ts',
  'rental/components/billing/billing-stripe-ui.ts',
  'rental/components/billing/useBillingPaymentMethodActions.ts',
  'rental/components/billing/useBillingStripeActions.ts',
];

const P258_ENFORCE_CLEAN_EXACT = ['rental/components/billing/TenantBillingAddOnsTab.tsx'];

const P259_ENFORCE_CLEAN_EXACT = [
  'rental/components/DocumentsView.tsx',
  'rental/components/documents/DocumentComplianceSummaryCard.tsx',
];

const P260_ENFORCE_CLEAN_EXACT = [
  'rental/components/documents/VehicleDocumentUploadDrawer.tsx',
  'rental/components/documents/DocumentIntakeUploadZone.tsx',
  'rental/components/documents/DocumentExtractionFlowStatus.tsx',
  'rental/components/documents/DocumentUploadDuplicatePanel.tsx',
  'rental/components/documents/DocumentIntakeProcessingSteps.tsx',
  'rental/components/documents/DocumentClassificationResultPanel.tsx',
  'rental/components/documents/DocumentExtractionReviewPanel.tsx',
  'rental/components/documents/DocumentApplyResultPanel.tsx',
  'rental/components/documents/DocumentFollowUpSuggestionsPanel.tsx',
  'rental/components/documents/DocumentEntityReview.tsx',
  'rental/components/documents/DocumentSchemaFieldReview.tsx',
  'rental/components/documents/DocumentActionPlanReview.tsx',
  'rental/lib/document-intake-i18n.ts',
  'rental/hooks/useDocumentIntakeFlow.ts',
  'rental/hooks/useDocumentUploadPage.ts',
  'rental/components/documents/document-extraction.shared.ts',
];

const P261_ENFORCE_CLEAN_EXACT = [
  'rental/components/DamagesView.tsx',
  'rental/components/damages/DamageControlSummary.tsx',
  'rental/components/damages/DamageInsightsSection.tsx',
  'rental/components/damages/DamageEvidenceCanvas.tsx',
  'rental/components/damages/DamageWorkQueue.tsx',
  'rental/components/damages/DamageDetailDrawer.tsx',
  'rental/components/damages/CreateDamageDialog.tsx',
  'rental/components/damages/MarkRepairedDialog.tsx',
  'rental/components/damages/CreateRepairTaskDialog.tsx',
  'rental/components/damages/DamageAiIntakeDialog.tsx',
  'rental/components/damages/AddDamagePhotoPanel.tsx',
  'rental/components/damages/DamageRentalSections.tsx',
  'rental/components/damages/DamageMapBlueprint.tsx',
  'rental/components/damages/DamageHeatmapOverlay.tsx',
  'rental/components/damages/damage-summary-display.ts',
  'rental/components/damages/damage-control.utils.ts',
  'rental/lib/rental-vehicle-damages-i18n.ts',
  'rental/hooks/useVehicleDamages.ts',
  'rental/hooks/useVehicleDamageActions.ts',
  'rental/lib/damage-insights.ts',
  'rental/lib/damage-rental-impact.ts',
  'rental/lib/damage-pickup-context.ts',
  'rental/hooks/useDamageAiIntake.ts',
];

const P262_ENFORCE_CLEAN_EXACT = [
  'rental/components/users-roles/UsersRolesTab.tsx',
  'rental/components/users-roles/TeamTab.tsx',
  'rental/components/users-roles/TeamMemberDrawer.tsx',
  'rental/components/users-roles/CreateUserWizard.tsx',
  'rental/components/users-roles/IamBadges.tsx',
  'rental/components/users-roles/iam-team.utils.ts',
  'rental/components/users-roles/useIamTeam.ts',
  'rental/components/UsersRolesTab.tsx',
  'rental/lib/rental-organization-users-roles-i18n.ts',
];

function isP27AEnforceCleanPath(relPath: string): boolean {
  return P27A_ENFORCE_CLEAN_EXACT.includes(relPath);
}

function isP27BEnforceCleanPath(relPath: string): boolean {
  return P27B_ENFORCE_CLEAN_EXACT.includes(relPath);
}

function isP28EnforceCleanPath(relPath: string): boolean {
  return P28_ENFORCE_CLEAN_EXACT.includes(relPath);
}

function isP29EnforceCleanPath(relPath: string): boolean {
  return P29_ENFORCE_CLEAN_EXACT.includes(relPath);
}

function isP210EnforceCleanPath(relPath: string): boolean {
  return P210_ENFORCE_CLEAN_EXACT.includes(relPath);
}

function isP211EnforceCleanPath(relPath: string): boolean {
  return P211_ENFORCE_CLEAN_EXACT.includes(relPath);
}

function isP212EnforceCleanPath(relPath: string): boolean {
  return P212_ENFORCE_CLEAN_EXACT.includes(relPath);
}

function isP213EnforceCleanPath(relPath: string): boolean {
  return P213_ENFORCE_CLEAN_EXACT.includes(relPath);
}

function isP214EnforceCleanPath(relPath: string): boolean {
  return P214_ENFORCE_CLEAN_EXACT.includes(relPath);
}

function isP215EnforceCleanPath(relPath: string): boolean {
  return P215_ENFORCE_CLEAN_EXACT.includes(relPath);
}

function isP216AEnforceCleanPath(relPath: string): boolean {
  return P216A_ENFORCE_CLEAN_EXACT.includes(relPath);
}

function isP216B1EnforceCleanPath(relPath: string): boolean {
  return P216B1_ENFORCE_CLEAN_EXACT.includes(relPath);
}

function isP216B2EnforceCleanPath(relPath: string): boolean {
  return P216B2_ENFORCE_CLEAN_EXACT.includes(relPath);
}

function isP216C1EnforceCleanPath(relPath: string): boolean {
  return P216C1_ENFORCE_CLEAN_EXACT.includes(relPath);
}

function isP216C2AEnforceCleanPath(relPath: string): boolean {
  return P216C2A_ENFORCE_CLEAN_EXACT.includes(relPath);
}

function isP216C2BEnforceCleanPath(relPath: string): boolean {
  return P216C2B_ENFORCE_CLEAN_EXACT.includes(relPath);
}

function isP217EnforceCleanPath(relPath: string): boolean {
  return P217_ENFORCE_CLEAN_EXACT.includes(relPath);
}

function isP218EnforceCleanPath(relPath: string): boolean {
  return P218_ENFORCE_CLEAN_EXACT.includes(relPath);
}

function isP219EnforceCleanPath(relPath: string): boolean {
  return P219_ENFORCE_CLEAN_EXACT.includes(relPath);
}

function isP220EnforceCleanPath(relPath: string): boolean {
  return P220_ENFORCE_CLEAN_EXACT.includes(relPath);
}

function isP221EnforceCleanPath(relPath: string): boolean {
  return P221_ENFORCE_CLEAN_EXACT.includes(relPath);
}

function isP222EnforceCleanPath(relPath: string): boolean {
  return P222_ENFORCE_CLEAN_EXACT.includes(relPath);
}

function isP223EnforceCleanPath(relPath: string): boolean {
  return P223_ENFORCE_CLEAN_EXACT.includes(relPath);
}

function isP224EnforceCleanPath(relPath: string): boolean {
  return P224_ENFORCE_CLEAN_EXACT.includes(relPath);
}

function isP225EnforceCleanPath(relPath: string): boolean {
  return P225_ENFORCE_CLEAN_EXACT.includes(relPath);
}

function isP226EnforceCleanPath(relPath: string): boolean {
  return P226_ENFORCE_CLEAN_EXACT.includes(relPath);
}

function isP227EnforceCleanPath(relPath: string): boolean {
  return P227_ENFORCE_CLEAN_EXACT.includes(relPath);
}

function isP228EnforceCleanPath(relPath: string): boolean {
  return P228_ENFORCE_CLEAN_EXACT.includes(relPath);
}

function isP229EnforceCleanPath(relPath: string): boolean {
  return P229_ENFORCE_CLEAN_EXACT.includes(relPath);
}

function isP230EnforceCleanPath(relPath: string): boolean {
  return P230_ENFORCE_CLEAN_EXACT.includes(relPath);
}

function isP231EnforceCleanPath(relPath: string): boolean {
  return P231_ENFORCE_CLEAN_EXACT.includes(relPath);
}

function isP232EnforceCleanPath(relPath: string): boolean {
  return P232_ENFORCE_CLEAN_EXACT.includes(relPath);
}

function isP233EnforceCleanPath(relPath: string): boolean {
  return P233_ENFORCE_CLEAN_EXACT.includes(relPath);
}

function isP234EnforceCleanPath(relPath: string): boolean {
  return P234_ENFORCE_CLEAN_EXACT.includes(relPath);
}

function isP235EnforceCleanPath(relPath: string): boolean {
  return P235_ENFORCE_CLEAN_EXACT.includes(relPath);
}

function isP236EnforceCleanPath(relPath: string): boolean {
  return P236_ENFORCE_CLEAN_EXACT.includes(relPath);
}

function isP237EnforceCleanPath(relPath: string): boolean {
  return P237_ENFORCE_CLEAN_EXACT.includes(relPath);
}

function isP238EnforceCleanPath(relPath: string): boolean {
  return P238_ENFORCE_CLEAN_EXACT.includes(relPath);
}

function isP239EnforceCleanPath(relPath: string): boolean {
  return P239_ENFORCE_CLEAN_EXACT.includes(relPath);
}

function isP240EnforceCleanPath(relPath: string): boolean {
  return P240_ENFORCE_CLEAN_EXACT.includes(relPath);
}

function isP241EnforceCleanPath(relPath: string): boolean {
  return P241_ENFORCE_CLEAN_EXACT.includes(relPath);
}

function isP242EnforceCleanPath(relPath: string): boolean {
  return P242_ENFORCE_CLEAN_EXACT.includes(relPath);
}

function isP243EnforceCleanPath(relPath: string): boolean {
  return P243_ENFORCE_CLEAN_EXACT.includes(relPath);
}

function isP244EnforceCleanPath(relPath: string): boolean {
  return P244_ENFORCE_CLEAN_EXACT.includes(relPath);
}

function isP245EnforceCleanPath(relPath: string): boolean {
  return P245_ENFORCE_CLEAN_EXACT.includes(relPath);
}

function isP246EnforceCleanPath(relPath: string): boolean {
  return P246_ENFORCE_CLEAN_EXACT.includes(relPath);
}

function isP247EnforceCleanPath(relPath: string): boolean {
  return P247_ENFORCE_CLEAN_EXACT.includes(relPath);
}

function isP248EnforceCleanPath(relPath: string): boolean {
  return P248_ENFORCE_CLEAN_EXACT.includes(relPath);
}

function isP249EnforceCleanPath(relPath: string): boolean {
  return P249_ENFORCE_CLEAN_EXACT.includes(relPath);
}

function isP250EnforceCleanPath(relPath: string): boolean {
  return P250_ENFORCE_CLEAN_EXACT.includes(relPath);
}

function isP251EnforceCleanPath(relPath: string): boolean {
  return P251_ENFORCE_CLEAN_EXACT.includes(relPath);
}

function isP252EnforceCleanPath(relPath: string): boolean {
  return P252_ENFORCE_CLEAN_EXACT.includes(relPath);
}

function isP253EnforceCleanPath(relPath: string): boolean {
  return P253_ENFORCE_CLEAN_EXACT.includes(relPath);
}

function isP257EnforceCleanPath(relPath: string): boolean {
  return P257_ENFORCE_CLEAN_EXACT.includes(relPath);
}

function isP258EnforceCleanPath(relPath: string): boolean {
  return P258_ENFORCE_CLEAN_EXACT.includes(relPath);
}

function isP259EnforceCleanPath(relPath: string): boolean {
  return P259_ENFORCE_CLEAN_EXACT.includes(relPath);
}

function isP260EnforceCleanPath(relPath: string): boolean {
  return P260_ENFORCE_CLEAN_EXACT.includes(relPath);
}

function isP261EnforceCleanPath(relPath: string): boolean {
  return P261_ENFORCE_CLEAN_EXACT.includes(relPath);
}

function isP262EnforceCleanPath(relPath: string): boolean {
  return P262_ENFORCE_CLEAN_EXACT.includes(relPath);
}

function isP26EnforceCleanPath(relPath: string): boolean {
  return P26_ENFORCE_CLEAN_PREFIXES.some(
    (prefix) => relPath === prefix || relPath.startsWith(prefix),
  );
}

function isP25EnforceCleanPath(relPath: string): boolean {
  if (P25_ENFORCE_CLEAN_EXACT.includes(relPath)) return true;
  return P25_ENFORCE_CLEAN_PREFIXES.some(
    (prefix) => relPath === prefix || relPath.startsWith(prefix),
  );
}

function isP22EnforceCleanPath(relPath: string): boolean {
  if (P22_ENFORCE_CLEAN_EXACT.includes(relPath)) return true;
  return P22_ENFORCE_CLEAN_PREFIXES.some((prefix) => relPath.startsWith(prefix));
}

function isP21EnforceCleanPath(relPath: string): boolean {
  if (P21_ENFORCE_CLEAN_EXACT.includes(relPath)) return true;
  return P21_ENFORCE_CLEAN_PREFIXES.some((prefix) => relPath.startsWith(prefix));
}

describe('hardcoded copy guardrails (P2.1 + P2.2.1 + P2.2.2 + P2.2.3 + P2.2.4 + P2.2.5 + P2.2.6 + P2.2.7A + P2.2.7B + P2.2.8 + P2.2.9 + P2.2.10 + P2.2.11 + P2.2.12 + P2.2.13 + P2.2.14 + P2.2.15 + P2.2.16A + P2.2.16B.1 enforce-clean surfaces)', () => {
  it('keeps enforce-clean surface findings at zero in inventory', () => {
    expect(inventory.summary.enforceCleanRemaining).toBe(0);
  });

  it('does not reference the removed login-copy shim in cleaned files', () => {
    for (const relPath of P21_ENFORCE_CLEAN_EXACT) {
      const source = readFileSync(join(__dirname, '..', relPath), 'utf8');
      expect(source, relPath).not.toContain('login-copy');
      expect(source, relPath).not.toContain('translateLoginCopy');
    }
  });

  it('scopes P2.2.1 enforce-clean findings to navigation and dashboard only', () => {
    const p21Debt = inventory.findings.filter((finding) =>
      (finding.files ?? [finding.file]).some((file) => isP21EnforceCleanPath(file)),
    );
    expect(p21Debt).toHaveLength(0);
  });

  it('scopes P2.2.2 enforce-clean findings to vehicle domain only', () => {
    const p22Debt = inventory.findings.filter((finding) =>
      (finding.files ?? [finding.file]).some((file) => isP22EnforceCleanPath(file)),
    );
    expect(p22Debt).toHaveLength(0);
  });

  it('scopes P2.2.3 enforce-clean findings to bookings and customers only', () => {
    const p23Debt = inventory.findings.filter((finding) =>
      isP23EnforceCleanPath(finding.file),
    );
    expect(p23Debt).toHaveLength(0);
  });

  it('scopes P2.2.4 enforce-clean findings to tasks and settings only', () => {
    const p24Debt = inventory.findings.filter((finding) =>
      isP24EnforceCleanPath(finding.file),
    );
    expect(p24Debt).toHaveLength(0);
  });

  it('scopes P2.2.5 enforce-clean findings to workflow automation only', () => {
    const p25Debt = inventory.findings.filter((finding) =>
      isP25EnforceCleanPath(finding.file),
    );
    expect(p25Debt).toHaveLength(0);
  });

  it('scopes P2.2.6 enforce-clean findings to rental stations only', () => {
    const p26Debt = inventory.findings.filter((finding) =>
      isP26EnforceCleanPath(finding.file),
    );
    expect(p26Debt).toHaveLength(0);
  });

  it('scopes P2.2.7A enforce-clean findings to voice assistant presentation slice only', () => {
    const p27aDebt = inventory.findings.filter((finding) =>
      isP27AEnforceCleanPath(finding.file),
    );
    expect(p27aDebt).toHaveLength(0);
  });

  it('scopes P2.2.7B enforce-clean findings to telephony and test center only', () => {
    const p27bDebt = inventory.findings.filter((finding) =>
      isP27BEnforceCleanPath(finding.file),
    );
    expect(p27bDebt).toHaveLength(0);
  });

  it('scopes P2.2.8 enforce-clean findings to WhatsApp Business only', () => {
    const p28Debt = inventory.findings.filter((finding) =>
      isP28EnforceCleanPath(finding.file),
    );
    expect(p28Debt).toHaveLength(0);
  });

  it('scopes P2.2.9 enforce-clean findings to Rental Support Center only', () => {
    const p29Debt = inventory.findings.filter((finding) =>
      isP29EnforceCleanPath(finding.file),
    );
    expect(p29Debt).toHaveLength(0);
  });

  it('scopes P2.2.10 enforce-clean findings to Master Support Ops only', () => {
    const p210Debt = inventory.findings.filter((finding) =>
      isP210EnforceCleanPath(finding.file),
    );
    expect(p210Debt).toHaveLength(0);
  });

  it('scopes P2.2.11 enforce-clean findings to Rental Handover Protocol only', () => {
    const p211Debt = inventory.findings.filter((finding) =>
      isP211EnforceCleanPath(finding.file),
    );
    expect(p211Debt).toHaveLength(0);
  });

  it('scopes P2.2.12 enforce-clean findings to Rental Fines only', () => {
    const p212Debt = inventory.findings.filter((finding) =>
      isP212EnforceCleanPath(finding.file),
    );
    expect(p212Debt).toHaveLength(0);
  });

  it('scopes P2.2.13 enforce-clean findings to Operator Handover only', () => {
    const p213Debt = inventory.findings.filter((finding) =>
      isP213EnforceCleanPath(finding.file),
    );
    expect(p213Debt).toHaveLength(0);
  });

  it('scopes P2.2.14 enforce-clean findings to Rental Invoice List only', () => {
    const p214Debt = inventory.findings.filter((finding) =>
      isP214EnforceCleanPath(finding.file),
    );
    expect(p214Debt).toHaveLength(0);
  });

  it('scopes P2.2.15 enforce-clean findings to Rental Vendor Directory only', () => {
    const p215Debt = inventory.findings.filter((finding) =>
      isP215EnforceCleanPath(finding.file),
    );
    expect(p215Debt).toHaveLength(0);
  });

  it('scopes P2.2.16A enforce-clean findings to Shared Service Task presentation only', () => {
    const p216aDebt = inventory.findings.filter((finding) =>
      isP216AEnforceCleanPath(finding.file),
    );
    expect(p216aDebt).toHaveLength(0);
  });

  it('scopes P2.2.16B.1 enforce-clean findings to task timeline taxonomy only', () => {
    const p216b1Debt = inventory.findings.filter((finding) =>
      isP216B1EnforceCleanPath(finding.file),
    );
    expect(p216b1Debt).toHaveLength(0);
  });

  it('scopes P2.2.16B.2 enforce-clean findings to task timeline locale threading only', () => {
    const p216b2Debt = inventory.findings.filter((finding) =>
      isP216B2EnforceCleanPath(finding.file),
    );
    expect(p216b2Debt).toHaveLength(0);
  });

  it('scopes P2.2.16C.1 enforce-clean findings to task detail chrome only', () => {
    const p216c1Debt = inventory.findings.filter((finding) =>
      isP216C1EnforceCleanPath(finding.file),
    );
    expect(p216c1Debt).toHaveLength(0);
  });

  it('scopes P2.2.16C.2A enforce-clean findings to shared task workflow core only', () => {
    const p216c2aDebt = inventory.findings.filter((finding) =>
      isP216C2AEnforceCleanPath(finding.file),
    );
    expect(p216c2aDebt).toHaveLength(0);
  });

  it('scopes P2.2.16C.2B enforce-clean findings to task detail host residuals only', () => {
    const p216c2bDebt = inventory.findings.filter((finding) =>
      isP216C2BEnforceCleanPath(finding.file),
    );
    expect(p216c2bDebt).toHaveLength(0);
  });

  it('scopes P2.2.17 enforce-clean findings to booking vehicle picker only', () => {
    const p217Debt = inventory.findings.filter((finding) =>
      isP217EnforceCleanPath(finding.file),
    );
    expect(p217Debt).toHaveLength(0);
  });

  it('scopes P2.2.18 enforce-clean findings to DataAuthorizationTab only', () => {
    const p218Debt = inventory.findings.filter((finding) =>
      isP218EnforceCleanPath(finding.file),
    );
    expect(p218Debt).toHaveLength(0);
  });

  it('scopes P2.2.19 enforce-clean findings to InsurancesView only', () => {
    const p219Debt = inventory.findings.filter((finding) =>
      isP219EnforceCleanPath(finding.file),
    );
    expect(p219Debt).toHaveLength(0);
  });

  it('scopes P2.2.20 enforce-clean findings to PartsAccessoriesView only', () => {
    const p220Debt = inventory.findings.filter((finding) =>
      isP220EnforceCleanPath(finding.file),
    );
    expect(p220Debt).toHaveLength(0);
  });

  it('scopes P2.2.21 enforce-clean findings to CreateInvoiceDialog only', () => {
    const p221Debt = inventory.findings.filter((finding) =>
      isP221EnforceCleanPath(finding.file),
    );
    expect(p221Debt).toHaveLength(0);
  });

  it('scopes P2.2.22 enforce-clean findings to SendInvoiceDialog only', () => {
    const p222Debt = inventory.findings.filter((finding) =>
      isP222EnforceCleanPath(finding.file),
    );
    expect(p222Debt).toHaveLength(0);
  });

  it('scopes P2.2.23 enforce-clean findings to InvoiceDocuments panel only', () => {
    const p223Debt = inventory.findings.filter((finding) =>
      isP223EnforceCleanPath(finding.file),
    );
    expect(p223Debt).toHaveLength(0);
  });

  it('scopes P2.2.24 enforce-clean findings to Operator Damage Capture only', () => {
    const p224Debt = inventory.findings.filter((finding) =>
      isP224EnforceCleanPath(finding.file),
    );
    expect(p224Debt).toHaveLength(0);
  });

  it('scopes P2.2.25 enforce-clean findings to Operator Pickup Verification only', () => {
    const p225Debt = inventory.findings.filter((finding) =>
      isP225EnforceCleanPath(finding.file),
    );
    expect(p225Debt).toHaveLength(0);
  });

  it('scopes P2.2.26 enforce-clean findings to Operator Tire Measure only', () => {
    const p226Debt = inventory.findings.filter((finding) =>
      isP226EnforceCleanPath(finding.file),
    );
    expect(p226Debt).toHaveLength(0);
  });

  it('scopes P2.2.27 enforce-clean findings to Operator Vehicle Quick View Open Tasks only', () => {
    const p227Debt = inventory.findings.filter((finding) =>
      isP227EnforceCleanPath(finding.file),
    );
    expect(p227Debt).toHaveLength(0);
  });

  it('scopes P2.2.28 enforce-clean findings to Operator Vehicle Quick View Header & Primary Status only', () => {
    const p228Debt = inventory.findings.filter((finding) =>
      isP228EnforceCleanPath(finding.file),
    );
    expect(p228Debt).toHaveLength(0);
  });

  it('scopes P2.2.29 enforce-clean findings to Operator Vehicle Quick View Quick Actions only', () => {
    const p229Debt = inventory.findings.filter((finding) =>
      isP229EnforceCleanPath(finding.file),
    );
    expect(p229Debt).toHaveLength(0);
  });

  it('scopes P2.2.30 enforce-clean findings to Operator Vehicle Quick View Tool Actions only', () => {
    const p230Debt = inventory.findings.filter((finding) =>
      isP230EnforceCleanPath(finding.file),
    );
    expect(p230Debt).toHaveLength(0);
  });

  it('scopes P2.2.31 enforce-clean findings to Operator Vehicle Quick View Booking Context only', () => {
    const p231Debt = inventory.findings.filter((finding) =>
      isP231EnforceCleanPath(finding.file),
    );
    expect(p231Debt).toHaveLength(0);
  });

  it('scopes P2.2.32 enforce-clean findings to Operator Vehicle Quick View Rental Health Modules only', () => {
    const p232Debt = inventory.findings.filter((finding) =>
      isP232EnforceCleanPath(finding.file),
    );
    expect(p232Debt).toHaveLength(0);
  });

  it('scopes P2.2.33 enforce-clean findings to Operator Vehicle Quick View Active Damages only', () => {
    const p233Debt = inventory.findings.filter((finding) =>
      isP233EnforceCleanPath(finding.file),
    );
    expect(p233Debt).toHaveLength(0);
  });

  it('scopes P2.2.34 enforce-clean findings to Operator Vehicle Quick View Tire Profile only', () => {
    const p234Debt = inventory.findings.filter((finding) =>
      isP234EnforceCleanPath(finding.file),
    );
    expect(p234Debt).toHaveLength(0);
  });

  it('scopes P2.2.35 enforce-clean findings to Operator Vehicle Quick View Documents only', () => {
    const p235Debt = inventory.findings.filter((finding) =>
      isP235EnforceCleanPath(finding.file),
    );
    expect(p235Debt).toHaveLength(0);
  });

  it('scopes P2.2.36 enforce-clean findings to Operator Booking Form Sheet only', () => {
    const p236Debt = inventory.findings.filter((finding) =>
      isP236EnforceCleanPath(finding.file),
    );
    expect(p236Debt).toHaveLength(0);
  });

  it('scopes P2.2.37 enforce-clean findings to Operator Booking Cancel & No-Show Sheets only', () => {
    const p237Debt = inventory.findings.filter((finding) =>
      isP237EnforceCleanPath(finding.file),
    );
    expect(p237Debt).toHaveLength(0);
  });

  it('scopes P2.2.38 enforce-clean findings to Operator Booking Documents Panel only', () => {
    const p238Debt = inventory.findings.filter((finding) =>
      isP238EnforceCleanPath(finding.file),
    );
    expect(p238Debt).toHaveLength(0);
  });

  it('keeps P239 Operator More View enforce-clean scope at zero findings', () => {
    const p239Debt = inventory.findings.filter((finding) =>
      isP239EnforceCleanPath(finding.file),
    );
    expect(p239Debt).toHaveLength(0);
  });

  it('keeps P240 Operator Booking Detail Sheet enforce-clean scope at zero findings', () => {
    const p240Debt = inventory.findings.filter((finding) =>
      isP240EnforceCleanPath(finding.file),
    );
    expect(p240Debt).toHaveLength(0);
  });

  it('keeps P241 Operator Today + Scan Booking Cards enforce-clean scope at zero findings', () => {
    const p241Debt = inventory.findings.filter((finding) =>
      isP241EnforceCleanPath(finding.file),
    );
    expect(p241Debt).toHaveLength(0);
  });

  it('keeps P242 Operator Scan Search UX enforce-clean scope at zero findings', () => {
    const p242Debt = inventory.findings.filter((finding) =>
      isP242EnforceCleanPath(finding.file),
    );
    expect(p242Debt).toHaveLength(0);
  });

  it('keeps P243 Operator Shell Navigation Chrome enforce-clean scope at zero findings', () => {
    const p243Debt = inventory.findings.filter((finding) =>
      isP243EnforceCleanPath(finding.file),
    );
    expect(p243Debt).toHaveLength(0);
  });

  it('keeps P244 Operator Header + Connectivity Banner enforce-clean scope at zero findings', () => {
    const p244Debt = inventory.findings.filter((finding) =>
      isP244EnforceCleanPath(finding.file),
    );
    expect(p244Debt).toHaveLength(0);
  });

  it('keeps P245 Operator Today Tab Chrome enforce-clean scope at zero findings', () => {
    const p245Debt = inventory.findings.filter((finding) =>
      isP245EnforceCleanPath(finding.file),
    );
    expect(p245Debt).toHaveLength(0);
  });

  it('keeps P246 Operator Task Card Row enforce-clean scope at zero findings', () => {
    const p246Debt = inventory.findings.filter((finding) =>
      isP246EnforceCleanPath(finding.file),
    );
    expect(p246Debt).toHaveLength(0);
  });

  it('keeps P247 Operator Tasks Tab Chrome enforce-clean scope at zero findings', () => {
    const p247Debt = inventory.findings.filter((finding) =>
      isP247EnforceCleanPath(finding.file),
    );
    expect(p247Debt).toHaveLength(0);
  });

  it('keeps P248 Operator Entry & Access Shell enforce-clean scope at zero findings', () => {
    const p248Debt = inventory.findings.filter((finding) =>
      isP248EnforceCleanPath(finding.file),
    );
    expect(p248Debt).toHaveLength(0);
  });

  it('keeps P249 Rental Invoice Detail Secondary enforce-clean scope at zero findings', () => {
    const p249Debt = inventory.findings.filter((finding) =>
      isP249EnforceCleanPath(finding.file),
    );
    expect(p249Debt).toHaveLength(0);
  });

  it('keeps P250 Rental Invoice Detail Header enforce-clean scope at zero findings', () => {
    const p250Debt = inventory.findings.filter((finding) =>
      isP250EnforceCleanPath(finding.file),
    );
    expect(p250Debt).toHaveLength(0);
  });

  it('keeps P251 Rental Invoice Relations enforce-clean scope at zero findings', () => {
    const p251Debt = inventory.findings.filter((finding) =>
      isP251EnforceCleanPath(finding.file),
    );
    expect(p251Debt).toHaveLength(0);
  });

  it('keeps P252 Rental Invoice Payments enforce-clean scope at zero findings', () => {
    const p252Debt = inventory.findings.filter((finding) =>
      isP252EnforceCleanPath(finding.file),
    );
    expect(p252Debt).toHaveLength(0);
  });

  it('keeps P253 Rental Invoice Line Items enforce-clean scope at zero findings', () => {
    const p253Debt = inventory.findings.filter((finding) =>
      isP253EnforceCleanPath(finding.file),
    );
    expect(p253Debt).toHaveLength(0);
  });

  it('keeps P257 Tenant Billing Payment Method enforce-clean scope at zero findings', () => {
    const p257Debt = inventory.findings.filter((finding) =>
      isP257EnforceCleanPath(finding.file),
    );
    expect(p257Debt).toHaveLength(0);
  });

  it('keeps P258 Tenant Billing Add-ons enforce-clean scope at zero findings', () => {
    const p258Debt = inventory.findings.filter((finding) =>
      isP258EnforceCleanPath(finding.file),
    );
    expect(p258Debt).toHaveLength(0);
  });

  it('keeps P259 Vehicle Documents overview enforce-clean scope at zero findings', () => {
    const p259Debt = inventory.findings.filter((finding) =>
      isP259EnforceCleanPath(finding.file),
    );
    expect(p259Debt).toHaveLength(0);
  });

  it('keeps P260 Vehicle Documents upload/extraction enforce-clean scope at zero findings', () => {
    const p260Debt = inventory.findings.filter((finding) =>
      isP260EnforceCleanPath(finding.file),
    );
    expect(p260Debt).toHaveLength(0);
  });

  it('keeps P261 Vehicle Damages enforce-clean scope at zero findings', () => {
    const p261Debt = inventory.findings.filter((finding) =>
      isP261EnforceCleanPath(finding.file),
    );
    expect(p261Debt).toHaveLength(0);
  });

  it('keeps P262 Users & Roles member management enforce-clean scope at zero findings', () => {
    const p262Debt = inventory.findings.filter((finding) =>
      isP262EnforceCleanPath(finding.file),
    );
    expect(p262Debt).toHaveLength(0);
  });

  it('keeps rental-organization-users-roles-i18n.ts on canonical translation resolvers', () => {
    const source = readFileSync(
      join(__dirname, '../rental/lib/rental-organization-users-roles-i18n.ts'),
      'utf8',
    );
    expect(source).toContain('resolveMembershipStatusLabel');
    expect(source).toContain('resolveAuditActionLabel');
    expect(source).toContain('buildInviteUserPayload');
    expect(source).not.toMatch(/locale === 'de'/);
    expect(source).not.toMatch(/de-DE/);
  });

  it('keeps rental-vehicle-damages-i18n.ts on canonical translation resolvers', () => {
    const source = readFileSync(
      join(__dirname, '../rental/lib/rental-vehicle-damages-i18n.ts'),
      'utf8',
    );
    expect(source).toContain('resolveDamageTypeLabel');
    expect(source).toContain('resolveDamageValidationMessage');
    expect(source).toContain('resolveDamageHostError');
    expect(source).not.toMatch(/locale === 'de'/);
  });

  it('keeps document-intake-i18n.ts on canonical translation resolvers', () => {
    const source = readFileSync(
      join(__dirname, '../rental/lib/document-intake-i18n.ts'),
      'utf8',
    );
    expect(source).toContain('resolveFlowStatusLabel');
    expect(source).toContain('resolveValidationMessage');
    expect(source).toContain('resolveExtractionFieldLabel');
    expect(source).not.toMatch(/locale === 'de'/);
    expect(source).not.toMatch(/Fertig/);
  });

  it('keeps VehicleDocumentUploadDrawer free of hardcoded German presentation literals', () => {
    const source = readFileSync(
      join(__dirname, '../rental/components/documents/VehicleDocumentUploadDrawer.tsx'),
      'utf8',
    );
    expect(source).toContain("t('docUpload.drawer.");
    expect(source).toContain('resolveFlowStatusLabel');
    expect(source).toContain('initialDocType: \'AUTO\'');
    expect(source).not.toMatch(/Dokument hochladen/);
    expect(source).not.toMatch(/Fertig/);
    expect(source).not.toMatch(/FLOW_STATUS_LABEL_DE/);
  });

  it('keeps rental-invoice-line-items-i18n.ts on canonical formatter delegation', () => {
    const source = readFileSync(
      join(__dirname, '../rental/lib/rental-invoice-line-items-i18n.ts'),
      'utf8',
    );
    expect(source).toContain('formatInvoiceListAmount');
    expect(source).not.toMatch(/locale === 'de'/);
    expect(source).not.toMatch(/de-DE/);
    expect(source).not.toContain('parseLineInput');
    expect(source).not.toContain('normalizeTaxRate');
  });

  it('keeps rental-invoice-payments-i18n.ts on canonical formatter delegation', () => {
    const source = readFileSync(
      join(__dirname, '../rental/lib/rental-invoice-payments-i18n.ts'),
      'utf8',
    );
    expect(source).toContain('formatInvoiceListAmount');
    expect(source).toContain('formatInvoiceListDate');
    expect(source).not.toMatch(/locale === 'de'/);
    expect(source).not.toMatch(/de-DE/);
    expect(source).not.toContain('parseAmountInputToCents');
  });

  it('keeps rental-invoice-relations-i18n.ts on canonical translation keys', () => {
    const source = readFileSync(
      join(__dirname, '../rental/lib/rental-invoice-relations-i18n.ts'),
      'utf8',
    );
    expect(source).toContain('TranslationKey');
    expect(source).toContain('rentalInvoiceRelationsFallbackLabel');
    expect(source).not.toMatch(/locale === 'de'/);
    expect(source).not.toMatch(/de-DE/);
  });

  it('keeps rental-invoice-detail-header-i18n.ts on canonical translation keys', () => {
    const source = readFileSync(
      join(__dirname, '../rental/lib/rental-invoice-detail-header-i18n.ts'),
      'utf8',
    );
    expect(source).toContain('TranslationKey');
    expect(source).toContain('rentalInvoiceDetailHeaderGateReason');
    expect(source).not.toMatch(/locale === 'de'/);
    expect(source).not.toMatch(/de-DE/);
  });

  it('keeps rental-invoice-detail-secondary-i18n.ts on canonical translation keys', () => {
    const source = readFileSync(
      join(__dirname, '../rental/lib/rental-invoice-detail-secondary-i18n.ts'),
      'utf8',
    );
    expect(source).toContain('TranslationKey');
    expect(source).toContain('rentalInvoiceDetailSecondaryLinkedTaskStatusLabel');
    expect(source).not.toMatch(/'Erledigt'/);
    expect(source).not.toMatch(/locale === 'de'/);
    expect(source).not.toMatch(/de-DE/);
  });

  it('keeps operator-vehicle-quick-view-i18n.ts on canonical translation keys', () => {
    const source = readFileSync(
      join(__dirname, '../operator/lib/operator-vehicle-quick-view-i18n.ts'),
      'utf8',
    );
    expect(source).toContain('TranslationKey');
    expect(source).toContain('operatorVehicleQuickViewTaskStatusLabel');
    expect(source).toContain('operatorVehicleQuickViewPrimaryStatusLabel');
    expect(source).not.toMatch(/'Überfällig'/);
    expect(source).not.toMatch(/locale === 'de'/);
    expect(source).not.toMatch(/de-DE/);
  });

  it('keeps OperatorVehicleQuickViewHeader.tsx free of hardcoded header presentation literals', () => {
    const source = readFileSync(
      join(__dirname, '../operator/components/OperatorVehicleQuickViewHeader.tsx'),
      'utf8',
    );
    expect(source).toContain('operatorVehicleQuickViewHeaderReleaseQuestion');
    expect(source).toContain('resolveOperatorVehicleQuickViewOperationalDisplayLocale');
    expect(source).not.toMatch(/locale:\s*'de'/);
    expect(source).not.toMatch(/locale="de"/);
    expect(source).not.toMatch(/'Darf raus\?'/);
    expect(source).not.toMatch(/'Fahrzeug nicht gefunden'/);
  });

  it('keeps OperatorVehicleQuickViewTasks.tsx free of hardcoded open-tasks presentation literals', () => {
    const source = readFileSync(
      join(__dirname, '../operator/components/OperatorVehicleQuickViewTasks.tsx'),
      'utf8',
    );
    expect(source).toContain('operatorVehicleQuickViewTasksSectionTitle');
    expect(source).not.toMatch(/'Offene Aufgaben'/);
    expect(source).not.toMatch(/'Keine offenen Aufgaben'/);
    expect(source).not.toMatch(/'Überfällig'/);
    expect(source).not.toMatch(/taskStatusLabelDe/);
  });

  it('keeps OperatorVehicleQuickViewQuickActions.tsx free of hardcoded quick-action presentation literals', () => {
    const source = readFileSync(
      join(__dirname, '../operator/components/OperatorVehicleQuickViewQuickActions.tsx'),
      'utf8',
    );
    expect(source).toContain('operatorVehicleQuickViewQuickActionPickupLabel');
    expect(source).toContain('operatorVehicleQuickViewQuickActionReturnLabel');
    expect(source).toContain('operatorVehicleQuickViewQuickActionCreateBookingLabel');
    expect(source).not.toMatch(/'Pickup starten'/);
    expect(source).not.toMatch(/'Return starten'/);
    expect(source).not.toMatch(/'Buchung für dieses Fahrzeug'/);
    expect(source).not.toMatch(/locale:\s*'de'/);
    expect(source).not.toMatch(/de-DE/);
  });

  it('keeps OperatorVehicleQuickViewBookingContext.tsx free of hardcoded booking presentation literals', () => {
    const source = readFileSync(
      join(__dirname, '../operator/components/OperatorVehicleQuickViewBookingContext.tsx'),
      'utf8',
    );
    expect(source).toContain('operatorVehicleQuickViewBookingSectionTitle');
    expect(source).toContain('operatorVehicleQuickViewBookingKindLabel');
    expect(source).toContain('formatOperatorVehicleQuickViewDateTime');
    expect(source).not.toMatch(/'Buchung'/);
    expect(source).not.toMatch(/'Abholung heute'/);
    expect(source).not.toMatch(/'Rückgabe heute'/);
    expect(source).not.toMatch(/'Aktive Buchung'/);
    expect(source).not.toMatch(/'Nächste Reservierung'/);
    expect(source).not.toMatch(/locale:\s*'de'/);
    expect(source).not.toMatch(/de-DE/);
  });

  it('keeps OperatorVehicleQuickViewRentalHealth.tsx free of hardcoded rental health presentation literals', () => {
    const source = readFileSync(
      join(__dirname, '../operator/components/OperatorVehicleQuickViewRentalHealth.tsx'),
      'utf8',
    );
    expect(source).toContain('operatorVehicleQuickViewRentalHealthSectionTitle');
    expect(source).toContain('operatorVehicleQuickViewRentalHealthModuleLabel');
    expect(source).toContain('operatorVehicleQuickViewRentalHealthModulePresentation');
    expect(source).not.toMatch(/'Rental Health'/);
    expect(source).not.toMatch(/'Status nicht verfügbar'/);
    expect(source).not.toMatch(/'Keine Daten'/);
    expect(source).not.toMatch(/'Batterie'/);
    expect(source).not.toMatch(/' · stale'/);
    expect(source).not.toMatch(/locale:\s*'de'/);
    expect(source).not.toMatch(/de-DE/);
  });

  it('keeps OperatorVehicleQuickViewActiveDamages.tsx free of hardcoded active damages presentation literals', () => {
    const source = readFileSync(
      join(__dirname, '../operator/components/OperatorVehicleQuickViewActiveDamages.tsx'),
      'utf8',
    );
    expect(source).toContain('operatorVehicleQuickViewActiveDamagesSectionTitle');
    expect(source).toContain('operatorVehicleQuickViewActiveDamagesRowTitle');
    expect(source).toContain('operatorVehicleQuickViewActiveDamagesImpactLabel');
    expect(source).not.toMatch(/'Aktive Schäden'/);
    expect(source).not.toMatch(/'Keine aktiven Schäden'/);
    expect(source).not.toMatch(/formatDamageType/);
    expect(source).not.toMatch(/locale:\s*'de'/);
    expect(source).not.toMatch(/de-DE/);
  });

  it('keeps operator-tire-measure-i18n.ts on canonical translation keys', () => {
    const source = readFileSync(
      join(__dirname, '../operator/lib/operator-tire-measure-i18n.ts'),
      'utf8',
    );
    expect(source).toContain('TranslationKey');
    expect(source).toContain('operatorTireMeasurePositionShort');
    expect(source).not.toMatch(/'Profiltiefe'/);
    expect(source).not.toMatch(/locale === 'de'/);
    expect(source).not.toMatch(/de-DE/);
  });

  it('keeps operator-pickup-check-i18n.ts on canonical translation keys', () => {
    const source = readFileSync(
      join(__dirname, '../operator/lib/operator-pickup-check-i18n.ts'),
      'utf8',
    );
    expect(source).toContain('TranslationKey');
    expect(source).toContain('operatorPickupCheckFieldLabel');
    expect(source).not.toMatch(/'Ausweis gesehen'/);
    expect(source).not.toMatch(/locale === 'de'/);
    expect(source).not.toMatch(/de-DE/);
  });

  it('keeps operator-damage-capture-i18n.ts on canonical translation keys', () => {
    const source = readFileSync(
      join(__dirname, '../operator/lib/operator-damage-capture-i18n.ts'),
      'utf8',
    );
    expect(source).toContain('TranslationKey');
    expect(source).toContain('operatorDamageCaptureValidationMessage');
    expect(source).not.toMatch(/'Schaden erfassen'/);
    expect(source).not.toMatch(/locale === 'de'/);
    expect(source).not.toMatch(/de-DE/);
  });

  it('keeps invoice-documents-i18n.ts on canonical translation keys', () => {
    const source = readFileSync(
      join(__dirname, '../rental/lib/invoice-documents-i18n.ts'),
      'utf8',
    );
    expect(source).toContain('TranslationKey');
    expect(source).toContain('formatInvoiceDocumentDateTime');
    expect(source).not.toMatch(/'Dokumente'/);
    expect(source).not.toMatch(/locale === 'de'/);
    expect(source).not.toMatch(/de-DE/);
  });

  it('keeps InvoiceDocuments.tsx free of hardcoded documents panel presentation literals', () => {
    const source = readFileSync(
      join(__dirname, '../rental/components/invoices/InvoiceDocuments.tsx'),
      'utf8',
    );
    expect(source).toContain("t('invoices.documents.title')");
    expect(source).toContain("t('invoices.documents.action.preview')");
    expect(source).toContain('formatDateTime(doc.createdAt, locale)');
    expect(source).not.toMatch(/Dokumente werden geladen/);
    expect(source).not.toMatch(/PDF wird erzeugt/);
    expect(source).not.toMatch(/de-DE/);
  });

  it('keeps invoiceDocuments.mapper.ts free of hardcoded de-DE formatting', () => {
    const source = readFileSync(
      join(__dirname, '../rental/components/invoices/invoiceDocuments.mapper.ts'),
      'utf8',
    );
    expect(source).toContain('formatInvoiceDocumentDateTime');
    expect(source).not.toMatch(/de-DE/);
  });

  it('keeps send-invoice-i18n.ts on canonical translation keys', () => {
    const source = readFileSync(
      join(__dirname, '../rental/lib/send-invoice-i18n.ts'),
      'utf8',
    );
    expect(source).toContain('TranslationKey');
    expect(source).toContain('invoices.send.defaultBody');
    expect(source).toContain('buildSendInvoiceDefaultBody');
    expect(source).not.toMatch(/'Rechnung per E-Mail senden'/);
    expect(source).not.toMatch(/locale === 'de'/);
    expect(source).not.toMatch(/de-DE/);
  });

  it('keeps SendInvoiceDialog.tsx free of hardcoded send-invoice presentation literals', () => {
    const source = readFileSync(
      join(__dirname, '../rental/components/invoices/SendInvoiceDialog.tsx'),
      'utf8',
    );
    expect(source).toContain("t('invoices.send.title')");
    expect(source).toContain('buildSendInvoiceDefaultBody(locale');
    expect(source).toContain("t('email.send.modal.recipient')");
    expect(source).not.toMatch(/Rechnung per E-Mail senden/);
    expect(source).not.toMatch(/Bitte Empfänger-E-Mail angeben/);
    expect(source).not.toMatch(/de-DE/);
  });

  it('keeps create-invoice-i18n.ts on canonical translation keys', () => {
    const source = readFileSync(
      join(__dirname, '../rental/lib/create-invoice-i18n.ts'),
      'utf8',
    );
    expect(source).toContain('TranslationKey');
    expect(source).toContain('invoices.create.template.standard.name');
    expect(source).toContain('labelCreateInvoiceType');
    expect(source).not.toMatch(/'Ausgangsrechnung'/);
    expect(source).not.toMatch(/locale === 'de'/);
    expect(source).not.toMatch(/de-DE/);
  });

  it('keeps CreateInvoiceDialog.tsx free of hardcoded create-invoice presentation literals', () => {
    const source = readFileSync(
      join(__dirname, '../rental/components/invoices/CreateInvoiceDialog.tsx'),
      'utf8',
    );
    expect(source).toContain("t('invoices.create.typeStep.title')");
    expect(source).toContain('labelCreateInvoiceType(locale');
    expect(source).toContain('formatCreateInvoiceAmount(locale');
    expect(source).not.toMatch(/Rechnungsart wählen/);
    expect(source).not.toMatch(/Rechnung erstellen/);
    expect(source).not.toMatch(/de-DE/);
  });

  it('keeps parts-accessories-i18n.ts on canonical translation keys', () => {
    const source = readFileSync(
      join(__dirname, '../rental/lib/parts-accessories-i18n.ts'),
      'utf8',
    );
    expect(source).toContain('TranslationKey');
    expect(source).toContain('partsAccessories.category.TIRES.label');
    expect(source).toContain('labelCategory');
    expect(source).not.toMatch(/'Tires'/);
    expect(source).not.toMatch(/locale === 'de'/);
    expect(source).not.toMatch(/de-DE/);
  });

  it('keeps PartsAccessoriesView.tsx free of hardcoded parts presentation literals', () => {
    const source = readFileSync(
      join(__dirname, '../rental/components/PartsAccessoriesView.tsx'),
      'utf8',
    );
    expect(source).toContain("t('nav.partsAccessories')");
    expect(source).toContain("t('partsAccessories.vehicle.title')");
    expect(source).toContain('labelCategory(locale');
    expect(source).toContain('formatPartsPrice(locale');
    expect(source).not.toMatch(/Parts & Accessories/);
    expect(source).not.toMatch(/Search Results/);
    expect(source).not.toMatch(/Confirm & Search/);
    expect(source).not.toMatch(/de-DE/);
  });

  it('keeps insurances-i18n.ts on canonical translation keys', () => {
    const source = readFileSync(
      join(__dirname, '../rental/lib/insurances-i18n.ts'),
      'utf8',
    );
    expect(source).toContain('TranslationKey');
    expect(source).toContain('insurances.status.ACTIVE');
    expect(source).toContain('labelInsuranceStatus');
    expect(source).not.toMatch(/'Active'/);
    expect(source).not.toMatch(/locale === 'de'/);
  });

  it('keeps InsurancesView.tsx free of hardcoded insurance presentation literals', () => {
    const source = readFileSync(
      join(__dirname, '../rental/components/InsurancesView.tsx'),
      'utf8',
    );
    expect(source).toContain("t('insurances.title')");
    expect(source).toContain("t('insurances.kpi.totalVehicles')");
    expect(source).toContain('labelInsuranceStatus(locale');
    expect(source).not.toMatch(/Fleet Insurance/);
    expect(source).not.toMatch(/Expiring Soon/);
    expect(source).not.toMatch(/All Statuses/);
    expect(source).not.toMatch(/locale === 'de'/);
  });

  it('keeps DataAuthorizationTab.tsx free of hardcoded data authorization presentation literals', () => {
    const source = readFileSync(
      join(__dirname, '../rental/components/settings/data-authorization/DataAuthorizationTab.tsx'),
      'utf8',
    );
    expect(source).toContain("t('settings.dataAuth.kpi.active')");
    expect(source).toContain("t('tasks.filter.resetFilters')");
    expect(source).toContain("t('common.all')");
    expect(source).not.toMatch(/Filter zurücksetzen/);
    expect(source).not.toMatch(/Aktive Freigaben/);
    expect(source).not.toMatch(/Keine Treffer/);
  });

  it('keeps booking-vehicle-preflight-presentation-i18n.ts on canonical translation keys', () => {
    const source = readFileSync(
      join(__dirname, '../rental/lib/booking-vehicle-preflight-presentation-i18n.ts'),
      'utf8',
    );
    expect(source).toContain('TranslationKey');
    expect(source).toContain('bookings.wizard.vehiclePicker.preflight.vehicleOffline');
    expect(source).toContain('health.rentalBlocked');
    expect(source).not.toMatch(/Nicht vermietbar/);
  });

  it('keeps VehiclePickerStep.tsx free of hardcoded picker presentation literals', () => {
    const source = readFileSync(
      join(__dirname, '../rental/components/new-booking/VehiclePickerStep.tsx'),
      'utf8',
    );
    expect(source).toContain("t('bookings.planner.allStations')");
    expect(source).toContain("t('tasks.filter.resetFilters')");
    expect(source).not.toMatch(/Alle Stationen/);
    expect(source).not.toMatch(/Filter zurücksetzen/);
  });

  it('keeps booking-vehicle-preflight.ts presentation separated from machine semantics', () => {
    const source = readFileSync(
      join(__dirname, '../rental/lib/booking-vehicle-preflight.ts'),
      'utf8',
    );
    expect(source).toContain('booking-vehicle-preflight-presentation-i18n');
    expect(source).toContain('hardBlockReason');
    expect(source).not.toMatch(/Mietfreigabe nicht verifiziert/);
    expect(source).not.toMatch(/VEHICLE_OFFLINE_LABEL/);
  });

  it('keeps task-detail-actions-presentation-i18n.ts on canonical translation keys', () => {
    const source = readFileSync(
      join(__dirname, '../lib/tasks/task-detail-actions-presentation-i18n.ts'),
      'utf8',
    );
    expect(source).toContain('TranslationKey');
    expect(source).toContain('tasks.detail.actions.start');
    expect(source).not.toContain('RESOLUTION_CODE_LABELS');
    expect(source).not.toMatch(/label:\s*'Starten'/);
  });

  it('keeps taskDetailActions.utils.ts free of hardcoded action labels', () => {
    const source = readFileSync(
      join(__dirname, '../lib/tasks/taskDetailActions.utils.ts'),
      'utf8',
    );
    expect(source).toContain('taskDetailActionLabel');
    expect(source).not.toMatch(/'Starten'/);
    expect(source).not.toMatch(/'Erledigen'/);
    expect(source).not.toMatch(/'Kommentar'/);
  });

  it('keeps taskDetailCompletion.utils.ts threading locale into blocker labels', () => {
    const source = readFileSync(
      join(__dirname, '../lib/tasks/taskDetailCompletion.utils.ts'),
      'utf8',
    );
    expect(source).toContain(
      'buildChecklistBlockerLabel(resolveTaskDetailPresentationLocale(locale)',
    );
    expect(source).not.toMatch(/buildChecklistBlockerLabel\(openRequiredTitles\)/);
  });

  it('keeps taskResolution.utils.ts free of hardcoded resolution label maps', () => {
    const source = readFileSync(
      join(__dirname, '../lib/tasks/taskResolution.utils.ts'),
      'utf8',
    );
    expect(source).toContain('taskDetailResolutionCodeLabel');
    expect(source).not.toContain('RESOLUTION_CODE_LABELS');
    expect(source).not.toMatch(/Reifen ersetzt/);
  });

  it('keeps useTaskDetailActions.ts free of hardcoded toast copy', () => {
    const source = readFileSync(
      join(__dirname, '../lib/tasks/hooks/useTaskDetailActions.ts'),
      'utf8',
    );
    expect(source).toContain('taskDetailToastStarted');
    expect(source).not.toMatch(/Aufgabe gestartet/);
    expect(source).not.toMatch(/Aktion fehlgeschlagen/);
  });

  it('keeps TaskDetailCompleteDialog.tsx free of hardcoded completion dialog copy', () => {
    const source = readFileSync(
      join(__dirname, '../lib/tasks/components/TaskDetailCompleteDialog.tsx'),
      'utf8',
    );
    expect(source).toContain('useLanguage');
    expect(source).toContain('tasks.detail.completion.title');
    expect(source).not.toMatch(/Aufgabe abschließen/);
    expect(source).not.toMatch(/Abschluss-Code/);
  });

  it('keeps VehicleTaskDetailDrawer.tsx free of host residual hardcoded copy', () => {
    const source = readFileSync(
      join(__dirname, '../rental/components/tasks/VehicleTaskDetailDrawer.tsx'),
      'utf8',
    );
    expect(source).toContain('useLanguage');
    expect(source).toContain("t('tasks.detail.openInTasks')");
    expect(source).not.toMatch(/In Tasks öffnen/);
    expect(source).not.toMatch(/de-DE/);
  });

  it('keeps OperatorTaskDetail.tsx free of host residual hardcoded copy', () => {
    const source = readFileSync(
      join(__dirname, '../operator/tasks/OperatorTaskDetail.tsx'),
      'utf8',
    );
    expect(source).toContain('useLanguage');
    expect(source).toContain("t('tasks.detail.loadError')");
    expect(source).toContain("t('tasks.detail.commentEmpty')");
    expect(source).toContain("t('tasks.detail.notFound')");
    expect(source).toContain('buildTaskDetailViewModel(task, { locale })');
    expect(source).not.toMatch(/Laden fehlgeschlagen/);
    expect(source).not.toMatch(/Kommentar eingeben/);
    expect(source).not.toMatch(/Aufgabe nicht gefunden/);
    expect(source).not.toMatch(/de-DE/);
  });

  it('keeps taskTimeline.utils.ts machine/descriptor-only without German prose maps', () => {
    const source = readFileSync(
      join(__dirname, '../lib/tasks/taskTimeline.utils.ts'),
      'utf8',
    );
    expect(source).toContain('resolveTimelineTone');
    expect(source).toContain('buildTaskTimelineItems');
    expect(source).not.toContain('TASK_TIMELINE_BRIDGE_LOCALE');
    expect(source).not.toContain('RESOLUTION_CODE_LABELS');
    expect(source).not.toContain('taskStatusLabelDe');
    expect(source).not.toMatch(/hat die Aufgabe erstellt/);
    expect(source).not.toMatch(/locale \?\? 'de-DE'/);
  });

  it('keeps task-timeline-presentation-i18n.ts on canonical translation keys', () => {
    const source = readFileSync(
      join(__dirname, '../lib/tasks/task-timeline-presentation-i18n.ts'),
      'utf8',
    );
    expect(source).toContain('TranslationKey');
    expect(source).toContain('tasks.timeline.event.created.user');
    expect(source).not.toContain('RESOLUTION_CODE_LABELS');
    expect(source).not.toMatch(/label:\s*'Offen'/);
  });

  it('keeps service-task-semantics.ts as machine-only utilities', () => {
    const source = readFileSync(
      join(__dirname, '../rental/lib/service-task-semantics.ts'),
      'utf8',
    );
    expect(source).toContain('isServiceMaintenanceTask');
    expect(source).toContain('boardColumnForTask');
    expect(source).not.toContain('TASK_TYPE_LABEL_DE');
    expect(source).not.toContain('TASK_PRIORITY_LABEL_DE');
    expect(source).not.toContain('TASK_STATUS_LABEL_DE');
    expect(source).not.toMatch(/label:\s*'Offen'/);
  });

  it('keeps service-task-presentation-i18n.ts on canonical translation keys', () => {
    const source = readFileSync(
      join(__dirname, '../lib/tasks/service-task-presentation-i18n.ts'),
      'utf8',
    );
    expect(source).toContain('TranslationKey');
    expect(source).toContain('tasks.type.VEHICLE_SERVICE');
    expect(source).not.toMatch(/Fahrzeug-Service/);
  });

  it('keeps task-detail-presentation-i18n.ts on canonical translation keys', () => {
    const source = readFileSync(
      join(__dirname, '../lib/tasks/task-detail-presentation-i18n.ts'),
      'utf8',
    );
    expect(source).toContain('TranslationKey');
    expect(source).toContain('tasks.detail.linked.VEHICLE');
    expect(source).not.toMatch(/Verknüpfte Objekte/);
    expect(source).not.toMatch(/de-DE/);
  });

  it('keeps taskDetailChecklist.utils.ts free of hardcoded presentation prose', () => {
    const source = readFileSync(
      join(__dirname, '../lib/tasks/taskDetailChecklist.utils.ts'),
      'utf8',
    );
    expect(source).toContain('taskDetailChecklistProgressLabel');
    expect(source).not.toMatch(/Pflichtpunkt offen/);
    expect(source).not.toMatch(/von \$\{/);
  });

  it('keeps taskDetailView.utils.ts free of hardcoded linked-object label maps', () => {
    const source = readFileSync(
      join(__dirname, '../lib/tasks/taskDetailView.utils.ts'),
      'utf8',
    );
    expect(source).toContain('taskDetailLinkedObjectTypeLabel');
    expect(source).not.toContain('LINKED_OBJECT_TYPE_LABELS');
    expect(source).not.toMatch(/Fahrzeug':/);
  });

  it('keeps vendor-directory-i18n.ts on canonical translation keys', () => {
    const source = readFileSync(
      join(__dirname, '../rental/lib/vendor-directory-i18n.ts'),
      'utf8',
    );
    expect(source).toContain('TranslationKey');
    expect(source).toContain('VENDOR_CATEGORY_LABEL_KEY_ENTRIES');
    expect(source).toContain('tasks.vendor.category.WORKSHOP');
    expect(source).not.toMatch(/label:\s*'Werkstatt'/);
    expect(source).not.toMatch(/toLocaleDateString\('de-DE'/);
  });

  it('keeps vendor-directory.utils.ts as machine-only config', () => {
    const source = readFileSync(
      join(__dirname, '../rental/lib/vendor-directory.utils.ts'),
      'utf8',
    );
    expect(source).toContain('VENDOR_CATEGORIES');
    expect(source).not.toMatch(/label:\s*'/);
    expect(source).not.toMatch(/getVendorCategoryLabel/);
  });

  it('keeps VendorManagementView free of bilingual embeddedInServiceCenter copy ternaries', () => {
    const source = readFileSync(
      join(__dirname, '../rental/components/VendorManagementView.tsx'),
      'utf8',
    );
    expect(source).not.toMatch(/embeddedInServiceCenter \? '/);
    expect(source).toContain("t('vendors.directory.");
    expect(source).toContain('useLanguage');
  });

  it('keeps invoice-list-i18n.ts on canonical translation keys', () => {
    const source = readFileSync(
      join(__dirname, '../rental/lib/invoice-list-i18n.ts'),
      'utf8',
    );
    expect(source).toContain('TranslationKey');
    expect(source).toContain('INVOICE_STATUS_FILTER_OPTIONS');
    expect(source).toContain('invoices.list.status.ISSUED');
    expect(source).not.toMatch(/label:\s*'Entwurf'/);
    expect(source).not.toMatch(/toLocaleDateString\('de-DE'/);
  });

  it('keeps invoiceConstants.ts as machine-only re-exports', () => {
    const source = readFileSync(
      join(__dirname, '../rental/components/invoices/invoiceConstants.ts'),
      'utf8',
    );
    expect(source).toContain('invoice-list-i18n');
    expect(source).not.toMatch(/Buchungsrechnung/);
  });

  it('keeps InvoiceFilters free of hardcoded German presentation literals', () => {
    const source = readFileSync(
      join(__dirname, '../rental/components/invoices/InvoiceFilters.tsx'),
      'utf8',
    );
    expect(source).not.toMatch(/Filter zurücksetzen/);
    expect(source).not.toMatch(/Rechnungen durchsuchen/);
    expect(source).toContain("t('invoices.list.");
  });

  it('keeps FinesView free of hardcoded presentation literals', () => {
    const source = readFileSync(
      join(__dirname, '../rental/components/FinesView.tsx'),
      'utf8',
    );
    const bannedPatterns = [
      /Bußgelder/,
      /Manuell erfassen/,
      /Alle Status/,
      /Keine Bußgelder gefunden/,
      /STATUS_MAP/,
      /OFFENSE_TYPES/,
      /toLocaleDateString\('de-DE'/,
      /NumberFormat\('de-DE'/,
      /'Filters'/,
      /Clear filters/,
    ];
    for (const pattern of bannedPatterns) {
      expect(source, pattern.toString()).not.toMatch(pattern);
    }
    expect(source).toContain("t('fines.");
    expect(source).toContain('labelFineStatus');
  });

  it('keeps fines-i18n.ts on canonical translation keys', () => {
    const source = readFileSync(
      join(__dirname, '../rental/lib/fines-i18n.ts'),
      'utf8',
    );
    expect(source).toContain('TranslationKey');
    expect(source).toContain('FINE_OFFENSE_TYPE_VALUES');
    expect(source).toContain('fines.status.NEW');
    expect(source).not.toMatch(/label:\s*'Neu'/);
  });

  it('keeps operatorHandoverPayload.ts on messageKey validation issues', () => {
    const source = readFileSync(
      join(__dirname, '../operator/handover/operatorHandoverPayload.ts'),
      'utf8',
    );
    expect(source).toContain('messageKey:');
    expect(source).toContain('OPERATOR_HANDOVER_TIRE_MEASUREMENT_NOTE');
    expect(source).not.toMatch(/message:\s*'/);
    expect(source).not.toMatch(/Bitte Pflichtfelder/);
  });

  it('keeps operatorHandoverTechnicalObservations.ts on labelKey chips', () => {
    const source = readFileSync(
      join(__dirname, '../operator/handover/operatorHandoverTechnicalObservations.ts'),
      'utf8',
    );
    expect(source).toContain('labelKey:');
    expect(source).toContain('placeholderKey:');
    expect(source).not.toMatch(/label:\s*'Wischer'/);
  });

  it('keeps operator-handover-i18n.ts on canonical keys and machine constants', () => {
    const source = readFileSync(
      join(__dirname, '../operator/handover/operator-handover-i18n.ts'),
      'utf8',
    );
    expect(source).toContain("HANDOVER_REPORTED_BY_FALLBACK");
    expect(source).toContain('OPERATOR_HANDOVER_TIRE_MEASUREMENT_NOTE');
    expect(source).toContain('handover.operator.');
    expect(source).not.toMatch(/return\s+'Pickup'/);
  });

  it('keeps OperatorHandoverFlow free of hardcoded German presentation literals', () => {
    const source = readFileSync(
      join(__dirname, '../operator/handover/OperatorHandoverFlow.tsx'),
      'utf8',
    );
    const bannedPatterns = [
      /STEP_LABELS/,
      /Schritt \{/,
      /Bitte Pflichtfelder/,
      /Übergabe konnte nicht/,
      /Zurück/,
      /Weiter/,
      /Schließen/,
    ];
    for (const pattern of bannedPatterns) {
      expect(source, pattern.toString()).not.toMatch(pattern);
    }
    expect(source).toContain('resolveOperatorValidationMessage');
    expect(source).toContain('labelOperatorHandoverStep');
  });

  it('keeps OperatorHandoverStepDamages on localized damage labels and Handover reportedBy', () => {
    const source = readFileSync(
      join(__dirname, '../operator/handover/OperatorHandoverStepDamages.tsx'),
      'utf8',
    );
    expect(source).toContain('HANDOVER_REPORTED_BY_FALLBACK');
    expect(source).toContain('labelOperatorDamageType');
    expect(source).not.toContain('formatDamageType');
    expect(source).not.toMatch(/reportedBy:\s*form\.state\.staffName \|\| 'Handover'/);
  });

  it('keeps bookingHandoverGates.ts free of user-facing presentation literals', () => {
    const source = readFileSync(
      join(__dirname, '../rental/lib/bookingHandoverGates.ts'),
      'utf8',
    );
    const bannedPatterns = [
      /Pickup nur bei/,
      /Pickup-Protokoll bereits/,
      /Pickup nicht möglich:/,
      /Kunde nicht mietberechtigt/,
      /Return nicht möglich/,
      /Return erst nach Pickup/,
      /Rückgabe bereits erfasst/,
    ];
    for (const pattern of bannedPatterns) {
      expect(source, pattern.toString()).not.toMatch(pattern);
    }
    expect(source).toContain('reasonKey');
    expect(source).toContain('handover.gates.');
  });

  it('keeps BookingHandoverTab free of hardcoded row/action presentation literals', () => {
    const source = readFileSync(
      join(__dirname, '../rental/components/booking-detail/BookingHandoverTab.tsx'),
      'utf8',
    );
    const bannedPatterns = [
      /label="Zeitpunkt"/,
      /label="Mitarbeiter"/,
      /'Protokoll anzeigen'/,
      /'Pickup starten'/,
      /'Vollständig'/,
      /'Voll'/,
    ];
    for (const pattern of bannedPatterns) {
      expect(source, pattern.toString()).not.toMatch(pattern);
    }
    expect(source).toContain('handover.tab.');
    expect(source).toContain('resolveHandoverGateReason');
  });

  it('keeps handover-i18n.ts on canonical translation keys', () => {
    const source = readFileSync(
      join(__dirname, '../rental/components/handover/handover-i18n.ts'),
      'utf8',
    );
    expect(source).toContain("HANDOVER_REPORTED_BY_FALLBACK = 'Handover'");
    expect(source).toContain('TranslationKey');
    expect(source).not.toMatch(/return\s+'Kratzer'/);
  });

  it('keeps whatsapp.ops.ts free of user-facing presentation literals', () => {
    const source = readFileSync(
      join(__dirname, '../rental/components/whatsapp/whatsapp.ops.ts'),
      'utf8',
    );
    const bannedPatterns = [
      /label:\s*'[A-Z]/,
      /description:\s*'[A-Z]/,
      /return\s+'Connected'/,
      /return\s+'Queued'/,
      /'Overview'/,
      /'Booking confirmation'/,
      /'just now'/,
    ];
    for (const pattern of bannedPatterns) {
      expect(source, pattern.toString()).not.toMatch(pattern);
    }
    expect(source).toContain('TranslationKey');
    expect(source).toContain('INBOX_FILTER_DEFS');
  });

  it('keeps support-center.utils.ts free of user-facing presentation literals', () => {
    const source = readFileSync(
      join(__dirname, '../rental/components/support/support-center.utils.ts'),
      'utf8',
    );
    const bannedPatterns = [
      /OPEN:\s*'Neu'/,
      /IN_PROGRESS:\s*'In Bearbeitung'/,
      /title:\s*'App/,
      /return\s+'Gerade eben'/,
      /return\s+'SynqDrive Support'/,
      /VEHICLE:\s*'Fahrzeug'/,
    ];
    for (const pattern of bannedPatterns) {
      expect(source, pattern.toString()).not.toMatch(pattern);
    }
    expect(source).toContain('TranslationKey');
    expect(source).toContain('QUICK_ISSUE_CARD_DEFS');
  });

  it('keeps support-ops.utils.ts free of user-facing presentation literals', () => {
    const source = readFileSync(
      join(__dirname, '../master/components/support-ops/support-ops.utils.ts'),
      'utf8',
    );
    const bannedPatterns = [
      /MASTER_SUPPORT_LOCALE/,
      /support-i18n/,
      /label:\s*'Alle offenen'/,
      /label:\s*'Kritisch'/,
      /return\s+'< 1 min'/,
      /OPEN:\s*'Neu'/,
      /SUPPORT_QUEUES/,
      /SUPPORT_STATUS_LABEL/,
      /formatDurationMs/,
      /formatDateTime/,
      /'Queues'/,
      /'Ø Erstantwort'/,
    ];
    for (const pattern of bannedPatterns) {
      expect(source, pattern.toString()).not.toMatch(pattern);
    }
    expect(source).toContain('TranslationKey');
    expect(source).toContain('SUPPORT_QUEUE_DEFS');
  });

  it('keeps SupportTechnicalContextCard free of hardcoded presentation literals', () => {
    const source = readFileSync(
      join(__dirname, '../components/support/SupportTechnicalContextCard.tsx'),
      'utf8',
    );
    const bannedPatterns = [
      /Technischer Kontext/,
      /Quellseite/,
      /Nicht verfügbar/,
      /label:\s*'Fahrzeug/,
      /'Ja'\s*:\s*'Nein'/,
      /formatDateTimeDe/,
      /support-ops\.utils/,
    ];
    for (const pattern of bannedPatterns) {
      expect(source, pattern.toString()).not.toMatch(pattern);
    }
    expect(source).toContain('support.ops.technicalContext.title');
    expect(source).toContain('useLanguage');
  });
});
