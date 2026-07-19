import type {
  EpisodeReconciliationCandidate,
  EpisodeReconciliationReport,
} from './device-connection-episode-reconciliation.types';

const CSV_COLUMNS = [
  'anonymizedVehicleId',
  'provider',
  'bindingClass',
  'openedAt',
  'latestEventAt',
  'firstTelemetryAfterUnplug',
  'explicitPlugSignal',
  'sustainedTelemetry',
  'tripAfterUnplug',
  'classification',
  'recommendedResolutionMethod',
  'confidence',
  'conflicts',
  'applyEligible',
] as const;

function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function renderReconciliationCsv(
  candidates: EpisodeReconciliationCandidate[],
): string {
  const header = CSV_COLUMNS.join(',');
  const rows = candidates.map((candidate) =>
    [
      candidate.anonymizedVehicleId,
      candidate.provider,
      candidate.bindingClass,
      candidate.openedAt,
      candidate.latestEventAt ?? '',
      candidate.firstTelemetryAfterUnplug ?? '',
      candidate.explicitPlugSignal ? 'yes' : 'no',
      candidate.sustainedTelemetry ? 'yes' : 'no',
      candidate.tripAfterUnplug ? 'yes' : 'no',
      candidate.classification,
      candidate.recommendedResolutionMethod ?? '',
      candidate.confidence,
      candidate.conflicts.join(';'),
      candidate.applyEligible ? 'yes' : 'no',
    ]
      .map((v) => csvEscape(String(v)))
      .join(','),
  );
  return [header, ...rows].join('\n') + '\n';
}

export function renderReconciliationMarkdown(report: EpisodeReconciliationReport): string {
  const lines: string[] = [
    '# Device Connection Episode Reconciliation Audit — July 2026',
    '',
    '| Field | Value |',
    '|-------|-------|',
    `| **Audit ID** | \`${report.auditId}\` |`,
    `| **Mode** | **${report.mode}** — no production data modified |`,
    `| **Generated** | ${report.generatedAt} |`,
    `| **Organization scope** | ${report.organizationScope ?? 'all'} |`,
    `| **Vehicle scope** | ${report.vehicleScope ?? 'all'} |`,
    '',
    '## Summary',
    '',
    `| Metric | Count |`,
    `|--------|------:|`,
    `| Episode candidates | ${report.summary.totalCandidates} |`,
    `| Apply-eligible (HIGH confidence) | ${report.summary.applyEligibleCount} |`,
    `| Review required | ${report.summary.reviewRequiredCount} |`,
    '',
    '### By classification',
    '',
    '| Classification | Count |',
    '|----------------|------:|',
  ];

  for (const [key, count] of Object.entries(report.summary.byClassification)) {
    lines.push(`| ${key} | ${count} |`);
  }

  lines.push(
    '',
    '## Method',
    '',
    '- Reconstructs canonical unplug episodes from the **full** `DimoDeviceConnectionEvent` history.',
    '- Evaluates snapshot (`obdIsPluggedIn`, provider/received timestamps), telemetry, trips, bindings, and alerts.',
    '- **Does not** write episodes, mutate events, or apply resolutions.',
    '- Uncertain cases remain `reviewRequired` with `applyEligible=no`.',
    '',
    '## Artifacts',
    '',
    '- Machine-readable: `docs/audits/data/device-connection-episode-reconciliation-2026-07.csv`',
    '',
    '## Candidate overview',
    '',
    '| Vehicle | Classification | Confidence | Apply | Conflicts |',
    '|---------|----------------|------------|-------|-----------|',
  );

  for (const candidate of report.candidates) {
    lines.push(
      `| ${candidate.anonymizedVehicleId} | ${candidate.classification} | ${candidate.confidence} | ${candidate.applyEligible ? 'yes' : 'no'} | ${candidate.conflicts.join('; ') || '—'} |`,
    );
  }

  lines.push(
    '',
    '## Apply guidance (future controlled run)',
    '',
    'Only rows with `applyEligible=yes` and `confidence=HIGH` are candidates for a later',
    'controlled backfill. All other rows require manual review before any write path.',
    '',
  );

  return lines.join('\n');
}
