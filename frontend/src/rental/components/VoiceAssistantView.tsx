import { Icon } from './ui/Icon';
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { toast } from 'sonner';
import { EmptyState, ErrorState } from '../../components/patterns/states';

import { useRentalOrg } from '../RentalContext';
import { api, getErrorMessage } from '../../lib/api';
import type {
  VoiceAssistantData,
  VoiceAssistantReadiness,
  VoiceAssistantUpdatePayload,
  VoiceConversationEntry,
  VoiceOption,
} from '../../lib/api';
import { VoiceAssistantBuilder } from './voice-assistant/VoiceAssistantBuilder';
import type { VoiceTextField } from './voice-assistant/voice-assistant-builder.types';
import { VoiceCommandHeader } from './voice-assistant/VoiceCommandHeader';
import { VoiceLaunchChecklist } from './voice-assistant/VoiceLaunchChecklist';
import { VoiceOpsKpiStrip } from './voice-assistant/VoiceOpsKpiStrip';
import { VoiceSectionNav } from './voice-assistant/VoiceSectionNav';
import { VoiceTelephonyWizard } from './voice-assistant/VoiceTelephonyWizard';
import { VoiceTestCenter } from './voice-assistant/VoiceTestCenter';
import { VoiceConversationsPanel } from './voice-assistant/VoiceConversationsPanel';
import { VoiceAnalyticsView } from './voice-assistant/VoiceAnalyticsView';
import { VoicePermissionsMatrix } from './voice-assistant/VoicePermissionsMatrix';
import type { VoicePermissionMode, VoiceToolCapabilityKey } from './voice-assistant/voice-assistant-permissions.ops';
import {
  answerRatePercent,
  buildLaunchChecklist,
  callsTodayFromConversations,
  lastCallLabel,
  openEscalationsCount,
  readinessPercent,
  type VoiceTab,
} from './voice-assistant/voice-assistant.ops';

interface Props { isDarkMode: boolean; }

type VoiceBoolField = Exclude<{
  [K in keyof VoiceAssistantUpdatePayload]: VoiceAssistantUpdatePayload[K] extends boolean | undefined ? K : never;
}[keyof VoiceAssistantUpdatePayload], undefined>;

export function VoiceAssistantView({ isDarkMode }: Props) {
  const { orgId } = useRentalOrg();
  const [tab, setTab] = useState<VoiceTab>('overview');
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

  const refreshReadiness = useCallback(async (targetOrgId: string) => {
    const r = await api.voiceAssistant.readiness(targetOrgId);
    setReadiness(r);
    return r;
  }, []);

  const load = useCallback(async () => {
    if (!orgId) {
      setLoading(false);
      setLoadError('Organization context is missing.');
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
      const message = getErrorMessage(err, 'Failed to load voice assistant');
      setLoadError(message);
      toast.error('Could not load voice assistant', { description: message });
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => { load(); }, [load]);

  const loadVoices = useCallback(async () => {
    if (!orgId || voicesLoading) return;
    setVoicesLoading(true);
    setVoicesError(null);
    try {
      const v = await api.voiceAssistant.voices(orgId);
      setVoices(v);
      if (v.length === 0) {
        setVoicesError('No voices returned — ElevenLabs may not be configured on the server.');
        toast.message('No voices returned', {
          description: 'ElevenLabs may not be configured on the server.',
        });
      }
    } catch (err) {
      const message = getErrorMessage(err);
      setVoicesError(message);
      toast.error('Could not load voices', { description: message });
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
      toast.error('Could not load conversations', { description: getErrorMessage(err) });
    }
  }, [orgId]);

  useEffect(() => { if (tab === 'config') void loadVoices(); }, [tab, loadVoices]);
  useEffect(() => { if (tab === 'logs') loadConversations(); }, [tab, loadConversations]);

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
      toast.success('Voice assistant saved');
    } catch (err) {
      const message = getErrorMessage(err, 'Save failed');
      setActionError(message);
      toast.error('Could not save voice assistant', { description: message });
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
      toast.success(updated.status === 'ACTIVE' ? 'Voice assistant activated' : 'Voice assistant deactivated');
    } catch (err) {
      const message = getErrorMessage(err, 'Activation failed');
      setActionError(message);
      toast.error(
        assistant.status === 'ACTIVE' ? 'Deactivation failed' : 'Activation failed',
        { description: message },
      );
      try {
        await refreshReadiness(orgId);
      } catch {
        // readiness refresh is best-effort after failure
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
      toast.success('Conversations synced', {
        description: result.message ?? `${result.synced} new conversation(s)`,
      });
    } catch (err) {
      const message = getErrorMessage(err, 'Sync failed');
      setActionError(message);
      toast.error('Could not sync conversations', { description: message });
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

  const setPermissionMode = (key: VoiceToolCapabilityKey, mode: VoicePermissionMode) => {
    setDraft(prev => ({
      ...prev,
      toolPermissions: {
        ...(prev.toolPermissions ?? assistant?.toolPermissions ?? {}),
        [key]: mode,
      },
    }));
  };

  const savePermissions = () => {
    if (!draft.toolPermissions) return;
    void save({ toolPermissions: draft.toolPermissions });
  };

  const hasPermissionDraft = Boolean(draft.toolPermissions && Object.keys(draft.toolPermissions).length > 0);

  const hasDraft = Object.keys(draft).length > 0;

  const card = 'sq-card rounded-2xl shadow-[var(--shadow-1)]';
  const inputCls = `w-full px-3 py-2 rounded-lg text-xs outline-none transition-colors ${
    isDarkMode
      ? 'bg-card border border-neutral-700 text-gray-200 focus:border-purple-500/50'
      : 'bg-gray-50 border border-gray-200 text-gray-800 focus:border-purple-400'
  }`;
  const labelCls = `block text-[11px] font-semibold mb-1 ${isDarkMode ? 'text-muted-foreground' : 'text-gray-500'}`;

  const isActive = assistant?.status === 'ACTIVE';
  const canActivate = Boolean(readiness?.ready) || isActive;
  const callsToday = callsTodayFromConversations(conversations, conversationsLoaded);
  const openEscalations = openEscalationsCount(conversations, conversationsLoaded);
  const answerRate = answerRatePercent(assistant);
  const readinessPct = readinessPercent(readiness);
  const launchItems = useMemo(
    () => buildLaunchChecklist(assistant, readiness, testPassed),
    [assistant, readiness, testPassed],
  );
  const providerWarning = useMemo(() => {
    const el = readiness?.checks.find(c => c.key === 'elevenlabs');
    if (el && !el.ok) return 'ElevenLabs not connected on server';
    if (assistant?.connectionStatus === 'DEGRADED') return 'Provider connection degraded';
    if (assistant?.connectionStatus === 'ERROR') return 'Provider error — check server logs';
    return null;
  }, [assistant?.connectionStatus, readiness?.checks]);
  const lastCall = lastCallLabel(conversations, conversationsLoaded);

  if (loading) {
    return (
      <div className="mx-auto flex h-[60vh] max-w-[1600px] items-center justify-center">
        <div className="sq-card flex items-center gap-3 rounded-2xl px-5 py-4 shadow-[var(--shadow-1)]">
          <Icon name="loader-2" className="h-5 w-5 animate-spin text-muted-foreground" />
          <span className="text-xs font-semibold text-muted-foreground">Loading voice assistant...</span>
        </div>
      </div>
    );
  }

  if (loadError && !assistant) {
    return (
      <div className="mx-auto flex h-[60vh] max-w-[1600px] items-center justify-center">
        <div className="sq-card max-w-md rounded-2xl p-6 text-center shadow-[var(--shadow-1)]">
          <p className="text-sm font-semibold text-foreground">Could not load voice assistant</p>
          <p className="mt-2 text-xs text-muted-foreground">{loadError}</p>
          <button
            type="button"
            onClick={() => load()}
            className="mt-4 rounded-lg border px-4 py-2 text-xs font-semibold"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!assistant) {
    return null;
  }

  return (
    <div className="mx-auto max-w-[1600px] space-y-4 pb-8">
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
        onTest={() => setTab('test')}
        onSync={() => { setTab('logs'); void syncLogs(); }}
        onSave={() => void save()}
      />

      {actionError && (
        <ErrorState
          compact
          title="Action failed"
          error={actionError}
          className="sq-card rounded-2xl border border-[color:var(--status-critical)]/20"
        />
      )}

      <VoiceOpsKpiStrip
        callsToday={callsToday}
        missedCalls={assistant.missedCalls}
        escalatedCalls={assistant.escalatedCalls}
        answerRate={answerRate}
        talkMinutes={assistant.totalTalkMinutes}
        readinessPercent={readinessPct}
        providerWarning={providerWarning}
        onOpenAnalytics={() => setTab('analytics')}
        onOpenOverview={() => setTab('overview')}
      />

      <VoiceSectionNav activeTab={tab} onChange={setTab} />

      <div key={tab} className="animate-fade-up">
      {tab === 'overview' && (
        <div className="space-y-4">
          <VoiceLaunchChecklist items={launchItems} onNavigate={setTab} />
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className={`${card} p-4`}>
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Lifetime usage</h3>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {[
                  { label: 'Total calls', value: assistant.totalCalls },
                  { label: 'Answered', value: assistant.answeredCalls },
                  { label: 'Missed', value: assistant.missedCalls },
                  { label: 'Escalated', value: assistant.escalatedCalls },
                ].map(row => (
                  <div key={row.label} className="rounded-xl border border-border/40 bg-muted/20 px-3 py-2.5">
                    <p className="text-[10px] text-muted-foreground">{row.label}</p>
                    <p className="mt-1 text-lg font-bold tabular-nums text-foreground">{row.value}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className={`${card} p-4`}>
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Assistant snapshot</h3>
              <dl className="mt-3 space-y-2">
                {[
                  { label: 'Voice', value: assistant.voiceName ?? 'Not set' },
                  { label: 'Language', value: assistant.language },
                  { label: 'Phone', value: assistant.phoneNumber ?? 'Not connected' },
                  { label: 'Agent', value: assistant.elevenLabsAgentId ? 'Provisioned' : 'Not provisioned' },
                ].map(row => (
                  <div key={row.label} className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5">
                    <dt className="text-[11px] text-muted-foreground">{row.label}</dt>
                    <dd className="text-[11px] font-semibold text-foreground">{row.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </div>
      )}

      {tab === 'config' && orgId && (
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
          onNavigateTab={setTab}
        />
      )}

      {tab === 'permissions' && assistant.toolPermissions && (
        <VoicePermissionsMatrix
          assistant={assistant}
          draft={draft}
          saving={saving}
          hasDraft={hasPermissionDraft}
          onModeChange={setPermissionMode}
          onSave={savePermissions}
        />
      )}

      {tab === 'escalation' && (
        <div className={`${card} p-5 space-y-4`}>
          <div className="flex items-center justify-between">
            <h3 className={`text-sm font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Escalation & Handover</h3>
            {hasDraft && (
              <button onClick={() => save()} disabled={saving} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold ${isDarkMode ? 'bg-purple-500/20 text-purple-300 hover:bg-purple-500/30' : 'bg-purple-50 text-purple-700 hover:bg-purple-100'}`}>
                {saving ? <Icon name="loader-2" className="w-3 h-3 animate-spin" /> : <Icon name="save" className="w-3 h-3" />} Save
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Escalation Phone Number</label>
              <input className={inputCls} value={textField('escalationPhone')} onChange={e => setTextField('escalationPhone', e.target.value)} placeholder="+49 123 456789" />
            </div>
            <div>
              <label className={labelCls}>Escalation Department</label>
              <input className={inputCls} value={textField('escalationDepartment')} onChange={e => setTextField('escalationDepartment', e.target.value)} placeholder="Support, Sales..." />
            </div>
          </div>

          <div>
            <label className={labelCls}>Fallback Message (when no agent available)</label>
            <input className={inputCls} value={textField('fallbackMessage')} onChange={e => setTextField('fallbackMessage', e.target.value)}
              placeholder="We're sorry, all agents are busy. Please call back later." />
          </div>

          <h4 className={`text-xs font-bold mt-4 ${isDarkMode ? 'text-muted-foreground' : 'text-gray-500'}`}>Escalation Triggers</h4>
          <div className="space-y-2">
            {([
              { key: 'escalateOnRequest', label: 'Caller requests a human agent', desc: 'Transfer when caller explicitly asks for a human' },
              { key: 'escalateOnLowConf', label: 'Low confidence answer', desc: 'Transfer when assistant is unsure about the answer' },
              { key: 'escalateOnSensitive', label: 'Sensitive topic detected', desc: 'Transfer for legal, complaint, or accident topics' },
            ] as const).map(t => (
              <label key={t.key} className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${isDarkMode ? 'hover:bg-card' : 'hover:bg-gray-50'}`}>
                <input type="checkbox" checked={boolField(t.key)} onChange={e => setBoolField(t.key, e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500" />
                <div>
                  <div className={`text-xs font-semibold ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}>{t.label}</div>
                  <div className={`text-[10px] ${isDarkMode ? 'text-gray-500' : 'text-muted-foreground'}`}>{t.desc}</div>
                </div>
              </label>
            ))}
          </div>

          <h4 className={`text-xs font-bold mt-4 ${isDarkMode ? 'text-muted-foreground' : 'text-gray-500'}`}>Business Hours</h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className={labelCls}>Start</label>
              <input type="time" className={inputCls} value={textField('businessHoursStart')} onChange={e => setTextField('businessHoursStart', e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>End</label>
              <input type="time" className={inputCls} value={textField('businessHoursEnd')} onChange={e => setTextField('businessHoursEnd', e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Timezone</label>
              <input className={inputCls} value={textField('businessHoursTimezone')} onChange={e => setTextField('businessHoursTimezone', e.target.value)} placeholder="Europe/Berlin" />
            </div>
          </div>
          <div>
            <label className={labelCls}>After-Hours Message</label>
            <input className={inputCls} value={textField('afterHoursMessage')} onChange={e => setTextField('afterHoursMessage', e.target.value)}
              placeholder="Our office is currently closed. Please call back during business hours." />
          </div>
        </div>
      )}

      {tab === 'telephony' && orgId && (
        <VoiceTelephonyWizard
          orgId={orgId}
          assistant={assistant}
          readinessElevenLabsOk={readiness?.checks.find(c => c.key === 'elevenlabs')?.ok}
          isBusy={isBusy}
          onAssistantUpdated={setAssistant}
          onNavigateTest={() => setTab('test')}
          onError={err => toast.error('Telephony error', { description: getErrorMessage(err) })}
          loadPhoneNumbers={() => api.voiceAssistant.phoneNumbers(orgId)}
          assignPhoneNumber={phoneNumberId => api.voiceAssistant.assignPhoneNumber(orgId, phoneNumberId)}
          unassignPhoneNumber={() => api.voiceAssistant.unassignPhoneNumber(orgId)}
          refreshTelephony={() => api.voiceAssistant.refreshTelephony(orgId)}
          updateTelephonySettings={payload => api.voiceAssistant.updateTelephonySettings(orgId, payload)}
        />
      )}

      {tab === 'test' && orgId && (
        <VoiceTestCenter
          orgId={orgId}
          assistant={assistant}
          readiness={readiness}
          onTestPassed={() => setTestPassed(true)}
          onNavigateTab={setTab}
        />
      )}

      {tab === 'analytics' && orgId && (
        <VoiceAnalyticsView
          orgId={orgId}
          isDarkMode={isDarkMode}
          cardClassName={card}
          onRequestSync={syncLogs}
        />
      )}

      {tab === 'knowledge' && (
        <EmptyState
          icon={<Icon name="book-open" className="h-5 w-5" />}
          title="Knowledge health"
          description="Knowledge snippet coverage and FAQ freshness scoring will appear here once the backend health endpoint is available."
          action={
            <button type="button" onClick={() => setTab('config')} className="sq-press rounded-lg border border-border/60 bg-card px-4 py-2 text-xs font-semibold">
              Edit knowledge snippets
            </button>
          }
        />
      )}

      {tab === 'logs' && orgId && (
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
      </div>
    </div>
  );
}
