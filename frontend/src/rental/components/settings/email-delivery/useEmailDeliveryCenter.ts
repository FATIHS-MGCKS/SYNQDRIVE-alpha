import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import {
  api,
  type CreateOrgEmailDomainPayload,
  type OrgEmailDomainDto,
  type OrgEmailMode,
  type OrgEmailSettingsDto,
  type UpdateOrgEmailSettingsPayload,
} from '../../../../lib/api';
import { mapApiErrorMessage, parseDnsRecords } from './email-delivery.utils';

function extractErrorMessage(err: unknown): string {
  if (err instanceof Error) return mapApiErrorMessage(err.message);
  if (typeof err === 'object' && err && 'message' in err) {
    return mapApiErrorMessage(String((err as { message: unknown }).message));
  }
  return 'Unbekannter Fehler';
}

function normalizeDomainDto(row: OrgEmailDomainDto): OrgEmailDomainDto {
  return {
    ...row,
    dnsRecords: parseDnsRecords(row.dnsRecords),
  };
}

export function useEmailDeliveryCenter(orgId: string | null) {
  const [settings, setSettings] = useState<OrgEmailSettingsDto | null>(null);
  const [domains, setDomains] = useState<OrgEmailDomainDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [creatingDomain, setCreatingDomain] = useState(false);
  const [checkingDomainId, setCheckingDomainId] = useState<string | null>(null);
  const [activatingMode, setActivatingMode] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);

  const load = useCallback(async () => {
    if (!orgId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [settingsRes, domainsRes] = await Promise.all([
        api.email.getSettings(orgId),
        api.email.listDomains(orgId),
      ]);
      setSettings(settingsRes);
      setDomains(
        Array.isArray(domainsRes) ? domainsRes.map(normalizeDomainDto) : [],
      );
    } catch (err) {
      setSettings(null);
      setDomains([]);
      setError('E-Mail-Einstellungen konnten nicht geladen werden.');
      toast.error(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  const saveSettings = useCallback(
    async (payload: UpdateOrgEmailSettingsPayload) => {
      if (!orgId) return null;
      setSavingSettings(true);
      try {
        const updated = await api.email.updateSettings(orgId, payload);
        setSettings(updated);
        toast.success('Einstellungen gespeichert');
        return updated;
      } catch (err) {
        toast.error(extractErrorMessage(err));
        return null;
      } finally {
        setSavingSettings(false);
      }
    },
    [orgId],
  );

  const setMode = useCallback(
    async (mode: OrgEmailMode) => {
      return saveSettings({ mode });
    },
    [saveSettings],
  );

  const createDomain = useCallback(
    async (payload: CreateOrgEmailDomainPayload) => {
      if (!orgId) return null;
      setCreatingDomain(true);
      try {
        const created = normalizeDomainDto(
          await api.email.createDomain(orgId, payload),
        );
        setDomains((prev) => [created, ...prev.filter((d) => d.id !== created.id)]);
        toast.success('Domain hinzugefügt — bitte DNS-Einträge hinterlegen');
        return created;
      } catch (err) {
        toast.error(extractErrorMessage(err));
        return null;
      } finally {
        setCreatingDomain(false);
      }
    },
    [orgId],
  );

  const checkDomain = useCallback(
    async (domainId: string) => {
      if (!orgId) return null;
      setCheckingDomainId(domainId);
      try {
        const updated = normalizeDomainDto(
          await api.email.checkDomain(orgId, domainId),
        );
        setDomains((prev) =>
          prev.map((d) => (d.id === updated.id ? updated : d)),
        );
        if (updated.status === 'VERIFIED') {
          toast.success('Domain erfolgreich verifiziert');
        } else if (updated.status === 'FAILED') {
          toast.error(updated.failureReason || 'Verifizierung fehlgeschlagen');
        } else {
          toast.message('Prüfung abgeschlossen — DNS-Einträge noch ausstehend');
        }
        return updated;
      } catch (err) {
        toast.error(extractErrorMessage(err));
        return null;
      } finally {
        setCheckingDomainId(null);
      }
    },
    [orgId],
  );

  const activateVerifiedDomain = useCallback(async () => {
    if (!orgId) return null;
    setActivatingMode(true);
    try {
      const updated = await api.email.updateSettings(orgId, {
        mode: 'VERIFIED_DOMAIN',
      });
      setSettings(updated);
      toast.success('Eigene Domain als Versandmodus aktiviert');
      return updated;
    } catch (err) {
      toast.error(extractErrorMessage(err));
      return null;
    } finally {
      setActivatingMode(false);
    }
  }, [orgId]);

  const sendTestEmail = useCallback(
    async (to: string) => {
      if (!orgId) return null;
      setSendingTest(true);
      try {
        const result = await api.email.sendTestEmail(orgId, { to: to.trim() });
        toast.success(`Test-E-Mail an ${result.to} gesendet`);
        return result;
      } catch (err) {
        toast.error(extractErrorMessage(err));
        return null;
      } finally {
        setSendingTest(false);
      }
    },
    [orgId],
  );

  return {
    settings,
    domains,
    loading,
    error,
    savingSettings,
    creatingDomain,
    checkingDomainId,
    activatingMode,
    sendingTest,
    load,
    saveSettings,
    setMode,
    createDomain,
    checkDomain,
    activateVerifiedDomain,
    sendTestEmail,
  };
}
