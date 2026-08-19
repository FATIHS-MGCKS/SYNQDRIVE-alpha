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
  at,
  automationFormattingLocaleOrDefault,
  labelTaskAutomationPriority,
  legacyCategoryLabel,
  legacyTriggerLabel,
} from './workflow-automation/automation-i18n';

const __dirname = dirname(fileURLToPath(import.meta.url));

const P25_ENFORCE_CLEAN_EXACT = ['rental/components/WorkflowAutomationView.tsx'];

const P25_ENFORCE_CLEAN_PREFIXES = ['rental/components/workflow-automation/'];

function isP25EnforceCleanPath(relPath: string): boolean {
  if (P25_ENFORCE_CLEAN_EXACT.includes(relPath)) return true;
  return P25_ENFORCE_CLEAN_PREFIXES.some(
    (prefix) => relPath === prefix || relPath.startsWith(prefix),
  );
}

function p25ScopedFindings() {
  return inventory.findings.filter((finding) => isP25EnforceCleanPath(finding.file));
}

describe('rental workflow & task automation localization (P2.2.5)', () => {
  describe('task automation', () => {
    it('resolves task automation labels through canonical i18n', () => {
      expect(at('en', 'taskAutomation.title')).toBe(en['taskAutomation.title']);
      expect(at('de', 'taskAutomation.filter.active')).toBe(de['taskAutomation.filter.active']);
    });

    it('reuses tasks.filter.priority for priority presentation', () => {
      expect(labelTaskAutomationPriority('en', 'HIGH')).toBe(en['tasks.filter.priority.HIGH']);
      expect(labelTaskAutomationPriority('de', 'CRITICAL')).toBe(de['tasks.filter.priority.CRITICAL']);
    });

    it('formats automation dates with active locale helper', () => {
      expect(automationFormattingLocaleOrDefault('pl')).toBe('pl-PL');
      const formatted = new Date('2026-08-19T15:30:00Z').toLocaleDateString(
        automationFormattingLocaleOrDefault('fr'),
        { day: '2-digit', month: 'long', year: 'numeric' },
      );
      expect(formatted).toMatch(/2026/);
    });

    it('falls back partial locales to English for task automation copy', () => {
      const result = translateKey('pl', 'taskAutomation.drawer.reset');
      expect(result.source).toBe('fallback-en');
      expect(result.text).toBe(en['taskAutomation.drawer.reset']);
    });
  });

  describe('legacy workflow builder', () => {
    it('resolves legacy category and trigger labels', () => {
      expect(legacyCategoryLabel('en', 'vehicle_return')).toBe(
        en['workflowAutomation.legacy.category.vehicle_return'],
      );
      expect(legacyTriggerLabel('de', 'booking.returned')).toBe(
        de['workflowAutomation.legacy.trigger.booking.returned'],
      );
    });

    it('renders English workflow automation shell copy', () => {
      expect(at('en', 'workflowAutomation.legacy.page.title')).toBe(
        en['workflowAutomation.legacy.page.title'],
      );
    });

    it('renders German workflow automation shell copy', () => {
      expect(at('de', 'workflowAutomation.legacy.page.title')).toBe(
        de['workflowAutomation.legacy.page.title'],
      );
    });
  });

  describe('guardrails', () => {
    it('keeps P2.2.5 enforce-clean scope at zero findings', () => {
      const debt = p25ScopedFindings().filter((finding) => finding.severity === 'enforce-clean');
      expect(debt).toHaveLength(0);
    });

    it('does not add new ../i18n/ compatibility shim consumers in touched automation files', () => {
      const touched = [
        join(__dirname, 'WorkflowAutomationView.tsx'),
        join(__dirname, 'workflow-automation/TaskAutomationRulesSection.tsx'),
      ];
      for (const filePath of touched) {
        const source = readFileSync(filePath, 'utf8');
        expect(source, filePath).not.toMatch(/from '\.\.\/i18n\//);
      }
    });

    it('keeps EN and DE dictionaries aligned for automation keys', () => {
      const enKeys = Object.keys(en);
      const deKeys = new Set(Object.keys(de));
      const automationKeys = enKeys.filter(
        (key) => key.startsWith('taskAutomation.') || key.startsWith('workflowAutomation.legacy.'),
      );
      expect(automationKeys.length).toBeGreaterThan(0);
      for (const key of automationKeys) {
        expect(deKeys.has(key), key).toBe(true);
      }
    });
  });
});
