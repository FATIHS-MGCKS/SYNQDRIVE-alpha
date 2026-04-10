import { useState, useEffect, useCallback } from 'react';
import {
  Phone, PhoneCall, PhoneIncoming, PhoneOff, ArrowUpRight, Bot,
  Loader2, Search, ChevronRight, Clock, CheckCircle2, XCircle, AlertTriangle,
  BarChart3, Building2, RefreshCw
} from 'lucide-react';
import { api } from '../../lib/api';
import type { VoiceAssistantAdminOverview, VoiceAssistantAdminOrgDetail } from '../../lib/api';

interface Props { isDarkMode: boolean; }

export function VoiceAssistantAdminView({ isDarkMode }: Props) {
  const [overview, setOverview] = useState<VoiceAssistantAdminOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedOrg, setSelectedOrg] = useState<string | null>(null);
  const [orgDetail, setOrgDetail] = useState<VoiceAssistantAdminOrgDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { const o = await api.voiceAssistant.admin.overview(); setOverview(o); } catch { /* empty */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const loadDetail = useCallback(async (orgId: string) => {
    setDetailLoading(true);
    setSelectedOrg(orgId);
    try { const d = await api.voiceAssistant.admin.orgDetail(orgId); setOrgDetail(d); } catch { /* empty */ }
    setDetailLoading(false);
  }, []);

  const glass = isDarkMode
    ? 'bg-neutral-900 border border-neutral-800'
    : 'bg-white border border-gray-200';
  const card = isDarkMode
    ? 'bg-neutral-800 border border-neutral-700 rounded-xl'
    : 'bg-white border border-gray-200 rounded-xl shadow-sm';

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className={`w-6 h-6 animate-spin ${isDarkMode ? 'text-purple-400' : 'text-purple-500'}`} />
      </div>
    );
  }

  const filtered = overview?.assistants.filter(a =>
    a.organizationName.toLowerCase().includes(search.toLowerCase()) ||
    a.name.toLowerCase().includes(search.toLowerCase())
  ) ?? [];

  if (selectedOrg && orgDetail) {
    const a = orgDetail.assistant;
    return (
      <div className="max-w-[1200px] mx-auto space-y-4">
        <button onClick={() => { setSelectedOrg(null); setOrgDetail(null); }}
          className={`flex items-center gap-1.5 text-xs font-semibold mb-2 ${isDarkMode ? 'text-purple-400 hover:text-purple-300' : 'text-purple-600 hover:text-purple-500'}`}>
          ← Back to Overview
        </button>

        <div className={`${glass} rounded-2xl p-5`}>
          <div className="flex items-center gap-3 mb-4">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isDarkMode ? 'bg-purple-500/15' : 'bg-purple-100'}`}>
              <Bot className={`w-5 h-5 ${isDarkMode ? 'text-purple-400' : 'text-purple-600'}`} />
            </div>
            <div>
              <h2 className={`text-lg font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{a?.name ?? 'Not configured'}</h2>
              <p className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>Organization: {overview?.assistants.find(x => x.organizationId === selectedOrg)?.organizationName ?? selectedOrg}</p>
            </div>
            {a && (
              <span className={`ml-auto px-2.5 py-1 rounded-lg text-xs font-semibold ${
                a.status === 'ACTIVE' ? isDarkMode ? 'bg-emerald-500/15 text-emerald-400' : 'bg-emerald-50 text-emerald-600'
                : a.status === 'INACTIVE' ? isDarkMode ? 'bg-red-500/15 text-red-400' : 'bg-red-50 text-red-600'
                : isDarkMode ? 'bg-amber-500/15 text-amber-400' : 'bg-amber-50 text-amber-600'
              }`}>{a.status}</span>
            )}
          </div>

          {!orgDetail.exists ? (
            <div className={`p-6 rounded-xl text-center ${isDarkMode ? 'bg-neutral-800' : 'bg-gray-50'}`}>
              <p className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>No voice assistant configured for this organization.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className={`${card} p-4 space-y-2`}>
                <h4 className={`text-[10px] font-bold uppercase tracking-wider ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>Config</h4>
                {[
                  { l: 'Voice', v: a?.voiceName ?? '—' },
                  { l: 'Language', v: a?.language ?? '—' },
                  { l: 'Phone', v: a?.phoneNumber ?? 'Not assigned' },
                  { l: 'Telephony', v: a?.telephonyEnabled ? 'Enabled' : 'Disabled' },
                  { l: 'Agent ID', v: a?.elevenLabsAgentId ? `${a.elevenLabsAgentId.slice(0, 12)}...` : '—' },
                ].map(r => (
                  <div key={r.l} className="flex items-center justify-between">
                    <span className={`text-[10px] ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>{r.l}</span>
                    <span className={`text-[10px] font-semibold ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>{r.v}</span>
                  </div>
                ))}
              </div>

              <div className={`${card} p-4 space-y-2`}>
                <h4 className={`text-[10px] font-bold uppercase tracking-wider ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>Usage</h4>
                {[
                  { l: 'Total Calls', v: a?.totalCalls ?? 0 },
                  { l: 'Answered', v: a?.answeredCalls ?? 0 },
                  { l: 'Missed', v: a?.missedCalls ?? 0 },
                  { l: 'Escalated', v: a?.escalatedCalls ?? 0 },
                  { l: 'Talk Min', v: (a?.totalTalkMinutes ?? 0).toFixed(1) },
                ].map(r => (
                  <div key={r.l} className="flex items-center justify-between">
                    <span className={`text-[10px] ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>{r.l}</span>
                    <span className={`text-xs font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{r.v}</span>
                  </div>
                ))}
              </div>

              <div className={`${card} p-4 space-y-2`}>
                <h4 className={`text-[10px] font-bold uppercase tracking-wider ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>Readiness</h4>
                {orgDetail.readiness?.checks.map(c => (
                  <div key={c.key} className="flex items-center gap-2">
                    {c.ok ? <CheckCircle2 className="w-3 h-3 text-emerald-500" /> : <XCircle className="w-3 h-3 text-red-400" />}
                    <span className={`text-[10px] ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>{c.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {orgDetail.recentConversations && orgDetail.recentConversations.length > 0 && (
            <div className="mt-4">
              <h4 className={`text-[10px] font-bold uppercase tracking-wider mb-2 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>Recent Conversations</h4>
              <div className="space-y-1.5">
                {orgDetail.recentConversations.map(c => (
                  <div key={c.id} className={`flex items-center justify-between p-2 rounded-lg ${isDarkMode ? 'bg-neutral-800' : 'bg-gray-50'}`}>
                    <div className="flex items-center gap-2">
                      <PhoneIncoming className={`w-3 h-3 ${c.outcome === 'RESOLVED' ? 'text-emerald-500' : c.outcome === 'ESCALATED' ? 'text-amber-500' : 'text-red-400'}`} />
                      <span className={`text-[10px] ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>{c.callerNumber || 'Unknown'}</span>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${
                        c.outcome === 'RESOLVED' ? isDarkMode ? 'bg-emerald-500/15 text-emerald-400' : 'bg-emerald-50 text-emerald-600'
                        : c.outcome === 'ESCALATED' ? isDarkMode ? 'bg-amber-500/15 text-amber-400' : 'bg-amber-50 text-amber-600'
                        : isDarkMode ? 'bg-red-500/15 text-red-400' : 'bg-red-50 text-red-600'
                      }`}>{c.outcome}</span>
                    </div>
                    <span className={`text-[10px] ${isDarkMode ? 'text-gray-600' : 'text-gray-400'}`}>
                      {new Date(c.startedAt).toLocaleString()} · {c.durationSeconds ? `${c.durationSeconds}s` : '—'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[1200px] mx-auto space-y-4">
      {/* Header */}
      <div className={`${glass} rounded-2xl p-5`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isDarkMode ? 'bg-purple-500/15' : 'bg-purple-100'}`}>
              <Bot className={`w-5 h-5 ${isDarkMode ? 'text-purple-400' : 'text-purple-600'}`} />
            </div>
            <div>
              <h1 className={`text-lg font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Voice Assistant Overview</h1>
              <p className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>Monitor all organization voice assistants</p>
            </div>
          </div>
          <button onClick={load} className={`p-2 rounded-lg ${isDarkMode ? 'hover:bg-neutral-800 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}>
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Organizations', value: overview?.summary.totalOrgs ?? 0, icon: Building2, color: 'purple' },
          { label: 'Total Calls', value: overview?.summary.totalCalls ?? 0, icon: PhoneCall, color: 'blue' },
          { label: 'Talk Minutes', value: (overview?.summary.totalMinutes ?? 0).toFixed(1), icon: Clock, color: 'emerald' },
          { label: 'Active', value: overview?.assistants.filter(a => a.status === 'ACTIVE').length ?? 0, icon: CheckCircle2, color: 'green' },
        ].map(m => (
          <div key={m.label} className={`${card} p-4`}>
            <div className="flex items-center gap-2 mb-2">
              <m.icon className={`w-4 h-4 text-${m.color}-500`} />
              <span className={`text-[10px] font-semibold uppercase tracking-wider ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>{m.label}</span>
            </div>
            <p className={`text-xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{m.value}</p>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className={`${glass} rounded-2xl px-4 py-3`}>
        <div className="flex items-center gap-2">
          <Search className={`w-4 h-4 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search organizations..."
            className={`flex-1 bg-transparent outline-none text-xs ${isDarkMode ? 'text-gray-200 placeholder:text-gray-600' : 'text-gray-800 placeholder:text-gray-400'}`}
          />
        </div>
      </div>

      {/* Orgs Table */}
      <div className={`${card} overflow-hidden`}>
        <div className={`grid grid-cols-[1fr_120px_80px_80px_100px_80px_40px] gap-3 px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider ${isDarkMode ? 'text-gray-500 border-b border-neutral-700' : 'text-gray-400 border-b border-gray-200'}`}>
          <span>Organization</span>
          <span>Assistant</span>
          <span>Status</span>
          <span>Calls</span>
          <span>Talk Min</span>
          <span>Phone</span>
          <span></span>
        </div>
        {filtered.length === 0 ? (
          <div className={`p-8 text-center ${isDarkMode ? 'text-gray-600' : 'text-gray-400'}`}>
            <p className="text-xs">No organizations found</p>
          </div>
        ) : (
          filtered.map(a => (
            <button
              key={a.organizationId}
              onClick={() => loadDetail(a.organizationId)}
              className={`w-full grid grid-cols-[1fr_120px_80px_80px_100px_80px_40px] gap-3 px-4 py-3 text-left transition-colors ${
                isDarkMode ? 'hover:bg-neutral-800 border-b border-neutral-800' : 'hover:bg-gray-50 border-b border-gray-100'
              }`}
            >
              <div className="flex items-center gap-2">
                <Building2 className={`w-3.5 h-3.5 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`} />
                <span className={`text-xs font-semibold truncate ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}>{a.organizationName}</span>
              </div>
              <span className={`text-xs truncate ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{a.name}</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium w-fit ${
                a.status === 'ACTIVE' ? isDarkMode ? 'bg-emerald-500/15 text-emerald-400' : 'bg-emerald-50 text-emerald-600'
                : a.status === 'INACTIVE' ? isDarkMode ? 'bg-red-500/15 text-red-400' : 'bg-red-50 text-red-600'
                : isDarkMode ? 'bg-amber-500/15 text-amber-400' : 'bg-amber-50 text-amber-600'
              }`}>{a.status}</span>
              <span className={`text-xs font-semibold ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>{a.totalCalls}</span>
              <span className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{a.totalTalkMinutes.toFixed(1)}</span>
              <span className={`text-[10px] ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>{a.phoneNumber || '—'}</span>
              <ChevronRight className={`w-3.5 h-3.5 ${isDarkMode ? 'text-gray-600' : 'text-gray-400'}`} />
            </button>
          ))
        )}
      </div>
    </div>
  );
}
