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
  'rental/components/documents/VehicleDocumentUploadDrawer.tsx',
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

describe('hardcoded copy guardrails (P2.1 + P2.2.1 + P2.2.2 + P2.2.3 + P2.2.4 + P2.2.5 + P2.2.6 + P2.2.7A + P2.2.7B + P2.2.8 + P2.2.9 + P2.2.10 + P2.2.11 + P2.2.12 + P2.2.13 + P2.2.14 enforce-clean surfaces)', () => {
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
