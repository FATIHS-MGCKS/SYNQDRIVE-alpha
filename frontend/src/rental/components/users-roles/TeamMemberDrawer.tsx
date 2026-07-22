import { Shield, KeyRound, LogOut, PauseCircle, ShieldAlert } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { DetailDrawer, SectionHeader, Timeline } from '../../../components/patterns';
import { api, type IamTeamMemberDetailDto } from '../../../lib/api';
import { useLanguage } from '../../i18n/LanguageContext';
import { CollapsiblePermissions } from './PermissionEditor';
import { MfaStateBadge, RiskBadge } from './IamBadges';
import { formatDateTime } from './iam-team.utils';
import { AUDIT_ACTION_LABELS } from './constants';

type DrawerTab = 'overview' | 'access' | 'scope' | 'security' | 'activity';

interface TeamMemberDrawerProps {
  orgId: string;
  membershipId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRefresh: () => Promise<void>;
}

export function TeamMemberDrawer({
  orgId,
  membershipId,
  open,
  onOpenChange,
  onRefresh,
}: TeamMemberDrawerProps) {
  const { t, locale } = useLanguage();
  const [detail, setDetail] = useState<IamTeamMemberDetailDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<DrawerTab>('overview');
  const [actionReason, setActionReason] = useState('');
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    void api.iam
      .teamMember(orgId, membershipId)
      .then(setDetail)
      .catch(() => toast.error('Failed to load member'))
      .finally(() => setLoading(false));
  }, [open, orgId, membershipId]);

  const tabs: { id: DrawerTab; label: string }[] = [
    { id: 'overview', label: t('iam.drawer.overview') },
    { id: 'access', label: t('iam.drawer.effectiveAccess') },
    { id: 'scope', label: t('iam.drawer.scope') },
    { id: 'security', label: t('iam.drawer.security') },
    { id: 'activity', label: t('iam.drawer.activity') },
  ];

  async function runAction(action: 'reset' | 'revoke' | 'suspend') {
    if (!detail) return;
    setPendingAction(action);
    try {
      if (action === 'reset') {
        await api.iam.sendResetLink(orgId, membershipId);
        toast.success(t('iam.action.sendReset'));
      } else if (action === 'revoke') {
        await api.iam.revokeAllSessions(orgId, detail.userId, `revoke:${detail.userId}:${Date.now()}`);
        toast.success(t('iam.action.revokeSessions'));
      } else if (action === 'suspend') {
        await api.users.updateByOrg(orgId, detail.userId, { status: 'SUSPENDED' });
        toast.success(t('iam.action.suspend'));
      }
      await onRefresh();
      const refreshed = await api.iam.teamMember(orgId, membershipId);
      setDetail(refreshed);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setPendingAction(null);
      setActionReason('');
    }
  }

  return (
    <DetailDrawer
      open={open}
      onOpenChange={onOpenChange}
      title={detail?.userSummary.displayName ?? '…'}
      description={detail?.userSummary.email}
    >
      {loading || !detail ? (
        <div className="py-12 text-center text-muted-foreground text-[13px]">Loading…</div>
      ) : (
        <div className="space-y-5">
          <div
            role="tablist"
            aria-label={t('iam.a11y.drawerTabs')}
            className="flex gap-1 overflow-x-auto border-b border-border"
          >
            {tabs.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={tab === item.id}
                className={`px-3 py-2 text-[12px] font-semibold whitespace-nowrap border-b-2 -mb-px ${
                  tab === item.id ? 'border-[var(--brand)] text-foreground' : 'border-transparent text-muted-foreground'
                }`}
                onClick={() => setTab(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>

          {tab === 'overview' && (
            <div className="space-y-4" role="tabpanel">
              <div className="flex flex-wrap gap-2">
                <MfaStateBadge state={detail.mfaState} />
                <RiskBadge level={detail.effectiveAccess.riskClassification} />
              </div>
              <div className="grid grid-cols-2 gap-3 text-[13px]">
                <div>
                  <div className="text-muted-foreground">Role</div>
                  <div className="font-medium">{detail.effectiveAccess.effectiveRoleLabel}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">{t('iam.col.lastActivity')}</div>
                  <div className="font-medium tabular-nums">
                    {formatDateTime(detail.sessions.items[0]?.createdAt ?? null, locale)}
                  </div>
                </div>
              </div>
              {detail.requiresAction && (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-[12px]">
                  {detail.reasonCodes.join(', ')}
                </div>
              )}
            </div>
          )}

          {tab === 'access' && (
            <div role="tabpanel" className="space-y-3">
              <SectionHeader title={t('iam.drawer.effectiveAccess')} />
              <p className="text-[12px] text-muted-foreground">
                v{detail.effectiveAccess.membershipVersion} · {detail.effectiveAccess.privilegedCapabilities.join(', ') || '—'}
              </p>
              <CollapsiblePermissions permissions={detail.effectiveAccess.permissions ?? {}} disabled />
            </div>
          )}

          {tab === 'scope' && (
            <div role="tabpanel" className="space-y-2 text-[13px]">
              <div>{detail.scope.stationNames.join(', ') || detail.scope.stationScope || 'All stations'}</div>
              {detail.scope.fieldAgentAccess && (
                <div className="text-muted-foreground">Field agent access enabled</div>
              )}
            </div>
          )}

          {tab === 'security' && (
            <div role="tabpanel" className="space-y-4">
              <MfaStateBadge state={detail.mfaState} />
              <SectionHeader title="Sessions" />
              <ul className="space-y-2 text-[12px]">
                {detail.sessions.items.map((s) => (
                  <li key={s.id} className="rounded-lg border border-border px-3 py-2">
                    <div>{s.userAgent ?? 'Unknown device'}</div>
                    <div className="text-muted-foreground tabular-nums">{formatDateTime(s.createdAt, locale)}</div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {tab === 'activity' && (
            <div role="tabpanel">
              <Timeline
                items={detail.auditTimeline.map((e) => ({
                  id: e.id,
                  title: (e.auditAction && AUDIT_ACTION_LABELS[e.auditAction]) || e.description,
                  time: e.createdAt,
                  tone:
                    e.level === 'CRITICAL'
                      ? 'critical'
                      : e.level === 'WARN'
                        ? 'warning'
                        : 'neutral',
                }))}
              />
            </div>
          )}

          <div className="sticky bottom-0 -mx-4 border-t border-border bg-background/95 backdrop-blur px-4 py-3 space-y-2">
            <label className="block text-[12px] font-medium" htmlFor="iam-action-reason">
              Reason (required for dangerous actions)
            </label>
            <input
              id="iam-action-reason"
              value={actionReason}
              onChange={(e) => setActionReason(e.target.value)}
              className="w-full rounded-lg border border-border px-3 py-2 text-[13px]"
            />
            <div className="flex flex-wrap gap-2">
              <ActionButton
                icon={KeyRound}
                label={t('iam.action.sendReset')}
                enabled={detail.availableActions.sendResetLink.enabled}
                preview={detail.availableActions.sendResetLink.impactPreview}
                loading={pendingAction === 'reset'}
                onClick={() => void runAction('reset')}
                disabled={!actionReason.trim()}
              />
              <ActionButton
                icon={LogOut}
                label={t('iam.action.revokeSessions')}
                enabled={detail.availableActions.revokeSessions.enabled}
                preview={detail.availableActions.revokeSessions.impactPreview}
                loading={pendingAction === 'revoke'}
                onClick={() => void runAction('revoke')}
                disabled={!actionReason.trim()}
              />
              <ActionButton
                icon={PauseCircle}
                label={t('iam.action.suspend')}
                enabled={detail.availableActions.suspendMembership.enabled}
                preview={detail.availableActions.suspendMembership.impactPreview}
                blocked={detail.availableActions.suspendMembership.blockedReason}
                loading={pendingAction === 'suspend'}
                onClick={() => void runAction('suspend')}
                disabled={!actionReason.trim()}
              />
            </div>
          </div>
        </div>
      )}
    </DetailDrawer>
  );
}

function ActionButton({
  icon: Icon,
  label,
  enabled,
  preview,
  blocked,
  loading,
  disabled,
  onClick,
}: {
  icon: typeof Shield;
  label: string;
  enabled: boolean;
  preview?: string | null;
  blocked?: string | null;
  loading?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  if (!enabled) {
    return (
      <button
        type="button"
        disabled
        title={blocked ?? preview ?? undefined}
        className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-2 text-[12px] text-muted-foreground opacity-60"
      >
        <ShieldAlert className="h-3.5 w-3.5" />
        {label}
      </button>
    );
  }
  return (
    <button
      type="button"
      title={preview ?? undefined}
      disabled={disabled || loading}
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-[12px] font-medium hover:bg-muted disabled:opacity-50"
    >
      <Icon className="h-3.5 w-3.5" />
      {loading ? '…' : label}
    </button>
  );
}
