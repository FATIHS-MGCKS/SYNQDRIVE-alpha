import { useEffect, useMemo, useRef, useState } from 'react';
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
  const { t, mfaStateLabel, attentionCodeLabel, accountStateLabel, platformRoleLabel, formatRelative, loadError } =
    useSecurityAccessPresentation();
  const { detail, sessions, loading, sessionsLoading, sessionsError, error, refresh, refreshSessions } =
    useSecurityUserDetail(userId, loadError);
  const [mfaResetOpen, setMfaResetOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [revokeAllOpen, setRevokeAllOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const targetUserIdRef = useRef<string | null>(userId);
  targetUserIdRef.current = userId;
  const drawerGenerationRef = useRef(0);

  useEffect(() => {
    drawerGenerationRef.current += 1;
    setMfaResetOpen(false);
    setDeleteOpen(false);
    setRevokeAllOpen(false);
    setActionLoading(false);
  }, [userId]);

  const isMutationTargetCurrent = (targetId: string, generationAtStart: number) =>
    targetUserIdRef.current === targetId && drawerGenerationRef.current === generationAtStart;

  const boundDetail = detail && userId && detail.id === userId ? detail : null;
  const boundSessions = userId && boundDetail ? sessions : [];
  const targetReady = Boolean(userId && boundDetail && !loading);

  const MfaIcon = boundDetail ? mfaStateIcon(boundDetail.mfaState) : ShieldOff;

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
              disabled={!targetReady}
              onClick={async () => {
                const generationAtStart = drawerGenerationRef.current;
                const targetId = targetUserIdRef.current;
                if (!targetId || !boundDetail || boundDetail.id !== targetId) return;
                try {
                  await api.admin.securityAccess.revokeSession(targetId, s.id);
                  if (!isMutationTargetCurrent(targetId, generationAtStart)) return;
                  toast.success(t('master.securityAccess.userDetail.toast.sessionEnded'));
                  void refreshSessions();
                } catch {
                  if (!isMutationTargetCurrent(targetId, generationAtStart)) return;
                  toast.error(t('master.securityAccess.userDetail.toast.sessionEndFailed'));
                }
              }}
            >
              {t('master.securityAccess.own.endSession')}
            </Button>
          ) : null,
      },
    ],
    [boundDetail, formatRelative, refreshSessions, t, targetReady],
  );

  return (
    <>
      <DetailDrawer
        open={!!userId}
        onOpenChange={(open) => !open && onClose()}
        eyebrow={contextLabel ?? t('master.securityAccess.userDetail.defaultEyebrow')}
        title={boundDetail?.name ?? t('master.securityAccess.userDetail.defaultTitle')}
        description={boundDetail?.email}
        status={
          boundDetail ? (
            <div className="flex flex-wrap gap-1.5">
              <StatusChip tone={mfaStateTone(boundDetail.mfaState)} icon={<MfaIcon className="h-3 w-3" />}>
                {t('master.securityAccess.userDetail.mfaChip', { state: mfaStateLabel(boundDetail.mfaState) })}
              </StatusChip>
              {boundDetail.attentionCodes.slice(0, 2).map((code) => {
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
          targetReady && boundDetail && (
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => void refresh()}>
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                {t('master.securityAccess.userDetail.refresh')}
              </Button>
              {boundDetail.mfa.enrolled && (
                <Button type="button" variant="destructive" size="sm" onClick={() => setMfaResetOpen(true)}>
                  {t('master.securityAccess.userDetail.resetMfa')}
                </Button>
              )}
              <Button
                type="button"
                variant="destructive"
                size="sm"
                data-testid="user-detail-delete"
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                {t('master.securityAccess.userDetail.deleteUser')}
              </Button>
            </div>
          )
        }
      >
        {userId && loading && !boundDetail ? (
          <SkeletonCard className="h-48" />
        ) : userId && error && !boundDetail ? (
          <MasterErrorState
            title={t('master.securityAccess.userDetail.errorTitle')}
            error={error}
            onRetry={() => void refresh()}
          />
        ) : boundDetail ? (
          <div className="space-y-6 text-sm">
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
                {t('master.securityAccess.userDetail.section.identity')}
              </h3>
              <dl className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <dt className="text-muted-foreground">{t('master.securityAccess.userDetail.field.status')}</dt>
                  <dd className="font-medium">{accountStateLabel(boundDetail.accountState)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t('master.securityAccess.userDetail.field.created')}</dt>
                  <dd className="font-medium">{formatRelative(boundDetail.createdAt)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t('master.securityAccess.userDetail.field.platformRole')}</dt>
                  <dd className="font-medium">{platformRoleLabel(boundDetail.platformRole)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t('master.securityAccess.userDetail.field.lastActive')}</dt>
                  <dd className="font-medium">{formatRelative(boundDetail.lastActive)}</dd>
                </div>
              </dl>
            </section>

            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
                {t('master.securityAccess.userDetail.section.access')}
              </h3>
              {boundDetail.memberships.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t('master.securityAccess.userDetail.noMemberships')}</p>
              ) : (
                <ul className="space-y-2">
                  {boundDetail.memberships.map((m) => (
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
                  <dd>{boundDetail.mfa.factorTypes.join(', ') || t('master.securityAccess.common.none')}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t('master.securityAccess.userDetail.field.recoveryCodes')}</dt>
                  <dd>
                    {t('master.securityAccess.userDetail.recoveryRemaining', {
                      count: String(boundDetail.mfa.recoveryCodesRemaining),
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
                {boundSessions.length > 1 && (
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
                  rows={boundSessions}
                  getRowKey={(s) => s.id}
                  empty={t('master.securityAccess.userDetail.sessionsEmpty')}
                  dense
                />
              )}
            </section>

            {boundDetail.recentPrivilegedActivity.length > 0 && (
              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
                  {t('master.securityAccess.userDetail.section.privilegedActivity')}
                </h3>
                <ul className="space-y-1.5">
                  {boundDetail.recentPrivilegedActivity.map((a) => (
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
                {t('master.securityAccess.userDetail.techUserId', { id: boundDetail.id })}
              </p>
            </details>
          </div>
        ) : userId && !loading && !error ? (
          <p className="text-sm text-muted-foreground">{t('master.securityAccess.userDetail.notFound')}</p>
        ) : null}
      </DetailDrawer>

      <PrivilegeActionDialog
        key={`mfa-reset-${userId ?? 'closed'}`}
        open={mfaResetOpen && targetReady}
        onOpenChange={setMfaResetOpen}
        title={t('master.securityAccess.userDetail.mfaReset.title')}
        description={t('master.securityAccess.userDetail.mfaReset.description')}
        category="high-risk"
        requireReason
        minReasonLength={10}
        confirmLabel={t('master.securityAccess.userDetail.mfaReset.confirm')}
        loading={actionLoading}
        targetSummary={
          boundDetail ? (
            <div className="rounded-xl border border-border bg-muted/40 px-3 py-2 text-xs">
              <p className="font-semibold">{boundDetail.name}</p>
              <p className="text-muted-foreground">{boundDetail.email}</p>
            </div>
          ) : undefined
        }
        onConfirm={async (reason) => {
          const generationAtStart = drawerGenerationRef.current;
          const targetId = targetUserIdRef.current;
          if (!targetId || !boundDetail || boundDetail.id !== targetId) return;
          setActionLoading(true);
          try {
            await api.admin.securityAccess.resetUserMfa(targetId, {
              reason,
              idempotencyKey: newIdempotencyKey('mfa-reset'),
            });
            if (!isMutationTargetCurrent(targetId, generationAtStart)) return;
            toast.success(t('master.securityAccess.userDetail.mfaReset.success'));
            setMfaResetOpen(false);
            void refresh();
          } catch {
            if (!isMutationTargetCurrent(targetId, generationAtStart)) return;
            toast.error(t('master.securityAccess.userDetail.mfaReset.failed'));
          } finally {
            if (isMutationTargetCurrent(targetId, generationAtStart)) setActionLoading(false);
          }
        }}
      />

      <PrivilegeActionDialog
        key={`delete-${userId ?? 'closed'}`}
        open={deleteOpen && targetReady}
        onOpenChange={setDeleteOpen}
        title={t('master.securityAccess.userDetail.delete.title')}
        description={t('master.securityAccess.userDetail.delete.description')}
        category="destructive"
        requireReason
        minReasonLength={10}
        confirmLabel={t('master.securityAccess.userDetail.delete.confirm')}
        loading={actionLoading}
        onConfirm={async (reason) => {
          const generationAtStart = drawerGenerationRef.current;
          const targetId = targetUserIdRef.current;
          if (!targetId || !boundDetail || boundDetail.id !== targetId) return;
          setActionLoading(true);
          try {
            await api.users.delete(targetId, reason);
            if (!isMutationTargetCurrent(targetId, generationAtStart)) return;
            toast.success(t('master.securityAccess.userDetail.delete.success'));
            setDeleteOpen(false);
            onClose();
            onUserDeleted?.();
          } catch {
            if (!isMutationTargetCurrent(targetId, generationAtStart)) return;
            toast.error(t('master.securityAccess.userDetail.delete.failed'));
          } finally {
            if (isMutationTargetCurrent(targetId, generationAtStart)) setActionLoading(false);
          }
        }}
      />

      <PrivilegeActionDialog
        key={`revoke-all-${userId ?? 'closed'}`}
        open={revokeAllOpen && targetReady}
        onOpenChange={setRevokeAllOpen}
        title={t('master.securityAccess.userDetail.revokeAll.title')}
        description={t('master.securityAccess.userDetail.revokeAll.description')}
        category="sensitive"
        confirmLabel={t('master.securityAccess.userDetail.revokeAll.confirm')}
        loading={actionLoading}
        onConfirm={async () => {
          const generationAtStart = drawerGenerationRef.current;
          const targetId = targetUserIdRef.current;
          if (!targetId || !boundDetail || boundDetail.id !== targetId) return;
          setActionLoading(true);
          try {
            await api.admin.securityAccess.revokeAllSessions(targetId);
            if (!isMutationTargetCurrent(targetId, generationAtStart)) return;
            toast.success(t('master.securityAccess.userDetail.revokeAll.success'));
            setRevokeAllOpen(false);
            void refreshSessions();
          } catch {
            if (!isMutationTargetCurrent(targetId, generationAtStart)) return;
            toast.error(t('master.securityAccess.userDetail.revokeAll.failed'));
          } finally {
            if (isMutationTargetCurrent(targetId, generationAtStart)) setActionLoading(false);
          }
        }}
      />
    </>
  );
}