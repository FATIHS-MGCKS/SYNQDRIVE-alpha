import { Globe, KeyRound, Loader2, LogOut, Shield, ShieldOff } from 'lucide-react';
import type { AccountMeDto, AccountSessionDto } from '../../../../lib/api';
import { DataCard, EmptyState, StatusChip } from '../../../../components/patterns';
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
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl border border-border/60 bg-muted/20">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center">
                <KeyRound className="w-4 h-4 text-muted-foreground" />
              </div>
              <div>
                <p className="text-xs font-medium text-foreground">Passwort</p>
                <p className="text-[11px] text-muted-foreground">
                  {security.hasPassword ? 'Passwort ist gesetzt' : 'Kein Passwort hinterlegt'}
                </p>
              </div>
            </div>
            {security.hasPassword ? (
              <button
                type="button"
                onClick={onChangePassword}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg text-[var(--brand)] hover:bg-[var(--brand-soft)]"
              >
                Passwort ändern
              </button>
            ) : (
              <p className="text-[11px] text-muted-foreground max-w-xs">
                Passwortverwaltung wird über deinen Login-Anbieter gesteuert.
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-3 rounded-xl border border-border/60 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {security.twoFactorEnabled ? (
                  <Shield className="w-4 h-4 text-[var(--status-success)]" />
                ) : (
                  <ShieldOff className="w-4 h-4 text-muted-foreground" />
                )}
                <div>
                  <p className="text-xs font-medium">Zwei-Faktor-Auth</p>
                  <p className="text-[10px] text-muted-foreground">Zusätzlicher Schutz</p>
                </div>
              </div>
              <StatusChip tone={twoFaChip.tone}>
                {twoFaChip.label}
              </StatusChip>
            </div>
            <div className="p-3 rounded-xl border border-border/60 flex items-center justify-between gap-2">
              <div>
                <p className="text-xs font-medium">Passkeys</p>
                <p className="text-[10px] text-muted-foreground">Biometrische Anmeldung</p>
              </div>
              <StatusChip tone={passkeysChip.tone}>
                {passkeysChip.label}
              </StatusChip>
            </div>
          </div>

          <div className="p-3 rounded-xl border border-border/60 text-[11px] text-muted-foreground space-y-1">
            <p>
              Letzte Anmeldung:{' '}
              <span className="text-foreground font-medium">
                {formatAccountDate(security.lastLoginAt ?? user.lastLoginAt)}
              </span>
            </p>
            {(security.lastLoginIp || user.lastLoginIp) && (
              <p>
                IP:{' '}
                <span className="text-foreground font-mono">
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
            <div className="p-3 rounded-xl border border-[color:var(--status-warning-soft)] bg-[color:var(--status-warning-soft)]/30">
              <p className="text-[11px] font-semibold text-foreground mb-1.5">Empfehlungen</p>
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
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onRefreshSessions}
              disabled={sessionsLoading}
              className="text-[11px] font-semibold text-muted-foreground hover:text-foreground"
            >
              Aktualisieren
            </button>
            <button
              type="button"
              onClick={onRevokeOthers}
              disabled={revokingSessions || activeSessions.length <= 1}
              className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg text-[color:var(--status-critical)] hover:bg-[color:var(--status-critical-soft)] disabled:opacity-40"
            >
              {revokingSessions ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <LogOut className="w-3.5 h-3.5" />
              )}
              Alle anderen abmelden
            </button>
          </div>
        }
      >
        {sessionsLoading ? (
          <p className="text-xs text-muted-foreground py-6 text-center">Sitzungen werden geladen…</p>
        ) : sessions.length === 0 ? (
          <EmptyState
            compact
            icon={<Globe className="w-5 h-5" />}
            title="Keine Sitzungen erfasst"
            description="Es sind noch keine Refresh-Token-Sitzungen für dieses Konto vorhanden."
          />
        ) : (
          <div className="space-y-2">
            {sessions.map((session) => (
              <div
                key={session.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl border border-border/60 bg-muted/20"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center shrink-0">
                    <Globe className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-foreground">
                      {[session.browser, session.device].filter(Boolean).join(' · ') || 'Unbekanntes Gerät'}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {session.ipAddress ? `IP ${session.ipAddress} · ` : ''}
                      Erstellt {formatAccountDate(session.createdAt)} · Läuft ab{' '}
                      {formatAccountDate(session.expiresAt)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
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
                  {canRevokeIndividual &&
                    !session.current &&
                    session.status === 'active' && (
                      <button
                        type="button"
                        onClick={() => onRevokeSession(session.id)}
                        disabled={revokingSessionId === session.id}
                        className="text-[11px] font-semibold px-2 py-1 rounded-lg text-muted-foreground hover:bg-muted disabled:opacity-50"
                      >
                        {revokingSessionId === session.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          'Abmelden'
                        )}
                      </button>
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
