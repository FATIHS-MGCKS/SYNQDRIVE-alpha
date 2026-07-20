import type { ApiServiceCase, ApiServiceCaseSource } from '../../../lib/api';
import type { TimelineItem } from '../../../components/patterns';
import { formatServiceCaseDateTime } from './fleet-health-service-case-list';
import {
  isServiceCaseTaskLinkAuditComment,
  serviceCaseTaskLinkAuditTitle,
} from './service-case-task-actions';

export const SERVICE_CASE_SOURCE_LABEL_DE: Record<ApiServiceCaseSource, string> = {
  MANUAL: 'Manuell',
  HEALTH: 'Health',
  DTC: 'Fehlercode',
  DAMAGE: 'Schaden',
  BOOKING: 'Buchung',
  DOCUMENT: 'Dokument',
  SERVICE_COMPLIANCE: 'Service-Compliance',
};

const HEALTH_MODULE_LABEL_DE: Record<string, string> = {
  battery: 'Batterie',
  tires: 'Reifen',
  brakes: 'Bremsen',
  error_codes: 'Fehlercodes',
  service_compliance: 'Service / TÜV',
  complaints: 'Beschwerden',
  vehicle_alerts: 'Fahrzeughinweise',
};

export interface ServiceCaseHealthFinding {
  id: string;
  label: string;
  detail: string | null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function healthModuleLabel(moduleKey: string): string {
  return HEALTH_MODULE_LABEL_DE[moduleKey] ?? moduleKey.replace(/_/g, ' ');
}

function pushFinding(
  findings: ServiceCaseHealthFinding[],
  seen: Set<string>,
  label: string,
  detail: string | null,
  idSuffix: string,
) {
  const key = `${label}::${detail ?? ''}`;
  if (seen.has(key)) return;
  seen.add(key);
  findings.push({ id: `${idSuffix}-${findings.length}`, label, detail });
}

export function extractServiceCaseHealthFindings(
  serviceCase: Pick<ApiServiceCase, 'source' | 'metadata' | 'description'>,
): ServiceCaseHealthFinding[] {
  const findings: ServiceCaseHealthFinding[] = [];
  const seen = new Set<string>();
  const meta = asRecord(serviceCase.metadata);

  if (meta) {
    const singleModule = meta.healthModule;
    if (typeof singleModule === 'string') {
      const state = typeof meta.healthState === 'string' ? meta.healthState : null;
      const reason =
        typeof meta.healthReason === 'string'
          ? meta.healthReason
          : typeof meta.reason === 'string'
            ? meta.reason
            : null;
      pushFinding(
        findings,
        seen,
        healthModuleLabel(singleModule),
        [state, reason].filter(Boolean).join(' · ') || null,
        'module',
      );
    }

    const modules = meta.healthModules;
    if (Array.isArray(modules)) {
      for (const entry of modules) {
        if (typeof entry === 'string') {
          pushFinding(findings, seen, healthModuleLabel(entry), null, 'modules');
          continue;
        }
        const row = asRecord(entry);
        if (!row) continue;
        const moduleKey = typeof row.module === 'string' ? row.module : typeof row.healthModule === 'string' ? row.healthModule : null;
        if (!moduleKey) continue;
        const detailParts = [
          typeof row.state === 'string' ? row.state : typeof row.healthState === 'string' ? row.healthState : null,
          typeof row.reason === 'string' ? row.reason : null,
        ].filter(Boolean);
        pushFinding(
          findings,
          seen,
          healthModuleLabel(moduleKey),
          detailParts.length ? detailParts.join(' · ') : null,
          'modules',
        );
      }
    }

    const rawFindings = meta.healthFindings ?? meta.findings;
    if (Array.isArray(rawFindings)) {
      for (const entry of rawFindings) {
        const row = asRecord(entry);
        if (!row) continue;
        const label =
          typeof row.label === 'string'
            ? row.label
            : typeof row.title === 'string'
              ? row.title
              : typeof row.module === 'string'
                ? healthModuleLabel(row.module)
                : 'Health-Fund';
        const detail =
          typeof row.detail === 'string'
            ? row.detail
            : typeof row.reason === 'string'
              ? row.reason
              : null;
        pushFinding(findings, seen, label, detail, 'finding');
      }
    }
  }

  if (findings.length === 0 && serviceCase.source === 'HEALTH') {
    pushFinding(
      findings,
      seen,
      'Health-Auslöser',
      serviceCase.description?.trim() || null,
      'fallback',
    );
  }

  return findings;
}

export function buildServiceCaseAuditTimeline(serviceCase: ApiServiceCase): TimelineItem[] {
  type DraftItem = TimelineItem & { sortMs: number };

  const items: DraftItem[] = [];

  const push = (
    id: string,
    title: string,
    iso: string | null | undefined,
    description?: string | null,
    tone: TimelineItem['tone'] = 'neutral',
  ) => {
    if (!iso) return;
    const sortMs = Date.parse(iso);
    if (!Number.isFinite(sortMs)) return;
    items.push({
      id,
      title,
      time: formatServiceCaseDateTime(iso) ?? undefined,
      description: description ?? undefined,
      tone,
      sortMs,
    });
  };

  push('opened', 'Fall eröffnet', serviceCase.openedAt ?? serviceCase.createdAt);
  push('scheduled', 'Werkstatttermin gesetzt', serviceCase.scheduledAt, null, 'info');
  push('expected-ready', 'Erwartete Fertigstellung', serviceCase.expectedReadyAt, null, 'info');
  push('downtime-start', 'Ausfall beginnt', serviceCase.downtimeStart, null, 'warning');

  for (const attachment of serviceCase.attachments ?? []) {
    push(
      `attachment-${attachment.id}`,
      `Dokument hochgeladen${attachment.fileName ? `: ${attachment.fileName}` : ''}`,
      attachment.createdAt,
      null,
      'neutral',
    );
  }

  for (const comment of serviceCase.comments ?? []) {
    const title = isServiceCaseTaskLinkAuditComment(comment.body)
      ? serviceCaseTaskLinkAuditTitle(comment.body)
      : 'Kommentar';
    push(`comment-${comment.id}`, title, comment.createdAt, comment.body, 'neutral');
  }

  push('completed', 'Fall abgeschlossen', serviceCase.completedAt, serviceCase.completionNotes, 'success');
  push('cancelled', 'Fall storniert', serviceCase.cancelledAt, null, 'critical');
  push('updated', 'Zuletzt aktualisiert', serviceCase.updatedAt);

  return items
    .sort((a, b) => b.sortMs - a.sortMs)
    .map(({ sortMs: _sortMs, ...item }) => item);
}

export function isActiveServiceCaseStatus(status: ApiServiceCase['status']): boolean {
  return status !== 'COMPLETED' && status !== 'CANCELLED';
}
