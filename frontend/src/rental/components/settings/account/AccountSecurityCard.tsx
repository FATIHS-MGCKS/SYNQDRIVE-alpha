import { Bell, MonitorSmartphone, Shield } from 'lucide-react';
import type { AccountMeDto } from '../../../../lib/api';
import { countActiveNotificationCategories, countCriticalNotificationChannels } from './account-utils';

interface AccountNotificationsSummaryCardProps {
  notifications: AccountMeDto['notifications'];
  onAdjust?: () => void;
}

export function AccountNotificationsSummaryCard({
  notifications,
  onAdjust,
}: AccountNotificationsSummaryCardProps) {
  const activeCategories = countActiveNotificationCategories(notifications);
  const critical = countCriticalNotificationChannels(notifications);

  return (
    <div className="sq-card p-4 h-full flex flex-col">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12px] font-medium text-muted-foreground">Benachrichtigungen</span>
        <Bell className="w-4 h-4 text-muted-foreground/80" />
      </div>
      <p className="mt-2 font-mono text-[22px] font-bold tabular-nums text-foreground">
        {activeCategories}
      </p>
      <p className="text-[12px] text-muted-foreground">von {notifications.length} Kategorien aktiv</p>
      <div className="mt-auto pt-3 border-t border-border/50 space-y-2">
        <p className="text-[10px] text-muted-foreground flex items-center gap-1.5">
          <Shield className="w-3 h-3" />
          {critical} mit „nur kritisch“
        </p>
        {onAdjust && (
          <button
            type="button"
            onClick={onAdjust}
            className="text-[10px] font-semibold text-[var(--brand)] hover:underline"
          >
            Benachrichtigungen anpassen
          </button>
        )}
      </div>
    </div>
  );
}

interface AccountSecuritySummaryCardProps {
  security: AccountMeDto['security'];
  onManage?: () => void;
}

export function AccountSecuritySummaryCard({ security, onManage }: AccountSecuritySummaryCardProps) {
  const twoFaLabel = security.twoFactorEnabled
    ? 'Aktiv'
    : security.twoFactorAvailable
      ? 'Nicht aktiviert'
      : 'Demnächst verfügbar';

  return (
    <div className="sq-card p-4 h-full flex flex-col">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12px] font-medium text-muted-foreground">Sicherheit</span>
        <MonitorSmartphone className="w-4 h-4 text-muted-foreground/80" />
      </div>
      <p className="mt-2 font-mono text-[22px] font-bold tabular-nums text-foreground">
        {security.securityScore}%
      </p>
      <p className="text-[12px] text-muted-foreground">
        {security.activeSessionCount} aktive Sitzung(en)
      </p>
      <div className="mt-auto pt-3 border-t border-border/50 space-y-1.5 text-[10px] text-muted-foreground">
        <p>Passwort: {security.hasPassword ? 'gesetzt' : 'nicht gesetzt'}</p>
        <p>2FA: {twoFaLabel}</p>
        {onManage && (
          <button
            type="button"
            onClick={onManage}
            className="text-[10px] font-semibold text-[var(--brand)] hover:underline"
          >
            Sicherheit & Sitzungen
          </button>
        )}
      </div>
    </div>
  );
}
