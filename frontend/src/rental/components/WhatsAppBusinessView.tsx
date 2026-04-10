import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Phone, Wifi, WifiOff, Bot, Shield, MessageSquare, Send, Sparkles,
  Settings, CheckCircle2, AlertCircle, Clock, User, Users, ChevronRight,
  ToggleLeft, ToggleRight, RefreshCw, ArrowLeft, Loader2, Search,
  Zap, FileText, Headphones, ShoppingCart, Truck, Eye, PenLine,
  MessageCircle, Hash, TrendingUp, X, Plus, ChevronDown,
} from 'lucide-react';
import { useRentalOrg } from '../RentalContext';
import { api } from '../../lib/api';
import type { WhatsAppConfig, WhatsAppConversation, WhatsAppMsg, WhatsAppStats } from '../../lib/api';

interface WhatsAppBusinessViewProps {
  isDarkMode: boolean;
}

type Tab = 'overview' | 'conversations' | 'settings';

const AI_MODE_LABELS: Record<string, { label: string; description: string; icon: any; color: string }> = {
  OFF: { label: 'AI Off', description: 'No AI involvement in messaging', icon: Eye, color: 'gray' },
  SUGGEST_ONLY: { label: 'Suggest Only', description: 'AI suggests replies for human review', icon: PenLine, color: 'blue' },
  AUTO_SIMPLE: { label: 'Auto Simple', description: 'AI sends simple replies automatically', icon: Bot, color: 'amber' },
  FULL: { label: 'Full Autonomy', description: 'AI handles conversations with full capability', icon: Sparkles, color: 'emerald' },
};

export function WhatsAppBusinessView({ isDarkMode }: WhatsAppBusinessViewProps) {
  const { orgId } = useRentalOrg();
  const [tab, setTab] = useState<Tab>('overview');
  const [config, setConfig] = useState<WhatsAppConfig | null>(null);
  const [stats, setStats] = useState<WhatsAppStats | null>(null);
  const [conversations, setConversations] = useState<WhatsAppConversation[]>([]);
  const [selectedConvo, setSelectedConvo] = useState<WhatsAppConversation | null>(null);
  const [messages, setMessages] = useState<WhatsAppMsg[]>([]);
  const [loading, setLoading] = useState(true);
  const [msgLoading, setMsgLoading] = useState(false);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [connectModal, setConnectModal] = useState(false);
  const [connectPhone, setConnectPhone] = useState('');
  const [connectName, setConnectName] = useState('');
  const [simModal, setSimModal] = useState(false);
  const [simPhone, setSimPhone] = useState('+49 170 1234567');
  const [simName, setSimName] = useState('Max Mustermann');
  const [simContent, setSimContent] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [savingConfig, setSavingConfig] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const cardClass = `rounded-xl border shadow-sm ${isDarkMode ? 'bg-[#1a1a2e]/80 border-white/[0.06]' : 'bg-white border-gray-200/60'}`;
  const labelClass = `text-[10px] font-medium uppercase tracking-wider ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`;
  const textPrimary = isDarkMode ? 'text-white' : 'text-gray-900';
  const textSecondary = isDarkMode ? 'text-gray-400' : 'text-gray-500';
  const inputClass = `w-full px-3 py-2 text-[11px] rounded-lg border ${isDarkMode ? 'bg-white/5 border-white/10 text-white placeholder-gray-600' : 'bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400'} focus:outline-none focus:ring-1 focus:ring-green-500/40`;

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const [cfg, st, convos] = await Promise.all([
        api.whatsapp.getConfig(orgId),
        api.whatsapp.getStats(orgId),
        api.whatsapp.getConversations(orgId),
      ]);
      setConfig(cfg.data);
      setStats(st.data);
      setConversations(convos.data || []);
    } catch { /* empty */ }
    setLoading(false);
  }, [orgId]);

  useEffect(() => { load(); }, [load]);

  const loadMessages = useCallback(async (convo: WhatsAppConversation) => {
    if (!orgId) return;
    setSelectedConvo(convo);
    setMsgLoading(true);
    setAiSuggestion(null);
    try {
      const res = await api.whatsapp.getMessages(orgId, convo.id);
      setMessages(res.data || []);
    } catch { setMessages([]); }
    setMsgLoading(false);
  }, [orgId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!orgId || !selectedConvo || !input.trim()) return;
    setSending(true);
    try {
      const res = await api.whatsapp.sendMessage(orgId, selectedConvo.id, input.trim());
      setMessages((prev) => [...prev, res.data]);
      setInput('');
      setAiSuggestion(null);
      load();
    } catch { /* empty */ }
    setSending(false);
  };

  const handleAiSuggest = async () => {
    if (!orgId || !selectedConvo) return;
    setAiLoading(true);
    try {
      const res = await api.whatsapp.getAiSuggestion(orgId, selectedConvo.id);
      setAiSuggestion(res.data.suggestion);
    } catch { /* empty */ }
    setAiLoading(false);
  };

  const handleSendAiReply = async () => {
    if (!orgId || !selectedConvo || !aiSuggestion) return;
    setSending(true);
    try {
      const res = await api.whatsapp.sendAiReply(orgId, selectedConvo.id, aiSuggestion);
      setMessages((prev) => [...prev, res.data]);
      setAiSuggestion(null);
      load();
    } catch { /* empty */ }
    setSending(false);
  };

  const handleConnect = async () => {
    if (!orgId || !connectPhone.trim()) return;
    try {
      const res = await api.whatsapp.connect(orgId, { phoneNumber: connectPhone.trim(), businessName: connectName.trim() || undefined });
      setConfig(res.data);
      setConnectModal(false);
      load();
    } catch { /* empty */ }
  };

  const handleDisconnect = async () => {
    if (!orgId) return;
    try {
      const res = await api.whatsapp.disconnect(orgId);
      setConfig(res.data);
      load();
    } catch { /* empty */ }
  };

  const handleSimulate = async () => {
    if (!orgId || !simPhone.trim() || !simContent.trim()) return;
    try {
      await api.whatsapp.simulateIncoming(orgId, { contactPhone: simPhone.trim(), contactName: simName.trim() || undefined, content: simContent.trim() });
      setSimModal(false);
      setSimContent('');
      load();
      const convos = await api.whatsapp.getConversations(orgId);
      setConversations(convos.data || []);
    } catch { /* empty */ }
  };

  const handleConfigSave = async (patch: Partial<WhatsAppConfig>) => {
    if (!orgId) return;
    setSavingConfig(true);
    try {
      const res = await api.whatsapp.updateConfig(orgId, patch);
      setConfig(res.data);
    } catch { /* empty */ }
    setSavingConfig(false);
  };

  const filteredConvos = conversations.filter((c) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (c.contactName?.toLowerCase().includes(q) || c.contactPhone.includes(q) || c.lastMessagePreview?.toLowerCase().includes(q));
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className={`w-6 h-6 animate-spin ${isDarkMode ? 'text-green-400' : 'text-green-600'}`} />
          <span className={`text-[11px] ${textSecondary}`}>Loading WhatsApp Business…</span>
        </div>
      </div>
    );
  }

  const isConnected = config?.isConnected ?? false;
  const isActive = config?.isActive ?? false;
  const aiMode = config?.aiMode ?? 'OFF';

  return (
    <div className="space-y-4">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${isDarkMode ? 'bg-green-500/10' : 'bg-green-50'}`}>
            <Phone className={`w-4.5 h-4.5 ${isDarkMode ? 'text-green-400' : 'text-green-600'}`} />
          </div>
          <div>
            <h1 className={`text-[15px] font-bold ${textPrimary}`}>WhatsApp Business</h1>
            <p className={`text-[10px] ${textSecondary}`}>AI-powered messaging for your organization</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isConnected && (
            <button onClick={() => { setSimModal(true); }} className={`px-3 py-1.5 rounded-lg text-[10px] font-medium flex items-center gap-1.5 ${isDarkMode ? 'bg-white/5 hover:bg-white/10 text-gray-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'} transition-colors`}>
              <Plus className="w-3 h-3" /> Simulate Message
            </button>
          )}
          <button onClick={load} className={`p-2 rounded-lg ${isDarkMode ? 'hover:bg-white/5 text-gray-400' : 'hover:bg-gray-100 text-gray-500'} transition-colors`}>
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className={`flex gap-1 p-1 rounded-xl ${isDarkMode ? 'bg-white/[0.03]' : 'bg-gray-100/60'}`}>
        {([
          { id: 'overview' as Tab, label: 'Overview', icon: TrendingUp },
          { id: 'conversations' as Tab, label: 'Conversations', icon: MessageCircle, count: stats?.unreadTotal },
          { id: 'settings' as Tab, label: 'Configuration', icon: Settings },
        ]).map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-[10px] font-semibold transition-all ${tab === t.id
            ? isDarkMode ? 'bg-white/10 text-white shadow-sm' : 'bg-white text-gray-900 shadow-sm'
            : isDarkMode ? 'text-gray-500 hover:text-gray-300' : 'text-gray-500 hover:text-gray-700'
          }`}>
            <t.icon className="w-3.5 h-3.5" />
            {t.label}
            {t.count ? <span className="ml-1 px-1.5 py-0.5 rounded-full text-[8px] font-bold bg-green-500 text-white">{t.count}</span> : null}
          </button>
        ))}
      </div>

      {tab === 'overview' && <OverviewTab isDarkMode={isDarkMode} config={config} stats={stats} cardClass={cardClass} labelClass={labelClass} textPrimary={textPrimary} textSecondary={textSecondary} onConnect={() => setConnectModal(true)} onDisconnect={handleDisconnect} onToggleActive={() => handleConfigSave({ isActive: !isActive } as any)} />}
      {tab === 'conversations' && <ConversationsTab isDarkMode={isDarkMode} config={config} conversations={filteredConvos} selectedConvo={selectedConvo} messages={messages} msgLoading={msgLoading} input={input} sending={sending} aiSuggestion={aiSuggestion} aiLoading={aiLoading} searchQuery={searchQuery} cardClass={cardClass} textPrimary={textPrimary} textSecondary={textSecondary} inputClass={inputClass} messagesEndRef={messagesEndRef} onSelectConvo={loadMessages} onInputChange={setInput} onSend={handleSend} onAiSuggest={handleAiSuggest} onSendAiReply={handleSendAiReply} onDismissSuggestion={() => setAiSuggestion(null)} onSearchChange={setSearchQuery} onBack={() => setSelectedConvo(null)} />}
      {tab === 'settings' && <SettingsTab isDarkMode={isDarkMode} config={config} saving={savingConfig} cardClass={cardClass} labelClass={labelClass} textPrimary={textPrimary} textSecondary={textSecondary} onSave={handleConfigSave} />}

      {/* Connect Modal */}
      {connectModal && (
        <ModalOverlay isDarkMode={isDarkMode} onClose={() => setConnectModal(false)}>
          <div className={`w-full max-w-md rounded-2xl p-6 ${isDarkMode ? 'bg-[#1a1a2e]' : 'bg-white'} shadow-2xl`}>
            <div className="flex items-center gap-3 mb-5">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isDarkMode ? 'bg-green-500/10' : 'bg-green-50'}`}>
                <Phone className={`w-5 h-5 ${isDarkMode ? 'text-green-400' : 'text-green-600'}`} />
              </div>
              <div>
                <h2 className={`text-sm font-bold ${textPrimary}`}>Connect WhatsApp Business</h2>
                <p className={`text-[10px] ${textSecondary}`}>Enter your WhatsApp Business credentials</p>
              </div>
            </div>
            <div className="space-y-3">
              <div>
                <label className={`text-[10px] font-medium ${textSecondary} block mb-1`}>Phone Number *</label>
                <input value={connectPhone} onChange={(e) => setConnectPhone(e.target.value)} placeholder="+49 170 1234567" className={inputClass} />
              </div>
              <div>
                <label className={`text-[10px] font-medium ${textSecondary} block mb-1`}>Business Name</label>
                <input value={connectName} onChange={(e) => setConnectName(e.target.value)} placeholder="Your Business Name" className={inputClass} />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setConnectModal(false)} className={`px-4 py-2 rounded-lg text-[10px] font-medium ${isDarkMode ? 'bg-white/5 text-gray-300 hover:bg-white/10' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'} transition-colors`}>Cancel</button>
              <button onClick={handleConnect} disabled={!connectPhone.trim()} className="px-4 py-2 rounded-lg text-[10px] font-semibold bg-green-600 text-white hover:bg-green-700 transition-colors disabled:opacity-40">Connect</button>
            </div>
          </div>
        </ModalOverlay>
      )}

      {/* Simulate Incoming Modal */}
      {simModal && (
        <ModalOverlay isDarkMode={isDarkMode} onClose={() => setSimModal(false)}>
          <div className={`w-full max-w-md rounded-2xl p-6 ${isDarkMode ? 'bg-[#1a1a2e]' : 'bg-white'} shadow-2xl`}>
            <div className="flex items-center gap-3 mb-5">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isDarkMode ? 'bg-blue-500/10' : 'bg-blue-50'}`}>
                <MessageSquare className={`w-5 h-5 ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`} />
              </div>
              <div>
                <h2 className={`text-sm font-bold ${textPrimary}`}>Simulate Incoming Message</h2>
                <p className={`text-[10px] ${textSecondary}`}>Test your WhatsApp integration</p>
              </div>
            </div>
            <div className="space-y-3">
              <div>
                <label className={`text-[10px] font-medium ${textSecondary} block mb-1`}>Phone Number *</label>
                <input value={simPhone} onChange={(e) => setSimPhone(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={`text-[10px] font-medium ${textSecondary} block mb-1`}>Contact Name</label>
                <input value={simName} onChange={(e) => setSimName(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={`text-[10px] font-medium ${textSecondary} block mb-1`}>Message *</label>
                <textarea value={simContent} onChange={(e) => setSimContent(e.target.value)} rows={3} placeholder="Hi, I have a question about my booking…" className={inputClass + ' resize-none'} />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setSimModal(false)} className={`px-4 py-2 rounded-lg text-[10px] font-medium ${isDarkMode ? 'bg-white/5 text-gray-300 hover:bg-white/10' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'} transition-colors`}>Cancel</button>
              <button onClick={handleSimulate} disabled={!simPhone.trim() || !simContent.trim()} className="px-4 py-2 rounded-lg text-[10px] font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-40">Send</button>
            </div>
          </div>
        </ModalOverlay>
      )}
    </div>
  );
}

/* ─── Overview Tab ────────────────────────────────────────── */

function OverviewTab({ isDarkMode, config, stats, cardClass, labelClass, textPrimary, textSecondary, onConnect, onDisconnect, onToggleActive }: {
  isDarkMode: boolean; config: WhatsAppConfig | null; stats: WhatsAppStats | null; cardClass: string; labelClass: string; textPrimary: string; textSecondary: string;
  onConnect: () => void; onDisconnect: () => void; onToggleActive: () => void;
}) {
  const isConnected = config?.isConnected ?? false;
  const isActive = config?.isActive ?? false;
  const aiMode = config?.aiMode ?? 'OFF';
  const modeInfo = AI_MODE_LABELS[aiMode] || AI_MODE_LABELS.OFF;

  return (
    <div className="space-y-4">
      {/* Connection Status Card */}
      <div className={`${cardClass} p-5`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${isConnected
              ? isDarkMode ? 'bg-green-500/10' : 'bg-green-50'
              : isDarkMode ? 'bg-gray-800/60' : 'bg-gray-100'
            }`}>
              {isConnected
                ? <Wifi className={`w-6 h-6 ${isDarkMode ? 'text-green-400' : 'text-green-600'}`} />
                : <WifiOff className={`w-6 h-6 ${isDarkMode ? 'text-gray-600' : 'text-gray-400'}`} />
              }
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className={`text-sm font-bold ${textPrimary}`}>
                  {isConnected ? 'WhatsApp Connected' : 'WhatsApp Not Connected'}
                </h3>
                <span className={`px-2 py-0.5 rounded-full text-[9px] font-semibold ${isConnected
                  ? 'bg-green-500/10 text-green-500'
                  : isDarkMode ? 'bg-gray-800 text-gray-500' : 'bg-gray-100 text-gray-500'
                }`}>
                  {isConnected ? 'Connected' : 'Disconnected'}
                </span>
              </div>
              {isConnected && config?.phoneNumber && (
                <p className={`text-[11px] ${textSecondary} mt-0.5`}>
                  {config.businessName ? `${config.businessName} · ` : ''}{config.phoneNumber}
                  {config.connectedAt ? ` · Since ${new Date(config.connectedAt).toLocaleDateString()}` : ''}
                </p>
              )}
              {!isConnected && <p className={`text-[11px] ${textSecondary} mt-0.5`}>Connect your WhatsApp Business account to start</p>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isConnected && (
              <button onClick={onToggleActive} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-medium transition-colors ${isActive
                ? isDarkMode ? 'bg-green-500/10 text-green-400 hover:bg-green-500/20' : 'bg-green-50 text-green-600 hover:bg-green-100'
                : isDarkMode ? 'bg-white/5 text-gray-400 hover:bg-white/10' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}>
                {isActive ? <ToggleRight className="w-3.5 h-3.5" /> : <ToggleLeft className="w-3.5 h-3.5" />}
                {isActive ? 'Active' : 'Paused'}
              </button>
            )}
            <button onClick={isConnected ? onDisconnect : onConnect} className={`px-4 py-2 rounded-lg text-[10px] font-semibold transition-colors ${isConnected
              ? isDarkMode ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20' : 'bg-red-50 text-red-600 hover:bg-red-100'
              : 'bg-green-600 text-white hover:bg-green-700'
            }`}>
              {isConnected ? 'Disconnect' : 'Connect Account'}
            </button>
          </div>
        </div>
      </div>

      {/* Status Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'AI Mode', value: modeInfo.label, icon: modeInfo.icon, color: modeInfo.color },
          { label: 'Conversations', value: String(stats?.totalConversations ?? 0), sub: `${stats?.openConversations ?? 0} open`, icon: MessageCircle, color: 'blue' },
          { label: 'Messages', value: String(stats?.totalMessages ?? 0), sub: `${stats?.aiMessages ?? 0} by AI`, icon: Hash, color: 'purple' },
          { label: 'Unread', value: String(stats?.unreadTotal ?? 0), icon: AlertCircle, color: stats?.unreadTotal ? 'amber' : 'gray' },
        ].map((item, i) => (
          <div key={i} className={`${cardClass} p-4`}>
            <div className="flex items-center justify-between mb-2">
              <span className={labelClass}>{item.label}</span>
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                isDarkMode ? `bg-${item.color}-500/10` : `bg-${item.color}-50`
              }`}>
                <item.icon className={`w-3.5 h-3.5 ${isDarkMode ? `text-${item.color}-400` : `text-${item.color}-600`}`} />
              </div>
            </div>
            <div className={`text-lg font-bold ${textPrimary}`}>{item.value}</div>
            {item.sub && <div className={`text-[10px] ${textSecondary} mt-0.5`}>{item.sub}</div>}
          </div>
        ))}
      </div>

      {/* Readiness Checklist */}
      <div className={`${cardClass} p-5`}>
        <h3 className={`text-[12px] font-bold ${textPrimary} mb-3`}>System Readiness</h3>
        <div className="space-y-2">
          {[
            { label: 'WhatsApp Business account connected', ok: isConnected },
            { label: 'Messaging channel active', ok: isActive },
            { label: 'AI assistant mode configured', ok: aiMode !== 'OFF' },
            { label: 'Organization DIMO agent ready', ok: true },
          ].map((item, i) => (
            <div key={i} className="flex items-center gap-2.5">
              {item.ok
                ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
                : <AlertCircle className={`w-3.5 h-3.5 shrink-0 ${isDarkMode ? 'text-gray-600' : 'text-gray-400'}`} />}
              <span className={`text-[11px] ${item.ok ? textPrimary : textSecondary}`}>{item.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* AI Behavior Summary */}
      {isConnected && (
        <div className={`${cardClass} p-5`}>
          <h3 className={`text-[12px] font-bold ${textPrimary} mb-3`}>AI Behavior Summary</h3>
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: 'Reply Mode', value: modeInfo.label, icon: modeInfo.icon },
              { label: 'Create Tasks', value: config?.aiCanCreateTasks ? 'Allowed' : 'Not allowed', icon: FileText },
              { label: 'Create Support Cases', value: config?.aiCanCreateSupport ? 'Allowed' : 'Not allowed', icon: Headphones },
              { label: 'Use Booking Context', value: config?.aiCanUseBookings ? 'Allowed' : 'Not allowed', icon: ShoppingCart },
              { label: 'Contact Vendors', value: config?.aiCanContactVendors ? 'Allowed' : 'Not allowed', icon: Truck },
              { label: 'Escalation', value: config?.aiEscalationEnabled ? 'Enabled' : 'Disabled', icon: Shield },
            ].map((item, i) => (
              <div key={i} className={`flex items-center gap-2.5 px-3 py-2 rounded-lg ${isDarkMode ? 'bg-white/[0.02]' : 'bg-gray-50/60'}`}>
                <item.icon className={`w-3.5 h-3.5 shrink-0 ${textSecondary}`} />
                <div className="min-w-0">
                  <div className={`text-[10px] ${textSecondary}`}>{item.label}</div>
                  <div className={`text-[11px] font-medium ${textPrimary} truncate`}>{item.value}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Conversations Tab ───────────────────────────────────── */

function ConversationsTab({ isDarkMode, config, conversations, selectedConvo, messages, msgLoading, input, sending, aiSuggestion, aiLoading, searchQuery, cardClass, textPrimary, textSecondary, inputClass, messagesEndRef, onSelectConvo, onInputChange, onSend, onAiSuggest, onSendAiReply, onDismissSuggestion, onSearchChange, onBack }: {
  isDarkMode: boolean; config: WhatsAppConfig | null; conversations: WhatsAppConversation[]; selectedConvo: WhatsAppConversation | null; messages: WhatsAppMsg[]; msgLoading: boolean; input: string; sending: boolean; aiSuggestion: string | null; aiLoading: boolean; searchQuery: string;
  cardClass: string; textPrimary: string; textSecondary: string; inputClass: string; messagesEndRef: React.RefObject<HTMLDivElement | null>;
  onSelectConvo: (c: WhatsAppConversation) => void; onInputChange: (v: string) => void; onSend: () => void; onAiSuggest: () => void; onSendAiReply: () => void; onDismissSuggestion: () => void; onSearchChange: (v: string) => void; onBack: () => void;
}) {
  const isConnected = config?.isConnected ?? false;

  if (!isConnected) {
    return (
      <div className={`${cardClass} p-10 text-center`}>
        <WifiOff className={`w-8 h-8 mx-auto mb-3 ${isDarkMode ? 'text-gray-600' : 'text-gray-400'}`} />
        <h3 className={`text-sm font-bold ${textPrimary} mb-1`}>Not Connected</h3>
        <p className={`text-[11px] ${textSecondary}`}>Connect your WhatsApp Business account from the Overview tab to start messaging.</p>
      </div>
    );
  }

  return (
    <div className={`${cardClass} overflow-hidden`} style={{ height: 'calc(100vh - 260px)', minHeight: '480px' }}>
      <div className="flex h-full">
        {/* Conversation List */}
        <div className={`w-[320px] shrink-0 border-r flex flex-col ${isDarkMode ? 'border-white/[0.06]' : 'border-gray-200/60'} ${selectedConvo ? 'hidden lg:flex' : 'flex'}`}>
          <div className={`p-3 border-b ${isDarkMode ? 'border-white/[0.06]' : 'border-gray-200/60'}`}>
            <div className="relative">
              <Search className={`absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 ${textSecondary}`} />
              <input value={searchQuery} onChange={(e) => onSearchChange(e.target.value)} placeholder="Search conversations…" className={`${inputClass} pl-8`} />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {conversations.length === 0 ? (
              <div className="p-6 text-center">
                <MessageCircle className={`w-6 h-6 mx-auto mb-2 ${isDarkMode ? 'text-gray-700' : 'text-gray-300'}`} />
                <p className={`text-[11px] ${textSecondary}`}>No conversations yet</p>
                <p className={`text-[10px] ${textSecondary} mt-1`}>Simulate an incoming message to get started</p>
              </div>
            ) : (
              conversations.map((c) => (
                <button key={c.id} onClick={() => onSelectConvo(c)} className={`w-full text-left px-3 py-3 border-b transition-colors ${isDarkMode ? 'border-white/[0.04] hover:bg-white/[0.03]' : 'border-gray-100 hover:bg-gray-50'} ${selectedConvo?.id === c.id ? isDarkMode ? 'bg-white/[0.06]' : 'bg-green-50/40' : ''}`}>
                  <div className="flex items-center gap-2.5">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${isDarkMode ? 'bg-green-500/10 text-green-400' : 'bg-green-100 text-green-700'}`}>
                      {(c.contactName || c.contactPhone).charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className={`text-[11px] font-semibold truncate ${textPrimary}`}>{c.contactName || c.contactPhone}</span>
                        {c.unreadCount > 0 && <span className="ml-1 px-1.5 py-0.5 rounded-full text-[8px] font-bold bg-green-500 text-white">{c.unreadCount}</span>}
                      </div>
                      <p className={`text-[10px] truncate ${textSecondary} mt-0.5`}>{c.lastMessagePreview || 'No messages'}</p>
                      {c.lastMessageAt && <p className={`text-[9px] ${textSecondary} mt-0.5`}>{formatRelativeTime(c.lastMessageAt)}</p>}
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Message Area */}
        <div className={`flex-1 flex flex-col ${!selectedConvo ? 'hidden lg:flex' : 'flex'}`}>
          {selectedConvo ? (
            <>
              {/* Conversation Header */}
              <div className={`px-4 py-3 border-b flex items-center gap-3 ${isDarkMode ? 'border-white/[0.06]' : 'border-gray-200/60'}`}>
                <button onClick={onBack} className={`lg:hidden p-1 rounded-lg ${isDarkMode ? 'hover:bg-white/5' : 'hover:bg-gray-100'}`}>
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold ${isDarkMode ? 'bg-green-500/10 text-green-400' : 'bg-green-100 text-green-700'}`}>
                  {(selectedConvo.contactName || selectedConvo.contactPhone).charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className={`text-[12px] font-bold ${textPrimary} truncate`}>{selectedConvo.contactName || selectedConvo.contactPhone}</h3>
                  <p className={`text-[10px] ${textSecondary}`}>{selectedConvo.contactPhone}{selectedConvo.status === 'open' ? ' · Open' : ''}</p>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {msgLoading ? (
                  <div className="flex justify-center py-10"><Loader2 className={`w-5 h-5 animate-spin ${textSecondary}`} /></div>
                ) : messages.length === 0 ? (
                  <div className="text-center py-10">
                    <MessageSquare className={`w-6 h-6 mx-auto mb-2 ${isDarkMode ? 'text-gray-700' : 'text-gray-300'}`} />
                    <p className={`text-[11px] ${textSecondary}`}>No messages in this conversation</p>
                  </div>
                ) : (
                  messages.map((m) => (
                    <MessageBubble key={m.id} msg={m} isDarkMode={isDarkMode} textSecondary={textSecondary} />
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* AI Suggestion */}
              {aiSuggestion && (
                <div className={`mx-4 mb-2 p-3 rounded-xl border ${isDarkMode ? 'bg-purple-500/5 border-purple-500/20' : 'bg-purple-50 border-purple-100'}`}>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Sparkles className={`w-3 h-3 ${isDarkMode ? 'text-purple-400' : 'text-purple-600'}`} />
                    <span className={`text-[10px] font-semibold ${isDarkMode ? 'text-purple-400' : 'text-purple-700'}`}>AI Suggested Reply</span>
                  </div>
                  <p className={`text-[11px] ${textPrimary} mb-2`}>{aiSuggestion}</p>
                  <div className="flex items-center gap-2">
                    <button onClick={onSendAiReply} className="px-3 py-1 rounded-lg text-[10px] font-semibold bg-purple-600 text-white hover:bg-purple-700 transition-colors">Send This Reply</button>
                    <button onClick={() => { onInputChange(aiSuggestion); onDismissSuggestion(); }} className={`px-3 py-1 rounded-lg text-[10px] font-medium ${isDarkMode ? 'bg-white/5 text-gray-300 hover:bg-white/10' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'} transition-colors`}>Edit First</button>
                    <button onClick={onDismissSuggestion} className={`px-3 py-1 rounded-lg text-[10px] font-medium ${isDarkMode ? 'text-gray-500 hover:text-gray-300' : 'text-gray-400 hover:text-gray-600'} transition-colors`}>Dismiss</button>
                  </div>
                </div>
              )}

              {/* Input Area */}
              <div className={`p-3 border-t ${isDarkMode ? 'border-white/[0.06]' : 'border-gray-200/60'}`}>
                <div className="flex items-end gap-2">
                  <button onClick={onAiSuggest} disabled={aiLoading} className={`shrink-0 p-2 rounded-lg transition-colors ${isDarkMode ? 'bg-purple-500/10 text-purple-400 hover:bg-purple-500/20' : 'bg-purple-50 text-purple-600 hover:bg-purple-100'} disabled:opacity-40`} title="Get AI suggestion">
                    {aiLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  </button>
                  <textarea value={input} onChange={(e) => onInputChange(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend(); } }} placeholder="Type a message…" rows={1} className={`flex-1 ${inputClass} resize-none max-h-20`} />
                  <button onClick={onSend} disabled={!input.trim() || sending} className="shrink-0 p-2 rounded-lg bg-green-600 text-white hover:bg-green-700 transition-colors disabled:opacity-40">
                    {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <MessageCircle className={`w-10 h-10 mx-auto mb-3 ${isDarkMode ? 'text-gray-700' : 'text-gray-300'}`} />
                <h3 className={`text-sm font-bold ${textPrimary} mb-1`}>Select a Conversation</h3>
                <p className={`text-[11px] ${textSecondary}`}>Choose a conversation from the list to view messages</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Message Bubble ──────────────────────────────────────── */

function MessageBubble({ msg, isDarkMode, textSecondary }: { msg: WhatsAppMsg; isDarkMode: boolean; textSecondary: string }) {
  const isOutgoing = msg.direction === 'outgoing';
  const isAi = msg.senderType === 'ai' || msg.aiGenerated;

  return (
    <div className={`flex ${isOutgoing ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[75%] rounded-2xl px-3.5 py-2.5 ${isOutgoing
        ? isAi
          ? isDarkMode ? 'bg-purple-500/15 text-purple-100' : 'bg-purple-100 text-purple-900'
          : isDarkMode ? 'bg-green-500/15 text-green-100' : 'bg-green-100 text-green-900'
        : isDarkMode ? 'bg-white/[0.06] text-gray-200' : 'bg-gray-100 text-gray-900'
      }`}>
        {isAi && (
          <div className="flex items-center gap-1 mb-1">
            <Bot className={`w-3 h-3 ${isDarkMode ? 'text-purple-400' : 'text-purple-600'}`} />
            <span className={`text-[9px] font-semibold ${isDarkMode ? 'text-purple-400' : 'text-purple-600'}`}>AI Assistant</span>
          </div>
        )}
        {!isOutgoing && msg.senderName && !isAi && (
          <div className={`text-[9px] font-semibold mb-0.5 ${isDarkMode ? 'text-green-400' : 'text-green-700'}`}>{msg.senderName}</div>
        )}
        <p className="text-[11px] leading-relaxed whitespace-pre-wrap">{msg.content}</p>
        <div className={`flex items-center gap-1.5 mt-1 ${isOutgoing ? 'justify-end' : ''}`}>
          <span className={`text-[9px] ${textSecondary}`}>{formatTime(msg.createdAt)}</span>
          {msg.aiSuggested && <span className={`text-[8px] px-1 py-0.5 rounded ${isDarkMode ? 'bg-purple-500/10 text-purple-400' : 'bg-purple-50 text-purple-600'}`}>AI Suggested</span>}
        </div>
      </div>
    </div>
  );
}

/* ─── Settings Tab ────────────────────────────────────────── */

function SettingsTab({ isDarkMode, config, saving, cardClass, labelClass, textPrimary, textSecondary, onSave }: {
  isDarkMode: boolean; config: WhatsAppConfig | null; saving: boolean; cardClass: string; labelClass: string; textPrimary: string; textSecondary: string;
  onSave: (patch: Partial<WhatsAppConfig>) => void;
}) {
  const aiMode = config?.aiMode ?? 'OFF';

  const toggleClass = (on: boolean) =>
    `relative w-9 h-5 rounded-full transition-colors cursor-pointer ${on
      ? 'bg-green-500'
      : isDarkMode ? 'bg-gray-700' : 'bg-gray-300'
    }`;
  const toggleDotClass = (on: boolean) =>
    `absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-4' : 'translate-x-0.5'}`;

  return (
    <div className="space-y-4">
      {/* AI Mode */}
      <div className={`${cardClass} p-5`}>
        <h3 className={`text-[12px] font-bold ${textPrimary} mb-1`}>AI Messaging Mode</h3>
        <p className={`text-[10px] ${textSecondary} mb-4`}>Control how the AI assistant handles WhatsApp conversations</p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          {(Object.entries(AI_MODE_LABELS) as [string, typeof AI_MODE_LABELS.OFF][]).map(([key, info]) => {
            const active = aiMode === key;
            return (
              <button key={key} onClick={() => onSave({ aiMode: key } as any)} disabled={saving} className={`p-3 rounded-xl border text-left transition-all ${active
                ? isDarkMode ? 'border-green-500/40 bg-green-500/5' : 'border-green-500/40 bg-green-50/60'
                : isDarkMode ? 'border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04]' : 'border-gray-200/60 hover:bg-gray-50'
              }`}>
                <div className="flex items-center gap-2 mb-1.5">
                  <info.icon className={`w-4 h-4 ${active
                    ? isDarkMode ? 'text-green-400' : 'text-green-600'
                    : textSecondary
                  }`} />
                  {active && <CheckCircle2 className="w-3 h-3 text-green-500 ml-auto" />}
                </div>
                <div className={`text-[11px] font-semibold ${textPrimary}`}>{info.label}</div>
                <div className={`text-[10px] ${textSecondary} mt-0.5 leading-snug`}>{info.description}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Permission Toggles */}
      <div className={`${cardClass} p-5`}>
        <h3 className={`text-[12px] font-bold ${textPrimary} mb-1`}>AI Permissions</h3>
        <p className={`text-[10px] ${textSecondary} mb-4`}>Fine-tune what the AI assistant is allowed to do within WhatsApp conversations</p>
        <div className="space-y-3">
          {[
            { key: 'aiCanUseBookings' as const, label: 'Use Booking Context', desc: 'AI can reference booking details when responding to customers', icon: ShoppingCart },
            { key: 'aiCanCreateTasks' as const, label: 'Create Internal Tasks', desc: 'AI can create tasks from customer messages that require follow-up', icon: FileText },
            { key: 'aiCanCreateSupport' as const, label: 'Create Support Cases', desc: 'AI can escalate messages to support tickets when needed', icon: Headphones },
            { key: 'aiCanContactVendors' as const, label: 'Contact Vendors', desc: 'AI can reach out to vendors/workshops on behalf of the organization', icon: Truck },
            { key: 'aiEscalationEnabled' as const, label: 'Human Escalation', desc: 'AI will escalate complex or sensitive conversations to a human team member', icon: Shield },
          ].map((perm) => {
            const on = config?.[perm.key] ?? false;
            return (
              <div key={perm.key} className={`flex items-center justify-between py-2.5 px-3 rounded-lg ${isDarkMode ? 'bg-white/[0.02]' : 'bg-gray-50/60'}`}>
                <div className="flex items-center gap-3">
                  <perm.icon className={`w-4 h-4 shrink-0 ${textSecondary}`} />
                  <div>
                    <div className={`text-[11px] font-semibold ${textPrimary}`}>{perm.label}</div>
                    <div className={`text-[10px] ${textSecondary} mt-0.5`}>{perm.desc}</div>
                  </div>
                </div>
                <button onClick={() => onSave({ [perm.key]: !on } as any)} disabled={saving} className={toggleClass(on)}>
                  <div className={toggleDotClass(on)} />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Safety Notice */}
      <div className={`${cardClass} p-4 flex items-start gap-3`}>
        <Shield className={`w-4 h-4 shrink-0 mt-0.5 ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`} />
        <div>
          <h4 className={`text-[11px] font-semibold ${textPrimary}`}>Safety & Control</h4>
          <p className={`text-[10px] ${textSecondary} mt-0.5 leading-snug`}>
            All AI actions are organization-scoped and logged. In "Suggest Only" mode, the AI never sends messages without human approval.
            Escalation routes complex situations to your team. You maintain full control over AI behavior at all times.
          </p>
        </div>
      </div>
    </div>
  );
}

/* ─── Modal Overlay ───────────────────────────────────────── */

function ModalOverlay({ isDarkMode, onClose, children }: { isDarkMode: boolean; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10">{children}</div>
    </div>
  );
}

/* ─── Helpers ─────────────────────────────────────────────── */

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function formatRelativeTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString();
}
