import { Icon } from './ui/Icon';
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { toast } from 'sonner';
import { ErrorState } from '../../components/patterns/states';

import { useRentalOrg } from '../RentalContext';
import { api, getErrorMessage } from '../../lib/api';
import type {
  VoiceAssistantData,
  VoiceAssistantReadiness,
  VoiceAssistantUpdatePayload,
  VoiceOption,
} from '../../lib/api';
import type { VoiceTextField } from './voice-assistant/voice-assistant-builder.types';
import { VoiceCommandHeader } from './voice-assistant/VoiceCommandHeader';
import { VoiceOnboardingWizard } from './voice-assistant/VoiceOnboardingWizard';
import { VoiceOpsSectionNav } from './voice-assistant/VoiceOpsSectionNav';
import { VoiceOperationsOverview } from './voice-assistant/VoiceOperationsOverview';
import { VoicePermissionGroupsPanel } from './voice-assistant/VoicePermissionGroupsPanel';
import { VoiceUsageAnalyticsPanel } from './voice-assistant/VoiceUsageAnalyticsPanel';
import { VoiceAgentSettings } from './voice-assistant/VoiceAgentSettings';
import { VoiceTestCenter } from './voice-assistant/VoiceTestCenter';
import type { VoiceToolCapabilityKey, VoicePermissionMode } from './voice-assistant/voice-assistant-permissions.ops';
import {
  clearWizardProgress,
  loadWizardStep,
  shouldShowOnboardingWizard,
  type VoiceOpsTab,
} from './voice-assistant/voice-wizard.ops';
import {
  mergeVoiceAssistantState,
  readVoiceAssistantStateFromUrl,
  resolveVoiceTestNavigationIntent,
  syncVoiceAssistantStateToUrl,
  type VoiceAssistantUrlState,
  type VoiceSettingsSection,
} from './voice-assistant/voice-assistant-navigation';
import { useLanguage } from '../i18n/LanguageContext';

interface Props {
  isDarkMode: boolean;
  suppressLegacyUrlSync?: boolean;
  initialVoiceState?: Partial<VoiceAssistantUrlState>;
  onCanonicalVoiceStateChange?: (state: Partial<VoiceAssistantUrlState>) => void;
  /** Canonical CC Inbox handoff when operational conversations are requested. */
  onOpenConversations: () => void;
}

type VoiceBoolField = Exclude<{
  [K in keyof VoiceAssistantUpdatePayload]: VoiceAssistantUpdatePayload[K] extends boolean | undefined ? K : never;
}[keyof VoiceAssistantUpdatePayload], undefined>;

export function VoiceAssistantView({
  isDarkMode,
  suppressLegacyUrlSync = false,
  initialVoiceState,
  onCanonicalVoiceStateChange,
  onOpenConversations,
}: Props) {
  const { t } = useLanguage();
  const { orgId } = useRentalOrg();
  const initialUrlState = mergeVoiceAssistantState({
    ...readVoiceAssistantStateFromUrl(
      typeof window !== 'undefined' ? window.location.search : '',
    ),
    ...initialVoiceState,
  });
  const [opsTab, setOpsTabState] = useState<VoiceOpsTab>(() => initialUrlState.opsTab);
  const [settingsSection, setSettingsSectionState] = useState<VoiceSettingsSection | null>(
    () => initialUrlState.settingsSection,
  );
  const [assistant, setAssistant] = useState<VoiceAssistantData | null>(null);
  const [readiness, setReadiness] = useState<VoiceAssistantReadiness | null>(null);
  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [activating, setActivating] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [draft, setDraft] = useState<VoiceAssistantUpdatePayload>({});
  const [voicesLoading, setVoicesLoading] = useState(false);
  const [voicesError, setVoicesError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [testPassed, setTestPassed] = useState(false);
  const operationLock = useRef(false);
  const conversationsHandoffRef = useRef(false);

  const applyVoiceUrlState = useCallback((partial: Partial<VoiceAssistantUrlState>) => {
    const next = mergeVoiceAssistantState(partial);
    setOpsTabState(next.opsTab);
    setSettingsSectionState(next.settingsSection);
    if (suppressLegacyUrlSync) {
      onCanonicalVoiceStateChange?.(next);
      return;
    }
    syncVoiceAssistantStateToUrl(next, { replace: true });
  }, [onCanonicalVoiceStateChange, suppressLegacyUrlSync]);

  const setOpsTab = useCallback(
    (tab: VoiceOpsTab) => {
      applyVoiceUrlState({
        opsTab: tab,
        settingsSection: tab === 'settings' ? settingsSection : null,
        wizardStep: null,
      });
    },
    [applyVoiceUrlState, settingsSection],
  );

  const openVoiceTestCenter = useCallback(() => {
    applyVoiceUrlState({
      opsTab: 'settings',
      settingsSection: 'test',
      wizardStep: null,
    });
  }, [applyVoiceUrlState]);

  const openVoiceSettingsBuilder = useCallback(() => {
    applyVoiceUrlState({
      opsTab: 'settings',
      settingsSection: null,
      wizardStep: null,
    });
  }, [applyVoiceUrlState]);

  useEffect(() => {
    if (suppressLegacyUrlSync) return;
    const onPopState = () => {
      const next = mergeVoiceAssistantState(readVoiceAssistantStateFromUrl(window.location.search));
      setOpsTabState(next.opsTab);
      setSettingsSectionState(next.settingsSection);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [suppressLegacyUrlSync]);

  const isBusy = saving || activating || syncing;
  const card = 'surface-premium rounded-2xl shadow-[var(--shadow-1)]';

  const refreshReadiness = useCallback(async (targetOrgId: string) => {
    const r = await api.voiceAssistant.readiness(targetOrgId);
    setReadiness(r);
    return r;
  }, []);

  const load = useCallback(async () => {
    if (!orgId) {
      setLoading(false);
      setLoadError(t('voice.common.missingOrg'));
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const [a, r] = await Promise.all([
        api.voiceAssistant.get(orgId),
        api.voiceAssistant.readiness(orgId),
      ]);
      setAssistant(a);
      setReadiness(r);
      setDraft({});
      setActionError(null);
    } catch (err) {
      const message = getErrorMessage(err, t('voice.common.loadError'));
      setLoadError(message);
      toast.error(t('voice.common.loadError'), { description: message });
    } finally {
      setLoading(false);
    }
  }, [orgId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadVoices = useCallback(async () => {
    if (!orgId || voicesLoading) return;
    setVoicesLoading(true);
    setVoicesError(null);
    try {
      const v = await api.voiceAssistant.voices(orgId);
      setVoices(v);
    } catch (err) {
      const message = getErrorMessage(err);
      setVoicesError(message);
    } finally {
      setVoicesLoading(false);
    }
  }, [orgId, voicesLoading]);

  const isActive = assistant?.status === 'ACTIVE';
  const showWizard = assistant ? shouldShowOnboardingWizard(assistant) : false;

  useEffect(() => {
    if (!assistant || loading || suppressLegacyUrlSync) return;
    const resolved = resolveVoiceTestNavigationIntent(
      readVoiceAssistantStateFromUrl(window.location.search),
      showWizard,
    );
    setOpsTabState(resolved.opsTab);
    setSettingsSectionState(resolved.settingsSection);
    const current = mergeVoiceAssistantState(readVoiceAssistantStateFromUrl(window.location.search));
    if (
      !suppressLegacyUrlSync &&
      (resolved.opsTab !== current.opsTab ||
        resolved.settingsSection !== current.settingsSection ||
        resolved.wizardStep !== current.wizardStep)
    ) {
      syncVoiceAssistantStateToUrl(resolved, { replace: true });
    }
  }, [assistant, loading, showWizard, suppressLegacyUrlSync]);

  useEffect(() => {
    if (showWizard) void loadVoices();
  }, [showWizard, loadVoices]);

  useEffect(() => {
    if (opsTab !== 'conversations') {
      conversationsHandoffRef.current = false;
      return;
    }
    if (conversationsHandoffRef.current) return;
    conversationsHandoffRef.current = true;
    onOpenConversations();
    applyVoiceUrlState({ opsTab: 'overview', settingsSection: null, wizardStep: null });
  }, [opsTab, onOpenConversations, applyVoiceUrlState]);

  useEffect(() => {
    if (!showWizard && opsTab === 'settings') void loadVoices();
  }, [showWizard, opsTab, loadVoices]);

  const save = async (patch?: VoiceAssistantUpdatePayload) => {
    if (!orgId || operationLock.current) return;
    const payload = patch ?? draft;
    if (Object.keys(payload).length === 0) return;

    operationLock.current = true;
    setSaving(true);
    setActionError(null);
    try {
      const updated = await api.voiceAssistant.update(orgId, payload);
      setAssistant(updated);
      setDraft({});
      await refreshReadiness(orgId);
      toast.success(t('voice.common.saved'));
    } catch (err) {
      const message = getErrorMessage(err, t('voice.common.saveError'));
      setActionError(message);
      toast.error(t('voice.common.saveError'), { description: message });
    } finally {
      setSaving(false);
      operationLock.current = false;
    }
  };

  const toggleActive = async () => {
    if (!orgId || !assistant || operationLock.current) return;

    operationLock.current = true;
    setActivating(true);
    setActionError(null);
    try {
      const updated =
        assistant.status === 'ACTIVE'
          ? await api.voiceAssistant.deactivate(orgId)
          : await api.voiceAssistant.activate(orgId);
      setAssistant(updated);
      await refreshReadiness(orgId);
      if (updated.status === 'ACTIVE' && orgId) {
        clearWizardProgress(orgId);
      }
      toast.success(
        updated.status === 'ACTIVE' ? t('voice.activation.success') : t('voice.activation.deactivated'),
      );
    } catch (err) {
      const message = getErrorMessage(err, t('voice.activation.failed'));
      setActionError(message);
      toast.error(t('voice.activation.failed'), { description: message });
      try {
        await refreshReadiness(orgId);
      } catch {
        // best effort
      }
    } finally {
      setActivating(false);
      operationLock.current = false;
    }
  };

  const syncLogs = async () => {
    if (!orgId || operationLock.current) return;
    operationLock.current = true;
    setSyncing(true);
    setActionError(null);
    try {
      const result = await api.voiceAssistant.syncConversations(orgId);
      const refreshed = await api.voiceAssistant.get(orgId);
      setAssistant(refreshed);
      toast.success(t('voice.ops.synced'), {
        description: result.message ?? `${result.synced}`,
      });
    } catch (err) {
      const message = getErrorMessage(err, t('voice.ops.syncError'));
      setActionError(message);
      toast.error(t('voice.ops.syncError'), { description: message });
    } finally {
      setSyncing(false);
      operationLock.current = false;
    }
  };

  const textField = (key: VoiceTextField): string => {
    const draftValue = draft[key];
    if (draftValue !== undefined && draftValue !== null) return String(draftValue);
    const current = assistant?.[key as keyof VoiceAssistantData];
    return current == null ? '' : String(current);
  };

  const boolField = (key: VoiceBoolField): boolean => {
    const draftValue = draft[key];
    if (draftValue !== undefined) return Boolean(draftValue);
    const current = assistant?.[key as keyof VoiceAssistantData];
    return Boolean(current);
  };

  const setTextField = (key: VoiceTextField, value: string) => {
    setDraft(prev => ({ ...prev, [key]: value }));
  };

  const setBoolField = (key: VoiceBoolField, value: boolean) => {
    setDraft(prev => ({ ...prev, [key]: value }));
  };

  const setVoiceSelection = (voiceId: string, voiceName: string) => {
    setDraft(prev => ({ ...prev, voiceId, voiceName }));
  };

  const setPermissionPatch = (patch: Partial<Record<VoiceToolCapabilityKey, VoicePermissionMode>>) => {
    setDraft(prev => ({
      ...prev,
      toolPermissions: {
        ...(prev.toolPermissions ?? assistant?.toolPermissions ?? {}),
        ...patch,
      },
    }));
  };

  const hasDraft = Object.keys(draft).length > 0;
  const canActivate = Boolean(readiness?.ready) || isActive;

  const providerWarning = useMemo(() => {
    const el = readiness?.checks.find(c => c.key === 'elevenlabs');
    if (el && !el.ok) return t('voice.ops.provider.elevenlabs');
    if (assistant?.connectionStatus === 'DEGRADED') return t('voice.ops.provider.degraded');
    if (assistant?.connectionStatus === 'ERROR') return t('voice.ops.provider.error');
    return null;
  }, [assistant?.connectionStatus, readiness?.checks, t]);

  if (loading) {
    return (
      <div className="mx-auto flex h-[60vh] max-w-[1600px] items-center justify-center">
        <div className="surface-premium flex items-center gap-3 rounded-2xl px-5 py-4 shadow-[var(--shadow-1)]">
          <Icon name="loader-2" className="h-5 w-5 animate-spin text-muted-foreground" />
          <span className="text-xs font-semibold text-muted-foreground">{t('voice.common.loading')}</span>
        </div>
      </div>
    );
  }

  if (loadError && !assistant) {
    return (
      <div className="mx-auto flex h-[60vh] max-w-[1600px] items-center justify-center">
        <div className="surface-premium max-w-md rounded-2xl p-6 text-center shadow-[var(--shadow-1)]">
          <p className="text-sm font-semibold text-foreground">{t('voice.common.loadError')}</p>
          <p className="mt-2 text-xs text-muted-foreground">{loadError}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="mt-4 rounded-lg border px-4 py-2 text-xs font-semibold"
          >
            {t('voice.common.retry')}
          </button>
        </div>
      </div>
    );
  }

  if (!assistant || !orgId) {
    return null;
  }

  if (showWizard) {
    const urlWizardStep = mergeVoiceAssistantState(
      readVoiceAssistantStateFromUrl(
        typeof window !== 'undefined' ? window.location.search : '',
      ),
    ).wizardStep;

    return (
      <div className="mx-auto max-w-[1600px] space-y-4 pb-8">
        <VoiceOnboardingWizard
          orgId={orgId}
          assistant={assistant}
          readiness={readiness}
          voices={voices}
          voicesLoading={voicesLoading}
          voicesError={voicesError}
          onLoadVoices={() => void loadVoices()}
          isDarkMode={isDarkMode}
          isBusy={isBusy}
          saving={saving}
          activating={activating}
          draft={draft}
          hasDraft={hasDraft}
          testPassed={testPassed}
          actionError={actionError}
          initialStep={urlWizardStep ?? loadWizardStep(orgId)}
          textField={textField}
          setTextField={setTextField}
          setVoiceSelection={setVoiceSelection}
          boolField={boolField}
          setBoolField={setBoolField}
          onSave={save}
          onPermissionChange={setPermissionPatch}
          onActivate={toggleActive}
          onAssistantUpdated={setAssistant}
          onReadinessRefresh={() => refreshReadiness(orgId)}
          onTestPassed={() => setTestPassed(true)}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1600px] space-y-4 pb-8">
      <VoiceCommandHeader
        assistant={assistant}
        readiness={readiness}
        isBusy={isBusy}
        activating={activating}
        saving={saving}
        syncing={syncing}
        testLoading={false}
        canActivate={canActivate}
        isActive={isActive}
        hasDraft={hasDraft}
        onActivate={() => void toggleActive()}
        onTest={() => openVoiceTestCenter()}
        onSync={() => {
          void syncLogs();
        }}
        onSave={() => void save()}
      />

      {actionError && (
        <ErrorState
          compact
          title={t('voice.common.actionFailed')}
          error={actionError}
          className="surface-premium rounded-2xl border border-[color:var(--status-critical)]/20"
        />
      )}

      <VoiceOpsSectionNav activeTab={opsTab} onChange={setOpsTab} />

      <div key={opsTab} className="animate-fade-up">
        {opsTab === 'overview' && (
          <VoiceOperationsOverview
            orgId={orgId}
            assistant={assistant}
            readiness={readiness}
            providerWarning={providerWarning}
            onOpenConversations={onOpenConversations}
            onOpenAnalytics={() => setOpsTab('analytics')}
          />
        )}

        {opsTab === 'automations' && assistant.toolPermissions && (
          <VoicePermissionGroupsPanel
            assistant={assistant}
            draft={draft}
            saving={saving}
            hasDraft={Boolean(draft.toolPermissions)}
            onModeChange={setPermissionPatch}
            onSave={() => void save({ toolPermissions: draft.toolPermissions })}
          />
        )}

        {opsTab === 'analytics' && (
          <VoiceUsageAnalyticsPanel
            orgId={orgId}
            isDarkMode={isDarkMode}
            cardClassName={card}
            onRequestSync={syncLogs}
          />
        )}

        {opsTab === 'settings' && settingsSection === 'test' && (
          <VoiceTestCenter
            orgId={orgId}
            assistant={assistant}
            readiness={readiness}
            onTestPassed={() => setTestPassed(true)}
            onNavigateTab={(tab) => {
              if (tab === 'analytics') {
                setOpsTab('analytics');
                return;
              }
              if (tab === 'overview') {
                setOpsTab('overview');
                return;
              }
              if (tab === 'permissions') {
                setOpsTab('automations');
                return;
              }
              if (tab === 'telephony') {
                applyVoiceUrlState({
                  opsTab: 'settings',
                  settingsSection: 'telephony',
                  wizardStep: null,
                });
                return;
              }
              openVoiceSettingsBuilder();
            }}
          />
        )}

        {opsTab === 'settings' && settingsSection !== 'test' && (
          <VoiceAgentSettings enabled={opsTab === 'settings'} />
        )}
      </div>
    </div>
  );
}
