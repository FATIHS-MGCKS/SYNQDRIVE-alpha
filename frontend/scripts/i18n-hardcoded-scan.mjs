#!/usr/bin/env node
/**
 * Deterministic hardcoded user-facing copy inventory for SynqDrive i18n P2+.
 * Excludes translation dictionaries, tests, and developer-only strings.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const frontendRoot = join(__dirname, '..');
const srcRoot = join(frontendRoot, 'src');
const inventoryPath = join(srcRoot, 'i18n/hardcoded-copy-inventory.json');

const SCAN_ROOTS = [
  join(srcRoot, 'App.tsx'),
  join(srcRoot, 'pages'),
  join(srcRoot, 'components'),
  join(srcRoot, 'i18n/components'),
  join(srcRoot, 'rental'),
  join(srcRoot, 'master'),
  join(srcRoot, 'operator'),
  join(srcRoot, 'lib'),
].filter((target) => existsSync(target));

const SKIP_FILE_RE =
  /\.(test|spec)\.(ts|tsx)$|translations\/|legal-documents\.|hardcoded-copy-inventory|login-copy\.ts$|test-utils\.ts$/;
const SKIP_DIR_RE = /\/(__tests__|node_modules)\//;

const P21_ENFORCE_CLEAN_EXACT = new Set([
  'pages/LoginPage.tsx',
  'pages/VerificationDonePage.tsx',
  'i18n/components/LanguageSelector.tsx',
  'App.tsx',
  'rental/components/TopBar.tsx',
  'rental/components/Sidebar.tsx',
  'rental/components/DashboardView.tsx',
]);

const P21_ENFORCE_CLEAN_PREFIXES = ['rental/components/dashboard/'];

const P22_ENFORCE_CLEAN_EXACT = new Set([
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
]);

const P23_ENFORCE_CLEAN_EXACT = new Set([
  'rental/components/BookingsView.tsx',
  'rental/components/NewBookingView.tsx',
  'rental/components/BookingDocumentsSection.tsx',
  'rental/components/CustomersView.tsx',
  'rental/components/CustomerDetailView.tsx',
  'rental/components/CustomerDetailModal.tsx',
  'rental/components/CustomerDocumentUploadBox.tsx',
]);

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

const P24_ENFORCE_CLEAN_EXACT = new Set([
  'rental/components/TasksView.tsx',
  'rental/components/SettingsView.tsx',
]);

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

const P25_ENFORCE_CLEAN_EXACT = new Set([
  'rental/components/WorkflowAutomationView.tsx',
]);

const P25_ENFORCE_CLEAN_PREFIXES = [
  'rental/components/workflow-automation/',
];

const P26_ENFORCE_CLEAN_PREFIXES = [
  'rental/components/stations/',
];

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
  'rental/components/documents/VehicleDocumentUploadDrawer.tsx',
  'rental/lib/vehicle-',
  'rental/lib/fleet',
  'rental/lib/health-',
  'rental/lib/tire-',
  'rental/lib/brake-',
  'rental/lib/battery-',
  'rental/lib/service-',
  'rental/lib/rental-health-',
  'rental/lib/vehicle-operational-state/',
  'rental/lib/vehicle-operational-query/',
  'rental/lib/battery-health-query/',
  'rental/lib/rental-health-query/',
  'lib/formatVehicleDisplay.ts',
];

const CATEGORY_PATTERNS = [
  { category: 'ARIA', re: /aria-label\s*=\s*\{?\s*t\(/g, skip: true },
  { category: 'ARIA', re: /aria-label\s*=\s*\{?\s*dt\(/g, skip: true },
  { category: 'ARIA', re: /aria-label\s*=\s*[{'"]([^'"{}]+)/g },
  { category: 'ARIA', re: /aria-description\s*=\s*[{'"]([^'"{}]+)/g },
  { category: 'PLACEHOLDER', re: /placeholder\s*=\s*\{?\s*t\(/g, skip: true },
  { category: 'PLACEHOLDER', re: /placeholder\s*=\s*[{'"]([^'"{}]+)/g },
  { category: 'TITLE', re: /title\s*=\s*\{?\s*t\(/g, skip: true },
  { category: 'TITLE', re: /title\s*=\s*\{?\s*dt\(/g, skip: true },
  { category: 'TITLE', re: /title\s*=\s*[{'"]([^'"{}]+)/g },
  { category: 'TEXT', re: />\s*([A-Za-zÄÖÜäöüß][^<>{}\n]{2,}?)\s*</g },
  { category: 'LABEL', re: /<label[^>]*>\s*([A-Za-zÄÖÜäöüß][^<]{2,})\s*<\/label>/g },
  { category: 'FORMAT_LOCALE', re: /['"](de-DE|en-US|en-GB)['"]/g },
];

function isLikelyUserCopy(sample) {
  if (!sample || sample.length < 3) return false;
  if (/useState|=>|\)\s*:|function|const |let |var |===|!==|\?\s*\(|setOpen\(|\)\s*:/.test(sample)) {
    return false;
  }
  if (/\$\{|\.[a-zA-Z]+\(|^\?\s|^\?\?|\?\s*`|\?\s*de\s*\?|&&/.test(sample)) {
    return false;
  }
  if (/^[a-zA-Z_$][\w$]*(\.[a-zA-Z_$][\w$]*)+$/.test(sample)) {
    return false;
  }
  if (/\?\?/.test(sample)) {
    return false;
  }
  if (/^[a-zA-Z_$][\w$]*\([^)]*\)?$/.test(sample)) {
    return false;
  }
  if (/^(void|never)\s*\|/.test(sample)) {
    return false;
  }
  if (/\bas\s+Record\b/.test(sample)) {
    return false;
  }
  if (!/[A-Za-zÄÖÜäöüß]{3,}/.test(sample)) return false;
  if (IGNORE_TEXT_RE.test(sample)) return false;
  if (IGNORE_LITERAL_RE.test(sample)) return false;
  return true;
}

const IGNORE_TEXT_RE =
  /^(true|false|null|undefined|\d+|#[0-9a-f]{3,8}|var\(--|w-\d|h-\d|flex|grid|px-|py-|text-|bg-|border-|rounded|hidden|block|sm:|md:|lg:|[A-Z_]{3,}|\/[a-z]|&mdash;)$/i;
const IGNORE_LITERAL_RE = new RegExp(
  '^(GET|POST|PUT|PATCH|DELETE|Bearer|Content-Type|application/|synqdrive\\.|https?://|#[0-9a-f]{3,8}|[a-z]+-[a-z-]+)$',
  'i',
);

function classifySurface(filePath) {
  const rel = relative(srcRoot, filePath).replace(/\\/g, '/');
  if (rel.startsWith('pages/Login') || rel === 'pages/login-copy.ts') return 'LOGIN';
  if (rel.startsWith('pages/')) return 'SHELL';
  if (rel === 'App.tsx' || rel.startsWith('components/') || rel.startsWith('i18n/components/')) {
    return 'SHELL';
  }
  if (rel.startsWith('rental/')) return 'RENTAL';
  if (rel.startsWith('master/')) return 'MASTER';
  if (rel.startsWith('operator/')) return 'OPERATOR';
  if (rel.startsWith('shared/') || rel.startsWith('lib/')) return 'SHARED';
  return 'OTHER';
}

function classifyRentalModule(relPath) {
  if (relPath === 'rental/App.tsx') return 'App / routing shell';
  if (relPath.includes('rental/components/TopBar')) return 'TopBar';
  if (relPath.includes('rental/components/Sidebar')) return 'Sidebar / navigation';
  if (
    relPath.includes('rental/components/DashboardView') ||
    relPath.startsWith('rental/components/dashboard/')
  ) {
    return 'Dashboard';
  }
  if (
    relPath.includes('HealthErrorsView') ||
    relPath.startsWith('rental/components/health/') ||
    relPath.startsWith('rental/components/battery/') ||
    relPath.includes('DashboardWarningLights') ||
    relPath.includes('rental-health')
  ) {
    return 'Vehicle Health';
  }
  if (
    relPath.startsWith('rental/components/trips/') ||
    relPath.includes('VehicleTripsFilterBar')
  ) {
    return 'Vehicle Trips';
  }
  if (
    relPath.startsWith('rental/components/service-center/') ||
    relPath.includes('service-info-display') ||
    relPath.includes('service-history') ||
    relPath.includes('service-schedule') ||
    relPath.includes('service-task-')
  ) {
    return 'Vehicle Maintenance';
  }
  if (
    relPath.startsWith('rental/components/vehicle-detail/') ||
    relPath.includes('VehicleOverview') ||
    relPath.includes('OverviewLiveMap') ||
    relPath.includes('VehicleDeviceConnection') ||
    relPath.includes('VehicleDrivingAssessment') ||
    relPath.includes('VehicleServiceContext') ||
    relPath.includes('VehicleRentalRequirements')
  ) {
    if (
      relPath.includes('VehicleTripsFilterBar') ||
      relPath.includes('VehicleBookings') ||
      relPath.includes('VehicleTasks')
    ) {
      return relPath.includes('VehicleTrips') ? 'Vehicle Trips' : 'Vehicle Detail';
    }
    return relPath.includes('VehicleOverview') ||
      relPath.includes('OverviewLiveMap') ||
      relPath.includes('VehicleDeviceConnection') ||
      relPath.includes('VehicleDrivingAssessment') ||
      relPath.includes('VehicleServiceContext') ||
      relPath.includes('VehicleRentalRequirements') ||
      relPath.includes('VehicleHealthBox')
      ? 'Vehicle Overview'
      : 'Vehicle Detail';
  }
  if (
    relPath.includes('FleetHubView') ||
    relPath.includes('FleetView') ||
    relPath.includes('FleetCondition') ||
    relPath.includes('FleetMapControls') ||
    relPath.includes('LiveMapOverview') ||
    relPath.includes('StatInlineDetail') ||
    relPath.startsWith('rental/components/fleet/') ||
    relPath.startsWith('rental/components/fleet-operator/') ||
    relPath.startsWith('rental/components/fleet-connectivity/') ||
    relPath.startsWith('rental/components/fleet-health-service/') ||
    relPath.includes('fleetVehicleDisplay') ||
    relPath.includes('fleetVisualState') ||
    relPath.includes('fleet-operator-panel') ||
    relPath.includes('fleet-command') ||
    relPath.includes('formatVehicleDisplay')
  ) {
    return 'Fleet Shell';
  }
  if (relPath.includes('booking') || relPath.includes('Booking')) return 'Bookings';
  if (relPath.includes('customer')) return 'Customers';
  if (relPath === 'rental/components/SettingsView.tsx') return 'Settings';
  if (
    relPath.includes('workflow-automation') ||
    relPath === 'rental/components/WorkflowAutomationView.tsx'
  ) {
    return 'Workflow Automation';
  }
  if (relPath.includes('voice-assistant')) return 'Voice Assistant';
  if (relPath.includes('whatsapp')) return 'WhatsApp';
  if (
    (relPath.includes('task') || relPath.includes('Task')) &&
    !relPath.includes('fleet-health-service') &&
    !relPath.includes('service-center')
  ) {
    return 'Tasks';
  }
  if (relPath.includes('notification') && !relPath.includes('dashboard/notifications')) {
    return 'Notifications';
  }
  if (relPath.includes('document') && !relPath.includes('VehicleDocument')) return 'Documents';
  if (relPath.includes('invoice') || relPath.includes('finance') || relPath.includes('billing')) {
    return 'Finance/Billing';
  }
  if (relPath.includes('settings')) return 'Settings';
  if (relPath.includes('insurance') || relPath.includes('parts-accessories') || relPath.includes('integration')) {
    return 'Integrations';
  }
  if (relPath.includes('data-analyse') || relPath.includes('financial-insight') || relPath.includes('report')) {
    return 'Reports/Analytics';
  }
  if (relPath.includes('station')) return 'Stations';
  if (relPath.includes('support') || relPath.includes('help-center')) return 'Support';
  return 'other Rental areas';
}

function isP24EnforceCleanPath(relPath) {
  if (P24_ENFORCE_CLEAN_EXACT.has(relPath)) return true;
  return P24_ENFORCE_CLEAN_PREFIXES.some((prefix) => relPath.startsWith(prefix));
}

function isP25EnforceCleanPath(relPath) {
  if (P25_ENFORCE_CLEAN_EXACT.has(relPath)) return true;
  return P25_ENFORCE_CLEAN_PREFIXES.some((prefix) => relPath.startsWith(prefix));
}

function isP26EnforceCleanPath(relPath) {
  return P26_ENFORCE_CLEAN_PREFIXES.some((prefix) => relPath.startsWith(prefix));
}

function isP22EnforceCleanPath(relPath) {
  if (P22_ENFORCE_CLEAN_EXACT.has(relPath)) return true;
  return P22_ENFORCE_CLEAN_PREFIXES.some((prefix) => relPath.startsWith(prefix));
}

function isP23EnforceCleanPath(relPath) {
  if (P23_ENFORCE_CLEAN_EXACT.has(relPath)) return true;
  return P23_ENFORCE_CLEAN_PREFIXES.some((prefix) => relPath.startsWith(prefix));
}

function isEnforcedCleanSurface(surface, relPath) {
  if (surface === 'LOGIN') return true;
  if (relPath === 'i18n/components/LanguageSelector.tsx') return true;
  if (relPath === 'pages/VerificationDonePage.tsx') return true;
  if (relPath === 'App.tsx') return true;
  if (P21_ENFORCE_CLEAN_EXACT.has(relPath)) return true;
  if (surface === 'RENTAL' && P21_ENFORCE_CLEAN_PREFIXES.some((prefix) => relPath.startsWith(prefix))) {
    return true;
  }
  if (surface === 'RENTAL' && isP22EnforceCleanPath(relPath)) return true;
  if (surface === 'RENTAL' && isP23EnforceCleanPath(relPath)) return true;
  if (surface === 'RENTAL' && isP24EnforceCleanPath(relPath)) return true;
  if (surface === 'RENTAL' && isP25EnforceCleanPath(relPath)) return true;
  if (surface === 'RENTAL' && isP26EnforceCleanPath(relPath)) return true;
  return false;
}

function migrationPhaseFor(relPath, surface) {
  if (!isEnforcedCleanSurface(surface, relPath)) {
    return surface === 'LOGIN' || surface === 'SHELL' ? 'P2.1' : surface === 'RENTAL' ? 'P2.2' : 'P2.3';
  }
  if (isP23EnforceCleanPath(relPath)) return 'P2.2.3';
  if (isP26EnforceCleanPath(relPath)) return 'P2.2.6';
  if (isP25EnforceCleanPath(relPath)) return 'P2.2.5';
  if (isP24EnforceCleanPath(relPath)) return 'P2.2.4';
  if (
    relPath.startsWith('rental/components/dashboard/') ||
    P21_ENFORCE_CLEAN_EXACT.has(relPath)
  ) {
    return 'P2.2.1';
  }
  return 'P2.2.2';
}

function collectFiles(target, files = []) {
  if (/\.(tsx|ts)$/.test(target)) {
    if (!SKIP_FILE_RE.test(target)) files.push(target);
    return files;
  }
  for (const entry of readdirSync(target, { withFileTypes: true })) {
    const full = join(target, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIR_RE.test(full)) collectFiles(full, files);
      continue;
    }
    if (!/\.(tsx|ts)$/.test(entry.name)) continue;
    if (SKIP_FILE_RE.test(full)) continue;
    files.push(full);
  }
  return files;
}

function normalizeText(text) {
  return text.replace(/\s+/g, ' ').trim();
}

function collectFindings(filePath, source) {
  const relPath = relative(srcRoot, filePath).replace(/\\/g, '/');
  const surface = classifySurface(filePath);
  const module = surface === 'RENTAL' ? classifyRentalModule(relPath) : null;
  const findings = [];

  for (const pattern of CATEGORY_PATTERNS) {
    const { category, re, skip } = pattern;
    if (skip) continue;
    if ((category === 'TEXT' || category === 'LABEL') && !filePath.endsWith('.tsx')) continue;
    re.lastIndex = 0;
    let match;
    while ((match = re.exec(source)) !== null) {
      const sample = normalizeText(match[1] ?? match[0]);
      const context = source.slice(match.index, match.index + 160);
      if (/\b(aria-label|placeholder|title)\s*=\s*\{[^}]*\b(t|dt)\(/.test(context)) continue;
      if (/\b(aria-label|placeholder|title)\s*=\s*\{[a-zA-Z_$][\w$.]*\([^}]*\}/.test(context)) continue;
      if (!isLikelyUserCopy(sample) && category !== 'FORMAT_LOCALE') continue;

      const line = source.slice(0, match.index).split('\n').length;
      findings.push({
        file: relPath,
        line,
        surface,
        module,
        category,
        sample: sample.slice(0, 120),
        severity: isEnforcedCleanSurface(surface, relPath) ? 'enforce-clean' : 'debt',
        migrationPhase: migrationPhaseFor(relPath, surface),
      });
    }
  }

  return findings;
}

function dedupeFindings(findings) {
  const map = new Map();
  for (const finding of findings) {
    const key = `${finding.surface}|${finding.category}|${finding.sample}`;
    const existing = map.get(key);
    if (existing) {
      existing.occurrences = (existing.occurrences ?? 1) + 1;
      existing.files = [...new Set([...(existing.files ?? [existing.file]), finding.file])];
      continue;
    }
    map.set(key, { ...finding, occurrences: 1, files: [finding.file] });
  }
  return [...map.values()].sort((a, b) => a.surface.localeCompare(b.surface) || a.sample.localeCompare(b.sample));
}

function summarize(findings) {
  const bySurface = {};
  const byCategory = {};
  const byRentalModule = {};
  for (const finding of findings) {
    bySurface[finding.surface] = (bySurface[finding.surface] ?? 0) + 1;
    byCategory[finding.category] = (byCategory[finding.category] ?? 0) + 1;
    if (finding.surface === 'RENTAL' && finding.module) {
      byRentalModule[finding.module] = (byRentalModule[finding.module] ?? 0) + 1;
    }
  }
  return {
    total: findings.length,
    bySurface,
    byCategory,
    byRentalModule,
    enforceCleanRemaining: findings.filter((f) => f.severity === 'enforce-clean').length,
  };
}

const files = [...new Set(SCAN_ROOTS.flatMap((root) => collectFiles(root)))];
const rawFindings = files.flatMap((file) => {
  const source = readFileSync(file, 'utf8');
  return collectFindings(file, source);
});
const findings = dedupeFindings(rawFindings);
const summary = summarize(findings);

const inventory = {
  version: 2,
  generatedAt: new Date().toISOString().slice(0, 10),
  phases: {
    P21: {
      enforceCleanExact: [...P21_ENFORCE_CLEAN_EXACT],
      enforceCleanPrefixes: [...P21_ENFORCE_CLEAN_PREFIXES],
    },
    P22: {
      enforceCleanExact: [...P22_ENFORCE_CLEAN_EXACT],
      enforceCleanPrefixes: [...P22_ENFORCE_CLEAN_PREFIXES],
    },
    P23: {
      enforceCleanExact: [...P23_ENFORCE_CLEAN_EXACT],
      enforceCleanPrefixes: [...P23_ENFORCE_CLEAN_PREFIXES],
    },
    P24: {
      enforceCleanExact: [...P24_ENFORCE_CLEAN_EXACT],
      enforceCleanPrefixes: [...P24_ENFORCE_CLEAN_PREFIXES],
    },
  },
  summary,
  findings,
};

writeFileSync(inventoryPath, `${JSON.stringify(inventory, null, 2)}\n`);
console.log('Hardcoded copy inventory');
console.log(`Total unique findings: ${summary.total}`);
console.log('By surface:', summary.bySurface);
console.log('By category:', summary.byCategory);
console.log('Rental by module:', summary.byRentalModule);
console.log(`Enforce-clean surface findings: ${summary.enforceCleanRemaining}`);
console.log(`Wrote ${relative(frontendRoot, inventoryPath)}`);
