import type {
  RpmCandidateView,
  RpmWebhookCandidateStatus,
  VehicleRpmWebhookSummary,
} from '../../lib/api';
import {
  CONTEXT_CLASSIFICATION_LABEL,
  CONTEXT_CONFIDENCE_LABEL,
  EVIDENCE_GRADE_LABEL,
  contextClassificationLabel,
} from '../components/trips/event-context-ui';

export const RPM_WEBHOOK_LABELS = {
  sectionTitle: 'High RPM (DIMO Webhook)',
  webhookSource: 'DIMO Vehicle Trigger',
  thresholdExceeded: 'Schwellwert überschritten',
  duringTrip: 'Während Fahrt',
  noCandidates: 'Keine RPM-Webhook-Ereignisse im Fenster.',
  lteR1Ice: 'LTE_R1 / ICE',
  notLteR1Ice: 'Nicht LTE_R1 / ICE',
} as const;

export function rpmCandidateStatusLabel(status: RpmWebhookCandidateStatus): string {
  const map: Record<RpmWebhookCandidateStatus, string> = {
    RECEIVED: 'Empfangen',
    CONTEXT_ENRICHED: 'Kontext angereichert',
    INSUFFICIENT_CONTEXT: 'Kontext unzureichend',
    CLASSIFIED: 'Klassifiziert',
    FAILED: 'Fehlgeschlagen',
  };
  return map[status] ?? status;
}

export function rpmCandidateStatusTone(
  status: RpmWebhookCandidateStatus,
): 'success' | 'warning' | 'critical' | 'info' | 'neutral' {
  if (status === 'CONTEXT_ENRICHED' || status === 'CLASSIFIED') return 'success';
  if (status === 'INSUFFICIENT_CONTEXT') return 'warning';
  if (status === 'FAILED') return 'critical';
  if (status === 'RECEIVED') return 'info';
  return 'neutral';
}

export function formatRpmValue(rpm: number | null | undefined): string {
  if (rpm == null || Number.isNaN(rpm)) return '—';
  return `${Math.round(rpm).toLocaleString('de-DE')} rpm`;
}

export function formatRpmTimestamp(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('de-DE');
  } catch {
    return iso;
  }
}

export function rpmCandidateHeadline(candidate: RpmCandidateView): string {
  return `${RPM_WEBHOOK_LABELS.thresholdExceeded} (${formatRpmValue(candidate.observedValue)} > ${formatRpmValue(candidate.threshold)})`;
}

export function rpmContextSummary(candidate: RpmCandidateView): string | null {
  const ctx = candidate.context;
  if (!ctx) return null;
  const parts: string[] = [];
  if (ctx.classifications.length > 0) {
    parts.push(
      ctx.classifications.map((c) => contextClassificationLabel(c)).join(', '),
    );
  }
  if (ctx.confidence) {
    parts.push(CONTEXT_CONFIDENCE_LABEL[ctx.confidence] ?? ctx.confidence);
  }
  if (ctx.evidenceGrade) {
    parts.push(EVIDENCE_GRADE_LABEL[ctx.evidenceGrade] ?? ctx.evidenceGrade);
  }
  return parts.length > 0 ? parts.join(' · ') : null;
}

export function sortRpmCandidates(candidates: RpmCandidateView[]): RpmCandidateView[] {
  return [...candidates].sort(
    (a, b) => new Date(a.observedAt).getTime() - new Date(b.observedAt).getTime(),
  );
}

export function shouldShowRpmWebhookSummary(
  summary: VehicleRpmWebhookSummary | null | undefined,
): boolean {
  if (!summary) return false;
  return summary.lteR1IceCapable || summary.count7d > 0;
}

export function rpmWebhookConfiguredLabel(
  status: VehicleRpmWebhookSummary['webhookConfigured'],
): string {
  if (status === 'active') return 'Webhook aktiv';
  if (status === 'not_configured') return 'Webhook nicht konfiguriert';
  return 'Webhook unbekannt';
}

export function rpmClassificationLabels(classifications: string[]): string[] {
  return classifications.map((c) => CONTEXT_CLASSIFICATION_LABEL[c] ?? contextClassificationLabel(c));
}
