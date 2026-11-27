import { useMemo, useState } from 'react';
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
import { useSecurityAccessPresentation } from '../useSecurityAccessPresentation';
import {
  attentionCodeIcon,
  attentionCodeTone,
  mfaStateIcon,
  mfaStateTone,
} from '../security-access.utils';
import { MasterErrorState } from '../../shell';
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
  const { t, mfaStateLabel, attentionCodeLabel, formatRelative, loadError } = useSecurityAccessPresentation();
  const { detail, sessions, loading, sessionsLoading, sessionsError, refresh, refreshSessions } = useSecurityUserDetail(
    userId,
    loadError,
  );
  const [mfaResetOpen, setMfaResetOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [revokeAllOpen, setRevokeAllOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const MfaIcon = detail ? mfaStateIcon(detail.mfaState) : ShieldOff;

  const sessionColumns = useMemo<DataTableColumn<GovernanceUserSessionDto>[]>(
    () => [
      {
        key: 'device',
        header: t('master.securityAccess.own.columns.device'),
        cell: (s) => (
          <div>
            <p className="text-xs font-medium">{s.device || s.browser || t('master.securityAccess.common.unknown')}</p>
            <p className="text-[10px] text-muted-foreground">{s.os}</p>
          </div>
        ),
      },
      {
        key: 'ip',
        header: t('master.securityAccess.own.columns.ip'),
        cell: (s) => <span className="text-xs font-mono text-muted-foreground">{s.ipAddress}</span>,
      },
      {
        key: 'last',
        header: t('master.securityAccess.own.columns.lastActivity'),
        cell: (s) => (
          <span className="text-xs text-muted-foreground">{formatRelative(s.lastUsedAt ?? s.createdAt)}</span>
        ),
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
                  toast.success(t('master.securityAccess.userDetail.toast.sessionEnded'));
                  void refreshSessions();
                } catch (e: unknown) {
                  toast.error(
                    e instanceof Error ? e.message : t('master.securityAccess.userDetail.toast.sessionEndFailed'),
                  );
                }
              }}
            >
              {t('master.securityAccess.own.endSession')}
            </Button>
          ) : null,
      },
    ],
    [formatRelative, refreshSessions, t, userId],
  );

  return (
    <>
      <DetailDrawer
        open={!!userId}
        onOpenChange={(open) => !open && onClose()}
        eyebrow={contextLabel ?? t('master.securityAccess.userDetail.defaultEyebrow')}
        title={detail?.name ?? t('master.securityAccess.userDetail.defaultTitle')}
        description={detail?.email}
        status={
          detail ? (
            <div className="flex flex-wrap gap-1.5">
              <StatusChip tone={mfaStateTone(detail.mfaState)} icon={<MfaIcon className="h-3 w-3" />}>
                {t('master.securityAccess.userDetail.mfaChip', { state: mfaStateLabel(detail.mfaState) })}
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
                {t('master.securityAccess.userDetail.refresh')}
              </Button>
              {detail.mfa.enrolled && (
                <Button type="button" variant="destructive" size="sm" onClick={() => setMfaResetOpen(true)}>
                  {t('master.securityAccess.userDetail.resetMfa')}
                </Button>
              )}
              <Button type="button" variant="destructive" size="sm" onClick={() => setDeleteOpen(true)}>
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                {t('master.securityAccess.userDetail.deleteUser')}
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
              <h3 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
                {t('master.securityAccess.userDetail.section.identity')}
              </h3>
              <dl className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <dt className="text-muted-foreground">{t('master.securityAccess.userDetail.field.status')}</dt>
                  <dd className="font-medium">{detail.accountState}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t('master.securityAccess.userDetail.field.created')}</dt>
                  <dd className="font-medium">{formatRelative(detail.createdAt)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t('master.securityAccess.userDetail.field.platformRole')}</dt>
                  <dd className="font-medium">{detail.platformRole ?? t('master.securityAccess.common.emDash')}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t('master.securityAccess.userDetail.field.lastActive')}</dt>
                  <dd className="font-medium">{formatRelative(detail.lastActive)}</dd>
                </div>
              </dl>
            </section>

            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
                {t('master.securityAccess.userDetail.section.access')}
              </h3>
              {detail.memberships.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t('master.securityAccess.userDetail.noMemberships')}</p>
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
                            {t('master.securityAccess.userDetail.link.org')}
                          </button>
                        )}
                        <a
                          href={`/organizations/${m.organizationId}/settings/users-roles`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-0.5 text-primary font-semibold hover:underline"
                        >
                          {t('master.securityAccess.userDetail.link.iam')}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
                {t('master.securityAccess.userDetail.section.security')}
              </h3>
              <dl className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <dt className="text-muted-foreground">{t('master.securityAccess.userDetail.field.mfaFactors')}</dt>
                  <dd>{detail.mfa.factorTypes.join(', ') || t('master.securityAccess.common.none')}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t('master.securityAccess.userDetail.field.recoveryCodes')}</dt>
                  <dd>
                    {t('master.securityAccess.userDetail.recoveryRemaining', {
                      count: String(detail.mfa.recoveryCodesRemaining),
                    })}
                  </dd>
                </div>
              </dl>
            </section>

            <section>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase text-muted-foreground">
                  {t('master.securityAccess.userDetail.section.sessions')}
                </h3>
                {sessions.length > 1 && (
                  <Button type="button" variant="outline" size="sm" onClick={() => setRevokeAllOpen(true)}>
                    {t('master.securityAccess.userDetail.revokeOtherSessions')}
                  </Button>
                )}
              </div>
              {sessionsLoading ? (
                <SkeletonCard className="h-24" />
              ) : sessionsError ? (
                <MasterErrorState
                  title={t('master.securityAccess.users.sessionsErrorTitle')}
                  error={sessionsError}
                  onRetry={() => void refreshSessions()}
                />
              ) : (
                <DataTable
                  columns={sessionColumns}
                  rows={sessions}
                  getRowKey={(s) => s.id}
                  empty={t('master.securityAccess.userDetail.sessionsEmpty')}
                  dense
                />
              )}
            </section>

            {detail.recentPrivilegedActivity.length > 0 && (
              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
                  {t('master.securityAccess.userDetail.section.privilegedActivity')}
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
                        <p className="text-muted-foreground">{formatRelative(a.createdAt)}</p>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <details className="text-[10px] text-muted-foreground">
              <summary className="cursor-pointer font-semibold uppercase">
                {t('master.securityAccess.userDetail.techDetails')}
              </summary>
              <p className="mt-2 font-mono">
                {t('master.securityAccess.userDetail.techUserId', { id: detail.id })}
              </p>
            </details>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t('master.securityAccess.userDetail.notFound')}</p>
        )}
      </DetailDrawer>

      <PrivilegeActionDialog
        open={mfaResetOpen}
        onOpenChange={setMfaResetOpen}
        title={t('master.securityAccess.userDetail.mfaReset.title')}
        description={t('master.securityAccess.userDetail.mfaReset.description')}
        category="high-risk"
        requireReason
        minReasonLength={10}
        confirmLabel={t('master.securityAccess.userDetail.mfaReset.confirm')}
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
            toast.success(t('master.securityAccess.userDetail.mfaReset.success'));
            setMfaResetOpen(false);
            void refresh();
          } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : t('master.securityAccess.userDetail.mfaReset.failed'));
          } finally {
            setActionLoading(false);
          }
        }}
      />

      <PrivilegeActionDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={t('master.securityAccess.userDetail.delete.title')}
        description={t('master.securityAccess.userDetail.delete.description')}
        category="destructive"
        requireReason
        minReasonLength={10}
        confirmLabel={t('master.securityAccess.userDetail.delete.confirm')}
        loading={actionLoading}
        onConfirm={async (reason) => {
          if (!userId) return;
          setActionLoading(true);
          try {
            await api.users.delete(userId, reason);
            toast.success(t('master.securityAccess.userDetail.delete.success'));
            setDeleteOpen(false);
            onClose();
            onUserDeleted?.();
          } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : t('master.securityAccess.userDetail.delete.failed'));
          } finally {
            setActionLoading(false);
          }
        }}
      />

      <PrivilegeActionDialog
        open={revokeAllOpen}
        onOpenChange={setRevokeAllOpen}
        title={t('master.securityAccess.userDetail.revokeAll.title')}
        description={t('master.securityAccess.userDetail.revokeAll.description')}
        category="sensitive"
        confirmLabel={t('master.securityAccess.userDetail.revokeAll.confirm')}
        loading={actionLoading}
        onConfirm={async () => {
          if (!userId) return;
          setActionLoading(true);
          try {
            await api.admin.securityAccess.revokeAllSessions(userId);
            toast.success(t('master.securityAccess.userDetail.revokeAll.success'));
            setRevokeAllOpen(false);
            void refreshSessions();
          } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : t('master.securityAccess.userDetail.revokeAll.failed'));
          } finally {
            setActionLoading(false);
          }
        }}
      />
    </>
  );
}