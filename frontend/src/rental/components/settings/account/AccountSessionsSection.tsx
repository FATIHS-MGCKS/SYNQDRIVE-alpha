import { useState } from 'react';
import { KeyRound, Loader2, LogOut, MonitorSmartphone, Shield, ShieldOff, Smartphone } from 'lucide-react';
import type { AccountMeDto, AccountSessionDto } from '../../../../lib/api';
import { DataCard, EmptyState } from '../../../../components/patterns';
import { Badge } from '../../../../components/ui/badge';
import { Button } from '../../../../components/ui/button';
import { formatAccountDate } from './account-utils';
import {
  formatSessionIdentity,
  formatSessionLastActivity,
  formatSessionIpCompact,
} from './session-display.utils';
import { TwoFactorSetupDialog } from './TwoFactorSetupDialog';
import { TwoFactorDisableDialog } from './TwoFactorDisableDialog';
import { TwoFactorRegenerateDialog } from './TwoFactorRegenerateDialog';

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
  onReloadAccount: () => void | Promise<void>;
}

function SecurityStatusBadge({
  enabled,
  available,
  comingSoonLabel,
}: {
  enabled: boolean;
  available: boolean;
  comingSoonLabel: string;
}) {
  if (enabled) {
    return (
      <Badge
        variant="outline"
        className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
      >
        Aktiv
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
      Noch nicht eingerichtet
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
  onReloadAccount,
}: AccountSessionsSectionProps) {
  const [setupOpen, setSetupOpen] = useState(false);
  const [disableOpen, setDisableOpen] = useState(false);
  const [regenerateOpen, setRegenerateOpen] = useState(false);

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
        title="Sicherheit"
        description="Passwort, Mehrfaktor-Authentifizierung und Anmeldehistorie."
      >
        <div className="space-y-3">
          <div className="flex flex-col justify-between gap-3 rounded-xl border border-border/60 bg-muted/20 p-3 sm:flex-row sm:items-center">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted">
                <KeyRound className="h-4 w-4 text-muted-foreground" aria-hidden />
              </div>
              <div>
                <p className="text-xs font-medium text-foreground">Passwort</p>
                <p className="text-[11px] text-muted-foreground">
                  {security.hasPassword
                    ? 'Passwort ist gesetzt'
                    : 'Kein Passwort hinterlegt'}
                </p>
              </div>
            </div>
            {security.hasPassword ? (
              <Button type="button" variant="outline" size="sm" onClick={onChangePassword}>
                Passwort ändern
              </Button>
            ) : (
              <p className="max-w-xs text-[11px] text-muted-foreground">
                Passwortverwaltung wird über Ihren Login-Anbieter gesteuert.
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
                    Zwei-Faktor-Authentifizierung (2FA)
                  </p>
                  <SecurityStatusBadge
                    enabled={twoFactorEnabled}
                    available={twoFactorAvailable}
                    comingSoonLabel="Demnächst verfügbar"
                  />
                </div>
                {twoFactorEnabled ? (
                  <p className="text-[11px] text-muted-foreground">
                    Zwei-Faktor-Authentifizierung ist für Ihr Konto aktiv.
                  </p>
                ) : twoFactorAvailable ? (
                  <p className="text-[11px] text-muted-foreground">
                    Schützen Sie Ihr Konto mit einem zusätzlichen Sicherheitscode bei der Anmeldung.
                  </p>
                ) : (
                  <p className="text-[11px] text-muted-foreground">
                    Zwei-Faktor-Authentifizierung wird vorbereitet.
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:shrink-0">
                {twoFactorAvailable && !twoFactorEnabled ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    onClick={() => setSetupOpen(true)}
                  >
                    2FA einrichten
                  </Button>
                ) : null}
                {twoFactorEnabled ? (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setRegenerateOpen(true)}
                    >
                      Recovery Codes neu generieren
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setDisableOpen(true)}
                    >
                      2FA deaktivieren
                    </Button>
                  </>
                ) : null}
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-border/60 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Smartphone className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <p className="text-xs font-medium text-foreground">Passkeys</p>
              <SecurityStatusBadge
                enabled={false}
                available={passkeysAvailable}
                comingSoonLabel="Demnächst verfügbar"
              />
            </div>
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              {passkeysAvailable
                ? 'Melden Sie sich künftig ohne Passwort mit biometrischen Daten oder einem Sicherheitsschlüssel an.'
                : 'Passkey-Anmeldung wird vorbereitet und ist bald verfügbar.'}
            </p>
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
                <span className="text-foreground/80">
                  {security.lastLoginIp ?? user.lastLoginIp}
                </span>
              </p>
            )}
            {user.lastLoginDevice ? (
              <p>
                Gerät: <span className="text-foreground">{user.lastLoginDevice}</span>
              </p>
            ) : null}
          </div>

          {security.recommendations.length > 0 ? (
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
          ) : null}
        </div>
      </DataCard>

      <DataCard
        title="Aktive Sitzungen"
        description="Geräte, mit denen Sie aktuell angemeldet sind."
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
                Andere Sitzungen abmelden
              </Button>
            ) : null}
          </div>
        }
      >
        {sessionsLoading ? (
          <p className="py-5 text-center text-xs text-muted-foreground">Sitzungen werden geladen…</p>
        ) : sessions.length === 0 ? (
          <EmptyState
            compact
            icon={<MonitorSmartphone className="h-5 w-5" />}
            title="Keine Sitzungen erfasst"
            description="Es sind noch keine aktiven Sitzungen für dieses Konto vorhanden."
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
                            Aktuelles Gerät
                          </Badge>
                        ) : null}
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        Letzte Aktivität: {formatSessionLastActivity(session)}
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
                        {revokingSessionId === session.id ? 'Wird abgemeldet…' : 'Abmelden'}
                      </Button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </DataCard>

      <TwoFactorSetupDialog
        open={setupOpen}
        onOpenChange={setSetupOpen}
        onCompleted={onReloadAccount}
      />
      <TwoFactorDisableDialog
        open={disableOpen}
        onOpenChange={setDisableOpen}
        onCompleted={onReloadAccount}
      />
      <TwoFactorRegenerateDialog open={regenerateOpen} onOpenChange={setRegenerateOpen} />
    </div>
  );
}
