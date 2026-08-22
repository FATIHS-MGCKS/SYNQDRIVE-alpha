import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { api, getErrorMessage, type WhatsAppConfig } from '../../../lib/api';
import { useOrgScopedGenerationRef } from '../../hooks/useOrgScopedGeneration';
import { isSandboxEnvironment } from './whatsapp.ops';

interface UseWhatsAppBusinessSettingsOptions {
  orgId: string | null | undefined;
  enabled?: boolean;
}

export function useWhatsAppBusinessSettings({
  orgId,
  enabled = true,
}: UseWhatsAppBusinessSettingsOptions) {
  const { generationRef, isCurrent, nextGeneration } = useOrgScopedGenerationRef(orgId);
  const [config, setConfig] = useState<WhatsAppConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [simModal, setSimModal] = useState(false);

  const load = useCallback(async () => {
    if (!orgId || !enabled) {
      setConfig(null);
      setError(null);
      setLoading(false);
      return;
    }

    const requestOrgId = orgId;
    const generation = nextGeneration();
    setLoading(true);
    setError(null);

    try {
      const result = await api.whatsapp.getConfig(requestOrgId);
      if (!isCurrent(requestOrgId, generation)) return;
      setConfig(result);
    } catch (err) {
      if (!isCurrent(requestOrgId, generation)) return;
      setError(getErrorMessage(err, 'Could not load WhatsApp configuration.'));
      setConfig(null);
    } finally {
      if (isCurrent(requestOrgId, generation)) {
        setLoading(false);
      }
    }
  }, [enabled, isCurrent, nextGeneration, orgId]);

  useEffect(() => {
    void load();
  }, [load]);

  const saveConfig = useCallback(
    async (patch: Partial<WhatsAppConfig>) => {
      if (!orgId || !enabled) return;
      const requestOrgId = orgId;
      const generation = generationRef.current;
      setSaving(true);
      try {
        const result = await api.whatsapp.updateConfig(requestOrgId, patch);
        if (!isCurrent(requestOrgId, generation)) return;
        setConfig(result);
        toast.success('WhatsApp settings saved');
      } catch (err) {
        if (!isCurrent(requestOrgId, generation)) return;
        toast.error('Could not save WhatsApp settings', {
          description: getErrorMessage(err),
        });
      } finally {
        setSaving(false);
      }
    },
    [enabled, generationRef, isCurrent, orgId],
  );

  const connect = useCallback(
    async (data: {
      phoneNumber: string;
      businessName?: string;
      phoneNumberId?: string;
      wabaId?: string;
      aiMode: WhatsAppConfig['aiMode'];
    }) => {
      if (!orgId || !enabled) return;
      const requestOrgId = orgId;
      const generation = generationRef.current;
      setSaving(true);
      try {
        const connected = await api.whatsapp.connect(requestOrgId, {
          phoneNumber: data.phoneNumber,
          businessName: data.businessName,
          phoneNumberId: data.phoneNumberId,
          wabaId: data.wabaId,
        });
        const updated = await api.whatsapp.updateConfig(requestOrgId, {
          aiMode: data.aiMode,
          phoneNumberId: data.phoneNumberId,
          wabaId: data.wabaId,
          accessTokenConfigured: connected.accessTokenConfigured,
        });
        if (!isCurrent(requestOrgId, generation)) return;
        setConfig(updated);
        setWizardOpen(false);
        toast.success('WhatsApp configured');
        await load();
      } catch (err) {
        if (!isCurrent(requestOrgId, generation)) return;
        toast.error('WhatsApp setup failed', { description: getErrorMessage(err) });
      } finally {
        setSaving(false);
      }
    },
    [enabled, generationRef, isCurrent, load, orgId],
  );

  const disconnect = useCallback(async () => {
    if (!orgId || !enabled) return;
    const requestOrgId = orgId;
    const generation = generationRef.current;
    try {
      const result = await api.whatsapp.disconnect(requestOrgId);
      if (!isCurrent(requestOrgId, generation)) return;
      setConfig(result);
      toast.success('WhatsApp disconnected');
      await load();
    } catch (err) {
      if (!isCurrent(requestOrgId, generation)) return;
      toast.error('Disconnect failed', { description: getErrorMessage(err) });
    }
  }, [enabled, generationRef, isCurrent, load, orgId]);

  const simulateIncoming = useCallback(
    async (data: { contactPhone: string; contactName?: string; content: string }) => {
      if (!orgId || !enabled || !isSandboxEnvironment()) return null;
      const requestOrgId = orgId;
      const generation = generationRef.current;
      try {
        const result = await api.whatsapp.simulateIncoming(requestOrgId, data);
        if (!isCurrent(requestOrgId, generation)) return null;
        setSimModal(false);
        toast.success('Sandbox message simulated');
        await load();
        return result;
      } catch (err) {
        if (!isCurrent(requestOrgId, generation)) return null;
        toast.error('Simulation failed', { description: getErrorMessage(err) });
        return null;
      }
    },
    [enabled, generationRef, isCurrent, load, orgId],
  );

  return {
    config,
    loading,
    saving,
    error,
    wizardOpen,
    setWizardOpen,
    simModal,
    setSimModal,
    reload: load,
    saveConfig,
    connect,
    disconnect,
    simulateIncoming,
  };
}
