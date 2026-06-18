import { AlertTriangle, Loader2, ShieldOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import { DetailDrawer, StatusChip, Timeline, type TimelineItem } from '../../../../components/patterns';
import { api, type DataAuthorizationAuditEntry, type DataAuthorizationDto } from '../../../../lib/api';
import {
  DIMO_REVOKE_IMPACT,
  isDimoTelemetryAuth,
  labelDataCategory,
  labelProcessor,
  labelPurpose,
  labelScope,
  labelSourceType,
} from './data-authorization.constants';
import { AuthRiskChip, AuthStatusChip } from './data-authorization.badges';
import { affectedObjectsSummary, formatAuthDate, labelScopeStatus } from './data-authorization.utils';

interface VehicleRow {
  id: string;
  make?: string;
  model?: string;
  licensePlate?: string | null;
  vin?: string;
}

function DetailSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {title}
      </h3>
      {children}
    </section>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(0,38%)_1fr] gap-2 text-[12px]">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground break-words">{value}</span>
    </div>
  );
}

interface DataAuthorizationDetailDrawerProps {
  auth: DataAuthorizationDto | null;
  orgId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canManage: boolean;
  actionLoading: boolean;
  onGrant: () => void;
  onRevoke: () => void;
}

export function DataAuthorizationDetailDrawer({
  auth,
  orgId,
  open,
  onOpenChange,
  canManage,
  actionLoading,
  onGrant,
  onRevoke,
}: DataAuthorizationDetailDrawerProps) {
  const [vehicles, setVehicles] = useState<VehicleRow[]>([]);
  const [showAllVehicles, setShowAllVehicles] = useState(false);
  const [audit, setAudit] = useState<DataAuthorizationAuditEntry[]>([]);

  useEffect(() => {
    if (!open || !auth) {
      setVehicles([]);
      setAudit([]);
      setShowAllVehicles(false);
      return;
    }

    void (async () => {
      try {
        const logs = await api.dataAuthorizations.auditLog(orgId, 40);
        setAudit(logs.filter((l) => l.entityId === auth.id));
      } catch {
        setAudit([]);
      }

      const ids = auth.vehicleIds ?? [];
      if (ids.length === 0) {
        setVehicles([]);
        return;
      }

      try {
        const res = await api.vehicles.listByOrg(orgId, { limit: 500 });
        const all = (res.data ?? res) as VehicleRow[];
        const map = new Map(all.map((v) => [v.id, v]));
        setVehicles(ids.map((id) => map.get(id) ?? { id }));
      } catch {
        setVehicles(ids.map((id) => ({ id })));
      }
    })();
  }, [open, auth, orgId]);

  if (!auth) return null;

  const dimo = isDimoTelemetryAuth(auth);
  const purposes = auth.purposes?.length ? auth.purposes : auth.purpose ? [auth.purpose] : [];
  const visibleVehicles = showAllVehicles ? vehicles : vehicles.slice(0, 5);

  const timelineFromAuth: TimelineItem[] = [
    { id: 'created', title: 'Erstellt', time: formatAuthDate(auth.createdAt), tone: 'neutral' },
    ...(auth.grantedAt
      ? [{
          id: 'granted',
          title: 'Aktiviert',
          time: formatAuthDate(auth.grantedAt),
          description: auth.grantedByName ? `von ${auth.grantedByName}` : undefined,
          tone: 'success' as const,
        }]
      : []),
    ...(auth.lastAccessAt
      ? [{
          id: 'access',
          title: 'Letzter Zugriff',
          time: formatAuthDate(auth.lastAccessAt),
          description: `${auth.accessCount} Zugriffe erfasst`,
          tone: 'info' as const,
        }]
      : []),
    ...(auth.revokedAt
      ? [{
          id: 'revoked',
          title: 'Widerrufen',
          time: formatAuthDate(auth.revokedAt),
          description: auth.revokeReason ?? auth.revokedByName ?? undefined,
          tone: 'critical' as const,
        }]
      : []),
    ...(auth.updatedAt && auth.updatedAt !== auth.createdAt
      ? [{
          id: 'updated',
          title: 'Aktualisiert',
          time: formatAuthDate(auth.updatedAt),
          tone: 'neutral' as const,
        }]
      : []),
  ];

  const auditTimeline: TimelineItem[] = audit.map((entry) => ({
    id: entry.id,
    title: entry.description,
    time: formatAuthDate(entry.createdAt),
    description: entry.changeSummary ?? undefined,
    tone:
      entry.action === 'REVOKE'
        ? ('critical' as const)
        : entry.action === 'GRANT'
          ? ('success' as const)
          : ('neutral' as const),
  }));

  const footer =
    canManage && (auth.statusKey === 'ACTIVE' || auth.statusKey === 'PENDING') ? (
      <>
        {auth.statusKey === 'PENDING' && (
          <button
            type="button"
            disabled={actionLoading}
            onClick={onGrant}
            className="sq-3d-btn sq-3d-btn--primary px-4 py-2 text-xs font-semibold rounded-xl disabled:opacity-50"
          >
            {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Genehmigen'}
          </button>
        )}
        <button
          type="button"
          disabled={actionLoading}
          onClick={onRevoke}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-xl border border-border text-destructive hover:bg-destructive/10 disabled:opacity-50"
        >
          <ShieldOff className="w-3.5 h-3.5" />
          {auth.statusKey === 'PENDING' ? 'Ablehnen' : 'Widerrufen'}
        </button>
      </>
    ) : undefined;

  return (
    <DetailDrawer
      open={open}
      onOpenChange={onOpenChange}
      widthClassName="sm:max-w-xl"
      eyebrow={auth.isSystemGenerated ? 'Systemfreigabe' : 'Datenfreigabe'}
      title={auth.title}
      description={auth.description ?? undefined}
      status={
        <div className="flex flex-wrap gap-1.5">
          <AuthStatusChip statusKey={auth.statusKey} />
          <AuthRiskChip riskKey={auth.riskLevelKey} />
        </div>
      }
      footer={footer}
    >
      <div className="space-y-6">
        <DetailSection title="Überblick">
          <div className="sq-card rounded-xl border border-border/70 p-3 space-y-2">
            <DetailRow label="Quelle" value={labelSourceType(auth.sourceType)} />
            <DetailRow label="Verarbeiter" value={labelProcessor(auth)} />
            <DetailRow label="Scope" value={labelScope(auth.scopeKey)} />
            {(dimo || auth.scopeStatus) && (
              <DetailRow label="Scope-Status" value={labelScopeStatus(auth)} />
            )}
            {auth.scopeNote && (
              <p className="text-xs text-amber-600 dark:text-amber-400 px-4 pb-2">{auth.scopeNote}</p>
            )}
            {dimo && (auth.vehicleCount ?? 0) === 0 && auth.statusKey !== 'REVOKED' && (
              <p className="text-xs text-muted-foreground px-4 pb-2">
                Letzte Synchronisierung: {formatAuthDate(auth.lastSyncedAt ?? auth.updatedAt)}
              </p>
            )}
            <DetailRow label="Betroffene Objekte" value={affectedObjectsSummary(auth)} />
            <DetailRow label="Ablauf" value={formatAuthDate(auth.expiresAt)} />
            <DetailRow label="Letzter Zugriff" value={formatAuthDate(auth.lastAccessAt)} />
          </div>
        </DetailSection>

        <DetailSection title="Was wird verarbeitet?">
          <div className="flex flex-wrap gap-1.5">
            {auth.dataCategories.map((cat) => (
              <StatusChip key={cat} tone="neutral">
                {labelDataCategory(cat)}
              </StatusChip>
            ))}
          </div>
          {dimo && (
            <p className="text-[12px] text-muted-foreground leading-relaxed">
              SynqDrive verarbeitet DIMO Hardware-/Cloud-Daten für verbundene Fahrzeuge —
              inkl. GPS, Telemetrie, Fahrzeugdaten, Kilometerstand, Trips, Health-Signale und
              DTC-Fehlercodes.
            </p>
          )}
        </DetailSection>

        <DetailSection title="Wofür wird es verwendet?">
          <div className="flex flex-wrap gap-1.5">
            {purposes.map((p) => (
              <StatusChip key={p} tone="info">
                {labelPurpose(p)}
              </StatusChip>
            ))}
          </div>
        </DetailSection>

        {vehicles.length > 0 && (
          <DetailSection title="Betroffene Fahrzeuge">
            <ul className="space-y-2">
              {visibleVehicles.map((v) => (
                <li
                  key={v.id}
                  className="sq-card rounded-lg border border-border/60 px-3 py-2 text-[12px]"
                >
                  <p className="font-semibold text-foreground">
                    {v.make && v.model ? `${v.make} ${v.model}` : `Fahrzeug ${v.id.slice(0, 8)}`}
                  </p>
                  <p className="text-muted-foreground font-mono text-[11px] mt-0.5">
                    {v.licensePlate ?? '—'} · {v.vin ?? v.id.slice(0, 8)}
                  </p>
                </li>
              ))}
            </ul>
            {vehicles.length > 5 && !showAllVehicles && (
              <button
                type="button"
                onClick={() => setShowAllVehicles(true)}
                className="text-[12px] font-semibold text-[var(--brand)] hover:underline"
              >
                Alle {vehicles.length} Fahrzeuge anzeigen
              </button>
            )}
          </DetailSection>
        )}

        {(auth.statusKey === 'ACTIVE' || auth.statusKey === 'PENDING') && dimo && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 flex gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-[12px] font-semibold text-foreground">Auswirkungen bei Widerruf</p>
              <p className="text-[11.5px] text-muted-foreground mt-1 leading-relaxed">
                {DIMO_REVOKE_IMPACT}
              </p>
            </div>
          </div>
        )}

        <DetailSection title="Timeline / Audit">
          {auditTimeline.length > 0 ? (
            <Timeline items={auditTimeline} />
          ) : (
            <Timeline items={timelineFromAuth} />
          )}
        </DetailSection>
      </div>
    </DetailDrawer>
  );
}
