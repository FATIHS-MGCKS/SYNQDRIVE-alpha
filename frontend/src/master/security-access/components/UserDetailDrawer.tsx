import { useState } from 'react';
import { ExternalLink, RefreshCw, ShieldOff, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { DetailDrawer } from '../../../components/patterns/detail-drawer';
import { StatusChip, DataTable } from '../../../components/patterns';
import type { DataTableColumn } from '../../../components/patterns';
import { SkeletonCard } from '../../../components/patterns/states';
import { Button } from '../../../components/ui/button';
import { api } from '../../../lib/api';
import { newIdempotencyKey } from '../../../lib/mfa';
import { useSecurityUserDetail } from '../useSecurityAccess';
import type { GovernanceUserSessionDto } from '../types';
import {
  attentionCodeIcon,
  attentionCodeLabel,
  attentionCodeTone,
  formatRelativeDe,
  mfaStateIcon,
  mfaStateLabel,
  mfaStateTone,
} from '../security-access.utils';
import { PrivilegeActionDialog } from './PrivilegeActionDialog';

interface UserDetailDrawerProps {
  userId: string | null;
  contextLabel?: string;
  onClose: () => void;
  onOpenAudit?: (auditId: string) => void;
  onOpenOrganization?: (orgId: string) => void;
  onUserDeleted?: () => void;
}

export function UserDetailDrawer({
  userId,
  contextLabel,
  onClose,
  onOpenAudit,
  onOpenOrganization,
  onUserDeleted,
}: UserDetailDrawerProps) {
  const { detail, sessions, loading, sessionsLoading, refresh, refreshSessions } = useSecurityUserDetail(userId);
  const [mfaResetOpen, setMfaResetOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [revokeAllOpen, setRevokeAllOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const MfaIcon = detail ? mfaStateIcon(detail.mfaState) : ShieldOff;

  const sessionColumns: DataTableColumn<GovernanceUserSessionDto>[] = [
    {
      key: 'device',
      header: 'Gerät',
      cell: (s) => (
        <div>
          <p className="text-xs font-medium">{s.device || s.browser || 'Unbekannt'}</p>
          <p className="text-[10px] text-muted-foreground">{s.os}</p>
        </div>
      ),
    },
    {
      key: 'ip',
      header: 'IP',
      cell: (s) => <span className="text-xs font-mono text-muted-foreground">{s.ipAddress}</span>,
    },
    {
      key: 'last',
      header: 'Letzte Aktivität',
      cell: (s) => <span className="text-xs text-muted-foreground">{formatRelativeDe(s.lastUsedAt ?? s.createdAt)}</span>,
    },
    {
      key: 'action',
      header: '',
      cell: (s) =>
        !s.current ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-xs"
            onClick={async () => {
              if (!userId) return;
              try {
                await api.admin.securityAccess.revokeSession(userId, s.id);
                toast.success('Sitzung beendet');
                void refreshSessions();
              } catch (e: unknown) {
                toast.error(e instanceof Error ? e.message : 'Sitzung konnte nicht beendet werden');
              }
            }}
          >
            Beenden
          </Button>
        ) : null,
    },
  ];

  return (
    <>
      <DetailDrawer
        open={!!userId}
        onOpenChange={(open) => !open && onClose()}
        eyebrow={contextLabel ?? 'Benutzer'}
        title={detail?.name ?? 'Benutzer'}
        description={detail?.email}
        status={
          detail ? (
            <div className="flex flex-wrap gap-1.5">
              <StatusChip tone={mfaStateTone(detail.mfaState)} icon={<MfaIcon className="h-3 w-3" />}>
                MFA: {mfaStateLabel(detail.mfaState)}
              </StatusChip>
              {detail.attentionCodes.slice(0, 2).map((code) => {
                const Icon = attentionCodeIcon(code);
                return (
                  <StatusChip key={code} tone={attentionCodeTone(code)} icon={<Icon className="h-3 w-3" />}>
                    {attentionCodeLabel(code)}
                  </StatusChip>
                );
              })}
            </div>
          ) : undefined
        }
        widthClassName="sm:max-w-xl"
        footer={
          detail && (
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => void refresh()}>
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                Aktualisieren
              </Button>
              {detail.mfa.enrolled && (
                <Button type="button" variant="destructive" size="sm" onClick={() => setMfaResetOpen(true)}>
                  MFA zurücksetzen
                </Button>
              )}
              <Button type="button" variant="destructive" size="sm" onClick={() => setDeleteOpen(true)}>
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                Benutzer löschen
              </Button>
            </div>
          )
        }
      >
        {loading && !detail ? (
          <SkeletonCard className="h-48" />
        ) : detail ? (
          <div className="space-y-6 text-sm">
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Identität</h3>
              <dl className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <dt className="text-muted-foreground">Status</dt>
                  <dd className="font-medium">{detail.accountState}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Erstellt</dt>
                  <dd className="font-medium">{formatRelativeDe(detail.createdAt)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Plattform-Rolle</dt>
                  <dd className="font-medium">{detail.platformRole ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Zuletzt aktiv</dt>
                  <dd className="font-medium">{formatRelativeDe(detail.lastActive)}</dd>
                </div>
              </dl>
            </section>

            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Zugriff</h3>
              {detail.memberships.length === 0 ? (
                <p className="text-xs text-muted-foreground">Keine Mandanten-Mitgliedschaften</p>
              ) : (
                <ul className="space-y-2">
                  {detail.memberships.map((m) => (
                    <li
                      key={m.organizationId}
                      className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2 text-xs"
                    >
                      <div>
                        <p className="font-semibold">{m.organizationName}</p>
                        <p className="text-muted-foreground">{m.roleLabel}</p>
                      </div>
                      <div className="flex gap-1">
                        {onOpenOrganization && (
                          <button
                            type="button"
                            className="text-primary font-semibold hover:underline"
                            onClick={() => onOpenOrganization(m.organizationId)}
                          >
                            Org
                          </button>
                        )}
                        <a
                          href={`/organizations/${m.organizationId}/settings/users-roles`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-0.5 text-primary font-semibold hover:underline"
                        >
                          IAM
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Sicherheit</h3>
              <dl className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <dt className="text-muted-foreground">MFA-Faktoren</dt>
                  <dd>{detail.mfa.factorTypes.join(', ') || 'Keine'}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Recovery-Codes</dt>
                  <dd>{detail.mfa.recoveryCodesRemaining} verbleibend</dd>
                </div>
              </dl>
            </section>

            <section>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase text-muted-foreground">Sitzungen</h3>
                {sessions.length > 1 && (
                  <Button type="button" variant="outline" size="sm" onClick={() => setRevokeAllOpen(true)}>
                    Alle anderen beenden
                  </Button>
                )}
              </div>
              {sessionsLoading ? (
                <SkeletonCard className="h-24" />
              ) : (
                <DataTable
                  columns={sessionColumns}
                  rows={sessions}
                  getRowKey={(s) => s.id}
                  empty="Keine aktiven Sitzungen"
                  dense
                />
              )}
            </section>

            {detail.recentPrivilegedActivity.length > 0 && (
              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
                  Letzte privilegierte Aktivität
                </h3>
                <ul className="space-y-1.5">
                  {detail.recentPrivilegedActivity.map((a) => (
                    <li key={a.id}>
                      <button
                        type="button"
                        className="w-full rounded-lg border border-border/50 px-3 py-2 text-left text-xs hover:bg-muted/30"
                        onClick={() => onOpenAudit?.(a.id)}
                      >
                        <p className="font-medium">{a.description}</p>
                        <p className="text-muted-foreground">{formatRelativeDe(a.createdAt)}</p>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <details className="text-[10px] text-muted-foreground">
              <summary className="cursor-pointer font-semibold uppercase">Technische Details</summary>
              <p className="mt-2 font-mono">User-ID: {detail.id}</p>
            </details>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Benutzer nicht gefunden.</p>
        )}
      </DetailDrawer>

      <PrivilegeActionDialog
        open={mfaResetOpen}
        onOpenChange={setMfaResetOpen}
        title="MFA zurücksetzen"
        description="Der Benutzer muss MFA neu einrichten. Alle aktiven Sitzungen werden beendet."
        category="high-risk"
        requireReason
        minReasonLength={10}
        confirmLabel="MFA zurücksetzen"
        loading={actionLoading}
        targetSummary={
          detail ? (
            <div className="rounded-xl border border-border bg-muted/40 px-3 py-2 text-xs">
              <p className="font-semibold">{detail.name}</p>
              <p className="text-muted-foreground">{detail.email}</p>
            </div>
          ) : undefined
        }
        onConfirm={async (reason) => {
          if (!userId) return;
          setActionLoading(true);
          try {
            await api.admin.securityAccess.resetUserMfa(userId, {
              reason,
              idempotencyKey: newIdempotencyKey('mfa-reset'),
            });
            toast.success('MFA wurde zurückgesetzt');
            setMfaResetOpen(false);
            void refresh();
          } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : 'MFA-Reset fehlgeschlagen');
          } finally {
            setActionLoading(false);
          }
        }}
      />

      <PrivilegeActionDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Benutzer löschen"
        description="Diese Aktion kann nicht rückgängig gemacht werden."
        category="destructive"
        requireReason
        minReasonLength={10}
        confirmLabel="Endgültig löschen"
        loading={actionLoading}
        onConfirm={async (reason) => {
          if (!userId) return;
          setActionLoading(true);
          try {
            await api.users.delete(userId, reason);
            toast.success('Benutzer gelöscht');
            setDeleteOpen(false);
            onClose();
            onUserDeleted?.();
          } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : 'Löschen fehlgeschlagen');
          } finally {
            setActionLoading(false);
          }
        }}
      />

      <PrivilegeActionDialog
        open={revokeAllOpen}
        onOpenChange={setRevokeAllOpen}
        title="Alle anderen Sitzungen beenden"
        description="Alle Sitzungen außer der aktuellen werden beendet."
        category="sensitive"
        confirmLabel="Sitzungen beenden"
        loading={actionLoading}
        onConfirm={async () => {
          if (!userId) return;
          setActionLoading(true);
          try {
            await api.admin.securityAccess.revokeAllSessions(userId);
            toast.success('Sitzungen beendet');
            setRevokeAllOpen(false);
            void refreshSessions();
          } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : 'Sitzungen konnten nicht beendet werden');
          } finally {
            setActionLoading(false);
          }
        }}
      />
    </>
  );
}
