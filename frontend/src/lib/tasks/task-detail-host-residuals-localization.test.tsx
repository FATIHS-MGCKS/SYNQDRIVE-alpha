// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import inventory from '../../i18n/hardcoded-copy-inventory.json';
import { de } from '../../i18n/translations/de';
import { en } from '../../i18n/translations/en';

const __dirname = dirname(fileURLToPath(import.meta.url));

const P216C2B_ENFORCE_CLEAN_EXACT = [
  'rental/components/tasks/VehicleTaskDetailDrawer.tsx',
  'operator/tasks/OperatorTaskDetail.tsx',
];

function isP216C2BEnforceCleanPath(relPath: string): boolean {
  return P216C2B_ENFORCE_CLEAN_EXACT.includes(relPath);
}

function readHostSource(relPath: string): string {
  return readFileSync(join(__dirname, '../../', relPath), 'utf8');
}

describe('task detail host residuals localization (P2.2.16C.2B)', () => {
  it('reports zero P216C2B scoped findings in inventory', () => {
    const findings = inventory.findings.filter((finding) => isP216C2BEnforceCleanPath(finding.file));
    expect(findings).toHaveLength(0);
  });

  describe('VehicleTaskDetailDrawer host matrix', () => {
    const source = readHostSource('rental/components/tasks/VehicleTaskDetailDrawer.tsx');

    it('uses canonical locale and translation keys for host residuals', () => {
      expect(source).toContain('useLanguage');
      expect(source).toContain("t('tasks.detail.openInTasks')");
      expect(source).toContain("t('tasks.detail.loadError')");
      expect(source).toContain("t('tasks.detail.commentEmpty')");
      expect(source).toContain('buildTaskDetailViewModel(detail, {');
      expect(source).toContain('locale');
      expect(source).toContain('formatTaskDate(detail.dueDate, locale)');
      expect(source).toContain('formatTaskDateTime(detail.createdAt, locale)');
    });

    it('does not contain hidden German host literals', () => {
      expect(source).not.toMatch(/In Tasks öffnen/);
      expect(source).not.toMatch(/Laden fehlgeschlagen/);
      expect(source).not.toMatch(/de-DE/);
    });

    it('localizes open-in-tasks label EN/DE without changing route semantics', () => {
      expect(en['tasks.detail.openInTasks']).toBe('Open in tasks');
      expect(de['tasks.detail.openInTasks']).toBe('In Aufgaben öffnen');
      expect(source).toContain('onOpenInGlobalTasks(detail.id)');
    });
  });

  describe('OperatorTaskDetail host matrix', () => {
    const source = readHostSource('operator/tasks/OperatorTaskDetail.tsx');

    it('uses canonical locale and translation keys for host residuals', () => {
      expect(source).toContain('useLanguage');
      expect(source).toContain("t('tasks.detail.loadError')");
      expect(source).toContain("t('tasks.detail.commentEmpty')");
      expect(source).toContain("t('tasks.detail.notFound')");
      expect(source).toContain('buildTaskDetailViewModel(task, { locale })');
    });

    it('does not contain hidden German host literals', () => {
      expect(source).not.toMatch(/Laden fehlgeschlagen/);
      expect(source).not.toMatch(/Kommentar eingeben/);
      expect(source).not.toMatch(/Aufgabe nicht gefunden/);
      expect(source).not.toMatch(/de-DE/);
    });

    it('localizes operator host labels EN/DE', () => {
      expect(en['tasks.detail.loadError']).toBe('Task could not be loaded');
      expect(de['tasks.detail.loadError']).toBe('Aufgabe konnte nicht geladen werden');
      expect(en['tasks.detail.commentEmpty']).toBe('Comment cannot be empty.');
      expect(de['tasks.detail.commentEmpty']).toBe('Kommentar darf nicht leer sein.');
      expect(en['tasks.detail.notFound']).toBe('Task not found');
      expect(de['tasks.detail.notFound']).toBe('Aufgabe nicht gefunden');
    });

    it('preserves machine task identity and navigation wiring', () => {
      expect(source).toContain('api.tasks.get(orgId, taskId)');
      expect(source).toContain('taskVehicleId: task?.vehicleId');
      expect(source).toContain('onTaskUpdated?.(updated)');
      expect(source).toContain('TaskDetailActionsHost');
    });
  });

  describe('GlobalTaskDetailPanel — out of C.2B scope', () => {
    it('remains localized from prior phases and is not modified by C.2B', () => {
      const source = readHostSource('rental/components/tasks/GlobalTaskDetailPanel.tsx');
      expect(source).toContain('useLanguage');
      expect(source).toContain("t('tasks.detail.assign')");
      expect(source).not.toMatch(/In Tasks öffnen/);
    });
  });

  describe('dictionary reuse', () => {
    it('reuses existing tasks.detail keys and adds only notFound', () => {
      expect(en['tasks.detail.openInTasks']).toBeTruthy();
      expect(en['tasks.detail.loadError']).toBeTruthy();
      expect(en['tasks.detail.commentEmpty']).toBeTruthy();
      expect(en['tasks.detail.notFound']).toBeTruthy();
      expect(de['tasks.detail.notFound']).toBeTruthy();
    });
  });
});
