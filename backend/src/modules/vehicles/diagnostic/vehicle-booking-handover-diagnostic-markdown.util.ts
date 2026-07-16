import type { VbhDiagnosticReport } from './vehicle-booking-handover-diagnostic.types';

export function renderVbhDiagnosticMarkdown(report: VbhDiagnosticReport): string {
  const lines: string[] = [];
  lines.push('# Vehicle / Booking / Handover Diagnostic Report');
  lines.push('');
  lines.push(`- Generated: ${report.generatedAt}`);
  lines.push(`- Reference now: ${report.referenceNow}`);
  lines.push(`- Mode: read-only (dryRun=${report.dryRun})`);
  lines.push(
    `- Organizations: ${report.organizationCount}${report.organizationId ? ` (scoped to ${report.organizationId})` : ''}`,
  );
  lines.push(`- Vehicles scanned: ${report.vehiclesScanned}`);
  lines.push(`- Bookings scanned: ${report.bookingsScanned}`);
  lines.push(`- Handovers scanned: ${report.handoversScanned}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push('| Metric | Count |');
  lines.push('|--------|------:|');
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
  } else {
    lines.push('| Check | Severity | Count | Sample vehicle IDs | Sample booking IDs |');
    lines.push('|-------|----------|------:|--------------------|--------------------|');
    for (const check of report.checks) {
      lines.push(
        `| ${check.label} (\`${check.checkId}\`) | ${check.severity} | ${check.count} | ${check.sampleVehicleIds.join(', ') || '—'} | ${check.sampleBookingIds.join(', ') || '—'} |`,
      );
    }
  }
  lines.push('');
  if (report.byOrganization.length > 0) {
    lines.push('## By organization');
    lines.push('');
    lines.push('| Organization | Vehicles | Bookings | Findings | Top checks |');
    lines.push('|--------------|----------:|----------:|---------:|------------|');
    for (const org of report.byOrganization) {
      const topChecks = Object.entries(org.byCheck)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([id, count]) => `${id} (${count})`)
        .join(', ');
      lines.push(
        `| \`${org.organizationId}\` | ${org.vehiclesScanned} | ${org.bookingsScanned} | ${org.totalFindings} | ${topChecks || '—'} |`,
      );
    }
    lines.push('');
  }
  lines.push('> Sample IDs are masked (`abcd…wxyz`) for privacy. No customer names are included.');
  return lines.join('\n');
}

export function renderVbhDiagnosticConsole(report: VbhDiagnosticReport): string {
  return renderVbhDiagnosticMarkdown(report);
}
