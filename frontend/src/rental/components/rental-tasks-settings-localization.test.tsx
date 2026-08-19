// @vitest-environment happy-dom
import { vi } from 'vitest';

vi.mock('@iconify/react', () => ({
  Icon: () => null,
  disableCache: vi.fn(),
}));

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { translateKey } from '../../i18n/LanguageContext';
import { de } from '../../i18n/translations/de';
import { en } from '../../i18n/translations/en';
import inventory from '../../i18n/hardcoded-copy-inventory.json';
import {
  taskFilterPriorityLabel,
  taskFilterStatusLabel,
  tasksFormattingLocaleOrDefault,
  tt,
} from './tasks-settings/tasks-i18n';
import { settingsFormattingLocaleOrDefault, st } from './tasks-settings/settings-i18n';
import { getCategoryTypeOptions } from './settings/rental-rules/rental-rules.constants';

const __dirname = dirname(fileURLToPath(import.meta.url));

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
  return P24_ENFORCE_CLEAN_PREFIXES.some(
    (prefix) => relPath === prefix || relPath.startsWith(prefix),
  );
}

function p24ScopedFindings() {
  return inventory.findings.filter((finding) => isP24EnforceCleanPath(finding.file));
}

describe('rental tasks & settings localization (P2.2.4)', () => {
  describe('tasks', () => {
    it('resolves task list and filter labels through canonical i18n', () => {
      expect(tt('en', 'tasks.view.open')).toBe(en['tasks.view.open']);
      expect(tt('de', 'tasks.filter.bucket.OVERDUE')).toBe(de['tasks.filter.bucket.OVERDUE']);
    });

    it('localizes task status presentation without mutating API values', () => {
      expect(taskFilterStatusLabel('en', 'OPEN')).toBe(en['tasks.filter.status.OPEN']);
      expect(taskFilterStatusLabel('de', 'IN_PROGRESS')).toBe(de['tasks.filter.status.IN_PROGRESS']);
      const source = readFileSync(join(__dirname, '../lib/task-list.utils.ts'), 'utf8');
      expect(source).toContain("'DONE'");
      expect(source).toContain("'IN_PROGRESS'");
    });

    it('localizes task priority presentation without mutating API values', () => {
      expect(taskFilterPriorityLabel('en', 'HIGH')).toBe(en['tasks.filter.priority.HIGH']);
      expect(taskFilterPriorityLabel('de', 'CRITICAL')).toBe(de['tasks.filter.priority.CRITICAL']);
      expect(taskFilterPriorityLabel('en', 'HIGH')).not.toBe('HIGH');
    });

    it('formats task dates with active locale helper', () => {
      expect(tasksFormattingLocaleOrDefault('pl')).toBe('pl-PL');
      const formatted = new Date('2026-08-19T15:30:00Z').toLocaleDateString(
        tasksFormattingLocaleOrDefault('fr'),
        { day: '2-digit', month: 'long', year: 'numeric' },
      );
      expect(formatted).toMatch(/2026/);
      expect(formatted.toLowerCase()).toMatch(/août|aug|08|19/i);
    });

    it('renders English task copy', () => {
      expect(tt('en', 'tasks.title')).toBe(en['tasks.title']);
    });

    it('renders German task copy', () => {
      expect(tt('de', 'tasks.title')).toBe(de['tasks.title']);
    });

    it('falls back partial locales to English for tasks copy', () => {
      const result = translateKey('pl', 'tasks.bulk.assign');
      expect(result.source).toBe('fallback-en');
      expect(result.text).toBe(en['tasks.bulk.assign']);
    });

    it('falls back Turkish to English for tasks copy', () => {
      const result = translateKey('tr', 'tasks.filter.status.DONE');
      expect(result.source).toBe('fallback-en');
      expect(result.text).toBe(en['tasks.filter.status.DONE']);
    });
  });

  describe('settings', () => {
    it('resolves settings shell and account labels through canonical i18n', () => {
      expect(st('en', 'settings.account.sectionTitle')).toBe(en['settings.account.sectionTitle']);
      expect(st('de', 'settings.company.loadErrorTitle')).toBe(de['settings.company.loadErrorTitle']);
    });

    it('localizes settings tabs and navigation copy', () => {
      expect(st('en', 'settings.account.sectionTitle')).toBe(en['settings.account.sectionTitle']);
      expect(st('de', 'settings.company.title')).toBe(de['settings.company.title']);
      const tabSource = readFileSync(join(__dirname, 'settings/AdministrationTabBar.tsx'), 'utf8');
      expect(tabSource).toContain("'adminTab.account'");
    });

    it('localizes data authorization presentation without changing semantics', () => {
      expect(st('en', 'settings.dataAuth.page.title')).toBe(en['settings.dataAuth.page.title']);
      expect(st('de', 'settings.dataAuth.revoke.dimoImpactTitle')).toBe(
        de['settings.dataAuth.revoke.dimoImpactTitle'],
      );
      const source = readFileSync(
        join(__dirname, 'settings/data-authorization/data-authorization.constants.ts'),
        'utf8',
      );
      expect(source).not.toMatch(/Keine Berechtigung/);
    });

    it('localizes rental rules UI presentation without changing rule semantics', () => {
      expect(st('en', 'settings.shell.rentalRulesDeniedTitle')).toBe(
        en['settings.shell.rentalRulesDeniedTitle'],
      );
      const economy = getCategoryTypeOptions('de').find((option) => option.value === 'ECONOMY');
      expect(economy?.label).toBe(de['rentalRules.categoryType.ECONOMY']);
      const constantsSource = readFileSync(
        join(__dirname, 'settings/rental-rules/rental-rules.constants.ts'),
        'utf8',
      );
      expect(constantsSource).not.toMatch(/allowed:\s*'/);
    });

    it('localizes email settings presentation without changing delivery behavior', () => {
      expect(st('en', 'email.settings.title')).toBe(en['email.settings.title']);
      expect(st('de', 'email.test.emailPlaceholder')).toBe(de['email.test.emailPlaceholder']);
      const source = readFileSync(join(__dirname, 'settings/email/EmailVersandTab.tsx'), 'utf8');
      expect(source).toContain("t('email.settings.signaturePlaceholder')");
      expect(source).not.toMatch(/test@example\.com/);
    });

    it('localizes SettingsView administration shell navigation', () => {
      const source = readFileSync(join(__dirname, 'SettingsView.tsx'), 'utf8');
      expect(source).toContain("t('nav.administration')");
      expect(source).toContain("t('settings.shell.rentalRulesDeniedTitle')");
    });

    it('formats settings dates with active locale helper', () => {
      expect(settingsFormattingLocaleOrDefault('pl')).toBe('pl-PL');
      expect(settingsFormattingLocaleOrDefault('fr')).toBe('fr-FR');
    });

    it('renders English settings copy', () => {
      expect(st('en', 'settings.account.profile.title')).toBe(en['settings.account.profile.title']);
    });

    it('renders German settings copy', () => {
      expect(st('de', 'settings.account.profile.title')).toBe(de['settings.account.profile.title']);
    });

    it('falls back partial locales to English for settings copy', () => {
      const result = translateKey('cs', 'settings.dataAuth.create.title');
      expect(result.source).toBe('fallback-en');
      expect(result.text).toBe(en['settings.dataAuth.create.title']);
    });

    it('falls back Turkish to English for settings copy', () => {
      const result = translateKey('tr', 'settings.company.title');
      expect(result.source).toBe('fallback-en');
      expect(result.text).toBe(en['settings.company.title']);
    });
  });

  describe('guardrails', () => {
    it('keeps P2.2.4 enforce-clean scope at zero findings', () => {
      const debt = p24ScopedFindings().filter((finding) => finding.severity === 'enforce-clean');
      expect(debt).toHaveLength(0);
    });

    it('does not add new ../i18n/ compatibility shim consumers in P2.2.4 touched shells', () => {
      const touched = [
        join(__dirname, 'TasksView.tsx'),
        join(__dirname, 'SettingsView.tsx'),
      ];
      for (const filePath of touched) {
        const source = readFileSync(filePath, 'utf8');
        expect(source, filePath).not.toMatch(/from '\.\.\/i18n\//);
      }
    });

    it('reports zero global enforce-clean findings after P2.2.4', () => {
      expect(inventory.summary.enforceCleanRemaining).toBe(0);
    });

    it('keeps EN and DE dictionaries aligned for new tasks/settings keys', () => {
      const enKeys = Object.keys(en);
      const deKeys = new Set(Object.keys(de));
      const tasksSettingsKeys = enKeys.filter(
        (key) => key.startsWith('tasks.') || key.startsWith('settings.'),
      );
      expect(tasksSettingsKeys.length).toBeGreaterThan(0);
      for (const key of tasksSettingsKeys) {
        expect(deKeys.has(key), key).toBe(true);
      }
    });
  });
});
