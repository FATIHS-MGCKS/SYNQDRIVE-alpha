import { KeyRound, Loader2, LogOut, MonitorSmartphone, Shield, ShieldOff, Smartphone } from 'lucide-react';
import type { AccountMeDto, AccountSessionDto } from '../../../../lib/api';
import { DataCard, EmptyState } from '../../../../components/patterns';
import { Badge } from '../../../../components/ui/badge';
import { Button } from '../../../../components/ui/button';
import { useLanguage } from '../../../i18n/LanguageContext';
import { formatAccountDate } from './account-utils';
import {
  formatSessionIdentity,
  formatSessionLastActivity,
  formatSessionIpCompact,
} from './session-display.utils';

interface AccountSessionsSectionProps {
  account: AccountMeDto;
  sessions: AccountSessionDto[];
  sessionsLoading: boolean;
  revokingSessions: boolean;
  revokingSessionId: string | null;
  onChangePassword: () => void;
  onRevokeOthers: () => void;
  onRevokeSession: (sessionId: string) => void;
  onRefreshSessions: () => void;
}

function SecurityStatusBadge({
  enabled,
  available,
  comingSoonLabel,
  activeLabel,
  notSetupLabel,
}: {
  enabled: boolean;
  available: boolean;
  comingSoonLabel: string;
  activeLabel: string;
  notSetupLabel: string;
}) {
  if (enabled) {
    return (
      <Badge
        variant="outline"
        className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
      >
        {activeLabel}
      </Badge>
    );
  }
  if (!available) {
    return (
      <Badge variant="outline" className="border-border/60 bg-muted/40 text-muted-foreground">
        {comingSoonLabel}
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className="border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200"
    >
      {notSetupLabel}
    </Badge>
  );
}

export function AccountSessionsSection({
  account,
  sessions,
  sessionsLoading,
  revokingSessions,
  revokingSessionId,
  onChangePassword,
  onRevokeOthers,
  onRevokeSession,
  onRefreshSessions,
}: AccountSessionsSectionProps) {
  const { t } = useLanguage();
  const { security, user } = account;
  const activeSessions = sessions.filter((session) => session.status === 'active');
  const otherActiveSessions = activeSessions.filter((session) => !session.current);
  const canRevokeIndividual = activeSessions.some((session) => session.current);

  const twoFactorEnabled = security.twoFactorEnabled;
  const twoFactorAvailable = security.twoFactorAvailable;
  const passkeysAvailable = security.passkeysAvailable;

  return (
    <div id="account-section-security" className="space-y-4">
      <DataCard
        title={t('settings.account.security.title')}
        description={t('settings.account.security.description')}
      >
        <div className="space-y-3">
          <div className="flex flex-col justify-between gap-3 rounded-xl border border-border/60 bg-muted/20 p-3 sm:flex-row sm:items-center">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted">
                <KeyRound className="h-4 w-4 text-muted-foreground" aria-hidden />
              </div>
              <div>
                <p className="text-xs font-medium text-foreground">{t('settings.account.security.password')}</p>
                <p className="text-[11px] text-muted-foreground">
                  {security.hasPassword
                    ? t('settings.account.security.passwordSet')
                    : t('settings.account.security.passwordNotSet')}
                </p>
              </div>
            </div>
            {security.hasPassword ? (
              <Button type="button" variant="outline" size="sm" onClick={onChangePassword}>
                {t('settings.account.security.changePassword')}
              </Button>
            ) : (
              <p className="max-w-xs text-[11px] text-muted-foreground">
                {t('settings.account.security.passwordManagedExternally')}
              </p>
            )}
          </div>

          <div className="rounded-xl border border-border/60 p-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  {twoFactorEnabled ? (
                    <Shield className="h-4 w-4 shrink-0 text-[color:var(--status-positive)]" aria-hidden />
                  ) : (
                    <ShieldOff className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                  )}
                  <p className="text-xs font-medium text-foreground">
                    {t('settings.account.security.twoFactor')}
                  </p>
                  <SecurityStatusBadge
                    enabled={twoFactorEnabled}
                    available={twoFactorAvailable}
                    comingSoonLabel={t('settings.account.security.comingSoon')}
                    activeLabel={t('settings.account.security.statusActive')}
                    notSetupLabel={t('settings.account.security.statusNotSetup')}
                  />
                </div>
                {twoFactorEnabled ? (
                  <p className="text-[11px] text-muted-foreground">
                    {t('settings.account.security.twoFactorActive')}
                  </p>
                ) : twoFactorAvailable ? (
                  <p className="text-[11px] text-muted-foreground">
                    {t('settings.account.security.twoFactorSetupHint')}
                  </p>
                ) : (
                  <p className="text-[11px] text-muted-foreground">
                    {t('settings.account.security.twoFactorPreparing')}
                  </p>
                )}
              </div>
              {twoFactorAvailable && !twoFactorEnabled ? (
                <Button type="button" variant="outline" size="sm" className="shrink-0" disabled>
                  {t('settings.account.security.setup2fa')}
                </Button>
              ) : null}
            </div>
          </div>

          <div className="rounded-xl border border-border/60 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Smartphone className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <p className="text-xs font-medium text-foreground">{t('settings.account.security.passkeys')}</p>
              <SecurityStatusBadge
                enabled={false}
                available={passkeysAvailable}
                comingSoonLabel={t('settings.account.security.comingSoon')}
                activeLabel={t('settings.account.security.statusActive')}
                notSetupLabel={t('settings.account.security.statusNotSetup')}
              />
            </div>
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              {passkeysAvailable
                ? t('settings.account.security.passkeysHint')
                : t('settings.account.security.passkeysPreparing')}
            </p>
          </div>

          <div className="space-y-1 rounded-xl border border-border/60 p-3 text-[11px] text-muted-foreground">
            <p>
              {t('settings.account.security.lastLogin')}{' '}
              <span className="font-medium text-foreground">
                {formatAccountDate(security.lastLoginAt ?? user.lastLoginAt)}
              </span>
            </p>
            {(security.lastLoginIp || user.lastLoginIp) && (
              <p>
                IP:{' '}
                <span className="text-foreground/80">
                  {security.lastLoginIp ?? user.lastLoginIp}
                </span>
              </p>
            )}
            {user.lastLoginDevice ? (
              <p>
                {t('settings.account.security.device')} <span className="text-foreground">{user.lastLoginDevice}</span>
              </p>
            ) : null}
          </div>

          {security.recommendations.length > 0 ? (
            <div className="rounded-xl border border-[color:var(--status-warning)]/20 bg-[color:var(--status-warning-soft)]/30 p-3">
              <p className="mb-1.5 text-[11px] font-semibold text-foreground">{t('settings.account.security.recommendations')}</p>
              <ul className="space-y-1">
                {security.recommendations.map((rec) => (
                  <li key={rec} className="text-[11px] text-muted-foreground">
                    · {rec}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </DataCard>

      <DataCard
        title={t('settings.account.sessions.title')}
        description={t('settings.account.sessions.description')}
        actions={
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onRefreshSessions}
              disabled={sessionsLoading}
            >
              {t('settings.account.sessions.refresh')}
            </Button>
            {otherActiveSessions.length > 0 ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onRevokeOthers}
                disabled={revokingSessions}
              >
                {revokingSessions ? (
                  <Loader2 className="animate-spin" aria-hidden />
                ) : (
                  <LogOut className="h-3.5 w-3.5" aria-hidden />
                )}
                {t('settings.account.sessions.revokeOthers')}
              </Button>
            ) : null}
          </div>
        }
      >
        {sessionsLoading ? (
          <p className="py-5 text-center text-xs text-muted-foreground">{t('settings.account.sessions.loading')}</p>
        ) : sessions.length === 0 ? (
          <EmptyState
            compact
            icon={<MonitorSmartphone className="h-5 w-5" />}
            title={t('settings.account.sessions.emptyTitle')}
            description={t('settings.account.sessions.emptyDescription')}
          />
        ) : (
          <ul className="space-y-2">
            {sessions.map((session) => {
              const ip = formatSessionIpCompact(session.ipAddress);
              return (
                <li
                  key={session.id}
                  className="rounded-xl border border-border/60 bg-muted/20 px-3 py-2.5 sm:px-4 sm:py-3"
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-xs font-medium text-foreground">
                          {formatSessionIdentity(session)}
                        </p>
                        {session.current ? (
                          <Badge
                            variant="outline"
                            className="border-primary/30 bg-primary/10 text-primary"
                          >
                            {t('settings.account.sessions.currentDevice')}
                          </Badge>
                        ) : null}
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        {t('settings.account.sessions.lastActivity')} {formatSessionLastActivity(session)}
                      </p>
                      {ip ? (
                        <p className="text-[11px] text-muted-foreground/80">IP: {ip}</p>
                      ) : null}
                    </div>
                    {canRevokeIndividual && !session.current && session.status === 'active' ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="shrink-0 self-start text-muted-foreground hover:text-destructive sm:self-center"
                        onClick={() => onRevokeSession(session.id)}
                        disabled={revokingSessionId === session.id}
                      >
                        {revokingSessionId === session.id ? (
                          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
                        ) : (
                          <LogOut className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                        )}
                        {revokingSessionId === session.id ? t('settings.account.sessions.revoking') : t('settings.account.sessions.revoke')}
                      </Button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </DataCard>
    </div>
  );
}
