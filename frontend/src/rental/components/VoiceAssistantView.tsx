import { AlertTriangle, ArrowUpRight, BarChart3, Clock, FileText, HelpCircle, MessageSquare, Phone, PhoneCall, PhoneIncoming, PhoneOff, PhoneOutgoing, Play, Settings, Shield, UserCheck, Zap, type LucideIcon } from 'lucide-react';
import { Icon } from './ui/Icon';
import { useState, useEffect, useCallback } from 'react';

import { useRentalOrg } from '../RentalContext';
import { api } from '../../lib/api';
import type { VoiceAssistantData, VoiceAssistantReadiness, VoiceOption, VoiceConversationEntry } from '../../lib/api';

interface Props { isDarkMode: boolean; }

type Tab = 'overview' | 'config' | 'permissions' | 'escalation' | 'telephony' | 'test' | 'analytics' | 'logs';

const SECTION_OPTIONS: { key: Tab; label: string; desc: string; icon: LucideIcon; tone: string }[] = [
  { key: 'overview', label: 'Overview', desc: 'Status, readiness and assistant setup', icon: BarChart3, tone: 'sq-tone-brand' },
  { key: 'config', label: 'Configuration', desc: 'Voice, language, prompts and context', icon: Settings, tone: 'sq-tone-neutral' },
  { key: 'permissions', label: 'Permissions', desc: 'Allowed actions and responsibilities', icon: Shield, tone: 'sq-tone-success' },
  { key: 'escalation', label: 'Escalation', desc: 'Handover rules, triggers and hours', icon: ArrowUpRight, tone: 'sq-tone-warning' },
  { key: 'telephony', label: 'Telephony', desc: 'Phone number and call routing', icon: Phone, tone: 'sq-tone-brand' },
  { key: 'test', label: 'Test', desc: 'Run an ElevenLabs test session', icon: Play, tone: 'sq-tone-neutral' },
  { key: 'analytics', label: 'Analytics', desc: 'Call volume and talk time metrics', icon: BarChart3, tone: 'sq-tone-success' },
  { key: 'logs', label: 'Conversations', desc: 'Synced conversation history', icon: FileText, tone: 'sq-tone-neutral' },
];

export function VoiceAssistantView({ isDarkMode }: Props) {
  const { orgId } = useRentalOrg();
  const [tab, setTab] = useState<Tab>('overview');
  const [assistant, setAssistant] = useState<VoiceAssistantData | null>(null);
  const [readiness, setReadiness] = useState<VoiceAssistantReadiness | null>(null);
  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const [conversations, setConversations] = useState<VoiceConversationEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<Partial<VoiceAssistantData>>({});
  const [testUrl, setTestUrl] = useState<string | null>(null);
  const [testLoading, setTestLoading] = useState(false);

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const [a, r] = await Promise.all([
        api.voiceAssistant.get(orgId),
        api.voiceAssistant.readiness(orgId),
      ]);
      setAssistant(a);
      setReadiness(r);
      setDraft({});
    } catch { /* empty */ }
    setLoading(false);
  }, [orgId]);

  useEffect(() => { load(); }, [load]);

  const loadVoices = useCallback(async () => {
    if (!orgId || voices.length > 0) return;
    try { const v = await api.voiceAssistant.voices(orgId); setVoices(v); } catch { /* empty */ }
  }, [orgId, voices.length]);

  const loadConversations = useCallback(async () => {
    if (!orgId) return;
    try { const c = await api.voiceAssistant.conversations(orgId, 50); setConversations(c); } catch { /* empty */ }
  }, [orgId]);

  useEffect(() => { if (tab === 'config') loadVoices(); }, [tab, loadVoices]);
  useEffect(() => { if (tab === 'logs') loadConversations(); }, [tab, loadConversations]);

  const save = async (patch?: Partial<VoiceAssistantData>) => {
    if (!orgId) return;
    setSaving(true);
    try {
      const data = patch ?? draft;
      const updated = await api.voiceAssistant.update(orgId, data);
      setAssistant(updated);
      setDraft({});
      const r = await api.voiceAssistant.readiness(orgId);
      setReadiness(r);
    } catch { /* empty */ }
    setSaving(false);
  };

  const toggleActive = async () => {
    if (!orgId || !assistant) return;
    setSaving(true);
    try {
      if (assistant.status === 'ACTIVE') {
        const updated = await api.voiceAssistant.deactivate(orgId);
        setAssistant(updated);
      } else {
        const updated = await api.voiceAssistant.activate(orgId);
        setAssistant(updated);
      }
      const r = await api.voiceAssistant.readiness(orgId);
      setReadiness(r);
    } catch { /* empty */ }
    setSaving(false);
  };

  const startTest = async () => {
    if (!orgId) return;
    setTestLoading(true);
    try {
      const res = await api.voiceAssistant.testSession(orgId);
      setTestUrl(res.signedUrl);
    } catch { /* empty */ }
    setTestLoading(false);
  };

  const syncLogs = async () => {
    if (!orgId) return;
    setSaving(true);
    try {
      await api.voiceAssistant.syncConversations(orgId);
      await loadConversations();
    } catch { /* empty */ }
    setSaving(false);
  };

  const d = (key: keyof VoiceAssistantData) => (draft as any)[key] ?? (assistant as any)?.[key] ?? '';
  const setD = (key: string, value: any) => setDraft(prev => ({ ...prev, [key]: value }));
  const hasDraft = Object.keys(draft).length > 0;

  const card = 'sq-card rounded-2xl shadow-[var(--shadow-1)]';
  const inputCls = `w-full px-3 py-2 rounded-lg text-xs outline-none transition-colors ${
    isDarkMode
      ? 'bg-neutral-800 border border-neutral-700 text-gray-200 focus:border-purple-500/50'
      : 'bg-gray-50 border border-gray-200 text-gray-800 focus:border-purple-400'
  }`;
  const textareaCls = `${inputCls} resize-none`;
  const labelCls = `block text-[11px] font-semibold mb-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`;

  const isActive = assistant?.status === 'ACTIVE';
  const statusLabel = isActive ? 'Active' : assistant?.status === 'INACTIVE' ? 'Inactive' : 'Draft';
  const activeSection = SECTION_OPTIONS.find(section => section.key === tab) ?? SECTION_OPTIONS[0];
  const ActiveSectionIcon = activeSection.icon;
  const readyChecks = readiness?.checks.filter(check => check.ok).length ?? 0;
  const totalChecks = readiness?.checks.length ?? 0;
  const avgDurationSeconds = assistant && assistant.answeredCalls > 0
    ? Math.round((assistant.totalTalkMinutes / assistant.answeredCalls) * 60)
    : 0;

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

  return (
    <div className="max-w-[1600px] mx-auto space-y-5">
      {/* Header */}
      <div className="flex min-h-8 flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[18px] leading-[1.12] font-bold tracking-[-0.02em] text-foreground">
            AI Voice Assistant
          </h1>
          <p className="mt-1 text-[10px] font-medium text-muted-foreground">
            Powered by ElevenLabs Conversational AI
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`flex items-center gap-2 rounded-xl px-3 py-2 text-[10px] font-semibold ${
            isActive
              ? 'sq-tone-success'
              : assistant?.status === 'INACTIVE'
                ? 'sq-tone-critical'
                : 'sq-tone-warning'
          }`}>
            <span className={`h-2 w-2 rounded-full ${isActive ? 'bg-emerald-500 animate-pulse' : assistant?.status === 'INACTIVE' ? 'bg-red-500' : 'bg-amber-500'}`} />
            {statusLabel}
          </span>
          <button
            type="button"
            onClick={toggleActive}
            disabled={saving}
            className={`sq-press flex items-center gap-2 rounded-xl border px-3 py-2 text-[10px] font-semibold transition-all disabled:opacity-60 ${
              isActive
                ? isDarkMode ? 'bg-red-900/30 border-red-700/50 text-red-400 hover:bg-red-900/50' : 'bg-red-50 border-red-200 text-red-600 hover:bg-red-100'
                : isDarkMode ? 'bg-emerald-900/30 border-emerald-700/50 text-emerald-400 hover:bg-emerald-900/50' : 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'
            }`}
          >
            {saving ? <Icon name="loader-2" className="h-4 w-4 animate-spin" /> : isActive ? <Icon name="power-off" className="h-4 w-4" /> : <Icon name="power" className="h-4 w-4" />}
            {isActive ? 'Deactivate' : 'Activate'}
          </button>
        </div>
      </div>

      {/* Segment metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        {[
          {
            label: 'Status',
            value: statusLabel,
            helper: assistant?.elevenLabsAgentId ? 'agent provisioned' : 'agent not provisioned',
            icon: Zap,
            tone: isActive ? 'sq-tone-success' : assistant?.status === 'INACTIVE' ? 'sq-tone-critical' : 'sq-tone-warning',
            action: () => setTab('overview'),
            active: tab === 'overview',
          },
          {
            label: 'Total Calls',
            value: assistant?.totalCalls ?? 0,
            helper: `${assistant?.answeredCalls ?? 0} answered`,
            icon: PhoneCall,
            tone: 'sq-tone-brand',
            action: () => setTab('analytics'),
            active: tab === 'analytics',
          },
          {
            label: 'Readiness',
            value: `${readyChecks}/${totalChecks || 0}`,
            helper: readiness?.ready ? 'ready to activate' : 'configuration needed',
            icon: Shield,
            tone: readiness?.ready ? 'sq-tone-success' : 'sq-tone-warning',
            action: () => setTab('overview'),
            active: false,
          },
          {
            label: 'Avg Duration',
            value: `${avgDurationSeconds}s`,
            helper: `${(assistant?.totalTalkMinutes ?? 0).toFixed(1)} talk minutes`,
            icon: Clock,
            tone: 'sq-tone-neutral',
            action: () => setTab('analytics'),
            active: false,
          },
        ].map(metric => {
          const MetricIcon = metric.icon;
          return (
            <button
              key={metric.label}
              type="button"
              onClick={metric.action}
              className={`group sq-card sq-press rounded-2xl p-4 text-left shadow-[var(--shadow-1)] transition-all ${
                metric.active ? 'ring-1 ring-[color:color-mix(in_srgb,var(--brand)_22%,transparent)]' : 'hover:bg-muted/35'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold text-muted-foreground">{metric.label}</p>
                  <p className="mt-1 truncate text-[20px] font-bold leading-none tracking-[-0.03em] text-foreground tabular-nums">
                    {metric.value}
                  </p>
                  <p className="mt-2 truncate text-[10px] font-medium text-muted-foreground">{metric.helper}</p>
                </div>
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${metric.tone}`}>
                  <MetricIcon className="h-4 w-4" />
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Workspace selector */}
      <div className="sq-card rounded-2xl p-4 shadow-[var(--shadow-1)]">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${activeSection.tone}`}>
              <ActiveSectionIcon className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <h2 className="text-[12px] font-semibold tracking-[-0.003em] text-foreground">Workspace</h2>
              <p className="mt-0.5 text-[10px] text-muted-foreground">{activeSection.desc}</p>
            </div>
          </div>
          <span className="rounded-full px-2 py-1 text-[10px] font-semibold sq-tone-brand">
            {activeSection.label} active
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[260px] flex-1">
            <select
              value={tab}
              onChange={event => setTab(event.target.value as Tab)}
              className={`w-full appearance-none rounded-lg border py-2.5 pl-3.5 pr-10 text-xs font-medium outline-none transition-all ${
                isDarkMode
                  ? 'bg-neutral-800 border-neutral-700 text-gray-200 focus:border-blue-500/50'
                  : 'bg-white border-gray-200 text-gray-900 focus:border-blue-300'
              }`}
            >
              {SECTION_OPTIONS.map(section => (
                <option key={section.key} value={section.key}>{section.label}</option>
              ))}
            </select>
            <Icon name="chevron-down" className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {SECTION_OPTIONS.slice(0, 4).map(section => {
              const SectionIcon = section.icon;
              const selected = tab === section.key;
              return (
                <button
                  key={section.key}
                  type="button"
                  onClick={() => setTab(section.key)}
                  className={`sq-press flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-[10px] font-semibold transition-all ${
                    selected
                      ? isDarkMode ? 'bg-blue-900/30 border-blue-700/50 text-blue-400' : 'bg-blue-50 border-blue-200 text-blue-700'
                      : isDarkMode ? 'bg-neutral-800 border-neutral-700 text-gray-300 hover:bg-neutral-800' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <SectionIcon className="h-3.5 w-3.5" />
                  {section.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Tab Content */}
      {tab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Stats */}
          <div className={`${card} p-4 space-y-3`}>
            <h3 className={`text-xs font-bold uppercase tracking-wider ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>Usage</h3>
            <div className="space-y-2">
              {[
                { label: 'Total Calls', value: assistant?.totalCalls ?? 0, icon: PhoneCall },
                { label: 'Answered', value: assistant?.answeredCalls ?? 0, icon: PhoneIncoming },
                { label: 'Missed', value: assistant?.missedCalls ?? 0, icon: PhoneOff },
                { label: 'Escalated', value: assistant?.escalatedCalls ?? 0, icon: ArrowUpRight },
                { label: 'Talk Minutes', value: (assistant?.totalTalkMinutes ?? 0).toFixed(1), icon: Clock },
              ].map(s => (
                <div key={s.label} className={`flex items-center justify-between p-2 rounded-lg ${isDarkMode ? 'bg-neutral-900/50' : 'bg-gray-50/80'}`}>
                  <div className="flex items-center gap-2">
                    <s.icon className={`w-3.5 h-3.5 ${isDarkMode ? 'text-purple-400' : 'text-purple-500'}`} />
                    <span className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{s.label}</span>
                  </div>
                  <span className={`text-sm font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{s.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Readiness */}
          <div className={`${card} p-4 space-y-3`}>
            <h3 className={`text-xs font-bold uppercase tracking-wider ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>Readiness</h3>
            <div className="space-y-1.5">
              {readiness?.checks.map(c => (
                <div key={c.key} className={`flex items-center gap-2 p-2 rounded-lg ${isDarkMode ? 'bg-neutral-900/50' : 'bg-gray-50/80'}`}>
                  {c.ok ? <Icon name="check-circle-2" className="w-3.5 h-3.5 text-emerald-500" /> : <Icon name="x-circle" className="w-3.5 h-3.5 text-red-400" />}
                  <span className={`text-xs ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>{c.label}</span>
                </div>
              ))}
            </div>
            {readiness && (
              <div className={`mt-2 p-2 rounded-lg text-xs font-semibold text-center ${
                readiness.ready
                  ? isDarkMode ? 'bg-emerald-500/10 text-emerald-400' : 'bg-emerald-50 text-emerald-600'
                  : isDarkMode ? 'bg-amber-500/10 text-amber-400' : 'bg-amber-50 text-amber-600'
              }`}>
                {readiness.ready ? 'Ready to activate' : 'Configuration incomplete'}
              </div>
            )}
          </div>

          {/* Quick Info */}
          <div className={`${card} p-4 space-y-3`}>
            <h3 className={`text-xs font-bold uppercase tracking-wider ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>Assistant</h3>
            <div className="space-y-2">
              {[
                { label: 'Name', value: assistant?.name ?? '—' },
                { label: 'Voice', value: assistant?.voiceName ?? 'Not set' },
                { label: 'Language', value: assistant?.language ?? '—' },
                { label: 'Phone', value: assistant?.phoneNumber ?? 'Not connected' },
                { label: 'ElevenLabs Agent', value: assistant?.elevenLabsAgentId ? 'Provisioned' : 'Not created' },
              ].map(i => (
                <div key={i.label} className={`flex items-center justify-between p-2 rounded-lg ${isDarkMode ? 'bg-neutral-900/50' : 'bg-gray-50/80'}`}>
                  <span className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>{i.label}</span>
                  <span className={`text-xs font-semibold ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>{i.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === 'config' && (
        <div className={`${card} p-5 space-y-5`}>
          <div className="flex items-center justify-between">
            <h3 className={`text-sm font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Assistant Configuration</h3>
            {hasDraft && (
              <button onClick={() => save()} disabled={saving} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold ${isDarkMode ? 'bg-purple-500/20 text-purple-300 hover:bg-purple-500/30' : 'bg-purple-50 text-purple-700 hover:bg-purple-100'}`}>
                {saving ? <Icon name="loader-2" className="w-3 h-3 animate-spin" /> : <Icon name="save" className="w-3 h-3" />} Save Changes
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Assistant Name</label>
              <input className={inputCls} value={d('name')} onChange={e => setD('name', e.target.value)} placeholder="My Assistant" />
            </div>
            <div>
              <label className={labelCls}>Role / Purpose</label>
              <input className={inputCls} value={d('role')} onChange={e => setD('role', e.target.value)} placeholder="Customer service, booking help..." />
            </div>
            <div>
              <label className={labelCls}>Personality</label>
              <input className={inputCls} value={d('personality')} onChange={e => setD('personality', e.target.value)} placeholder="Friendly, professional..." />
            </div>
            <div>
              <label className={labelCls}>Language</label>
              <select className={inputCls} value={d('language')} onChange={e => setD('language', e.target.value)}>
                <option value="en">English</option>
                <option value="de">German</option>
                <option value="fr">French</option>
                <option value="es">Spanish</option>
                <option value="it">Italian</option>
                <option value="pt">Portuguese</option>
                <option value="nl">Dutch</option>
                <option value="tr">Turkish</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Voice</label>
              {voices.length === 0 ? (
                <button onClick={loadVoices} className={`${inputCls} text-left`}>
                  {d('voiceName') || 'Click to load voices...'}
                </button>
              ) : (
                <select className={inputCls} value={d('voiceId')} onChange={e => {
                  const v = voices.find(v => v.voice_id === e.target.value);
                  setD('voiceId', e.target.value);
                  if (v) setD('voiceName', v.name);
                }}>
                  <option value="">Select a voice</option>
                  {voices.map(v => <option key={v.voice_id} value={v.voice_id}>{v.name}{v.category ? ` (${v.category})` : ''}</option>)}
                </select>
              )}
            </div>
            <div>
              <label className={labelCls}>Greeting Message</label>
              <input className={inputCls} value={d('greetingMessage')} onChange={e => setD('greetingMessage', e.target.value)} placeholder="Hello! How can I help you today?" />
            </div>
          </div>

          <div>
            <label className={labelCls}>System Prompt</label>
            <textarea className={textareaCls} rows={5} value={d('systemPrompt')} onChange={e => setD('systemPrompt', e.target.value)}
              placeholder="You are a helpful AI assistant for a vehicle rental company..." />
          </div>
          <div>
            <label className={labelCls}>Company Context</label>
            <textarea className={textareaCls} rows={3} value={d('companyContext')} onChange={e => setD('companyContext', e.target.value)}
              placeholder="Company background, services, locations..." />
          </div>
          <div>
            <label className={labelCls}>Business Rules</label>
            <textarea className={textareaCls} rows={3} value={d('businessRules')} onChange={e => setD('businessRules', e.target.value)}
              placeholder="Booking policies, cancellation rules, pricing info..." />
          </div>
          <div>
            <label className={labelCls}>Forbidden Actions</label>
            <textarea className={textareaCls} rows={2} value={d('forbiddenActions')} onChange={e => setD('forbiddenActions', e.target.value)}
              placeholder="Never share customer data, never make promises about pricing..." />
          </div>
          <div>
            <label className={labelCls}>Knowledge Snippets / FAQ</label>
            <textarea className={textareaCls} rows={3} value={d('knowledgeSnippets')} onChange={e => setD('knowledgeSnippets', e.target.value)}
              placeholder="Common Q&A, specific knowledge..." />
          </div>
        </div>
      )}

      {tab === 'permissions' && (
        <div className={`${card} p-5 space-y-4`}>
          <div className="flex items-center justify-between">
            <h3 className={`text-sm font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Permissions & Responsibilities</h3>
            {hasDraft && (
              <button onClick={() => save()} disabled={saving} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold ${isDarkMode ? 'bg-purple-500/20 text-purple-300 hover:bg-purple-500/30' : 'bg-purple-50 text-purple-700 hover:bg-purple-100'}`}>
                {saving ? <Icon name="loader-2" className="w-3 h-3 animate-spin" /> : <Icon name="save" className="w-3 h-3" />} Save
              </button>
            )}
          </div>
          <p className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>Control what the assistant is allowed to do during conversations.</p>
          <div className="space-y-2">
            {([
              { key: 'permAnswerQuestions', label: 'Answer Questions', desc: 'General question answering about the business', icon: HelpCircle },
              { key: 'permManageBookings', label: 'Manage Bookings', desc: 'Create, modify, or cancel bookings', icon: MessageSquare },
              { key: 'permWorkshopHandling', label: 'Workshop Handling', desc: 'Process workshop and maintenance requests', icon: Settings },
              { key: 'permBreakdownSupport', label: 'Breakdown Support', desc: 'Handle roadside assistance and breakdowns', icon: AlertTriangle },
              { key: 'permContactCustomers', label: 'Contact Customers', desc: 'Initiate contact with customers', icon: UserCheck },
              { key: 'permContactVendors', label: 'Contact Vendors', desc: 'Reach out to vendors and partners', icon: PhoneOutgoing },
              { key: 'permCreateActions', label: 'Create/Update Records', desc: 'Create tasks, update records, delete items', icon: Zap },
            ] as const).map(p => (
              <label key={p.key} className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${isDarkMode ? 'hover:bg-neutral-800' : 'hover:bg-gray-50'}`}>
                <input type="checkbox" checked={d(p.key) as boolean} onChange={e => setD(p.key, e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500" />
                <p.icon className={`w-4 h-4 ${isDarkMode ? 'text-purple-400' : 'text-purple-500'}`} />
                <div>
                  <div className={`text-xs font-semibold ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}>{p.label}</div>
                  <div className={`text-[10px] ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>{p.desc}</div>
                </div>
              </label>
            ))}
          </div>
        </div>
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
              <input className={inputCls} value={d('escalationPhone')} onChange={e => setD('escalationPhone', e.target.value)} placeholder="+49 123 456789" />
            </div>
            <div>
              <label className={labelCls}>Escalation Department</label>
              <input className={inputCls} value={d('escalationDepartment')} onChange={e => setD('escalationDepartment', e.target.value)} placeholder="Support, Sales..." />
            </div>
          </div>

          <div>
            <label className={labelCls}>Fallback Message (when no agent available)</label>
            <input className={inputCls} value={d('fallbackMessage')} onChange={e => setD('fallbackMessage', e.target.value)}
              placeholder="We're sorry, all agents are busy. Please call back later." />
          </div>

          <h4 className={`text-xs font-bold mt-4 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Escalation Triggers</h4>
          <div className="space-y-2">
            {([
              { key: 'escalateOnRequest', label: 'Caller requests a human agent', desc: 'Transfer when caller explicitly asks for a human' },
              { key: 'escalateOnLowConf', label: 'Low confidence answer', desc: 'Transfer when assistant is unsure about the answer' },
              { key: 'escalateOnSensitive', label: 'Sensitive topic detected', desc: 'Transfer for legal, complaint, or accident topics' },
            ] as const).map(t => (
              <label key={t.key} className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${isDarkMode ? 'hover:bg-neutral-800' : 'hover:bg-gray-50'}`}>
                <input type="checkbox" checked={d(t.key) as boolean} onChange={e => setD(t.key, e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500" />
                <div>
                  <div className={`text-xs font-semibold ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}>{t.label}</div>
                  <div className={`text-[10px] ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>{t.desc}</div>
                </div>
              </label>
            ))}
          </div>

          <h4 className={`text-xs font-bold mt-4 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Business Hours</h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className={labelCls}>Start</label>
              <input type="time" className={inputCls} value={d('businessHoursStart')} onChange={e => setD('businessHoursStart', e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>End</label>
              <input type="time" className={inputCls} value={d('businessHoursEnd')} onChange={e => setD('businessHoursEnd', e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Timezone</label>
              <input className={inputCls} value={d('businessHoursTimezone')} onChange={e => setD('businessHoursTimezone', e.target.value)} placeholder="Europe/Berlin" />
            </div>
          </div>
          <div>
            <label className={labelCls}>After-Hours Message</label>
            <input className={inputCls} value={d('afterHoursMessage')} onChange={e => setD('afterHoursMessage', e.target.value)}
              placeholder="Our office is currently closed. Please call back during business hours." />
          </div>
        </div>
      )}

      {tab === 'telephony' && (
        <div className={`${card} p-5 space-y-4`}>
          <h3 className={`text-sm font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Telephony</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className={`p-4 rounded-xl ${isDarkMode ? 'bg-neutral-900/50' : 'bg-gray-50/80'}`}>
              <div className="flex items-center gap-2 mb-3">
                <Icon name="phone" className={`w-4 h-4 ${isDarkMode ? 'text-purple-400' : 'text-purple-500'}`} />
                <span className={`text-xs font-bold ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>Phone Number</span>
              </div>
              <p className={`text-lg font-bold mb-1 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                {assistant?.phoneNumber || 'Not assigned'}
              </p>
              <p className={`text-[10px] ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                {assistant?.phoneNumberId ? `ID: ${assistant.phoneNumberId}` : 'Configure in ElevenLabs dashboard'}
              </p>
            </div>
            <div className={`p-4 rounded-xl ${isDarkMode ? 'bg-neutral-900/50' : 'bg-gray-50/80'}`}>
              <div className="flex items-center gap-2 mb-3">
                <Icon name="zap" className={`w-4 h-4 ${isDarkMode ? 'text-purple-400' : 'text-purple-500'}`} />
                <span className={`text-xs font-bold ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>Connection Status</span>
              </div>
              <p className={`text-lg font-bold mb-1 ${assistant?.elevenLabsAgentId ? 'text-emerald-500' : isDarkMode ? 'text-amber-400' : 'text-amber-500'}`}>
                {assistant?.elevenLabsAgentId ? 'Connected' : 'Not Provisioned'}
              </p>
              <p className={`text-[10px] ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                {assistant?.elevenLabsAgentId ? `Agent: ${assistant.elevenLabsAgentId.slice(0, 12)}...` : 'Activate assistant to provision'}
              </p>
            </div>
          </div>
          <div className="space-y-2">
            {([
              { key: 'telephonyEnabled', label: 'Telephony Enabled', desc: 'Allow phone calls to/from this assistant' },
              { key: 'inboundEnabled', label: 'Inbound Calls', desc: 'Accept incoming calls' },
              { key: 'outboundEnabled', label: 'Outbound Calls', desc: 'Allow assistant to make outgoing calls' },
            ] as const).map(t => (
              <label key={t.key} className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${isDarkMode ? 'hover:bg-neutral-800' : 'hover:bg-gray-50'}`}>
                <input type="checkbox" checked={d(t.key) as boolean}
                  onChange={e => { setD(t.key, e.target.checked); save({ [t.key]: e.target.checked }); }}
                  className="w-4 h-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500" />
                <div>
                  <div className={`text-xs font-semibold ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}>{t.label}</div>
                  <div className={`text-[10px] ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>{t.desc}</div>
                </div>
              </label>
            ))}
          </div>
        </div>
      )}

      {tab === 'test' && (
        <div className={`${card} p-5 space-y-4`}>
          <h3 className={`text-sm font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Test Your Assistant</h3>
          {!assistant?.elevenLabsAgentId ? (
            <div className={`p-6 rounded-xl text-center ${isDarkMode ? 'bg-neutral-900/50' : 'bg-gray-50/80'}`}>
              <Icon name="bot" className={`w-10 h-10 mx-auto mb-3 ${isDarkMode ? 'text-gray-600' : 'text-gray-300'}`} />
              <p className={`text-xs font-semibold mb-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Agent Not Provisioned</p>
              <p className={`text-[10px] ${isDarkMode ? 'text-gray-600' : 'text-gray-400'}`}>Activate the assistant first to enable testing.</p>
            </div>
          ) : (
            <>
              <div className={`p-4 rounded-xl ${isDarkMode ? 'bg-neutral-900/50' : 'bg-gray-50/80'}`}>
                <p className={`text-xs mb-3 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  Start a test conversation with your AI assistant. This uses ElevenLabs&apos; WebSocket-based conversational AI.
                </p>
                <button
                  onClick={startTest}
                  disabled={testLoading}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold transition-all ${
                    isDarkMode ? 'bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/20' : 'bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200'
                  }`}
                >
                  {testLoading ? <Icon name="loader-2" className="w-4 h-4 animate-spin" /> : <Icon name="mic" className="w-4 h-4" />}
                  Start Test Session
                </button>
              </div>
              {testUrl && (
                <div className={`p-4 rounded-xl ${isDarkMode ? 'bg-emerald-500/10 border border-emerald-500/20' : 'bg-emerald-50 border border-emerald-200'}`}>
                  <p className={`text-xs font-semibold mb-2 ${isDarkMode ? 'text-emerald-400' : 'text-emerald-600'}`}>Test Session Ready</p>
                  <p className={`text-[10px] mb-2 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                    A signed WebSocket URL has been generated. Use the ElevenLabs widget or SDK to connect:
                  </p>
                  <code className={`block text-[10px] p-2 rounded break-all ${isDarkMode ? 'bg-neutral-900 text-gray-300' : 'bg-white text-gray-600'}`}>
                    {testUrl.slice(0, 80)}...
                  </code>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {tab === 'analytics' && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          {[
            { label: 'Total Calls', value: assistant?.totalCalls ?? 0, icon: PhoneCall, tone: 'sq-tone-brand' },
            { label: 'Answered', value: assistant?.answeredCalls ?? 0, icon: PhoneIncoming, tone: 'sq-tone-success' },
            { label: 'Missed', value: assistant?.missedCalls ?? 0, icon: PhoneOff, tone: (assistant?.missedCalls ?? 0) > 0 ? 'sq-tone-critical' : 'sq-tone-neutral' },
            { label: 'Escalated', value: assistant?.escalatedCalls ?? 0, icon: ArrowUpRight, tone: (assistant?.escalatedCalls ?? 0) > 0 ? 'sq-tone-warning' : 'sq-tone-neutral' },
          ].map(m => (
            <div key={m.label} className={`${card} p-4`}>
              <div className="mb-2 flex items-center gap-2">
                <span className={`flex h-8 w-8 items-center justify-center rounded-xl ${m.tone}`}>
                  <m.icon className="h-4 w-4" />
                </span>
                <span className="text-[10px] font-semibold text-muted-foreground">{m.label}</span>
              </div>
              <p className="text-2xl font-bold text-foreground tabular-nums">{m.value}</p>
            </div>
          ))}
          <div className={`${card} p-4 col-span-2`}>
            <div className="flex items-center gap-2 mb-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl sq-tone-brand">
                <Icon name="clock" className="h-4 w-4" />
              </span>
              <span className="text-[10px] font-semibold text-muted-foreground">Total Talk Time</span>
            </div>
            <p className="text-2xl font-bold text-foreground tabular-nums">{(assistant?.totalTalkMinutes ?? 0).toFixed(1)} min</p>
          </div>
          <div className={`${card} p-4 col-span-2`}>
            <div className="flex items-center gap-2 mb-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl sq-tone-neutral">
                <Icon name="bar-chart-3" className="h-4 w-4" />
              </span>
              <span className="text-[10px] font-semibold text-muted-foreground">Avg Duration</span>
            </div>
            <p className="text-2xl font-bold text-foreground tabular-nums">
              {assistant && assistant.answeredCalls > 0 ? ((assistant.totalTalkMinutes / assistant.answeredCalls) * 60).toFixed(0) : '0'}s
            </p>
          </div>
        </div>
      )}

      {tab === 'logs' && (
        <div className={`${card} p-5 space-y-4`}>
          <div className="flex items-center justify-between">
            <h3 className={`text-sm font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Conversation Logs</h3>
            <button onClick={syncLogs} disabled={saving} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold ${isDarkMode ? 'bg-neutral-800 text-gray-300 hover:bg-neutral-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {saving ? <Icon name="loader-2" className="w-3 h-3 animate-spin" /> : <Icon name="refresh-cw" className="w-3 h-3" />} Sync from ElevenLabs
            </button>
          </div>
          {conversations.length === 0 ? (
            <div className={`p-8 rounded-xl text-center ${isDarkMode ? 'bg-neutral-900/50' : 'bg-gray-50/80'}`}>
              <Icon name="file-text" className={`w-8 h-8 mx-auto mb-2 ${isDarkMode ? 'text-gray-600' : 'text-gray-300'}`} />
              <p className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>No conversations yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {conversations.map(c => (
                <div key={c.id} className={`p-3 rounded-lg ${isDarkMode ? 'bg-neutral-900/50 hover:bg-neutral-800' : 'bg-gray-50/80 hover:bg-gray-100/80'} transition-colors`}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      {c.direction === 'inbound' ? <Icon name="phone-incoming" className="w-3 h-3 text-emerald-500" /> : <Icon name="phone-outgoing" className="w-3 h-3 text-blue-500" />}
                      <span className={`text-xs font-semibold ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}>
                        {c.callerNumber || 'Unknown Caller'}
                      </span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                        c.outcome === 'RESOLVED' ? isDarkMode ? 'bg-emerald-500/15 text-emerald-400' : 'bg-emerald-50 text-emerald-600'
                        : c.outcome === 'ESCALATED' ? isDarkMode ? 'bg-amber-500/15 text-amber-400' : 'bg-amber-50 text-amber-600'
                        : isDarkMode ? 'bg-red-500/15 text-red-400' : 'bg-red-50 text-red-600'
                      }`}>{c.outcome}</span>
                    </div>
                    <span className={`text-[10px] ${isDarkMode ? 'text-gray-600' : 'text-gray-400'}`}>
                      {new Date(c.startedAt).toLocaleString()} · {c.durationSeconds ? `${c.durationSeconds}s` : '—'}
                    </span>
                  </div>
                  {c.summary && <p className={`text-[10px] ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>{c.summary}</p>}
                  {c.transcript && (
                    <details className="mt-1">
                      <summary className={`text-[10px] font-semibold cursor-pointer ${isDarkMode ? 'text-purple-400' : 'text-purple-500'}`}>View Transcript</summary>
                      <pre className={`mt-1 text-[10px] p-2 rounded whitespace-pre-wrap max-h-40 overflow-y-auto ${isDarkMode ? 'bg-neutral-800 text-gray-300' : 'bg-gray-100 text-gray-600'}`}>{c.transcript}</pre>
                    </details>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
