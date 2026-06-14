import { Icon } from './ui/Icon';
import { useState, useEffect, useRef, useCallback } from 'react';

import { api } from '../../lib/api';
import { useRentalOrg } from '../RentalContext';
import { getStoredUser } from '../../lib/auth';

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
  reporterName: string;
  reporterEmail: string;
  lastActivityAt: string;
  createdAt: string;
  messages?: Message[];
  messageCount?: number;
}

function formatTime(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'Gerade eben';
  if (diffMin < 60) return `Vor ${diffMin} Min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `Vor ${diffH}h`;
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const STATUS_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  Open: { bg: 'bg-blue-500/15', text: 'text-blue-500', dot: 'bg-blue-500' },
  'In Progress': { bg: 'bg-amber-500/15', text: 'text-amber-500', dot: 'bg-amber-500' },
  Waiting: { bg: 'bg-purple-500/15', text: 'text-purple-500', dot: 'bg-purple-500' },
  Resolved: { bg: 'bg-emerald-500/15', text: 'text-emerald-500', dot: 'bg-emerald-500' },
  Closed: { bg: 'bg-gray-500/15', text: 'text-gray-400', dot: 'bg-gray-400' },
};

export function SupportView({ isDarkMode }: { isDarkMode: boolean }) {
  const { orgId } = useRentalOrg();
  const user = getStoredUser();

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const loadTickets = useCallback(async () => {
    if (!orgId) return;
    try {
      setLoading(true);
      const list = await api.support.byOrg(orgId);
      setTickets(list || []);
    } catch { setTickets([]); }
    finally { setLoading(false); }
  }, [orgId]);

  useEffect(() => { loadTickets(); }, [loadTickets]);

  const openTicket = async (t: Ticket) => {
    if (!orgId) return;
    try {
      const full = await api.support.getByOrg(orgId, t.id);
      setSelectedTicket(full);
    } catch { setSelectedTicket({ ...t, messages: [] }); }
  };

  const filtered = tickets.filter(t => {
    if (searchTerm && !t.subject.toLowerCase().includes(searchTerm.toLowerCase()) && !`#${t.ticketNumber}`.includes(searchTerm)) return false;
    if (statusFilter !== 'all' && t.status !== statusFilter) return false;
    return true;
  });

  const statusCounts = tickets.reduce<Record<string, number>>((acc, t) => { acc[t.status] = (acc[t.status] || 0) + 1; return acc; }, {});

  const cardClass = `rounded-xl shadow-sm border ${isDarkMode ? 'bg-neutral-900 border-neutral-700' : 'bg-white border-gray-200'}`;
  const textPrimary = isDarkMode ? 'text-white' : 'text-gray-900';
  const textSecondary = isDarkMode ? 'text-gray-400' : 'text-gray-500';

  // ── Ticket Detail View ──
  if (selectedTicket) {
    return (
      <TicketDetail
        isDarkMode={isDarkMode}
        ticket={selectedTicket}
        orgId={orgId || ''}
        onBack={() => { setSelectedTicket(null); loadTickets(); }}
        onUpdate={(t) => setSelectedTicket(t)}
      />
    );
  }

  // ── Create Form ──
  if (showCreate) {
    return (
      <CreateTicketForm
        isDarkMode={isDarkMode}
        orgId={orgId || ''}
        onClose={() => setShowCreate(false)}
        onCreated={(t) => { setShowCreate(false); setSelectedTicket(t); loadTickets(); }}
      />
    );
  }

  // ── Main list view ──
  return (
    <div className="space-y-5 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className={`text-xl font-bold tracking-tight ${textPrimary}`}>Support Center</h1>
          <p className={`text-xs mt-1 ${textSecondary}`}>{tickets.length} Tickets · {statusCounts['Open'] || 0} offen</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl text-xs font-semibold hover:bg-blue-700 transition-colors shadow-lg shadow-blue-500/20">
          <Icon name="plus" className="w-4 h-4" /> Neues Ticket
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Offen', count: statusCounts['Open'] || 0, color: 'blue' },
          { label: 'In Bearbeitung', count: statusCounts['In Progress'] || 0, color: 'amber' },
          { label: 'Gelöst', count: statusCounts['Resolved'] || 0, color: 'emerald' },
          { label: 'Geschlossen', count: statusCounts['Closed'] || 0, color: 'gray' },
        ].map(s => (
          <div key={s.label} className={`${cardClass} p-4`}>
            <p className={`text-2xl font-bold ${textPrimary}`}>{s.count}</p>
            <p className={`text-[11px] ${textSecondary} mt-0.5`}>{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Icon name="search" className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${textSecondary}`} />
          <input type="text" placeholder="Ticket suchen..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
            className={`w-full pl-10 pr-3 py-2.5 rounded-xl border text-xs ${isDarkMode ? 'bg-neutral-800 border-neutral-700 text-white placeholder-gray-500' : 'bg-white border-gray-200 text-gray-900 placeholder-gray-400'} outline-none`} />
        </div>
        <div className="flex gap-1.5">
          {['all', 'Open', 'In Progress', 'Resolved', 'Closed'].map(s => (
            <button key={s} onClick={() => setStatusFilter(s)} className={`px-3 py-2 rounded-lg text-xs font-medium transition-all border ${statusFilter === s ? (isDarkMode ? 'bg-blue-600/20 text-blue-400 border-blue-500/30' : 'bg-blue-50 text-blue-600 border-blue-200') : (isDarkMode ? 'text-gray-400 border-neutral-700 hover:bg-neutral-800' : 'text-gray-600 border-gray-200 hover:bg-gray-50')}`}>
              {s === 'all' ? 'Alle' : s}
            </button>
          ))}
        </div>
      </div>

      {/* Ticket list */}
      <div className={`${cardClass} divide-y ${isDarkMode ? 'divide-neutral-700/30' : 'divide-gray-100'}`}>
        {loading ? (
          <div className="flex items-center justify-center py-16"><Icon name="loader-2" className={`w-5 h-5 animate-spin ${textSecondary}`} /></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <Icon name="headphones" className={`w-10 h-10 mx-auto mb-3 ${textSecondary} opacity-40`} />
            <p className={`text-sm font-medium ${textPrimary}`}>Keine Tickets gefunden</p>
            <p className={`text-xs mt-1 ${textSecondary}`}>{searchTerm || statusFilter !== 'all' ? 'Versuchen Sie andere Filter.' : 'Erstellen Sie Ihr erstes Support-Ticket.'}</p>
          </div>
        ) : filtered.map(t => {
          const sc = STATUS_COLORS[t.status] || STATUS_COLORS.Open;
          return (
            <button key={t.id} onClick={() => openTicket(t)} className={`w-full text-left px-5 py-4 flex items-start gap-4 transition-colors ${isDarkMode ? 'hover:bg-neutral-800/40' : 'hover:bg-gray-50/60'}`}>
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold shrink-0 ${isDarkMode ? 'bg-neutral-800 text-gray-300' : 'bg-gray-100 text-gray-600'}`}>
                #{t.ticketNumber}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className={`text-xs font-semibold truncate ${textPrimary}`}>{t.subject}</p>
                  <span className={`shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${sc.bg} ${sc.text}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} /> {t.status}
                  </span>
                </div>
                <p className={`text-[11px] mt-0.5 truncate ${textSecondary}`}>{t.description}</p>
              </div>
              <div className="text-right shrink-0">
                <p className={`text-[11px] ${textSecondary}`}>{formatTime(t.lastActivityAt || t.createdAt)}</p>
                {t.messageCount !== undefined && t.messageCount > 1 && (
                  <div className={`flex items-center gap-1 justify-end mt-1 ${textSecondary}`}>
                    <Icon name="message-square" className="w-3 h-3" />
                    <span className="text-[10px]">{t.messageCount}</span>
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════
// CREATE TICKET FORM
// ════════════════════════════════════════════════

function CreateTicketForm({ isDarkMode, orgId, onClose, onCreated }: {
  isDarkMode: boolean; orgId: string;
  onClose: () => void; onCreated: (t: Ticket) => void;
}) {
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const textPrimary = isDarkMode ? 'text-white' : 'text-gray-900';
  const textSecondary = isDarkMode ? 'text-gray-400' : 'text-gray-500';
  const inputClass = `w-full px-4 py-3 rounded-xl border text-xs ${isDarkMode ? 'bg-neutral-800 border-neutral-700 text-white placeholder-gray-500 focus:border-blue-500/50' : 'bg-white border-gray-200 text-gray-900 placeholder-gray-400 focus:border-blue-400'} outline-none transition-all`;
  const cardClass = `rounded-xl p-6 shadow-sm border ${isDarkMode ? 'bg-neutral-900 border-neutral-700' : 'bg-white border-gray-200'}`;

  const handleImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setImageFile(f);
    const reader = new FileReader();
    reader.onload = () => setImagePreview(reader.result as string);
    reader.readAsDataURL(f);
  };

  const handleSubmit = async () => {
    if (!subject.trim() || !description.trim()) return;
    setSaving(true);
    try {
      let imageUrl: string | undefined;
      if (imageFile) {
        setUploading(true);
        const res = await api.support.uploadImage(imageFile);
        imageUrl = res.url;
        setUploading(false);
      }
      const ticket = await api.support.createByOrg(orgId, {
        subject: subject.trim(),
        description: description.trim(),
        imageUrl,
      });
      onCreated(ticket);
    } catch { setSaving(false); }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <button onClick={onClose} className={`flex items-center gap-1 text-xs font-medium ${textSecondary} hover:${textPrimary} transition-colors`}>
        <Icon name="chevron-left" className="w-4 h-4" /> Zurück zur Übersicht
      </button>

      <div className={cardClass}>
        <h2 className={`text-base font-bold ${textPrimary} mb-5`}>Neues Support-Ticket erstellen</h2>

        <div className="space-y-4">
          <div>
            <label className={`block text-[11px] font-semibold mb-1.5 ${textSecondary} uppercase tracking-wider`}>Betreff</label>
            <input value={subject} onChange={e => setSubject(e.target.value)} className={inputClass} placeholder="Kurze Beschreibung des Problems..." />
          </div>
          <div>
            <label className={`block text-[11px] font-semibold mb-1.5 ${textSecondary} uppercase tracking-wider`}>Beschreibung</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={5} className={`${inputClass} resize-none`} placeholder="Beschreiben Sie Ihr Anliegen ausführlich..." />
          </div>
          <div>
            <label className={`block text-[11px] font-semibold mb-1.5 ${textSecondary} uppercase tracking-wider`}>Bild anhängen (optional)</label>
            <input ref={fileRef} type="file" accept="image/*" onChange={handleImage} className="hidden" />
            {imagePreview ? (
              <div className="relative inline-block">
                <img src={imagePreview} alt="Preview" className="h-24 rounded-xl border border-gray-200/30 object-cover" />
                <button onClick={() => { setImageFile(null); setImagePreview(null); }} className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center"><Icon name="x" className="w-3 h-3" /></button>
              </div>
            ) : (
              <button onClick={() => fileRef.current?.click()} className={`flex items-center gap-2 px-4 py-3 rounded-xl border-2 border-dashed text-xs font-medium transition-colors ${isDarkMode ? 'border-neutral-700 text-gray-400 hover:border-neutral-600' : 'border-gray-300 text-gray-500 hover:border-gray-400'}`}>
                <Icon name="image" className="w-4 h-4" /> Bild auswählen
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t" style={{ borderColor: isDarkMode ? 'rgb(64 64 64 / 0.5)' : 'rgb(229 231 235 / 0.5)' }}>
          <button onClick={onClose} className={`px-4 py-2.5 rounded-xl text-xs font-semibold border ${isDarkMode ? 'border-neutral-700 text-gray-400 hover:bg-neutral-800' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>Abbrechen</button>
          <button onClick={handleSubmit} disabled={saving || !subject.trim() || !description.trim()} className="px-5 py-2.5 bg-blue-600 text-white rounded-xl text-xs font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-2">
            {saving ? (uploading ? <><Icon name="loader-2" className="w-3.5 h-3.5 animate-spin" /> Bild wird hochgeladen...</> : <><Icon name="loader-2" className="w-3.5 h-3.5 animate-spin" /> Wird erstellt...</>) : <><Icon name="send" className="w-3.5 h-3.5" /> Ticket erstellen</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════
// TICKET DETAIL / CHAT THREAD
// ════════════════════════════════════════════════

function TicketDetail({ isDarkMode, ticket, orgId, onBack, onUpdate }: {
  isDarkMode: boolean; ticket: Ticket; orgId: string;
  onBack: () => void; onUpdate: (t: Ticket) => void;
}) {
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const user = getStoredUser();

  const messages = ticket.messages || [];
  const isClosed = ticket.statusKey === 'CLOSED' || ticket.statusKey === 'RESOLVED';

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

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
      await api.support.addMessageByOrg(orgId, ticket.id, { content: message.trim(), imageUrl });
      setMessage('');
      setImageFile(null);
      setImagePreview(null);
      const updated = await api.support.getByOrg(orgId, ticket.id);
      onUpdate(updated);
    } catch { /* ignore */ }
    finally { setSending(false); }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const sc = STATUS_COLORS[ticket.status] || STATUS_COLORS.Open;
  const textPrimary = isDarkMode ? 'text-white' : 'text-gray-900';
  const textSecondary = isDarkMode ? 'text-gray-400' : 'text-gray-500';
  const cardClass = `rounded-xl shadow-sm border ${isDarkMode ? 'bg-neutral-900 border-neutral-700' : 'bg-white border-gray-200'}`;

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      {/* Back + header */}
      <button onClick={onBack} className={`flex items-center gap-1 text-xs font-medium ${textSecondary} hover:${textPrimary} transition-colors`}>
        <Icon name="chevron-left" className="w-4 h-4" /> Zurück zur Übersicht
      </button>

      <div className={`${cardClass} p-5`}>
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className={`text-xs font-bold ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`}>#{ticket.ticketNumber}</span>
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${sc.bg} ${sc.text}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} /> {ticket.status}
              </span>
            </div>
            <h2 className={`text-base font-bold mt-1 ${textPrimary}`}>{ticket.subject}</h2>
            <p className={`text-[11px] mt-0.5 ${textSecondary}`}>Erstellt {formatTime(ticket.createdAt)} · Priorität: {ticket.priority}</p>
          </div>
        </div>
      </div>

      {/* Chat thread */}
      <div className={`${cardClass} flex flex-col`} style={{ height: 'calc(100vh - 320px)', minHeight: '400px' }}>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {messages.map(msg => {
            const isUser = msg.senderRole === 'user';
            return (
              <div key={msg.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[75%] ${isUser ? 'order-2' : ''}`}>
                  <div className={`flex items-center gap-2 mb-1 ${isUser ? 'justify-end' : ''}`}>
                    <span className={`text-[10px] font-semibold ${isUser ? (isDarkMode ? 'text-blue-400' : 'text-blue-600') : (isDarkMode ? 'text-emerald-400' : 'text-emerald-600')}`}>
                      {isUser ? msg.senderName || 'Sie' : `${msg.senderName} (Support)`}
                    </span>
                    <span className={`text-[10px] ${textSecondary}`}>{formatTime(msg.createdAt)}</span>
                  </div>
                  <div className={`px-4 py-3 rounded-2xl text-xs leading-relaxed ${isUser ? (isDarkMode ? 'bg-blue-600/20 text-blue-100 rounded-br-md' : 'bg-blue-600 text-white rounded-br-md') : (isDarkMode ? 'bg-neutral-800 text-gray-200 rounded-bl-md' : 'bg-gray-100 text-gray-800 rounded-bl-md')}`}>
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                    {msg.imageUrl && (
                      <img src={msg.imageUrl.startsWith('/') ? msg.imageUrl : msg.imageUrl} alt="Attachment" className="mt-2 rounded-xl max-h-48 object-cover cursor-pointer hover:opacity-90 transition-opacity" onClick={() => window.open(msg.imageUrl!, '_blank')} />
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        {!isClosed ? (
          <div className={`p-4 border-t ${isDarkMode ? 'border-neutral-700' : 'border-gray-200'}`}>
            {imagePreview && (
              <div className="relative inline-block mb-2">
                <img src={imagePreview} alt="Preview" className="h-16 rounded-lg object-cover" />
                <button onClick={() => { setImageFile(null); setImagePreview(null); }} className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full flex items-center justify-center"><Icon name="x" className="w-2.5 h-2.5" /></button>
              </div>
            )}
            <div className="flex items-end gap-2">
              <input ref={fileRef} type="file" accept="image/*" onChange={handleImage} className="hidden" />
              <button onClick={() => fileRef.current?.click()} className={`p-2.5 rounded-xl transition-colors ${isDarkMode ? 'hover:bg-neutral-800 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}>
                <Icon name="paperclip" className="w-4 h-4" />
              </button>
              <textarea value={message} onChange={e => setMessage(e.target.value)} onKeyDown={handleKeyDown} rows={1} placeholder="Nachricht schreiben..." className={`flex-1 px-4 py-2.5 rounded-xl border text-xs resize-none ${isDarkMode ? 'bg-neutral-800 border-neutral-700 text-white placeholder-gray-500' : 'bg-white border-gray-200 text-gray-900 placeholder-gray-400'} outline-none`} />
              <button onClick={handleSend} disabled={sending || (!message.trim() && !imageFile)} className="p-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50">
                {sending ? <Icon name="loader-2" className="w-4 h-4 animate-spin" /> : <Icon name="send" className="w-4 h-4" />}
              </button>
            </div>
          </div>
        ) : (
          <div className={`p-4 text-center border-t ${isDarkMode ? 'border-neutral-700' : 'border-gray-200'}`}>
            <p className={`text-xs ${textSecondary}`}>Dieses Ticket ist {ticket.status === 'Resolved' ? 'gelöst' : 'geschlossen'}.</p>
          </div>
        )}
      </div>
    </div>
  );
}
