import { renderTaskDiagnosticMarkdown } from './task-data-diagnostic-markdown.util';
import type { TaskDiagnosticReport } from './task-data-diagnostic.types';

describe('renderTaskDiagnosticMarkdown', () => {
  it('renders summary and checks table', () => {
    const report: TaskDiagnosticReport = {
      mode: 'diagnostic',
      dryRun: true,
      readOnly: true,
      generatedAt: '2026-07-15T12:00:00.000Z',
      referenceNow: '2026-07-15T12:00:00.000Z',
      organizationId: 'org-1',
      organizationCount: 1,
      tasksScanned: 3,
      summary: {
        totalFindings: 1,
        errors: 1,
        warnings: 0,
        infos: 0,
        byCategory: {
          done_integrity: 1,
          done_checklist: 0,
          active_duplicates: 0,
          missing_links: 0,
          timing: 0,
          audit: 0,
          legacy_automation: 0,
        },
        byCheck: { done_missing_completed_at: 1 },
      },
      checks: [
        {
          checkId: 'done_missing_completed_at',
          category: 'done_integrity',
          severity: 'error',
          label: 'DONE without completedAt',
          count: 1,
          sampleTaskIds: ['abcd…wxyz'],
        },
      ],
    };

    const md = renderTaskDiagnosticMarkdown(report);
    expect(md).toContain('# Task Data Diagnostic Report');
    expect(md).toContain('done_missing_completed_at');
    expect(md).toContain('abcd…wxyz');
  });
});
