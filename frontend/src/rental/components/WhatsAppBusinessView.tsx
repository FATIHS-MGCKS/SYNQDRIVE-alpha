import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Icon } from './ui/Icon';
import { EmptyState, ErrorState } from '../../components/patterns/states';
import { Skeleton } from '../../components/ui/skeleton';
import { useRentalOrg } from '../RentalContext';
import {
  api,
  getErrorMessage,
  type WhatsAppAiSuggestionResponse,
  type WhatsAppConfig,
  type WhatsAppConversation,
  type WhatsAppMsg,
  type WhatsAppStats,
  type WhatsAppTemplate,
  type WhatsAppTemplateCategory,
} from '../../lib/api';
import { WhatsAppOperationsHeader } from './whatsapp/WhatsAppOperationsHeader';
import { WhatsAppSectionNav } from './whatsapp/WhatsAppSectionNav';
import { WhatsAppOverviewTab } from './whatsapp/WhatsAppOverviewTab';
import { WhatsAppInboxLayout } from './whatsapp/WhatsAppInboxLayout';
import { WhatsAppTemplateManager } from './whatsapp/WhatsAppTemplateManager';
import { WhatsAppSettingsPanel } from './whatsapp/WhatsAppSettingsPanel';
import { WhatsAppSetupWizard } from './whatsapp/WhatsAppSetupWizard';
import {
  countFailedInThread,
  filterConversations,
  type InboxFilter,
  type MobilePane,
  type WhatsAppTab,
  isSandboxEnvironment,
} from './whatsapp/whatsapp.ops';

interface WhatsAppBusinessViewProps {
  isDarkMode: boolean;
}

export function WhatsAppBusinessView({ isDarkMode: _isDarkMode }: WhatsAppBusinessViewProps) {
  const { orgId } = useRentalOrg();
  const [tab, setTab] = useState<WhatsAppTab>('overview');
  const [config, setConfig] = useState<WhatsAppConfig | null>(null);
  const [stats, setStats] = useState<WhatsAppStats | null>(null);
  const [conversations, setConversations] = useState<WhatsAppConversation[]>([]);
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([]);
  const [selectedConvo, setSelectedConvo] = useState<WhatsAppConversation | null>(null);
  const [messages, setMessages] = useState<WhatsAppMsg[]>([]);
  const [loading, setLoading] = useState(true);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templatesError, setTemplatesError] = useState<string | null>(null);
  const [msgLoading, setMsgLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [aiResult, setAiResult] = useState<WhatsAppAiSuggestionResponse | null>(null);
  const [aiSuggestionReason, setAiSuggestionReason] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [policyBlock, setPolicyBlock] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [inboxFilter, setInboxFilter] = useState<InboxFilter>('all');
  const [mobilePane, setMobilePane] = useState<MobilePane>('inbox');
  const [savingConfig, setSavingConfig] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [simModal, setSimModal] = useState(false);
  const [simPhone, setSimPhone] = useState('+49 170 1234567');
  const [simName, setSimName] = useState('');
  const [simContent, setSimContent] = useState('');
  const [templateModal, setTemplateModal] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState('');
  const [newTemplateBody, setNewTemplateBody] = useState('');
  const [newTemplateCategory, setNewTemplateCategory] = useState<WhatsAppTemplateCategory>('BOOKING_CONFIRMATION');
  const operationLock = useRef(false);

  const loadTemplates = useCallback(async () => {
    if (!orgId) return;
    setTemplatesLoading(true);
    setTemplatesError(null);
    try {
      const list = await api.whatsapp.listTemplates(orgId);
      setTemplates(list ?? []);
    } catch (err) {
      const msg = getErrorMessage(err);
      setTemplatesError(msg);
    } finally {
      setTemplatesLoading(false);
    }
  }, [orgId]);

  const load = useCallback(async () => {
    if (!orgId) {
      setLoading(false);
      setLoadError('Organization context is missing.');
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const [cfg, st, convos] = await Promise.all([
        api.whatsapp.getConfig(orgId),
        api.whatsapp.getStats(orgId),
        api.whatsapp.getConversations(orgId),
      ]);
      setConfig(cfg);
      setStats(st);
      setConversations(convos ?? []);
      void loadTemplates();
    } catch (err) {
      const msg = getErrorMessage(err, 'Failed to load WhatsApp');
      setLoadError(msg);
      toast.error('Could not load WhatsApp', { description: msg });
    } finally {
      setLoading(false);
    }
  }, [orgId, loadTemplates]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadMessages = useCallback(
    async (convo: WhatsAppConversation) => {
      if (!orgId) return;
      setSelectedConvo(convo);
      setMsgLoading(true);
      setAiResult(null);
      setAiSuggestionReason(null);
      setPolicyBlock(null);
      try {
        const res = await api.whatsapp.getMessages(orgId, convo.id);
        setMessages(res ?? []);
        setConversations(prev =>
          prev.map(c => (c.id === convo.id ? { ...c, unreadCount: 0 } : c)),
        );
      } catch (err) {
        const msg = getErrorMessage(err);
        setMessages([]);
        toast.error('Could not load messages', { description: msg });
      } finally {
        setMsgLoading(false);
      }
    },
    [orgId],
  );

  const refreshConversations = useCallback(async () => {
    if (!orgId) return;
    const convos = await api.whatsapp.getConversations(orgId);
    setConversations(convos ?? []);
    const st = await api.whatsapp.getStats(orgId);
    setStats(st);
  }, [orgId]);

  const handleSend = async () => {
    if (!orgId || !selectedConvo || !input.trim() || operationLock.current) return;
    operationLock.current = true;
    setSending(true);
    setPolicyBlock(null);
    try {
      const res = await api.whatsapp.sendMessage(orgId, selectedConvo.id, input.trim());
      setMessages(prev => [...prev, res]);
      setInput('');
      setAiResult(null);
      await refreshConversations();
      if (res.status === 'FAILED') {
        toast.error('Message failed', { description: res.failureReason ?? 'Provider error' });
      } else {
        toast.success('Message queued');
      }
    } catch (err) {
      const msg = getErrorMessage(err);
      setPolicyBlock(msg);
      toast.error('Send failed', { description: msg });
    } finally {
      setSending(false);
      operationLock.current = false;
    }
  };

  const handleAiSuggest = async () => {
    if (!orgId || !selectedConvo) return;
    setAiLoading(true);
    setAiSuggestionReason(null);
    try {
      const res = await api.whatsapp.getAiSuggestion(orgId, selectedConvo.id);
      setAiResult(res);
      setAiSuggestionReason(res.humanReason ?? res.reason ?? null);
      if (!res.suggestedReply && (res.reason || res.humanReason)) {
        toast.message('No suggestion', { description: res.humanReason ?? res.reason ?? undefined });
      }
    } catch (err) {
      toast.error('AI suggestion failed', { description: getErrorMessage(err) });
    } finally {
      setAiLoading(false);
    }
  };

  const handleSendAiReply = async () => {
    if (!orgId || !selectedConvo || !aiResult) return;
    const text = aiResult.suggestedReply ?? aiResult.suggestion;
    if (!text) return;
    setSending(true);
    try {
      const res = await api.whatsapp.sendAiReply(
        orgId,
        selectedConvo.id,
        text,
        aiResult.suggestionId ?? undefined,
      );
      setMessages(prev => [...prev, res]);
      setAiResult(null);
      await refreshConversations();
      toast.success('AI reply sent');
    } catch (err) {
      toast.error('AI reply blocked', { description: getErrorMessage(err) });
    } finally {
      setSending(false);
    }
  };

  const handleConfigSave = async (patch: Partial<WhatsAppConfig>) => {
    if (!orgId) return;
    setSavingConfig(true);
    try {
      const res = await api.whatsapp.updateConfig(orgId, patch);
      setConfig(res);
      toast.success('Settings saved');
    } catch (err) {
      toast.error('Save failed', { description: getErrorMessage(err) });
    } finally {
      setSavingConfig(false);
    }
  };

  const handleWizardComplete = async (data: {
    phoneNumber: string;
    businessName?: string;
    phoneNumberId?: string;
    wabaId?: string;
    aiMode: WhatsAppConfig['aiMode'];
  }) => {
    if (!orgId) return;
    setSavingConfig(true);
    try {
      const connected = await api.whatsapp.connect(orgId, {
        phoneNumber: data.phoneNumber,
        businessName: data.businessName,
        phoneNumberId: data.phoneNumberId,
        wabaId: data.wabaId,
      });
      const updated = await api.whatsapp.updateConfig(orgId, {
        aiMode: data.aiMode,
        phoneNumberId: data.phoneNumberId,
        wabaId: data.wabaId,
        accessTokenConfigured: connected.accessTokenConfigured,
      });
      setConfig(updated);
      setWizardOpen(false);
      toast.success('WhatsApp configured', {
        description: 'Provider token must be set on the server for outbound delivery.',
      });
      await load();
    } catch (err) {
      toast.error('Setup failed', { description: getErrorMessage(err) });
    } finally {
      setSavingConfig(false);
    }
  };

  const handleDisconnect = async () => {
    if (!orgId) return;
    try {
      const res = await api.whatsapp.disconnect(orgId);
      setConfig(res);
      toast.success('Disconnected');
      await load();
    } catch (err) {
      toast.error('Disconnect failed', { description: getErrorMessage(err) });
    }
  };

  const handleSimulate = async () => {
    if (!orgId || !simPhone.trim() || !simContent.trim()) return;
    try {
      const res = await api.whatsapp.simulateIncoming(orgId, {
        contactPhone: simPhone.trim(),
        contactName: simName.trim() || undefined,
        content: simContent.trim(),
      });
      setSimModal(false);
      setSimContent('');
      toast.success(res.sandbox ? 'Sandbox message simulated' : 'Message simulated', {
        description: res.sandbox ? 'Dev/test only — not a real Meta delivery' : undefined,
      });
      await load();
      if (res.conversationId) {
        const convo = (await api.whatsapp.getConversations(orgId)).find(c => c.id === res.conversationId);
        if (convo) {
          setTab('inbox');
          await loadMessages(convo);
        }
      }
    } catch (err) {
      toast.error('Simulation failed', { description: getErrorMessage(err) });
    }
  };

  const handleCreateTemplate = async () => {
    if (!orgId || !newTemplateName.trim() || !newTemplateBody.trim()) return;
    try {
      await api.whatsapp.createTemplate(orgId, {
        name: newTemplateName.trim(),
        category: newTemplateCategory,
        bodyTemplate: newTemplateBody.trim(),
      });
      setTemplateModal(false);
      setNewTemplateName('');
      setNewTemplateBody('');
      toast.success('Template draft created');
      await loadTemplates();
    } catch (err) {
      toast.error('Could not create template', { description: getErrorMessage(err) });
    }
  };

  const handleRequestHandover = async () => {
    if (!orgId || !selectedConvo) {
      toast.message('Human handover noted', { description: 'Select a conversation first.' });
      return;
    }
    try {
      await api.whatsapp.requestHumanReview(
        orgId,
        selectedConvo.id,
        aiResult?.humanReason ?? 'Manual human review from WhatsApp Operations Center',
      );
      await refreshConversations();
      toast.success('Marked for human review');
    } catch (err) {
      toast.error('Handover failed', { description: getErrorMessage(err) });
    }
  };

  const filteredConvos = filterConversations(conversations, inboxFilter, searchQuery);
  const failedInThread = countFailedInThread(messages);

  if (loading) {
    return (
      <div className="mx-auto max-w-[1600px] space-y-4 p-1">
        <Skeleton className="h-16 rounded-2xl" />
        <Skeleton className="h-24 rounded-2xl" />
        <Skeleton className="h-48 rounded-2xl" />
      </div>
    );
  }

  if (loadError && !config) {
    return (
      <div className="mx-auto max-w-[1600px]">
        <ErrorState title="WhatsApp unavailable" error={loadError} onRetry={() => void load()} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1600px] space-y-4">
      <WhatsAppOperationsHeader
        config={config}
        stats={stats}
        isBusy={loading || savingConfig}
        onConnect={() => setWizardOpen(true)}
        onOpenTemplates={() => setTab('templates')}
        onRefresh={() => void load()}
      />

      <WhatsAppSectionNav
        activeTab={tab}
        unreadTotal={stats?.unreadTotal}
        onChange={setTab}
      />

      {tab === 'overview' && (
        <WhatsAppOverviewTab
          config={config}
          stats={stats}
          templates={templates}
          conversations={conversations}
          loadError={loadError}
          onNavigate={setTab}
          onConnect={() => setWizardOpen(true)}
          onRetry={() => void load()}
        />
      )}

      {tab === 'inbox' && (
        config?.isConnected ? (
          <WhatsAppInboxLayout
            orgId={orgId}
            config={config}
            conversations={filteredConvos}
            selected={selectedConvo}
            messages={messages}
            messagesLoading={msgLoading}
            search={searchQuery}
            filter={inboxFilter}
            mobilePane={mobilePane}
            input={input}
            sending={sending}
            aiResult={aiResult}
            aiLoading={aiLoading}
            aiSuggestionReason={aiSuggestionReason}
            policyBlock={policyBlock}
            onSearchChange={setSearchQuery}
            onFilterChange={setInboxFilter}
            onSelect={c => void loadMessages(c)}
            onMobilePane={setMobilePane}
            onInputChange={setInput}
            onSend={() => void handleSend()}
            onAiSuggest={() => void handleAiSuggest()}
            onSendAiReply={() => void handleSendAiReply()}
            onDismissSuggestion={() => setAiResult(null)}
            onUseSuggestionInComposer={() => {
              const text = aiResult?.suggestedReply ?? aiResult?.suggestion;
              if (text) setInput(text);
              setAiResult(null);
            }}
            onOpenTemplates={() => setTab('templates')}
            onRequestHandover={() => void handleRequestHandover()}
            onConversationRefresh={() => void refreshConversations()}
          />
        ) : (
          <EmptyState
            icon={<Icon name="wifi-off" className="h-5 w-5" />}
            title="Setup required"
            description="Connect WhatsApp Business before using the operations inbox."
            action={
              <button
                type="button"
                onClick={() => setWizardOpen(true)}
                className="sq-press rounded-xl bg-[color:var(--brand)] px-4 py-2 text-[11px] font-semibold text-white"
              >
                Open setup wizard
              </button>
            }
          />
        )
      )}

      {tab === 'templates' && (
        <WhatsAppTemplateManager
          templates={templates}
          loading={templatesLoading}
          error={templatesError}
          onRetry={() => void loadTemplates()}
          onCreateDraft={() => setTemplateModal(true)}
        />
      )}

      {tab === 'settings' && (
        <WhatsAppSettingsPanel
          config={config}
          saving={savingConfig}
          onSave={patch => void handleConfigSave(patch)}
          onConnect={() => setWizardOpen(true)}
          onDisconnect={() => void handleDisconnect()}
          onSimulate={() => setSimModal(true)}
        />
      )}

      <WhatsAppSetupWizard
        open={wizardOpen}
        saving={savingConfig}
        onClose={() => setWizardOpen(false)}
        onComplete={data => void handleWizardComplete(data)}
      />

      {simModal && isSandboxEnvironment() && (
        <SimulateModal
          simPhone={simPhone}
          simName={simName}
          simContent={simContent}
          onPhoneChange={setSimPhone}
          onNameChange={setSimName}
          onContentChange={setSimContent}
          onClose={() => setSimModal(false)}
          onSubmit={() => void handleSimulate()}
        />
      )}

      {templateModal && (
        <TemplateDraftModal
          name={newTemplateName}
          body={newTemplateBody}
          category={newTemplateCategory}
          onNameChange={setNewTemplateName}
          onBodyChange={setNewTemplateBody}
          onCategoryChange={setNewTemplateCategory}
          onClose={() => setTemplateModal(false)}
          onSubmit={() => void handleCreateTemplate()}
        />
      )}

      {tab === 'inbox' && selectedConvo && failedInThread > 0 && (
        <p className="text-center text-[10px] text-muted-foreground xl:hidden">
          {failedInThread} failed message(s) in current thread
        </p>
      )}
    </div>
  );
}

function SimulateModal({
  simPhone,
  simName,
  simContent,
  onPhoneChange,
  onNameChange,
  onContentChange,
  onClose,
  onSubmit,
}: {
  simPhone: string;
  simName: string;
  simContent: string;
  onPhoneChange: (v: string) => void;
  onNameChange: (v: string) => void;
  onContentChange: (v: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const inputClass =
    'w-full rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-[11px] outline-none focus:ring-1 focus:ring-[color:var(--brand)]/30';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 overlay-scrim" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-[color:var(--status-watch)]/30 bg-card p-5 shadow-[var(--shadow-2)]">
        <div className="mb-3 flex items-center gap-2">
          <span className="rounded-md bg-[color:var(--status-watch)]/15 px-2 py-0.5 text-[9px] font-bold text-[color:var(--status-watch)]">
            SANDBOX
          </span>
          <h3 className="text-[13px] font-semibold text-foreground">Simulate incoming message</h3>
        </div>
        <div className="space-y-2">
          <input value={simPhone} onChange={e => onPhoneChange(e.target.value)} placeholder="Phone" className={inputClass} />
          <input value={simName} onChange={e => onNameChange(e.target.value)} placeholder="Contact name" className={inputClass} />
          <textarea
            value={simContent}
            onChange={e => onContentChange(e.target.value)}
            rows={3}
            placeholder="Message content"
            className={`${inputClass} resize-none`}
          />
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="sq-press rounded-lg px-3 py-2 text-[11px] font-medium text-muted-foreground">
            Cancel
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={!simPhone.trim() || !simContent.trim()}
            className="sq-press rounded-lg bg-[color:var(--brand)] px-3 py-2 text-[11px] font-semibold text-white disabled:opacity-40"
          >
            Simulate
          </button>
        </div>
      </div>
    </div>
  );
}

function TemplateDraftModal({
  name,
  body,
  category,
  onNameChange,
  onBodyChange,
  onCategoryChange,
  onClose,
  onSubmit,
}: {
  name: string;
  body: string;
  category: WhatsAppTemplateCategory;
  onNameChange: (v: string) => void;
  onBodyChange: (v: string) => void;
  onCategoryChange: (v: WhatsAppTemplateCategory) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const inputClass =
    'w-full rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-[11px] outline-none';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 overlay-scrim" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-2xl bg-card p-5 shadow-[var(--shadow-2)]">
        <h3 className="text-[13px] font-semibold text-foreground">New template draft</h3>
        <div className="mt-3 space-y-2">
          <input value={name} onChange={e => onNameChange(e.target.value)} placeholder="Template name" className={inputClass} />
          <select value={category} onChange={e => onCategoryChange(e.target.value as WhatsAppTemplateCategory)} className={inputClass}>
            <option value="BOOKING_CONFIRMATION">Booking confirmation</option>
            <option value="PICKUP_REMINDER">Pickup reminder</option>
            <option value="RETURN_REMINDER">Return reminder</option>
            <option value="MISSING_DOCUMENTS">Missing documents</option>
            <option value="PAYMENT_REMINDER">Payment reminder</option>
            <option value="DEPOSIT_REMINDER">Deposit reminder</option>
            <option value="DAMAGE_FOLLOWUP">Damage follow-up</option>
            <option value="HANDOVER_LINK">Handover link</option>
            <option value="RETURN_LINK">Return link</option>
            <option value="SUPPORT_UPDATE">Support update</option>
            <option value="VEHICLE_READY">Vehicle ready</option>
          </select>
          <textarea value={body} onChange={e => onBodyChange(e.target.value)} rows={4} placeholder="Body with {{variables}}" className={`${inputClass} resize-none font-mono`} />
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="sq-press rounded-lg px-3 py-2 text-[11px] text-muted-foreground">
            Cancel
          </button>
          <button type="button" onClick={onSubmit} className="sq-press rounded-lg bg-[color:var(--brand)] px-3 py-2 text-[11px] font-semibold text-white">
            Create draft
          </button>
        </div>
      </div>
    </div>
  );
}
