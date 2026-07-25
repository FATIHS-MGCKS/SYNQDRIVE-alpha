import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const workflowDir = resolve(__dirname);
const patternsDir = resolve(__dirname, '../../../components/patterns');

function read(name: string) {
  return readFileSync(resolve(workflowDir, name), 'utf8');
}

describe('workflow automation mobile readiness', () => {
  it('uses card layout instead of desktop-only tables in overview', () => {
    const overview = read('WorkflowOverviewSection.tsx');
    expect(overview).not.toContain('<table');
    expect(overview).toContain('workflow-runtime-row-');
    expect(overview).toContain('grid-cols-1');
    expect(overview).toContain('overflow-x-hidden');
  });

  it('provides 44px touch targets on filter chips and row actions', () => {
    const overview = read('WorkflowOverviewSection.tsx');
    expect(overview).toContain('min-h-11');
    expect(overview).toContain('aria-pressed');
    expect(overview).toContain('break-words');
  });

  it('restores focus when workflow config drawer closes', () => {
    const overview = read('WorkflowOverviewSection.tsx');
    const drawer = read('WorkflowConfigDrawer.tsx');
    const detailDrawer = readFileSync(resolve(patternsDir, 'detail-drawer.tsx'), 'utf8');

    expect(overview).toContain('drawerReturnFocusRef');
    expect(overview).toContain('returnFocusRef={drawerReturnFocusRef}');
    expect(drawer).toContain('returnFocusRef?:');
    expect(detailDrawer).toContain('returnFocusRef');
    expect(detailDrawer).toContain('focus({ preventScroll: true })');
  });

  it('keeps sticky drawer footer safe-area compatible', () => {
    const detailDrawer = readFileSync(resolve(patternsDir, 'detail-drawer.tsx'), 'utf8');
    expect(detailDrawer).toContain('safe-area-inset-bottom');
    expect(detailDrawer).toContain('sticky bottom-0');
  });

  it('links form errors with aria-describedby on key workflow fields', () => {
    const drawer = read('WorkflowConfigDrawer.tsx');
    expect(drawer).toContain('aria-describedby');
    expect(drawer).toContain('aria-invalid');
    expect(drawer).toContain('role="alert"');
    expect(drawer).toContain('workflow-config-name-error');
  });

  it('uses AlertDialog for unsaved workflow changes (no native confirm)', () => {
    const drawer = read('WorkflowConfigDrawer.tsx');
    expect(drawer).toContain('AlertDialog');
    expect(drawer).not.toContain('window.confirm');
  });

  it('scopes header tabs with roles for screen readers', () => {
    const view = readFileSync(resolve(workflowDir, '../WorkflowAutomationView.tsx'), 'utf8');
    expect(view).toContain('role="tablist"');
    expect(view).toContain('role="tab"');
    expect(view).toContain('aria-selected');
  });

  it('renders task automation rules as mobile-friendly cards', () => {
    const section = read('TaskAutomationRulesSection.tsx');
    expect(section).not.toContain('<table');
    expect(section).toContain('min-h-11');
    expect(section).toContain('break-words');
    expect(section).toContain('returnFocusRef={drawerReturnFocusRef}');
    expect(section).toContain('aria-busy="true"');
  });

  it('uses AlertDialog instead of native confirm in task automation drawer', () => {
    const drawer = read('TaskAutomationRuleDrawer.tsx');
    expect(drawer).toContain('AlertDialog');
    expect(drawer).not.toContain('window.confirm');
    expect(drawer).not.toMatch(/\bconfirm\(/);
    expect(drawer).toContain('requestClose');
    expect(drawer).toContain('min-h-11');
    expect(drawer).toContain('htmlFor=');
  });

  it('avoids truncating drawer titles for long workflow names', () => {
    const detailDrawer = readFileSync(resolve(patternsDir, 'detail-drawer.tsx'), 'utf8');
    expect(detailDrawer).toContain('break-words');
    expect(detailDrawer).not.toContain('truncate');
  });
});
