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

function isP27AEnforceCleanPath(relPath: string): boolean {
  return P27A_ENFORCE_CLEAN_EXACT.includes(relPath);
}

function isP27BEnforceCleanPath(relPath: string): boolean {
  return P27B_ENFORCE_CLEAN_EXACT.includes(relPath);
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

describe('hardcoded copy guardrails (P2.1 + P2.2.1 + P2.2.2 + P2.2.3 + P2.2.4 + P2.2.5 + P2.2.6 + P2.2.7A + P2.2.7B enforce-clean surfaces)', () => {
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
});
