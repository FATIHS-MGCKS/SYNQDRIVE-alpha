import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { toast } from 'sonner';
import { ErrorState } from '../../components/patterns/states';
import {
  VoiceHealthBanner,
  VoicePageShell,
  VoiceResponsiveTabs,
  VoiceSkeleton,
} from '../../components/voice-ui';

import { useRentalOrg } from '../RentalContext';
import { api, getErrorMessage } from '../../lib/api';
import type {
  VoiceAssistantData,
  VoiceAssistantReadiness,
  VoiceAssistantUpdatePayload,
  VoiceConversationEntry,
  VoiceOption,
} from '../../lib/api';
import type { VoiceTextField } from './voice-assistant/voice-assistant-builder.types';
import { VoiceCommandHeader } from './voice-assistant/VoiceCommandHeader';
import { VoiceOnboardingWizard } from './voice-assistant/VoiceOnboardingWizard';
import { VoiceOperationsOverview } from './voice-assistant/VoiceOperationsOverview';
import { VoiceConversationsPanel } from './voice-assistant/VoiceConversationsPanel';
import { VoicePermissionGroupsPanel } from './voice-assistant/VoicePermissionGroupsPanel';
import { VoiceUsageAnalyticsPanel } from './voice-assistant/VoiceUsageAnalyticsPanel';
import { VoiceAssistantBuilder } from './voice-assistant/VoiceAssistantBuilder';
import { VoiceTelephonyWizard } from './voice-assistant/VoiceTelephonyWizard';
import { VoiceWizardKnowledgeStep } from './voice-assistant/VoiceWizardKnowledgeStep';
import { VoiceSettingsPanel } from './voice-assistant/VoiceSettingsPanel';
import { useVoiceWorkspace } from './voice-assistant/useVoiceWorkspace';
import {
  maskTechnicalId,
  shouldShowOnboardingShell,
  VOICE_OPS_TABS,
} from './voice-assistant/voice-information-architecture';
import type { VoiceToolCapabilityKey, VoicePermissionMode } from './voice-assistant/voice-assistant-permissions.ops';
import {
  callsTodayFromConversations,
  lastCallLabel,
  openEscalationsCount,
} from './voice-assistant/voice-assistant.ops';
import { useLanguage } from '../i18n/LanguageContext';

interface Props {
  isDarkMode: boolean;
}

type VoiceBoolField = Exclude<{
  [K in keyof VoiceAssistantUpdatePayload]: VoiceAssistantUpdatePayload[K] extends boolean | undefined ? K : never;
}[keyof VoiceAssistantUpdatePayload], undefined>;

export function VoiceAssistantView({ isDarkMode }: Props) {
  const { t } = useLanguage();
  const { orgId } = useRentalOrg();
  const {
    workspace,
    route,
    loading: workspaceLoading,
    error: workspaceError,
    refresh: refreshWorkspace,
    setWizardStep,
    setOpsTab,
  } = useVoiceWorkspace(orgId);
  const [assistant, setAssistant] = useState<VoiceAssistantData | null>(null);
  const [readiness, setReadiness] = useState<VoiceAssistantReadiness | null>(null);
  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const [conversations, setConversations] = useState<VoiceConversationEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [activating, setActivating] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [draft, setDraft] = useState<VoiceAssistantUpdatePayload>({});
  const [voicesLoading, setVoicesLoading] = useState(false);
  const [voicesError, setVoicesError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [conversationsLoaded, setConversationsLoaded] = useState(false);
  const [testPassed, setTestPassed] = useState(false);
  const operationLock = useRef(false);

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
      await refreshWorkspace();
    } catch (err) {
      const message = getErrorMessage(err, t('voice.common.loadError'));
      setLoadError(message);
      toast.error(t('voice.common.loadError'), { description: message });
    } finally {
      setLoading(false);
    }
  }, [orgId, t, refreshWorkspace]);

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

  const loadConversations = useCallback(async () => {
    if (!orgId) return;
    try {
      const result = await api.voiceAssistant.conversations(orgId, { limit: 50 });
      setConversations(result.items);
      setConversationsLoaded(true);
    } catch (err) {
      toast.error(t('voice.ops.conversationsError'), { description: getErrorMessage(err) });
    }
  }, [orgId, t]);

  const isActive = assistant?.status === 'ACTIVE';
  const showWizard = workspace ? shouldShowOnboardingShell(workspace) : false;
  const opsTab = route.opsTab ?? 'overview';
  const settingsSection = route.settingsSection ?? 'assistant';

  useEffect(() => {
    if (showWizard) void loadVoices();
  }, [showWizard, loadVoices]);

  useEffect(() => {
    if (!showWizard && (opsTab === 'overview' || opsTab === 'conversations')) {
      void loadConversations();
    }
  }, [showWizard, opsTab, loadConversations]);

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
      await refreshWorkspace();
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
      await refreshWorkspace();
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
      await loadConversations();
      if (assistant) {
        const refreshed = await api.voiceAssistant.get(orgId);
        setAssistant(refreshed);
      }
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
  const callsToday = callsTodayFromConversations(conversations, conversationsLoaded);
  const openEscalations = openEscalationsCount(conversations, conversationsLoaded);
  const lastCall = lastCallLabel(conversations, conversationsLoaded);

  const providerWarning = useMemo(() => {
    const el = readiness?.checks.find(c => c.key === 'elevenlabs');
    if (el && !el.ok) return t('voice.ops.provider.elevenlabs');
    if (assistant?.connectionStatus === 'DEGRADED') return t('voice.ops.provider.degraded');
    if (assistant?.connectionStatus === 'ERROR') return t('voice.ops.provider.error');
    return null;
  }, [assistant?.connectionStatus, readiness?.checks, t]);

  if (loading || workspaceLoading) {
    return (
      <VoicePageShell>
        <VoiceSkeleton variant="hero" />
        <VoiceSkeleton variant="metrics" />
      </VoicePageShell>
    );
  }

  if ((loadError || workspaceError) && !assistant) {
    return (
      <div className="mx-auto flex h-[60vh] max-w-[1600px] items-center justify-center">
        <div className="surface-premium max-w-md rounded-2xl p-6 text-center shadow-[var(--shadow-1)]">
          <p className="text-sm font-semibold text-foreground">{t('voice.common.loadError')}</p>
          <p className="mt-2 text-xs text-muted-foreground">{loadError ?? workspaceError}</p>
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

  if (!assistant || !orgId || !workspace) {
    return null;
  }

  const diagnosticRows = readiness?.checks.map((check) => ({
    id: check.key,
    label: check.label,
    value: check.ok ? t('voice.settings.diagnostics.ok') : t('voice.settings.diagnostics.issue'),
    status: check.ok ? ('ok' as const) : ('warn' as const),
    hint: check.verification ? maskTechnicalId(check.verification) : undefined,
  })) ?? [];

  const opsNavItems = VOICE_OPS_TABS.map((key) => ({
    key,
    label: t(`voice.ops.tab.${key}` as 'voice.ops.tab.overview'),
  }));

  const blockingIssue = workspace.issues.find((issue) => issue.blocking);

  if (showWizard) {
    return (
      <VoicePageShell>
        {blockingIssue && (
          <VoiceHealthBanner
            tone="blocked"
            title={blockingIssue.message}
            description={workspace.primaryState}
          />
        )}
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
          testPassed={workspace.testPassed || testPassed}
          actionError={actionError}
          step={route.wizardStep ?? workspace.onboardingStep}
          allowedSteps={workspace.navigation.allowedWizardSteps}
          onStepChange={setWizardStep}
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
          onTestPassed={() => {
            setTestPassed(true);
            void refreshWorkspace();
          }}
        />
      </VoicePageShell>
    );
  }

  return (
    <VoicePageShell
      header={
        <VoiceCommandHeader
          assistant={assistant}
          readiness={readiness}
          callsToday={callsToday}
          conversationsLoaded={conversationsLoaded}
          conversationsCount={conversations.length}
          lastCall={lastCall}
          openEscalations={openEscalations}
          isBusy={isBusy}
          activating={activating}
          saving={saving}
          syncing={syncing}
          testLoading={false}
          canActivate={canActivate}
          isActive={isActive}
          hasDraft={hasDraft}
          onActivate={() => void toggleActive()}
          onTest={() => setOpsTab('settings', 'diagnostics')}
          onSync={() => {
            setOpsTab('conversations');
            void syncLogs();
          }}
          onSave={() => void save()}
        />
      }
      nav={
        <VoiceResponsiveTabs
          items={opsNavItems}
          activeKey={opsTab}
          onChange={(key) => setOpsTab(key as typeof opsTab)}
          ariaLabel={t('voice.ops.navLabel')}
        />
      }
    >
      {workspace.primaryState === 'DEGRADED' && (
        <VoiceHealthBanner
          tone="degraded"
          title={t('voice.ops.provider.degraded')}
          description={providerWarning ?? undefined}
        />
      )}

      {actionError && (
        <ErrorState
          compact
          title={t('voice.common.actionFailed')}
          error={actionError}
          className="surface-premium rounded-2xl border border-[color:var(--status-critical)]/20"
        />
      )}

      <div key={opsTab} className="animate-fade-up motion-reduce:animate-none">
        {opsTab === 'overview' && (
          <VoiceOperationsOverview
            orgId={orgId}
            assistant={assistant}
            readiness={readiness}
            conversations={conversations}
            conversationsLoaded={conversationsLoaded}
            providerWarning={providerWarning}
            onOpenConversations={() => setOpsTab('conversations')}
            onOpenAnalytics={() => setOpsTab('analytics')}
          />
        )}

        {opsTab === 'conversations' && (
          <VoiceConversationsPanel
            orgId={orgId}
            isDarkMode={isDarkMode}
            cardClassName={card}
            onConversationsChange={items => {
              setConversations(items);
              setConversationsLoaded(true);
            }}
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

        {opsTab === 'settings' && (
          <VoiceSettingsPanel
            activeSection={settingsSection}
            onSectionChange={(section) => setOpsTab('settings', section)}
            diagnosticRows={diagnosticRows}
          >
            {settingsSection === 'assistant' && (
              <VoiceAssistantBuilder
                orgId={orgId}
                assistant={assistant}
                readiness={readiness}
                voices={voices}
                voicesLoading={voicesLoading}
                voicesError={voicesError}
                onLoadVoices={() => void loadVoices()}
                textField={textField}
                setTextField={setTextField}
                setVoiceSelection={setVoiceSelection}
                hasDraft={hasDraft}
                saving={saving}
                onSave={() => void save()}
                onNavigateTab={() => undefined}
              />
            )}
            {settingsSection === 'knowledge' && (
              <VoiceWizardKnowledgeStep orgId={orgId} assistant={assistant} />
            )}
            {settingsSection === 'permissions' && assistant.toolPermissions && (
              <VoicePermissionGroupsPanel
                assistant={assistant}
                draft={draft}
                saving={saving}
                hasDraft={Boolean(draft.toolPermissions)}
                onModeChange={setPermissionPatch}
                onSave={() => void save({ toolPermissions: draft.toolPermissions })}
              />
            )}
            {settingsSection === 'telephony' && (
              <VoiceTelephonyWizard
                orgId={orgId}
                assistant={assistant}
                readinessElevenLabsOk={readiness?.checks.find(c => c.key === 'elevenlabs')?.ok}
                isBusy={isBusy}
                onAssistantUpdated={setAssistant}
                onNavigateTest={() => setOpsTab('settings', 'diagnostics')}
                onError={err => toast.error(t('voice.phone.error'), { description: getErrorMessage(err) })}
                loadPhoneNumbers={() => api.voiceAssistant.phoneNumbers(orgId)}
                assignPhoneNumber={phoneNumberId => api.voiceAssistant.assignPhoneNumber(orgId, phoneNumberId)}
                unassignPhoneNumber={() => api.voiceAssistant.unassignPhoneNumber(orgId)}
                refreshTelephony={() => api.voiceAssistant.refreshTelephony(orgId)}
                updateTelephonySettings={payload => api.voiceAssistant.updateTelephonySettings(orgId, payload)}
              />
            )}
            {settingsSection === 'availability' && (
              <p className="text-[12px] text-muted-foreground">{t('voice.availability.description')}</p>
            )}
            {settingsSection === 'privacy' && (
              <p className="text-[12px] text-muted-foreground">{t('voice.activation.privacy')}</p>
            )}
            {settingsSection === 'budget' && (
              <p className="text-[12px] text-muted-foreground">{t('voice.activation.budgetDesc')}</p>
            )}
          </VoiceSettingsPanel>
        )}
      </div>
    </VoicePageShell>
  );
}
