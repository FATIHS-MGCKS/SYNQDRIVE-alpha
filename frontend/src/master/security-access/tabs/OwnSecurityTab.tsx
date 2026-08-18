import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { DataCard, DataTable, StatusChip } from '../../../components/patterns';
import type { DataTableColumn } from '../../../components/patterns';
import { MfaEnrollmentPanel } from '../../../components/mfa/MfaEnrollmentPanel';
import { Button } from '../../../components/ui/button';
import { api } from '../../../lib/api';
import type { AccountSessionDto } from '../../../lib/api';
import { MasterLoadingState } from '../../shell';
import { formatRelativeDe, maskIpDisplay } from '../security-access.utils';
import type { OwnSecurityTab } from '../types';
import { CHROME_TAB_BAR_CLASS, chromeTabTriggerClass } from '../../../components/patterns/chrome-tab-bar';

interface OwnSecurityTabProps {
  activeTab: OwnSecurityTab;
  onTabChange: (tab: OwnSecurityTab) => void;
}

export function OwnSecurityTabView({ activeTab, onTabChange }: OwnSecurityTabProps) {
  const [mfaStatus, setMfaStatus] = useState<Awaited<ReturnType<typeof api.account.mfa.status>> | null>(null);
  const [sessions, setSessions] = useState<AccountSessionDto[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [mfa, sess] = await Promise.all([
        api.account.mfa.status(),
        api.account.sessions(),
      ]);
      setMfaStatus(mfa);
      setSessions(sess);
    } catch {
      toast.error('Eigene Sicherheitsdaten konnten nicht geladen werden');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const sessionColumns: DataTableColumn<AccountSessionDto>[] = [
    {
      key: 'device',
      header: 'Gerät',
      cell: (s) => (
        <div>
          <p className="text-xs font-medium">{s.device ?? s.browser ?? 'Unbekannt'}</p>
          {s.current && (
            <StatusChip tone="info" className="mt-1 text-[10px]">
              Aktuelle Sitzung
            </StatusChip>
          )}
        </div>
      ),
    },
    {
      key: 'last',
      header: 'Letzte Aktivität',
      cell: (s) => <span className="text-xs text-muted-foreground">{formatRelativeDe(s.lastUsedAt ?? s.createdAt)}</span>,
    },
    {
      key: 'ip',
      header: 'IP',
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
                toast.success('Sitzung beendet');
                void load();
              } catch (e: unknown) {
                toast.error(e instanceof Error ? e.message : 'Fehler beim Beenden');
              }
            }}
          >
            Beenden
          </Button>
        ) : null,
    },
  ];

  const subTabs: { id: OwnSecurityTab; label: string }[] = [
    { id: 'mfa', label: 'MFA' },
    { id: 'sessions', label: 'Sitzungen' },
    { id: 'recovery', label: 'Wiederherstellung' },
  ];

  return (
    <div className="space-y-4">
      <div className={CHROME_TAB_BAR_CLASS} role="tablist" aria-label="Eigene Sicherheit Unter-Tabs">
        {subTabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={activeTab === t.id}
            className={chromeTabTriggerClass(activeTab === t.id)}
            onClick={() => onTabChange(t.id)}
          >
            {t.label}
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
                <DataCard title="MFA aktiv">
                  <p className="text-sm text-muted-foreground">
                    Faktoren: {mfaStatus.factorTypes.join(', ') || 'TOTP'} · Recovery-Codes:{' '}
                    {mfaStatus.recoveryCodesRemaining}
                  </p>
                </DataCard>
              ) : (
                <MfaEnrollmentPanel onEnrolled={() => void load()} />
              )}
            </div>
          )}

          {activeTab === 'sessions' && (
            <DataCard
              title="Aktive Sitzungen"
              actions={
                sessions.length > 1 ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      try {
                        const res = await api.account.revokeOtherSessions();
                        toast.success(`${res.revoked} Sitzung(en) beendet`);
                        void load();
                      } catch (e: unknown) {
                        toast.error(e instanceof Error ? e.message : 'Fehler');
                      }
                    }}
                  >
                    Alle anderen beenden
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
                empty="Keine Sitzungen"
                dense
              />
            </DataCard>
          )}

          {activeTab === 'recovery' && (
            <DataCard title="Wiederherstellung">
              <p className="text-sm text-muted-foreground mb-3">
                Recovery-Codes werden bei der MFA-Einrichtung einmalig angezeigt. Verbleibend:{' '}
                <strong>{mfaStatus?.recoveryCodesRemaining ?? 0}</strong>
              </p>
              <p className="text-xs text-muted-foreground">
                Rotation erfordert Schritt-für-Schritt-Bestätigung — nutzen Sie die Account-Einstellungen in der Rental-App
                oder setzen Sie MFA neu auf, wenn Codes aufgebraucht sind.
              </p>
              <Button type="button" variant="outline" size="sm" className="mt-4" onClick={() => void load()}>
                <RefreshCw className="mr-2 h-3.5 w-3.5" />
                Status aktualisieren
              </Button>
            </DataCard>
          )}
        </>
      )}
    </div>
  );
}
