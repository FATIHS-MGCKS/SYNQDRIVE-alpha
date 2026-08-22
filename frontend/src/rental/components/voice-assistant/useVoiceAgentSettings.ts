import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  api,
  getErrorMessage,
  type VoiceAssistantData,
  type VoiceAssistantReadiness,
  type VoiceAssistantUpdatePayload,
  type VoiceOption,
} from '../../../lib/api';
import type { VoiceTextField } from '../voice-assistant/voice-assistant-builder.types';
import { useOrgScopedGenerationRef } from '../../hooks/useOrgScopedGeneration';

type VoiceBoolField = Exclude<
  {
    [K in keyof VoiceAssistantUpdatePayload]: VoiceAssistantUpdatePayload[K] extends
      | boolean
      | undefined
      ? K
      : never;
  }[keyof VoiceAssistantUpdatePayload],
  undefined
>;

interface UseVoiceAgentSettingsOptions {
  orgId: string | null | undefined;
  enabled?: boolean;
}

export function useVoiceAgentSettings({ orgId, enabled = true }: UseVoiceAgentSettingsOptions) {
  const { generationRef, isCurrent, nextGeneration } = useOrgScopedGenerationRef(orgId);
  const [assistant, setAssistant] = useState<VoiceAssistantData | null>(null);
  const [readiness, setReadiness] = useState<VoiceAssistantReadiness | null>(null);
  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const [draft, setDraft] = useState<VoiceAssistantUpdatePayload>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [voicesLoading, setVoicesLoading] = useState(false);
  const [voicesError, setVoicesError] = useState<string | null>(null);
  const voicesLoadingRef = useRef(false);

  const load = useCallback(async () => {
    if (!orgId || !enabled) {
      setAssistant(null);
      setReadiness(null);
      setDraft({});
      setError(null);
      setLoading(false);
      return;
    }

    const requestOrgId = orgId;
    const generation = nextGeneration();
    setLoading(true);
    setError(null);

    try {
      const [assistantResult, readinessResult] = await Promise.all([
        api.voiceAssistant.get(requestOrgId),
        api.voiceAssistant.readiness(requestOrgId),
      ]);
      if (!isCurrent(requestOrgId, generation)) return;
      setAssistant(assistantResult);
      setReadiness(readinessResult);
      setDraft({});
    } catch (err) {
      if (!isCurrent(requestOrgId, generation)) return;
      setError(getErrorMessage(err, 'Could not load Voice configuration.'));
      setAssistant(null);
      setReadiness(null);
    } finally {
      if (isCurrent(requestOrgId, generation)) {
        setLoading(false);
      }
    }
  }, [enabled, isCurrent, nextGeneration, orgId]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadVoices = useCallback(async () => {
    if (!orgId || !enabled || voicesLoadingRef.current) return;
    const requestOrgId = orgId;
    const generation = generationRef.current;
    voicesLoadingRef.current = true;
    setVoicesLoading(true);
    setVoicesError(null);
    try {
      const result = await api.voiceAssistant.voices(requestOrgId);
      if (!isCurrent(requestOrgId, generation)) return;
      setVoices(result);
    } catch (err) {
      if (!isCurrent(requestOrgId, generation)) return;
      setVoicesError(getErrorMessage(err));
    } finally {
      voicesLoadingRef.current = false;
      if (isCurrent(requestOrgId, generation)) {
        setVoicesLoading(false);
      }
    }
  }, [enabled, generationRef, isCurrent, orgId]);

  useEffect(() => {
    if (enabled && orgId && assistant) {
      void loadVoices();
    }
  }, [assistant?.id, enabled, loadVoices, orgId]);

  const save = useCallback(
    async (patch?: VoiceAssistantUpdatePayload) => {
      if (!orgId || !enabled) return;
      const payload = patch ?? draft;
      if (Object.keys(payload).length === 0) return;

      const requestOrgId = orgId;
      const generation = generationRef.current;
      setSaving(true);
      try {
        const updated = await api.voiceAssistant.update(requestOrgId, payload);
        if (!isCurrent(requestOrgId, generation)) return;
        setAssistant(updated);
        setDraft({});
        const readinessResult = await api.voiceAssistant.readiness(requestOrgId);
        if (!isCurrent(requestOrgId, generation)) return;
        setReadiness(readinessResult);
        toast.success('Voice settings saved');
      } catch (err) {
        if (!isCurrent(requestOrgId, generation)) return;
        toast.error('Could not save Voice settings', { description: getErrorMessage(err) });
      } finally {
        setSaving(false);
      }
    },
    [draft, enabled, generationRef, isCurrent, orgId],
  );

  const textField = useCallback(
    (key: VoiceTextField): string => {
      const draftValue = draft[key];
      if (draftValue !== undefined && draftValue !== null) return String(draftValue);
      const current = assistant?.[key as keyof VoiceAssistantData];
      return current == null ? '' : String(current);
    },
    [assistant, draft],
  );

  const boolField = useCallback(
    (key: VoiceBoolField): boolean => {
      const draftValue = draft[key];
      if (draftValue !== undefined) return Boolean(draftValue);
      const current = assistant?.[key as keyof VoiceAssistantData];
      return Boolean(current);
    },
    [assistant, draft],
  );

  const setTextField = useCallback((key: VoiceTextField, value: string) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }, []);

  const setBoolField = useCallback((key: VoiceBoolField, value: boolean) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }, []);

  const setVoiceSelection = useCallback((voiceId: string, voiceName: string) => {
    setDraft((prev) => ({ ...prev, voiceId, voiceName }));
  }, []);

  const hasDraft = Object.keys(draft).length > 0;

  return {
    assistant,
    readiness,
    voices,
    loading,
    saving,
    error,
    voicesLoading,
    voicesError,
    hasDraft,
    reload: load,
    loadVoices,
    save,
    textField,
    boolField,
    setTextField,
    setBoolField,
    setVoiceSelection,
    setAssistant,
  };
}
