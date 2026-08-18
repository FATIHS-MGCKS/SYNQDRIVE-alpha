import { ChevronDown, ExternalLink } from 'lucide-react';
import { useState } from 'react';
import { DetailDrawer } from '../../../components/patterns/detail-drawer';
import { StatusChip } from '../../../components/patterns';
import { SkeletonCard } from '../../../components/patterns/states';
import { useAuditDetail } from '../useSecurityAccess';
import {
  auditResultLabel,
  auditResultTone,
  formatRelativeDe,
  maskIpDisplay,
  truncateReason,
} from '../security-access.utils';

interface AuditDetailDrawerProps {
  auditId: string | null;
  onClose: () => void;
  onOpenFullAudit?: (auditId: string) => void;
}

function DiffBlock({ label, value }: { label: string; value: unknown }) {
  const text =
    value == null
      ? '—'
      : typeof value === 'string'
        ? value
        : JSON.stringify(value, null, 2);

  return (
    <div>
      <p className="mb-1 text-[10px] font-semibold uppercase text-muted-foreground">{label}</p>
      <pre className="max-h-48 overflow-auto rounded-xl bg-muted/30 p-3 text-[10px] leading-relaxed whitespace-pre-wrap break-all">
        {text}
      </pre>
    </div>
  );
}

export function AuditDetailDrawer({ auditId, onClose, onOpenFullAudit }: AuditDetailDrawerProps) {
  const { detail, loading } = useAuditDetail(auditId);
  const [techOpen, setTechOpen] = useState(false);

  return (
    <DetailDrawer
      open={!!auditId}
      onOpenChange={(open) => !open && onClose()}
      title={detail?.action ?? 'Audit-Eintrag'}
      description={detail?.createdAt ? formatRelativeDe(detail.createdAt) : undefined}
      status={
        detail ? (
          <StatusChip tone={auditResultTone(detail.result)} dot>
            {auditResultLabel(detail.result)}
          </StatusChip>
        ) : undefined
      }
      widthClassName="sm:max-w-xl"
    >
      {loading && !detail ? (
        <SkeletonCard className="h-40" />
      ) : detail ? (
        <div className="space-y-5 text-sm">
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Zusammenfassung</h3>
            <p className="text-sm text-foreground">{detail.summary ?? detail.description}</p>
          </section>

          <section className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <p className="text-muted-foreground">Akteur</p>
              <p className="font-medium">{detail.userName ?? detail.actor?.name ?? 'System'}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Organisation</p>
              <p className="font-medium">{detail.organizationName ?? 'Plattform'}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Ziel</p>
              <p className="font-medium">
                {detail.entity}
                {detail.entityId ? ` · ${detail.entityId.slice(0, 8)}` : ''}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Grund</p>
              <p className="font-medium">{truncateReason(detail.reason, 200)}</p>
            </div>
          </section>

          {(detail.diff?.before != null || detail.diff?.after != null) && (
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Vorher / Nachher</h3>
              <div className="space-y-3">
                <DiffBlock label="Vorher" value={detail.diff?.before} />
                <DiffBlock label="Nachher" value={detail.diff?.after} />
              </div>
            </section>
          )}

          {detail.immutable && (
            <p className="text-[10px] text-muted-foreground">Revisionssicher — nicht bearbeitbar.</p>
          )}

          {onOpenFullAudit && (
            <button
              type="button"
              className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
              onClick={() => onOpenFullAudit(detail.id)}
            >
              Vollständiger Audit-Eintrag
              <ExternalLink className="h-3 w-3" />
            </button>
          )}

          <button
            type="button"
            className="flex w-full items-center justify-between rounded-lg border border-border px-3 py-2 text-xs font-semibold"
            onClick={() => setTechOpen((v) => !v)}
          >
            Technische Details
            <ChevronDown className={`h-4 w-4 transition-transform ${techOpen ? 'rotate-180' : ''}`} />
          </button>

          {techOpen && (
            <div className="space-y-2 rounded-xl border border-border bg-muted/20 p-3 text-[10px] font-mono">
              <p>ID: {detail.id}</p>
              {detail.trace?.correlationId && <p>Correlation: {detail.trace.correlationId}</p>}
              {detail.trace?.requestId && <p>Request: {detail.trace.requestId}</p>}
              {detail.network?.ipAddress && <p>IP: {maskIpDisplay(detail.network.ipAddress)}</p>}
              {detail.auditDomain && <p>Domain: {detail.auditDomain}</p>}
              {detail.auditAction && <p>Aktion: {detail.auditAction}</p>}
            </div>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Eintrag nicht gefunden.</p>
      )}
    </DetailDrawer>
  );
}
