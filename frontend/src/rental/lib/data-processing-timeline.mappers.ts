import type { TimelineItem } from '../../components/patterns';
import type {
  DataProcessingAgreementDetail,
  ProcessingActivityVersionItem,
  ReviewCycleDetail,
  RevocationWorkflowDetail,
} from '../../lib/api';

function formatDate(value?: string | null): string {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return value;
  }
}

export function mapVersionTimeline(versions: ProcessingActivityVersionItem[]): TimelineItem[] {
  return versions.map((v) => ({
    id: v.id,
    title: `v${v.versionNumber} · ${v.status}`,
    time: formatDate(v.updatedAt),
    description: v.isCurrentVersion ? 'Aktuelle Version' : v.title,
    tone: v.isCurrentVersion ? ('success' as const) : ('neutral' as const),
  }));
}

export function mapDpaAuditTimeline(events: DataProcessingAgreementDetail['auditEvents']): TimelineItem[] {
  if (!events?.length) return [];
  return events.map((e) => ({
    id: e.id,
    title: e.summary || e.eventType,
    time: formatDate(e.createdAt),
    description: e.eventType,
    tone: e.eventType.includes('REVOKE') || e.eventType.includes('TERMINATE')
      ? ('critical' as const)
      : ('neutral' as const),
  }));
}

export function mapReviewCycleTimeline(cycle: ReviewCycleDetail): TimelineItem[] {
  return cycle.decisions.map((d) => ({
    id: d.id,
    title: `${d.stepType}: ${d.outcome}`,
    time: formatDate(d.decidedAt),
    description: d.reason ?? d.actorUserId ?? undefined,
    tone:
      d.outcome === 'APPROVED'
        ? ('success' as const)
        : d.outcome === 'REJECTED'
          ? ('critical' as const)
          : ('watch' as const),
  }));
}

export function mapRevocationTimeline(detail: RevocationWorkflowDetail): TimelineItem[] {
  return detail.stepEvents.map((e) => ({
    id: e.id,
    title: e.stepKey,
    time: formatDate(e.createdAt),
    description: e.detail ?? e.status,
    tone:
      e.status === 'FAILED' || e.status === 'DEAD_LETTER'
        ? ('critical' as const)
        : e.status === 'COMPLETED'
          ? ('success' as const)
          : ('info' as const),
  }));
}

export function mapStatusEventsTimeline(
  events: Array<{ toStatus: string; createdAt: string }> | undefined,
): TimelineItem[] {
  if (!events?.length) return [];
  return events.map((e, idx) => ({
    id: `status-${idx}`,
    title: e.toStatus,
    time: formatDate(e.createdAt),
    tone: e.toStatus === 'REVOKED' ? ('critical' as const) : ('neutral' as const),
  }));
}
