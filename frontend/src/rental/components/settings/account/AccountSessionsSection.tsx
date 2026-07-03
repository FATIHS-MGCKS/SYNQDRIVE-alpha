import { Globe, KeyRound, Loader2, LogOut, Shield, ShieldOff } from 'lucide-react';
import type { AccountMeDto, AccountSessionDto } from '../../../../lib/api';
import { DataCard, EmptyState, StatusChip } from '../../../../components/patterns';
import { Button } from '../../../../components/ui/button';
import { formatAccountDate, sessionStatusLabel } from './account-utils';

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
  const { security, user } = account;
  const activeSessions = sessions.filter((s) => s.status === 'active');
  const canRevokeIndividual = sessions.some((s) => s.current && s.status === 'active');

  const twoFaChip = security.twoFactorEnabled
    ? { label: 'Aktiv', tone: 'success' as const }
    : security.twoFactorAvailable
      ? { label: 'Nicht aktiviert', tone: 'warning' as const }
      : { label: 'Demnächst verfügbar', tone: 'neutral' as const };

  const passkeysChip = security.passkeysAvailable
    ? { label: 'Nicht eingerichtet', tone: 'neutral' as const }
    : { label: 'Demnächst verfügbar', tone: 'neutral' as const };

  return (
    <div id="account-section-security" className="space-y-4">
      <DataCard
        title="Sicherheit"
        description="Passwort, Mehrfaktor-Authentifizierung und Anmeldehistorie."
      >
        <div className="space-y-2.5">
          <div className="flex flex-col justify-between gap-3 rounded-xl border border-border/60 bg-muted/20 p-3 sm:flex-row sm:items-center">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted">
                <KeyRound className="h-4 w-4 text-muted-foreground" />
              </div>
              <div>
                <p className="text-xs font-medium text-foreground">Passwort</p>
                <p className="text-[11px] text-muted-foreground">
                  {security.hasPassword ? 'Passwort ist gesetzt' : 'Kein Passwort hinterlegt'}
                </p>
              </div>
            </div>
            {security.hasPassword ? (
              <Button type="button" variant="outline" size="sm" onClick={onChangePassword}>
                Passwort ändern
              </Button>
            ) : (
              <p className="max-w-xs text-[11px] text-muted-foreground">
                Passwortverwaltung wird über deinen Login-Anbieter gesteuert.
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="flex items-center justify-between gap-2 rounded-xl border border-border/60 p-3">
              <div className="flex items-center gap-2">
                {security.twoFactorEnabled ? (
                  <Shield className="h-4 w-4 text-[color:var(--status-positive)]" />
                ) : (
                  <ShieldOff className="h-4 w-4 text-muted-foreground" />
                )}
                <div>
                  <p className="text-xs font-medium">Zwei-Faktor-Auth</p>
                  <p className="text-[10px] text-muted-foreground">Zusätzlicher Schutz</p>
                </div>
              </div>
              <StatusChip tone={twoFaChip.tone}>{twoFaChip.label}</StatusChip>
            </div>
            <div className="flex items-center justify-between gap-2 rounded-xl border border-border/60 p-3">
              <div>
                <p className="text-xs font-medium">Passkeys</p>
                <p className="text-[10px] text-muted-foreground">Biometrische Anmeldung</p>
              </div>
              <StatusChip tone={passkeysChip.tone}>{passkeysChip.label}</StatusChip>
            </div>
          </div>

          <div className="space-y-1 rounded-xl border border-border/60 p-3 text-[11px] text-muted-foreground">
            <p>
              Letzte Anmeldung:{' '}
              <span className="font-medium text-foreground">
                {formatAccountDate(security.lastLoginAt ?? user.lastLoginAt)}
              </span>
            </p>
            {(security.lastLoginIp || user.lastLoginIp) && (
              <p>
                IP:{' '}
                <span className="font-mono text-foreground">
                  {security.lastLoginIp ?? user.lastLoginIp}
                </span>
              </p>
            )}
            {user.lastLoginDevice && (
              <p>
                Gerät: <span className="text-foreground">{user.lastLoginDevice}</span>
              </p>
            )}
          </div>

          {security.recommendations.length > 0 && (
            <div className="rounded-xl border border-[color:var(--status-warning)]/20 bg-[color:var(--status-warning-soft)]/30 p-3">
              <p className="mb-1.5 text-[11px] font-semibold text-foreground">Empfehlungen</p>
              <ul className="space-y-1">
                {security.recommendations.map((rec) => (
                  <li key={rec} className="text-[11px] text-muted-foreground">
                    · {rec}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </DataCard>

      <DataCard
        title="Aktive Sitzungen"
        description="Geräte mit gültiger Anmeldung. Die aktuelle Sitzung wird heuristisch markiert."
        actions={
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onRefreshSessions}
              disabled={sessionsLoading}
            >
              Aktualisieren
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={onRevokeOthers}
              disabled={revokingSessions || activeSessions.length <= 1}
            >
              {revokingSessions ? <Loader2 className="animate-spin" /> : <LogOut />}
              Alle anderen abmelden
            </Button>
          </div>
        }
      >
        {sessionsLoading ? (
          <p className="py-5 text-center text-xs text-muted-foreground">Sitzungen werden geladen…</p>
        ) : sessions.length === 0 ? (
          <EmptyState
            compact
            icon={<Globe className="h-5 w-5" />}
            title="Keine Sitzungen erfasst"
            description="Es sind noch keine Refresh-Token-Sitzungen für dieses Konto vorhanden."
          />
        ) : (
          <div className="space-y-2">
            {sessions.map((session) => (
              <div
                key={session.id}
                className="flex flex-col justify-between gap-3 rounded-xl border border-border/60 bg-muted/20 p-3 sm:flex-row sm:items-center"
              >
                <div className="flex min-w-0 items-start gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted">
                    <Globe className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-foreground">
                      {[session.browser, session.device].filter(Boolean).join(' · ') || 'Unbekanntes Gerät'}
                    </p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      {session.ipAddress ? `IP ${session.ipAddress} · ` : ''}
                      Erstellt {formatAccountDate(session.createdAt)} · Läuft ab{' '}
                      {formatAccountDate(session.expiresAt)}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <StatusChip
                    tone={
                      session.status === 'active'
                        ? 'success'
                        : session.status === 'revoked'
                          ? 'neutral'
                          : 'warning'
                    }
                  >
                    {session.current ? 'Aktuell' : sessionStatusLabel(session.status)}
                  </StatusChip>
                  {canRevokeIndividual && !session.current && session.status === 'active' && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => onRevokeSession(session.id)}
                      disabled={revokingSessionId === session.id}
                    >
                      {revokingSessionId === session.id ? (
                        <Loader2 className="animate-spin" />
                      ) : (
                        'Abmelden'
                      )}
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </DataCard>
    </div>
  );
}
