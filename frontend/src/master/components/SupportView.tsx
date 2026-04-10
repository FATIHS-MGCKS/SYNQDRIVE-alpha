import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Search, Send, Paperclip, Image as ImageIcon, X, ChevronLeft,
  Loader2, MessageSquare, AlertCircle, CheckCircle, Clock, Inbox,
  Filter, Building2, Hash, RefreshCw, ChevronDown,
} from 'lucide-react';
import { api } from '../../lib/api';

interface Message {
  id: string;
  senderId: string;
  senderName: string;
  senderRole: 'user' | 'admin';
  content: string;
  imageUrl: string | null;
  createdAt: string;
}

interface Ticket {
  id: string;
  ticketNumber: number;
  subject: string;
  description: string;
  status: string;
  statusKey: string;
  priority: string;
  priorityKey: string;
  reporterName: string;
  reporterEmail: string;
  organizationId: string;
  lastActivityAt: string;
  createdAt: string;
  messages?: Message[];
  messageCount?: number;
}

interface Stats {
  open: number;
  inProgress: number;
  waiting: number;
  resolved: number;
  closed: number;
  total: number;
}

function formatTime(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const STATUS_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  Open: { bg: 'bg-blue-500/15', text: 'text-blue-500', dot: 'bg-blue-500' },
  'In Progress': { bg: 'bg-amber-500/15', text: 'text-amber-500', dot: 'bg-amber-500' },
  Waiting: { bg: 'bg-purple-500/15', text: 'text-purple-500', dot: 'bg-purple-500' },
  Resolved: { bg: 'bg-emerald-500/15', text: 'text-emerald-500', dot: 'bg-emerald-500' },
  Closed: { bg: 'bg-gray-500/15', text: 'text-gray-400', dot: 'bg-gray-400' },
};

const PRIORITY_COLORS: Record<string, string> = {
  Low: 'text-gray-400',
  Medium: 'text-blue-400',
  High: 'text-amber-400',
  Urgent: 'text-red-400',
};

export function SupportView({ isDarkMode }: { isDarkMode: boolean }) {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const textPrimary = isDarkMode ? 'text-white' : 'text-gray-900';
  const textSecondary = isDarkMode ? 'text-gray-400' : 'text-gray-500';
  const cardClass = `rounded-xl shadow-sm border ${isDarkMode ? 'bg-neutral-900 border-neutral-700' : 'bg-white border-gray-200'}`;

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [statsRes, ticketsRes] = await Promise.all([
        api.support.stats(),
        api.support.tickets(statusFilter !== 'all' ? { status: statusFilter } : undefined),
      ]);
      setStats(statsRes);
      setTickets(ticketsRes?.data || ticketsRes || []);
    } catch { setTickets([]); }
    finally { setLoading(false); }
  }, [statusFilter]);

  useEffect(() => { loadData(); }, [loadData]);

  const openTicket = async (t: Ticket) => {
    try {
      const full = await api.support.getTicket(t.id);
      setSelectedTicket(full);
    } catch { setSelectedTicket({ ...t, messages: [] }); }
  };

  const filtered = useMemo(() =>
    tickets.filter(t => {
      if (!searchTerm) return true;
      const q = searchTerm.toLowerCase();
      return t.subject.toLowerCase().includes(q) || t.reporterEmail.toLowerCase().includes(q) || `#${t.ticketNumber}`.includes(q) || t.reporterName.toLowerCase().includes(q);
    }),
  [tickets, searchTerm]);

  if (selectedTicket) {
    return (
      <AdminTicketDetail
        isDarkMode={isDarkMode}
        ticket={selectedTicket}
        onBack={() => { setSelectedTicket(null); loadData(); }}
        onUpdate={setSelectedTicket}
      />
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className={`text-xl font-bold tracking-tight ${textPrimary}`}>Support Center</h1>
          <p className={`text-xs mt-1 ${textSecondary}`}>Manage all support tickets across organizations</p>
        </div>
        <button onClick={loadData} className={`p-2.5 rounded-xl transition-colors ${isDarkMode ? 'hover:bg-neutral-800 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}>
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Stats row */}
      {stats && (
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
          {[
            { label: 'Total', count: stats.total, color: '' },
            { label: 'Open', count: stats.open, color: 'text-blue-500' },
            { label: 'In Progress', count: stats.inProgress, color: 'text-amber-500' },
            { label: 'Waiting', count: stats.waiting, color: 'text-purple-500' },
            { label: 'Resolved', count: stats.resolved, color: 'text-emerald-500' },
            { label: 'Closed', count: stats.closed, color: 'text-gray-400' },
          ].map(s => (
            <div key={s.label} className={`${cardClass} p-3 text-center`}>
              <p className={`text-lg font-bold ${s.color || textPrimary}`}>{s.count}</p>
              <p className={`text-[10px] ${textSecondary} mt-0.5`}>{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-md">
          <Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${textSecondary}`} />
          <input type="text" placeholder="Search by subject, email, ticket #..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
            className={`w-full pl-10 pr-3 py-2.5 rounded-xl border text-xs ${isDarkMode ? 'bg-neutral-800 border-neutral-700 text-white placeholder-gray-500' : 'bg-white border-gray-200 text-gray-900 placeholder-gray-400'} outline-none`} />
        </div>
        <div className="flex gap-1.5">
          {['all', 'Open', 'In Progress', 'Waiting', 'Resolved', 'Closed'].map(s => (
            <button key={s} onClick={() => setStatusFilter(s)} className={`px-3 py-2 rounded-lg text-xs font-medium transition-all border ${statusFilter === s ? (isDarkMode ? 'bg-blue-600/20 text-blue-400 border-blue-500/30' : 'bg-blue-50 text-blue-600 border-blue-200') : (isDarkMode ? 'text-gray-400 border-neutral-700 hover:bg-neutral-800' : 'text-gray-600 border-gray-200 hover:bg-gray-50')}`}>
              {s === 'all' ? 'All' : s}
            </button>
          ))}
        </div>
      </div>

      {/* Ticket table */}
      <div className={cardClass}>
        {loading ? (
          <div className="flex items-center justify-center py-16"><Loader2 className={`w-5 h-5 animate-spin ${textSecondary}`} /></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <Inbox className={`w-10 h-10 mx-auto mb-3 ${textSecondary} opacity-40`} />
            <p className={`text-sm font-medium ${textPrimary}`}>No tickets found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px]">
              <thead>
                <tr className={isDarkMode ? 'bg-neutral-800/50' : 'bg-gray-50'}>
                  <th className={`text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider ${textSecondary}`}>#</th>
                  <th className={`text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider ${textSecondary}`}>Subject</th>
                  <th className={`text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider ${textSecondary}`}>Reporter</th>
                  <th className={`text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider ${textSecondary}`}>Status</th>
                  <th className={`text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider ${textSecondary}`}>Priority</th>
                  <th className={`text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider ${textSecondary}`}>Activity</th>
                  <th className={`text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider ${textSecondary}`}>Msgs</th>
                </tr>
              </thead>
              <tbody className={`divide-y ${isDarkMode ? 'divide-neutral-700/30' : 'divide-gray-100'}`}>
                {filtered.map(t => {
                  const sc = STATUS_COLORS[t.status] || STATUS_COLORS.Open;
                  const pc = PRIORITY_COLORS[t.priority] || 'text-gray-400';
                  return (
                    <tr key={t.id} onClick={() => openTicket(t)} className={`cursor-pointer transition-colors ${isDarkMode ? 'hover:bg-neutral-800' : 'hover:bg-gray-50'}`}>
                      <td className={`px-4 py-3 text-xs font-bold ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`}>#{t.ticketNumber}</td>
                      <td className="px-4 py-3">
                        <p className={`text-xs font-semibold truncate max-w-[250px] ${textPrimary}`}>{t.subject}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className={`text-xs font-medium ${textPrimary}`}>{t.reporterName || t.reporterEmail}</p>
                        <p className={`text-[10px] ${textSecondary}`}>{t.reporterEmail}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${sc.bg} ${sc.text}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} /> {t.status}
                        </span>
                      </td>
                      <td className={`px-4 py-3 text-xs font-medium ${pc}`}>{t.priority}</td>
                      <td className={`px-4 py-3 text-[11px] ${textSecondary}`}>{formatTime(t.lastActivityAt || t.createdAt)}</td>
                      <td className="px-4 py-3">
                        <div className={`flex items-center gap-1 ${textSecondary}`}>
                          <MessageSquare className="w-3 h-3" />
                          <span className="text-[11px]">{t.messageCount || 0}</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════
// ADMIN TICKET DETAIL / CHAT
// ════════════════════════════════════════════════

function AdminTicketDetail({ isDarkMode, ticket, onBack, onUpdate }: {
  isDarkMode: boolean; ticket: Ticket;
  onBack: () => void; onUpdate: (t: Ticket) => void;
}) {
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [statusChanging, setStatusChanging] = useState(false);
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const messages = ticket.messages || [];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const textPrimary = isDarkMode ? 'text-white' : 'text-gray-900';
  const textSecondary = isDarkMode ? 'text-gray-400' : 'text-gray-500';
  const cardClass = `rounded-xl shadow-sm border ${isDarkMode ? 'bg-neutral-900 border-neutral-700' : 'bg-white border-gray-200'}`;

  const handleImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setImageFile(f);
    const reader = new FileReader();
    reader.onload = () => setImagePreview(reader.result as string);
    reader.readAsDataURL(f);
  };

  const handleSend = async () => {
    if (!message.trim() && !imageFile) return;
    setSending(true);
    try {
      let imageUrl: string | undefined;
      if (imageFile) {
        const res = await api.support.uploadImage(imageFile);
        imageUrl = res.url;
      }
      await api.support.addMessage(ticket.id, { content: message.trim(), imageUrl });
      setMessage('');
      setImageFile(null);
      setImagePreview(null);
      const updated = await api.support.getTicket(ticket.id);
      onUpdate(updated);
    } catch { /* ignore */ }
    finally { setSending(false); }
  };

  const handleStatusChange = async (status: string) => {
    setStatusChanging(true);
    setShowStatusMenu(false);
    try {
      await api.support.updateStatus(ticket.id, status);
      const updated = await api.support.getTicket(ticket.id);
      onUpdate(updated);
    } catch { /* ignore */ }
    finally { setStatusChanging(false); }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const sc = STATUS_COLORS[ticket.status] || STATUS_COLORS.Open;

  return (
    <div className="space-y-4">
      <button onClick={onBack} className={`flex items-center gap-1 text-xs font-medium ${textSecondary} hover:${textPrimary} transition-colors`}>
        <ChevronLeft className="w-4 h-4" /> Back to tickets
      </button>

      {/* Ticket header */}
      <div className={`${cardClass} p-5`}>
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className={`text-xs font-bold ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`}>#{ticket.ticketNumber}</span>
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${sc.bg} ${sc.text}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} /> {ticket.status}
              </span>
              <span className={`text-[10px] ${PRIORITY_COLORS[ticket.priority] || 'text-gray-400'} font-semibold`}>{ticket.priority}</span>
            </div>
            <h2 className={`text-base font-bold mt-1 ${textPrimary}`}>{ticket.subject}</h2>
            <p className={`text-[11px] mt-0.5 ${textSecondary}`}>
              From: {ticket.reporterName || ticket.reporterEmail} · Created {formatTime(ticket.createdAt)}
            </p>
          </div>
          <div className="relative">
            <button onClick={() => setShowStatusMenu(!showStatusMenu)} disabled={statusChanging} className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-colors ${isDarkMode ? 'border-neutral-700 text-gray-300 hover:bg-neutral-800' : 'border-gray-200 text-gray-700 hover:bg-gray-50'}`}>
              {statusChanging ? <Loader2 className="w-3 h-3 animate-spin" /> : null} Change Status <ChevronDown className="w-3 h-3" />
            </button>
            {showStatusMenu && (
              <div className={`absolute right-0 top-full mt-1 z-20 w-44 rounded-xl border shadow-xl overflow-hidden ${isDarkMode ? 'bg-neutral-900 border-neutral-700' : 'bg-white border-gray-200'}`}>
                {['OPEN', 'IN_PROGRESS', 'WAITING', 'RESOLVED', 'CLOSED'].map(s => {
                  const labels: Record<string, string> = { OPEN: 'Open', IN_PROGRESS: 'In Progress', WAITING: 'Waiting', RESOLVED: 'Resolved', CLOSED: 'Closed' };
                  return (
                    <button key={s} onClick={() => handleStatusChange(s)} className={`w-full text-left px-4 py-2.5 text-xs font-medium transition-colors ${isDarkMode ? 'hover:bg-neutral-800 text-gray-300' : 'hover:bg-gray-50 text-gray-700'} ${ticket.statusKey === s ? 'font-bold' : ''}`}>
                      {labels[s]}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Chat thread */}
      <div className={`${cardClass} flex flex-col`} style={{ height: 'calc(100vh - 340px)', minHeight: '400px' }}>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {messages.map(msg => {
            const isAdmin = msg.senderRole === 'admin';
            return (
              <div key={msg.id} className={`flex ${isAdmin ? 'justify-end' : 'justify-start'}`}>
                <div className="max-w-[75%]">
                  <div className={`flex items-center gap-2 mb-1 ${isAdmin ? 'justify-end' : ''}`}>
                    <span className={`text-[10px] font-semibold ${isAdmin ? (isDarkMode ? 'text-emerald-400' : 'text-emerald-600') : (isDarkMode ? 'text-blue-400' : 'text-blue-600')}`}>
                      {isAdmin ? `${msg.senderName} (You)` : msg.senderName}
                    </span>
                    <span className={`text-[10px] ${textSecondary}`}>{formatTime(msg.createdAt)}</span>
                  </div>
                  <div className={`px-4 py-3 rounded-2xl text-xs leading-relaxed ${isAdmin ? (isDarkMode ? 'bg-emerald-600/20 text-emerald-100 rounded-br-md' : 'bg-emerald-600 text-white rounded-br-md') : (isDarkMode ? 'bg-neutral-800 text-gray-200 rounded-bl-md' : 'bg-gray-100 text-gray-800 rounded-bl-md')}`}>
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                    {msg.imageUrl && (
                      <img src={msg.imageUrl} alt="Attachment" className="mt-2 rounded-xl max-h-48 object-cover cursor-pointer hover:opacity-90" onClick={() => window.open(msg.imageUrl!, '_blank')} />
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        {/* Reply input */}
        <div className={`p-4 border-t ${isDarkMode ? 'border-neutral-700' : 'border-gray-200'}`}>
          {imagePreview && (
            <div className="relative inline-block mb-2">
              <img src={imagePreview} alt="Preview" className="h-16 rounded-lg object-cover" />
              <button onClick={() => { setImageFile(null); setImagePreview(null); }} className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full flex items-center justify-center"><X className="w-2.5 h-2.5" /></button>
            </div>
          )}
          <div className="flex items-end gap-2">
            <input ref={fileRef} type="file" accept="image/*" onChange={handleImage} className="hidden" />
            <button onClick={() => fileRef.current?.click()} className={`p-2.5 rounded-xl transition-colors ${isDarkMode ? 'hover:bg-neutral-800 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}>
              <Paperclip className="w-4 h-4" />
            </button>
            <textarea value={message} onChange={e => setMessage(e.target.value)} onKeyDown={handleKeyDown} rows={1} placeholder="Reply to this ticket..." className={`flex-1 px-4 py-2.5 rounded-xl border text-xs resize-none ${isDarkMode ? 'bg-neutral-800 border-neutral-700 text-white placeholder-gray-500' : 'bg-white border-gray-200 text-gray-900 placeholder-gray-400'} outline-none`} />
            <button onClick={handleSend} disabled={sending || (!message.trim() && !imageFile)} className="p-2.5 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-colors disabled:opacity-50">
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
