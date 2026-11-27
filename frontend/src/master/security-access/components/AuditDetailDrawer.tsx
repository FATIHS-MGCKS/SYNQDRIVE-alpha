import { ChevronDown, ExternalLink } from 'lucide-react';
import { useEffect, useState } from 'react';
import { DetailDrawer } from '../../../components/patterns/detail-drawer';
import { StatusChip } from '../../../components/patterns';
import { SkeletonCard } from '../../../components/patterns/states';
import { useAuditDetail } from '../useSecurityAccess';
import { useSecurityAccessPresentation } from '../useSecurityAccessPresentation';
import { auditResultTone, maskIpDisplay, truncateReason } from '../security-access.utils';

interface AuditDetailDrawerProps {
  auditId: string | null;
  onClose: () => void;
  onOpenFullAudit?: (auditId: string) => void;
}

function DiffBlock({ label, value }: { label: string; value: unknown }) {
  const { t } = useSecurityAccessPresentation();
  const text =
    value == null
      ? t('master.securityAccess.common.emDash')
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
  const { t, auditResultLabel, formatRelative } = useSecurityAccessPresentation();
  const { detail, loading } = useAuditDetail(auditId);
  const boundDetail = detail && auditId && detail.id === auditId ? detail : null;
  const [techOpen, setTechOpen] = useState(false);

  useEffect(() => {
    setTechOpen(false);
  }, [auditId]);

  return (
    <DetailDrawer
      open={!!auditId}
      onOpenChange={(open) => !open && onClose()}
      title={boundDetail?.action ?? t('master.securityAccess.auditDetail.titleFallback')}
      description={boundDetail?.createdAt ? formatRelative(boundDetail.createdAt) : undefined}
      status={
        boundDetail ? (
          <StatusChip tone={auditResultTone(boundDetail.result)} dot>
            {auditResultLabel(boundDetail.result)}
          </StatusChip>
        ) : undefined
      }
      widthClassName="sm:max-w-xl"
    >
      {auditId && loading && !boundDetail ? (
        <SkeletonCard className="h-40" />
      ) : boundDetail ? (
        <div className="space-y-5 text-sm">
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
              {t('master.securityAccess.auditDetail.section.summary')}
            </h3>
            <p className="text-sm text-foreground">{boundDetail.summary ?? boundDetail.description}</p>
          </section>

          <section className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <p className="text-muted-foreground">{t('master.securityAccess.auditDetail.field.actor')}</p>
              <p className="font-medium">
                {boundDetail.userName ?? boundDetail.actor?.name ?? t('master.securityAccess.common.system')}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">{t('master.securityAccess.auditDetail.field.organization')}</p>
              <p className="font-medium">{boundDetail.organizationName ?? t('master.securityAccess.common.platform')}</p>
            </div>
            <div>
              <p className="text-muted-foreground">{t('master.securityAccess.auditDetail.field.target')}</p>
              <p className="font-medium">
                {boundDetail.entity}
                {boundDetail.entityId ? ` · ${boundDetail.entityId.slice(0, 8)}` : ''}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">{t('master.securityAccess.auditDetail.field.reason')}</p>
              <p className="font-medium">{truncateReason(boundDetail.reason, 200)}</p>
            </div>
          </section>

          {(boundDetail.diff?.before != null || boundDetail.diff?.after != null) && (
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
                {t('master.securityAccess.auditDetail.section.diff')}
              </h3>
              <div className="space-y-3">
                <DiffBlock label={t('master.securityAccess.auditDetail.diff.before')} value={boundDetail.diff?.before} />
                <DiffBlock label={t('master.securityAccess.auditDetail.diff.after')} value={boundDetail.diff?.after} />
              </div>
            </section>
          )}

          {boundDetail.immutable && (
            <p className="text-[10px] text-muted-foreground">{t('master.securityAccess.auditDetail.immutableNotice')}</p>
          )}

          {onOpenFullAudit && (
            <button
              type="button"
              className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
              onClick={() => onOpenFullAudit(boundDetail.id)}
            >
              {t('master.securityAccess.auditDetail.fullEntryLink')}
              <ExternalLink className="h-3 w-3" />
            </button>
          )}

          <button
            type="button"
            className="flex w-full items-center justify-between rounded-lg border border-border px-3 py-2 text-xs font-semibold"
            onClick={() => setTechOpen((v) => !v)}
          >
            {t('master.securityAccess.auditDetail.techDetails')}
            <ChevronDown className={`h-4 w-4 transition-transform ${techOpen ? 'rotate-180' : ''}`} />
          </button>

          {techOpen && (
            <div className="space-y-2 rounded-xl border border-border bg-muted/20 p-3 text-[10px] font-mono">
              <p>ID: {boundDetail.id}</p>
              {boundDetail.trace?.correlationId && <p>Correlation: {boundDetail.trace.correlationId}</p>}
              {boundDetail.trace?.requestId && <p>Request: {boundDetail.trace.requestId}</p>}
              {boundDetail.network?.ipAddress && <p>IP: {maskIpDisplay(boundDetail.network.ipAddress)}</p>}
              {boundDetail.auditDomain && <p>Domain: {boundDetail.auditDomain}</p>}
              {boundDetail.auditAction && (
                <p>
                  {t('master.securityAccess.audit.columns.action')}: {boundDetail.auditAction}
                </p>
              )}
            </div>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{t('master.securityAccess.auditDetail.notFound')}</p>
      )}
    </DetailDrawer>
  );
}