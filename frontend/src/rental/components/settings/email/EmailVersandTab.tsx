import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Mail,
  RefreshCw,
  Send,
  Shield,
} from 'lucide-react';

import {
  api,
  type OrgEmailDomainDto,
  type OrgEmailSettingsDto,
  type OutboundEmailDto,
} from '../../../../lib/api';
import { useRentalOrg } from '../../../RentalContext';

interface EmailVersandTabProps {
  isDarkMode: boolean;
}

const DOMAIN_STATUS_LABEL: Record<string, string> = {
  NOT_CONFIGURED: 'Nicht konfiguriert',
  PENDING_DNS: 'DNS ausstehend',
  VERIFYING: 'Wird geprüft',
  VERIFIED: 'Verifiziert',
  FAILED: 'Fehlgeschlagen',
};

export function EmailVersandTab({ isDarkMode }: EmailVersandTabProps) {
  const { orgId, userRole } = useRentalOrg();
  const canManage = userRole === 'ORG_ADMIN' || userRole === 'MASTER_ADMIN';

  const [settings, setSettings] = useState<OrgEmailSettingsDto | null>(null);
  const [domains, setDomains] = useState<OrgEmailDomainDto[]>([]);
  const [history, setHistory] = useState<OutboundEmailDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);
  const [newDomain, setNewDomain] = useState('');
  const [fromLocalPart, setFromLocalPart] = useState('noreply');
  const [testEmail, setTestEmail] = useState('');
  const [busyDomainId, setBusyDomainId] = useState<string | null>(null);

  const card = `rounded-xl border p-5 ${isDarkMode ? 'surface-premium border-border' : 'bg-white border-gray-200'}`;
  const subtle = isDarkMode ? 'text-muted-foreground' : 'text-muted-foreground';

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const [s, d, h] = await Promise.all([
        api.orgEmail.getSettings(orgId),
        api.orgEmail.listDomains(orgId),
        api.orgEmail.listHistory(orgId, { limit: 20 }),
      ]);
      setSettings(s);
      setDomains(d);
      setHistory(h.data);
      setBanner(null);
    } catch (err) {
      setBanner({ kind: 'error', text: (err as Error).message || 'Laden fehlgeschlagen' });
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    void load();
  }, [load]);

  const verifiedDomains = useMemo(
    () => domains.filter((d) => d.status === 'VERIFIED'),
    [domains],
  );

  const saveSettings = async () => {
    if (!orgId || !settings || !canManage) return;
    setSaving(true);
    try {
      const updated = await api.orgEmail.updateSettings(orgId, settings);
      setSettings(updated);
      setBanner({ kind: 'success', text: 'E-Mail-Einstellungen gespeichert' });
    } catch (err) {
      setBanner({ kind: 'error', text: (err as Error).message || 'Speichern fehlgeschlagen' });
    } finally {
      setSaving(false);
    }
  };

  const addDomain = async () => {
    if (!orgId || !newDomain.trim() || !canManage) return;
    setSaving(true);
    try {
      const created = await api.orgEmail.addDomain(orgId, {
        domain: newDomain.trim(),
        fromLocalPart: fromLocalPart.trim() || 'noreply',
      });
      setDomains((prev) => [created, ...prev]);
      setNewDomain('');
      setBanner({ kind: 'success', text: `Domain ${created.domain} hinzugefügt — DNS-Einträge konfigurieren` });
    } catch (err) {
      setBanner({ kind: 'error', text: (err as Error).message || 'Domain konnte nicht hinzugefügt werden' });
    } finally {
      setSaving(false);
    }
  };

  const verifyDomain = async (domainId: string) => {
    if (!orgId) return;
    setBusyDomainId(domainId);
    try {
      const updated = await api.orgEmail.verifyDomain(orgId, domainId);
      setDomains((prev) => prev.map((d) => (d.id === domainId ? updated : d)));
      setBanner({
        kind: updated.status === 'VERIFIED' ? 'success' : 'error',
        text:
          updated.status === 'VERIFIED'
            ? 'Domain verifiziert'
            : updated.failureReason || 'Verifizierung noch nicht abgeschlossen',
      });
    } catch (err) {
      setBanner({ kind: 'error', text: (err as Error).message || 'Verifizierung fehlgeschlagen' });
    } finally {
      setBusyDomainId(null);
    }
  };

  const activateDomain = async (domainId: string) => {
    if (!orgId) return;
    setBusyDomainId(domainId);
    try {
      const updated = await api.orgEmail.activateDomain(orgId, domainId);
      setDomains((prev) =>
        prev.map((d) => ({
          ...d,
          isActive: d.id === domainId ? updated.isActive : false,
        })),
      );
      setSettings((s: OrgEmailSettingsDto | null) => (s ? { ...s, mode: 'CUSTOM_DOMAIN' } : s));
      setBanner({ kind: 'success', text: 'Domain als Absender aktiviert' });
    } catch (err) {
      setBanner({ kind: 'error', text: (err as Error).message || 'Aktivierung fehlgeschlagen' });
    } finally {
      setBusyDomainId(null);
    }
  };

  const sendTest = async () => {
    if (!orgId || !testEmail.trim() || !canManage) return;
    setSaving(true);
    try {
      await api.orgEmail.sendTest(orgId, { toEmail: testEmail.trim() });
      setBanner({ kind: 'success', text: `Test-E-Mail an ${testEmail} gesendet` });
      const h = await api.orgEmail.listHistory(orgId, { limit: 20 });
      setHistory(h.data);
    } catch (err) {
      setBanner({ kind: 'error', text: (err as Error).message || 'Test-Versand fehlgeschlagen' });
    } finally {
      setSaving(false);
    }
  };

  const deleteDomain = async (domainId: string, domainName: string) => {
    if (!orgId || !canManage) return;
    if (!window.confirm(`Domain „${domainName}" wirklich entfernen?`)) return;
    setBusyDomainId(domainId);
    try {
      await api.orgEmail.deleteDomain(orgId, domainId);
      setDomains((prev) => prev.filter((d) => d.id !== domainId));
      setBanner({ kind: 'success', text: `Domain ${domainName} entfernt` });
    } catch (err) {
      setBanner({ kind: 'error', text: (err as Error).message || 'Domain konnte nicht entfernt werden' });
    } finally {
      setBusyDomainId(null);
    }
  };

  if (loading) {
    return (
      <div className={`flex items-center gap-2 text-sm ${subtle}`}>
        <Loader2 className="w-4 h-4 animate-spin" /> Lädt E-Mail & Versand…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">E-Mail & Versand</h2>
        <p className={`text-sm mt-1 ${subtle}`}>
          Absender, Reply-To, Signatur und eigene Domains für den Dokumentenversand.
          Ohne eigene Domain wird der SynqDrive-Plattform-Absender verwendet.
        </p>
      </div>

      {banner && (
        <div
          className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${
            banner.kind === 'error'
              ? isDarkMode
                ? 'bg-red-500/10 border-red-500/30 text-red-300'
                : 'bg-red-50 border-red-200 text-red-700'
              : isDarkMode
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : 'bg-emerald-50 border-emerald-200 text-emerald-700'
          }`}
        >
          {banner.kind === 'error' ? (
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          ) : (
            <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
          )}
          <span>{banner.text}</span>
        </div>
      )}

      <div className={card}>
        <div className="flex items-center gap-2 mb-4">
          <Mail className="w-4 h-4 text-brand" />
          <h3 className="text-sm font-semibold">Absender & Signatur</h3>
        </div>
        {settings && (
          <div className="space-y-4">
            <div>
              <label className={`text-xs font-medium ${subtle}`}>Versandmodus</label>
              <select
                disabled={!canManage}
                value={settings.mode}
                onChange={(e) =>
                  setSettings({ ...settings, mode: e.target.value as OrgEmailSettingsDto['mode'] })
                }
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="SYNQDRIVE_DEFAULT">SynqDrive Standard-Absender</option>
                <option value="CUSTOM_DOMAIN" disabled={verifiedDomains.length === 0}>
                  Eigene Domain {verifiedDomains.length === 0 ? '(keine verifiziert)' : ''}
                </option>
              </select>
              {settings.mode === 'SYNQDRIVE_DEFAULT' && settings.platformSender && (
                <p className={`mt-2 text-xs ${subtle}`}>
                  Aktueller Plattform-Absender:{' '}
                  <span className="font-medium text-foreground">
                    {settings.defaultFromName?.trim() || settings.platformSender.fromName} &lt;
                    {settings.platformSender.fromEmail}&gt;
                  </span>
                </p>
              )}
            </div>
            <div>
              <label className={`text-xs font-medium ${subtle}`}>Absendername</label>
              <input
                disabled={!canManage}
                value={settings.defaultFromName ?? ''}
                onChange={(e) => setSettings({ ...settings, defaultFromName: e.target.value })}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                placeholder="z. B. Ihre Autovermietung"
              />
            </div>
            <div>
              <label className={`text-xs font-medium ${subtle}`}>Reply-To</label>
              <input
                disabled={!canManage}
                type="email"
                value={settings.replyToEmail ?? ''}
                onChange={(e) => setSettings({ ...settings, replyToEmail: e.target.value })}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                placeholder="rechnung@ihre-domain.de"
              />
            </div>
            <div>
              <label className={`text-xs font-medium ${subtle}`}>Signatur (HTML)</label>
              <textarea
                disabled={!canManage}
                value={settings.signatureHtml ?? ''}
                onChange={(e) => setSettings({ ...settings, signatureHtml: e.target.value })}
                rows={4}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono"
                placeholder="<p>Mit freundlichen Grüßen<br/>Ihr Team</p>"
              />
            </div>
            {canManage && (
              <button
                type="button"
                onClick={() => void saveSettings()}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-lg bg-neutral-900 text-white px-4 py-2 text-sm font-medium disabled:opacity-50 dark:bg-white dark:text-neutral-900"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
                Speichern
              </button>
            )}
          </div>
        )}
      </div>

      <div className={card}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold">Eigene Domains</h3>
          <button type="button" onClick={() => void load()} className={`p-2 rounded-lg ${subtle} hover:text-foreground`}>
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {canManage && (
          <div className="flex flex-col sm:flex-row gap-2 mb-4">
            <input
              value={newDomain}
              onChange={(e) => setNewDomain(e.target.value)}
              placeholder="ihre-domain.de"
              className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
            <input
              value={fromLocalPart}
              onChange={(e) => setFromLocalPart(e.target.value)}
              placeholder="noreply"
              className="w-full sm:w-32 rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={() => void addDomain()}
              disabled={saving || !newDomain.trim()}
              className="rounded-lg bg-brand text-brand-foreground px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              Domain hinzufügen
            </button>
          </div>
        )}

        <div className="space-y-3">
          {domains.length === 0 ? (
            <p className={`text-sm ${subtle}`}>Noch keine Domain konfiguriert.</p>
          ) : (
            domains.map((domain) => (
              <div
                key={domain.id}
                className={`rounded-lg border p-4 ${isDarkMode ? 'border-border/50 bg-muted/20' : 'border-gray-200 bg-gray-50/50'}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold">{domain.domain}</div>
                    <div className={`text-xs ${subtle}`}>
                      {domain.fromLocalPart}@{domain.domain} · {DOMAIN_STATUS_LABEL[domain.status] ?? domain.status}
                      {domain.isActive ? ' · aktiv' : ''}
                    </div>
                  </div>
                  {canManage && (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={busyDomainId === domain.id}
                        onClick={() => void verifyDomain(domain.id)}
                        className="text-xs px-3 py-1.5 rounded-lg border border-border hover:bg-muted"
                      >
                        {busyDomainId === domain.id ? <Loader2 className="w-3 h-3 animate-spin" /> : 'DNS prüfen'}
                      </button>
                      {domain.status === 'VERIFIED' && !domain.isActive && (
                        <button
                          type="button"
                          disabled={busyDomainId === domain.id}
                          onClick={() => void activateDomain(domain.id)}
                          className="text-xs px-3 py-1.5 rounded-lg bg-emerald-600 text-white"
                        >
                          Aktivieren
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={busyDomainId === domain.id}
                        onClick={() => void deleteDomain(domain.id, domain.domain)}
                        className="text-xs px-3 py-1.5 rounded-lg border border-red-500/40 text-red-600 hover:bg-red-500/10"
                      >
                        Entfernen
                      </button>
                    </div>
                  )}
                </div>
                {Array.isArray(domain.dnsRecords) && (domain.dnsRecords as unknown[]).length > 0 && (
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className={subtle}>
                          <th className="text-left py-1 pr-2">Typ</th>
                          <th className="text-left py-1 pr-2">Name</th>
                          <th className="text-left py-1">Wert</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(domain.dnsRecords as Array<{ type?: string; name?: string; value?: string }>).map(
                          (rec, idx) => (
                            <tr key={idx} className="border-t border-border/30">
                              <td className="py-1 pr-2 font-mono">{rec.type}</td>
                              <td className="py-1 pr-2 font-mono">{rec.name}</td>
                              <td className="py-1 font-mono break-all">{rec.value}</td>
                            </tr>
                          ),
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {canManage && (
        <div className={card}>
          <h3 className="text-sm font-semibold mb-3">Test-E-Mail</h3>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="email"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              placeholder="test@example.com"
              className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={() => void sendTest()}
              disabled={saving || !testEmail.trim()}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              <Send className="w-4 h-4" /> Test senden
            </button>
          </div>
        </div>
      )}

      <div className={card}>
        <h3 className="text-sm font-semibold mb-3">Versandhistorie</h3>
        {history.length === 0 ? (
          <p className={`text-sm ${subtle}`}>Noch keine E-Mails versendet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className={subtle}>
                  <th className="text-left py-2 pr-3">Datum</th>
                  <th className="text-left py-2 pr-3">An</th>
                  <th className="text-left py-2 pr-3">Betreff</th>
                  <th className="text-left py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {history.map((row) => (
                  <tr key={row.id} className="border-t border-border/30">
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {new Date(row.sentAt || row.createdAt).toLocaleString('de-DE')}
                    </td>
                    <td className="py-2 pr-3">{row.toEmail}</td>
                    <td className="py-2 pr-3 max-w-[200px] truncate">{row.subject}</td>
                    <td className="py-2">{row.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
