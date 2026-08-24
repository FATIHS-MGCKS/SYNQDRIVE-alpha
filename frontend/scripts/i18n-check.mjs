#!/usr/bin/env node
/**
 * SynqDrive i18n structural health + translation coverage + hardcoded copy guardrails.
 */
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const frontendRoot = join(__dirname, '..');

const scanResult = spawnSync('node', ['scripts/i18n-hardcoded-scan.mjs'], {
  cwd: frontendRoot,
  stdio: 'inherit',
  shell: false,
});

if (scanResult.status !== 0) {
  process.exit(scanResult.status ?? 1);
}

const shimInventory = spawnSync('node', ['scripts/i18n-shim-inventory.mjs'], {
  cwd: frontendRoot,
  stdio: 'inherit',
  shell: false,
});

if (shimInventory.status !== 0) {
  process.exit(shimInventory.status ?? 1);
}

const testFiles = [
  'src/i18n/locales.test.ts',
  'src/i18n/i18n-structural-check.test.ts',
  'src/i18n/LanguageContext.test.tsx',
  'src/i18n/translation-registry.test.ts',
  'src/i18n/components/LanguageSelector.test.tsx',
  'src/i18n/surface-integration.test.ts',
  'src/i18n/platform-provider-placement.test.ts',
  'src/i18n/auth-error-i18n.test.ts',
  'src/i18n/hardcoded-copy-guard.test.ts',
  'src/pages/login-runtime.test.ts',
  'src/pages/login-localization.test.tsx',
  'src/rental/components/rental-nav-dashboard-localization.test.tsx',
  'src/rental/components/rental-vehicles-health-localization.test.tsx',
  'src/rental/components/rental-bookings-customers-localization.test.tsx',
  'src/rental/components/rental-tasks-settings-localization.test.tsx',
  'src/rental/components/rental-insurances-localization.test.tsx',
  'src/rental/components/rental-parts-accessories-localization.test.tsx',
  'src/rental/components/rental-create-invoice-dialog-localization.test.tsx',
  'src/rental/components/rental-send-invoice-dialog-localization.test.tsx',
  'src/rental/components/rental-invoice-documents-localization.test.tsx',
  'src/operator/damages/operator-damage-capture-localization.test.tsx',
  'src/operator/verification/operator-pickup-check-localization.test.tsx',
  'src/operator/tire-measure/operator-tire-measure-localization.test.tsx',
  'src/operator/bookings/operator-booking-form-localization.test.tsx',
];

const result = spawnSync('npx', ['vitest', 'run', ...testFiles], {
  cwd: frontendRoot,
  stdio: 'inherit',
  shell: false,
});

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

console.log('');
console.log('STRUCTURAL HEALTH: passed');
console.log('');
console.log('TRANSLATION COVERAGE');

const coverageResult = spawnSync(
  'npx',
  [
    'vitest',
    'run',
    'src/i18n/translation-registry.test.ts',
    '-t',
    'prints structural and coverage summary for i18n:check',
  ],
  {
    cwd: frontendRoot,
    stdio: 'inherit',
    shell: false,
  },
);

if (coverageResult.status !== 0) {
  process.exit(coverageResult.status ?? 1);
}

console.log('');
console.log('HARDCODED COPY: inventory refreshed; enforce-clean surfaces guarded');
console.log('');
console.log('i18n structural + coverage + hardcoded checks passed (P2.1 + P2.2.1 guardrails).');
