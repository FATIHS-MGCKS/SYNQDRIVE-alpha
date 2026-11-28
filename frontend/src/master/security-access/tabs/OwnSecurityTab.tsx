import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { DataCard, DataTable, StatusChip } from '../../../components/patterns';
import type { DataTableColumn } from '../../../components/patterns';
import { MfaEnrollmentPanel } from '../../../components/mfa/MfaEnrollmentPanel';
import { Button } from '../../../components/ui/button';
import { api } from '../../../lib/api';
import type { AccountSessionDto } from '../../../lib/api';
import { MasterLoadingState } from '../../shell';
import { useSecurityAccessPresentation } from '../useSecurityAccessPresentation';
import { maskIpDisplay } from '../security-access.utils';
import type { OwnSecurityTab } from '../types';
import { CHROME_TAB_BAR_CLASS, chromeTabTriggerClass } from '../../../components/patterns/chrome-tab-bar';

interface OwnSecurityTabProps {
  activeTab: OwnSecurityTab;
  onTabChange: (tab: OwnSecurityTab) => void;
}

export function OwnSecurityTabView({ activeTab, onTabChange }: OwnSecurityTabProps) {
  const { t, formatRelative, loadError } = useSecurityAccessPresentation();
  const [mfaStatus, setMfaStatus] = useState<Awaited<ReturnType<typeof api.account.mfa.status>> | null>(null);
  const [sessions, setSessions] = useState<AccountSessionDto[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [mfa, sess] = await Promise.all([api.account.mfa.status(), api.account.sessions()]);
      setMfaStatus(mfa);
      setSessions(sess);
    } catch {
      toast.error(loadError('own'));
    } finally {
      setLoading(false);
    }
  }, [loadError]);

  useEffect(() => {
    void load();
  }, [load]);

  const sessionColumns = useMemo<DataTableColumn<AccountSessionDto>[]>(
    () => [
      {
        key: 'device',
        header: t('master.securityAccess.own.columns.device'),
        cell: (s) => (
          <div>
            <p className="text-xs font-medium">{s.device ?? s.browser ?? t('master.securityAccess.common.unknown')}</p>
            {s.current && (
              <StatusChip tone="info" className="mt-1 text-[10px]">
                {t('master.securityAccess.own.currentSession')}
              </StatusChip>
            )}
          </div>
        ),
      },
      {
        key: 'last',
        header: t('master.securityAccess.own.columns.lastActivity'),
        cell: (s) => (
          <span className="text-xs text-muted-foreground">{formatRelative(s.lastUsedAt ?? s.createdAt)}</span>
        ),
      },
      {
        key: 'ip',
        header: t('master.securityAccess.own.columns.ip'),
        cell: (s) => <span className="text-xs font-mono">{maskIpDisplay(s.ipAddress)}</span>,
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
                try {
                  await api.account.revokeSession(s.id);
                  toast.success(t('master.securityAccess.own.toast.sessionEnded'));
                  void load();
                } catch (e: unknown) {
                  toast.error(e instanceof Error ? e.message : t('master.securityAccess.own.toast.sessionEndFailed'));
                }
              }}
            >
              {t('master.securityAccess.own.endSession')}
            </Button>
          ) : null,
      },
    ],
    [formatRelative, load, t],
  );

  const subTabs = useMemo(
    () =>
      [
        { id: 'mfa' as const, label: t('master.securityAccess.own.subTab.mfa') },
        { id: 'sessions' as const, label: t('master.securityAccess.own.subTab.sessions') },
        { id: 'recovery' as const, label: t('master.securityAccess.own.subTab.recovery') },
      ],
    [t],
  );

  return (
    <div className="space-y-4">
      <div className={CHROME_TAB_BAR_CLASS} role="tablist" aria-label={t('master.securityAccess.own.subTabsAria')}>
        {subTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            className={chromeTabTriggerClass(activeTab === tab.id)}
            onClick={() => onTabChange(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <MasterLoadingState variant="card" count={1} />
      ) : (
        <>
          {activeTab === 'mfa' && (
            <div className="space-y-4">
              {mfaStatus?.enrolled ? (
                <DataCard title={t('master.securityAccess.own.mfaActiveTitle')}>
                  <p className="text-sm text-muted-foreground">
                    {t('master.securityAccess.own.mfaActiveFactors', {
                      factors: mfaStatus.factorTypes.join(', ') || 'TOTP',
                      count: String(mfaStatus.recoveryCodesRemaining),
                    })}
                  </p>
                </DataCard>
              ) : (
                <MfaEnrollmentPanel onEnrolled={() => void load()} />
              )}
            </div>
          )}

          {activeTab === 'sessions' && (
            <DataCard
              title={t('master.securityAccess.own.sessionsTitle')}
              actions={
                sessions.length > 1 ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      try {
                        const res = await api.account.revokeOtherSessions();
                        toast.success(
                          t('master.securityAccess.own.toast.sessionsRevoked', { count: String(res.revoked) }),
                        );
                        void load();
                      } catch (e: unknown) {
                        toast.error(e instanceof Error ? e.message : t('master.securityAccess.own.toast.genericError'));
                      }
                    }}
                  >
                    {t('master.securityAccess.own.revokeAllOthers')}
                  </Button>
                ) : undefined
              }
              flush
              bodyClassName="p-0"
            >
              <DataTable
                columns={sessionColumns}
                rows={sessions}
                getRowKey={(s) => s.id}
                empty={t('master.securityAccess.own.sessionsEmpty')}
                dense
              />
            </DataCard>
          )}

          {activeTab === 'recovery' && (
            <DataCard title={t('master.securityAccess.own.recoveryTitle')}>
              <p className="text-sm text-muted-foreground mb-3">
                {t('master.securityAccess.own.recoveryBody')}{' '}
                <strong>{mfaStatus?.recoveryCodesRemaining ?? 0}</strong>
              </p>
              <p className="text-xs text-muted-foreground">{t('master.securityAccess.own.recoveryRotationHint')}</p>
              <Button type="button" variant="outline" size="sm" className="mt-4" onClick={() => void load()}>
                <RefreshCw className="mr-2 h-3.5 w-3.5" />
                {t('master.securityAccess.own.refreshStatus')}
              </Button>
            </DataCard>
          )}
        </>
      )}
    </div>
  );
}