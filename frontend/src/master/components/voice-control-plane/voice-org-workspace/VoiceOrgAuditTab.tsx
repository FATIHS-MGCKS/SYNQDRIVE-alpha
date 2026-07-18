import { StatusChip } from '../../../../components/patterns';
import { EmptyState } from '../../../../components/patterns/states';
import { VoiceSectionHeader } from '../../../../components/voice-ui';
import type { VoiceControlPlaneAuditEventRow } from '../../../../lib/api';

interface VoiceOrgAuditTabProps {
  auditEvents: VoiceControlPlaneAuditEventRow[];
  protectionAudit: Array<Record<string, unknown>>;
}

export function VoiceOrgAuditTab({ auditEvents, protectionAudit }: VoiceOrgAuditTabProps) {
  const hasProtection = protectionAudit.length > 0;

  return (
    <div className="space-y-4" data-testid="voice-org-tab-audit">
      <VoiceSectionHeader
        title="Audit & Sicherheit"
        description="Master-Admin-Aktionen und Protection-Events — keine Secrets."
      />

      {hasProtection && (
        <div className="rounded-xl border border-border p-4">
          <h4 className="text-xs font-semibold mb-2">Protection-Audit</h4>
          <ul className="space-y-2 text-xs">
            {protectionAudit.slice(0, 20).map((row, index) => (
              <li key={String(row.id ?? index)} className="flex flex-wrap justify-between gap-2 border-b border-border/50 pb-2">
                <span>{String(row.action ?? row.reasonCode ?? '—')}</span>
                <span className="text-muted-foreground">{String(row.message ?? '').slice(0, 80)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {auditEvents.length === 0 ? (
        <EmptyState title="Kein Audit-Trail" description="Noch keine sicheren Master-Aktionen für diese Organisation." />
      ) : (
        <div className="space-y-2">
          {auditEvents.map(event => (
            <div key={event.id} className="rounded-xl border border-border p-3 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                <StatusChip tone="neutral">{event.category}</StatusChip>
                <time className="text-[10px] text-muted-foreground">
                  {new Date(event.createdAt).toLocaleString('de-DE')}
                </time>
              </div>
              <p className="font-semibold">{event.action}</p>
              <p className="text-muted-foreground mt-1">
                {event.reasonCode ?? event.message ?? '—'}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
