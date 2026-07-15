import type { TaskDiagnosticReport } from './task-data-diagnostic.types';

export function renderTaskDiagnosticMarkdown(report: TaskDiagnosticReport): string {
  const lines: string[] = [];
  lines.push('# Task Data Diagnostic Report');
  lines.push('');
  lines.push(`- Generated: ${report.generatedAt}`);
  lines.push(`- Reference now: ${report.referenceNow}`);
  lines.push(`- Mode: read-only (dryRun=${report.dryRun})`);
  lines.push(`- Organizations: ${report.organizationCount}${report.organizationId ? ` (scoped to ${report.organizationId})` : ''}`);
  lines.push(`- Tasks scanned: ${report.tasksScanned}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`| Metric | Count |`);
  lines.push(`|--------|------:|`);
  lines.push(`| Total findings | ${report.summary.totalFindings} |`);
  lines.push(`| Errors | ${report.summary.errors} |`);
  lines.push(`| Warnings | ${report.summary.warnings} |`);
  lines.push(`| Info | ${report.summary.infos} |`);
  lines.push('');
  lines.push('### By category');
  lines.push('');
  lines.push('| Category | Count |');
  lines.push('|----------|------:|');
  for (const [category, count] of Object.entries(report.summary.byCategory)) {
    if (count > 0) lines.push(`| ${category} | ${count} |`);
  }
  lines.push('');
  lines.push('## Checks');
  lines.push('');
  if (report.checks.length === 0) {
    lines.push('_No issues detected._');
    return lines.join('\n');
  }
  lines.push('| Check | Severity | Count | Sample task IDs |');
  lines.push('|-------|----------|------:|-----------------|');
  for (const check of report.checks) {
    lines.push(
      `| ${check.label} (\`${check.checkId}\`) | ${check.severity} | ${check.count} | ${check.sampleTaskIds.join(', ') || '—'} |`,
    );
  }
  lines.push('');
  lines.push('> Sample IDs are masked (`abcd…wxyz`) for privacy.');
  return lines.join('\n');
}

export function renderTaskDiagnosticConsole(report: TaskDiagnosticReport): string {
  const md = renderTaskDiagnosticMarkdown(report);
  return md;
}
