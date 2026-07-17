import type { BatteryShadowValidationReport } from './battery-shadow-validation.types';

function gateIcon(status: string): string {
  switch (status) {
    case 'pass':
      return '✅';
    case 'warn':
      return '⚠️';
    case 'fail':
      return '❌';
    case 'insufficient_data':
      return '⏳';
    default:
      return '—';
  }
}

export function renderBatteryShadowValidationMarkdown(
  report: BatteryShadowValidationReport,
): string {
  const lines: string[] = [
    '# Battery Health V2 — Shadow Validation Report',
    '',
    `> ${report.disclaimer}`,
    '',
    `**Generated:** ${report.generatedAt}`,
    `**Script:** ${report.scriptVersion}`,
    `**Recommendation:** \`${report.overallRecommendation}\``,
    '',
    '## Observation period',
    '',
    `| Field | Value |`,
    `|-------|-------|`,
    `| Start | ${report.observationPeriod.startAt} |`,
    `| End | ${report.observationPeriod.endAt} |`,
    `| Duration | ${report.observationPeriod.durationDays} days |`,
    `| Meets minimum (≥${report.observationPeriod.minimumRecommendedDays}d) | ${report.observationPeriod.meetsMinimumPeriod ? 'yes' : 'no'} |`,
    '',
    '## Safety guards',
    '',
    `- Publication blocked: **${report.publicationBlocked}** (flags publication=${report.flags.publicationEnabled}, hvSoh=${report.flags.hvSohPublicationEnabled})`,
    `- Readiness blocked: **${report.readinessBlocked}** (flag readiness=${report.flags.readinessEnabled})`,
    '',
    '## LV metrics',
    '',
    `| Metric | Value |`,
    `|--------|-------|`,
    `| Rest windows | ${report.lv.restWindowCount} (${report.lv.vehiclesWithRestWindows} vehicles) |`,
    `| REST 60m capture | ${report.lv.rest60m.captured}/${report.lv.rest60m.scheduled} (${report.lv.rest60m.captureRatePct ?? '—'}%) |`,
    `| REST 6h capture | ${report.lv.rest6h.captured}/${report.lv.rest6h.scheduled} (${report.lv.rest6h.captureRatePct ?? '—'}%) |`,
    `| MISSED total | ${report.lv.missedTotal} |`,
    `| Wake contamination | ${report.lv.wakeContaminationCount} (${report.lv.wakeContaminationRatePct ?? '—'}%) |`,
    `| Charging contamination | ${report.lv.chargingContaminationCount} |`,
    `| Start-proxy sessions | ${report.lv.startProxySessions} |`,
    `| Start-proxy measurements | ${report.lv.startProxyMeasurements} |`,
    `| Shadow LV assessments | ${report.lv.shadowLvAssessmentCount} |`,
    `| Assessment score stdev (median) | ${report.lv.shadowLvScoreStdDevMedian ?? '—'} |`,
    `| False-positive candidates | ${report.lv.falsePositiveCandidates} |`,
    '',
    '### Profile distribution',
    '',
    ...report.lv.profileDistribution.map(
      (row) => `- ${row.profile}: ${row.vehicleCount} vehicles`,
    ),
    '',
    '## HV metrics',
    '',
    `| Metric | Value |`,
    `|--------|-------|`,
    `| Recharge sessions | ${report.hv.rechargeSessionCount} (${report.hv.vehiclesWithRechargeSessions} vehicles) |`,
    `| Segment coverage | ${report.hv.rechargeSegmentCoveragePct ?? '—'}% |`,
    `| Qualified sessions | ${report.hv.qualifiedSessionCount} |`,
    `| M2 observations | ${report.hv.m2ObservationCount} |`,
    `| M2 sessions with samples | ${report.hv.m2SessionsWithSamples} |`,
    `| M2 session CV p95 | ${report.hv.m2SessionCvP95 ?? '—'}% |`,
    `| Cross-session scatter | ${report.hv.crossSessionScatterPct ?? '—'}% |`,
    `| M3 agreement rate | ${report.hv.m3AgreementRatePct ?? '—'}% |`,
    `| Reference capacity active | ${report.hv.referenceCapacityActiveCount} |`,
    `| Reference capacity unverified | ${report.hv.referenceCapacityUnverifiedCount} |`,
    '',
    '### Storage growth (observation window)',
    '',
    `- battery_measurements: ${report.hv.storageGrowth.batteryMeasurements}`,
    `- battery_measurement_sessions: ${report.hv.storageGrowth.batteryMeasurementSessions}`,
    `- hv_charge_sessions: ${report.hv.storageGrowth.hvChargeSessions}`,
    `- hv_capacity_observations: ${report.hv.storageGrowth.hvCapacityObservations}`,
    `- battery_assessments: ${report.hv.storageGrowth.batteryAssessments}`,
    '',
    '## Gates',
    '',
    `Passed: ${report.summary.gatesPassed} · Warn: ${report.summary.gatesWarned} · Failed: ${report.summary.gatesFailed} · Insufficient: ${report.summary.gatesInsufficientData}`,
    '',
    ...report.gates.map(
      (g) =>
        `- ${gateIcon(g.status)} **${g.label}** — ${g.status} (threshold: ${g.threshold}, observed: ${g.observed})${g.detail ? ` — ${g.detail}` : ''}`,
    ),
    '',
  ];

  if (report.vehicleSamples.length > 0) {
    lines.push('## Vehicle samples', '');
    for (const sample of report.vehicleSamples) {
      lines.push(
        `- \`${sample.vehicleId}\` ${sample.licensePlate ?? '—'} — REST60 capture ${sample.lvRestCaptureRate60mPct ?? '—'}%, HV sessions ${sample.hvSessionCount}`,
      );
    }
    lines.push('');
  }

  return lines.join('\n');
}

export function renderBatteryShadowValidationConsole(
  report: BatteryShadowValidationReport,
): string {
  const header = [
    'Battery Health V2 — Shadow Validation',
    report.disclaimer,
    `Recommendation: ${report.overallRecommendation}`,
    `Period: ${report.observationPeriod.durationDays}d (${report.observationPeriod.startAt} → ${report.observationPeriod.endAt})`,
    `Gates: pass=${report.summary.gatesPassed} warn=${report.summary.gatesWarned} fail=${report.summary.gatesFailed} insufficient=${report.summary.gatesInsufficientData}`,
    '',
  ];

  const gateLines = report.gates.map(
    (g) => `[${g.status.toUpperCase()}] ${g.label}: ${g.observed} (threshold ${g.threshold})`,
  );

  return [...header, ...gateLines].join('\n');
}
