import type { StationsV2DiagnosticReport } from './stations-v2-diagnostic.types';

export function renderStationsV2DiagnosticMarkdown(
  report: StationsV2DiagnosticReport,
): string {
  const lines: string[] = [];
  lines.push('# Stations V2 Data Diagnostic Report');
  lines.push('');
  lines.push(`- Generated: ${report.generatedAt}`);
  lines.push(`- Reference now: ${report.referenceNow}`);
  lines.push(`- Mode: read-only (dryRun=${report.dryRun})`);
  lines.push(
    `- Organizations: ${report.organizationCount}${report.organizationId ? ` (scoped to ${report.organizationId})` : ''}`,
  );
  lines.push(`- Stations scanned: ${report.stationsScanned}`);
  lines.push(`- Vehicles scanned: ${report.vehiclesScanned}`);
  lines.push(`- Bookings scanned: ${report.bookingsScanned}`);
  lines.push(`- Memberships / roles / prefs scanned: ${report.membershipsScanned}`);
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
    lines.push(
      '| Check | Severity | Count | Remediation (summary) | Sample station IDs | Sample vehicle IDs |',
    );
    lines.push(
      '|-------|----------|------:|-----------------------|--------------------|--------------------|',
    );
    for (const check of report.checks) {
      const remediation =
        check.remediation.length > 80
          ? `${check.remediation.slice(0, 77)}…`
          : check.remediation;
      lines.push(
        `| ${check.label} (\`${check.checkId}\`) | ${check.severity} | ${check.count} | ${remediation} | ${check.sampleStationIds.join(', ') || '—'} | ${check.sampleVehicleIds.join(', ') || '—'} |`,
      );
    }
  }
  lines.push('');
  if (report.byOrganization.length > 0) {
    lines.push('## By organization');
    lines.push('');
    lines.push(
      '| Organization | Stations | Vehicles | Bookings | Findings | Top checks |',
    );
    lines.push(
      '|--------------|----------:|----------:|---------:|---------:|------------|',
    );
    for (const org of report.byOrganization) {
      const topChecks = Object.entries(org.byCheck)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([id, count]) => `${id} (${count})`)
        .join(', ');
      lines.push(
        `| \`${org.organizationId}\` | ${org.stationsScanned} | ${org.vehiclesScanned} | ${org.bookingsScanned} | ${org.totalFindings} | ${topChecks || '—'} |`,
      );
    }
    lines.push('');
  }
  lines.push(
    '> Sample IDs are masked (`abcd…wxyz`). No customer PII is included. This report performs **no writes**.',
  );
  return lines.join('\n');
}

export function renderStationsV2DiagnosticConsole(
  report: StationsV2DiagnosticReport,
): string {
  return renderStationsV2DiagnosticMarkdown(report);
}
