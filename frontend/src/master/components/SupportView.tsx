import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Search,
  Send,
  Paperclip,
  X,
  ChevronLeft,
  Loader2,
  MessageSquare,
  Inbox,
  RefreshCw,
  ChevronDown,
} from 'lucide-react';
import {
  PageHeader,
  DataCard,
  MetricCard,
  DataTable,
  StatusChip,
  PriorityBadge,
  EmptyState,
  supportStatusTone,
} from '../../components/patterns';
import { Button } from '../../components/ui/button';
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

const INPUT =
  'w-full pl-10 pr-3 py-2.5 rounded-xl border text-xs bg-muted/50 border-border text-foreground placeholder:text-muted-foreground outline-none focus:border-[color:var(--brand)] focus:ring-2 focus:ring-[color:var(--ring)]';

const STATUS_FILTERS = ['all', 'Open', 'In Progress', 'Waiting', 'Resolved', 'Closed'] as const;

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

export function SupportView(_props: { isDarkMode?: boolean }) {
  void _props;
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [statsRes, ticketsRes] = await Promise.all([
        api.support.stats(),
        api.support.tickets(statusFilter !== 'all' ? { status: statusFilter } : undefined),
      ]);
      setStats(statsRes);
      setTickets(ticketsRes?.data || ticketsRes || []);
    } catch {
      setTickets([]);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const openTicket = async (t: Ticket) => {
    try {
      const full = await api.support.getTicket(t.id);
      setSelectedTicket(full);
    } catch {
      setSelectedTicket({ ...t, messages: [] });
    }
  };

  const filtered = useMemo(
    () =>
      tickets.filter((t) => {
        if (!searchTerm) return true;
        const q = searchTerm.toLowerCase();
        return (
          t.subject.toLowerCase().includes(q) ||
          t.reporterEmail.toLowerCase().includes(q) ||
          `#${t.ticketNumber}`.includes(q) ||
          t.reporterName.toLowerCase().includes(q)
        );
      }),
    [tickets, searchTerm],
  );

  if (selectedTicket) {
    return (
      <AdminTicketDetail
        ticket={selectedTicket}
        onBack={() => {
          setSelectedTicket(null);
          void loadData();
        }}
        onUpdate={setSelectedTicket}
      />
    );
  }

  return (
    <div className="space-y-5 pb-8">
      <PageHeader
        title="Support Center"
        eyebrow="Master Admin"
        description="Manage all support tickets across organizations"
        icon={<MessageSquare className="w-4 h-4" />}
        actions={
          <Button type="button" variant="outline" size="sm" onClick={() => void loadData()} disabled={loading}>
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        }
      />

      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <MetricCard label="Total" value={stats.total} status="neutral" />
          <MetricCard label="Open" value={stats.open} status="info" />
          <MetricCard label="In Progress" value={stats.inProgress} status="watch" />
          <MetricCard label="Waiting" value={stats.waiting} status="watch" />
          <MetricCard label="Resolved" value={stats.resolved} status="success" />
          <MetricCard label="Closed" value={stats.closed} status="noData" />
        </div>
      )}

      <DataCard title="Tickets" flush>
        <div className="p-4 space-y-3 border-b border-border/70">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by subject, email, ticket #..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={INPUT}
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {STATUS_FILTERS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                  statusFilter === s
                    ? 'bg-[color:var(--brand)] text-[color:var(--brand-foreground)] border-[color:var(--brand)]'
                    : 'border-border text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                }`}
              >
                {s === 'all' ? 'All' : s}
              </button>
            ))}
          </div>
        </div>

        <DataTable
          card={false}
          loading={loading}
          rows={filtered}
          getRowKey={(t) => t.id}
          onRowClick={openTicket}
          empty={
            <EmptyState
              icon={<Inbox className="w-5 h-5" />}
              title="No tickets found"
              description="Try a different filter or search term."
              compact
            />
          }
          columns={[
            {
              key: 'num',
              header: '#',
              cell: (t) => (
                <span className="text-xs font-bold text-[color:var(--brand)] tabular-nums">
                  #{t.ticketNumber}
                </span>
              ),
            },
            {
              key: 'subject',
              header: 'Subject',
              cell: (t) => (
                <p className="text-xs font-semibold truncate max-w-[250px] text-foreground">{t.subject}</p>
              ),
            },
            {
              key: 'reporter',
              header: 'Reporter',
              cell: (t) => (
                <div>
                  <p className="text-xs font-medium text-foreground">{t.reporterName || t.reporterEmail}</p>
                  <p className="text-[10px] text-muted-foreground">{t.reporterEmail}</p>
                </div>
              ),
            },
            {
              key: 'status',
              header: 'Status',
              cell: (t) => (
                <StatusChip tone={supportStatusTone(t.status)} dot>
                  {t.status}
                </StatusChip>
              ),
            },
            {
              key: 'priority',
              header: 'Priority',
              cell: (t) => <PriorityBadge priority={t.priority} />,
            },
            {
              key: 'activity',
              header: 'Activity',
              cell: (t) => (
                <span className="text-[11px] text-muted-foreground tabular-nums">
                  {formatTime(t.lastActivityAt || t.createdAt)}
                </span>
              ),
            },
            {
              key: 'msgs',
              header: 'Msgs',
              cell: (t) => (
                <div className="flex items-center gap-1 text-muted-foreground">
                  <MessageSquare className="w-3 h-3" />
                  <span className="text-[11px] tabular-nums">{t.messageCount || 0}</span>
                </div>
              ),
            },
          ]}
        />
      </DataCard>
    </div>
  );
}

function AdminTicketDetail({
  ticket,
  onBack,
  onUpdate,
}: {
  ticket: Ticket;
  onBack: () => void;
  onUpdate: (t: Ticket) => void;
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
    } catch {
      /* ignore */
    } finally {
      setSending(false);
    }
  };

  const handleStatusChange = async (status: string) => {
    setStatusChanging(true);
    setShowStatusMenu(false);
    try {
      await api.support.updateStatus(ticket.id, status);
      const updated = await api.support.getTicket(ticket.id);
      onUpdate(updated);
    } catch {
      /* ignore */
    } finally {
      setStatusChanging(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  const statusLabels: Record<string, string> = {
    OPEN: 'Open',
    IN_PROGRESS: 'In Progress',
    WAITING: 'Waiting',
    RESOLVED: 'Resolved',
    CLOSED: 'Closed',
  };

  return (
    <div className="space-y-4 pb-8">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronLeft className="w-4 h-4" /> Back to tickets
      </button>

      <DataCard>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-[color:var(--brand)] tabular-nums">
                #{ticket.ticketNumber}
              </span>
              <StatusChip tone={supportStatusTone(ticket.status)} dot>
                {ticket.status}
              </StatusChip>
              <PriorityBadge priority={ticket.priority} />
            </div>
            <h2 className="text-base font-bold mt-1 text-foreground">{ticket.subject}</h2>
            <p className="text-[11px] mt-0.5 text-muted-foreground">
              From: {ticket.reporterName || ticket.reporterEmail} · Created{' '}
              {formatTime(ticket.createdAt)}
            </p>
          </div>
          <div className="relative shrink-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowStatusMenu(!showStatusMenu)}
              disabled={statusChanging}
              className="gap-1.5"
            >
              {statusChanging ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
              Change Status
              <ChevronDown className="w-3 h-3" />
            </Button>
            {showStatusMenu && (
              <div className="absolute right-0 top-full mt-1 z-20 w-44 rounded-xl border border-border bg-popover shadow-[var(--shadow-2)] overflow-hidden">
                {(['OPEN', 'IN_PROGRESS', 'WAITING', 'RESOLVED', 'CLOSED'] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => void handleStatusChange(s)}
                    className={`w-full text-left px-4 py-2.5 text-xs font-medium transition-colors hover:bg-muted text-foreground ${
                      ticket.statusKey === s ? 'font-bold bg-muted/50' : ''
                    }`}
                  >
                    {statusLabels[s]}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </DataCard>

      <DataCard flush bodyClassName="flex flex-col" className="overflow-hidden">
        <div
          className="flex flex-col"
          style={{ height: 'calc(100vh - 340px)', minHeight: '400px' }}
        >
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {messages.map((msg) => {
              const isAdmin = msg.senderRole === 'admin';
              return (
                <div key={msg.id} className={`flex ${isAdmin ? 'justify-end' : 'justify-start'}`}>
                  <div className="max-w-[75%]">
                    <div className={`flex items-center gap-2 mb-1 ${isAdmin ? 'justify-end' : ''}`}>
                      <span
                        className={`text-[10px] font-semibold ${
                          isAdmin ? 'text-[color:var(--status-positive)]' : 'text-[color:var(--brand)]'
                        }`}
                      >
                        {isAdmin ? `${msg.senderName} (You)` : msg.senderName}
                      </span>
                      <span className="text-[10px] text-muted-foreground tabular-nums">
                        {formatTime(msg.createdAt)}
                      </span>
                    </div>
                    <div
                      className={`px-4 py-3 rounded-2xl text-xs leading-relaxed ${
                        isAdmin
                          ? 'bg-[color:var(--brand-soft)] text-[color:var(--brand-ink)] rounded-br-md border border-[color:var(--brand)]/15'
                          : 'bg-muted text-foreground rounded-bl-md'
                      }`}
                    >
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                      {msg.imageUrl && (
                        <img
                          src={msg.imageUrl}
                          alt="Attachment"
                          className="mt-2 rounded-xl max-h-48 object-cover cursor-pointer hover:opacity-90"
                          onClick={() => window.open(msg.imageUrl!, '_blank')}
                        />
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          <div className="p-4 border-t border-border">
            {imagePreview && (
              <div className="relative inline-block mb-2">
                <img src={imagePreview} alt="Preview" className="h-16 rounded-lg object-cover" />
                <button
                  type="button"
                  onClick={() => {
                    setImageFile(null);
                    setImagePreview(null);
                  }}
                  className="absolute -top-1 -right-1 w-4 h-4 bg-[color:var(--status-critical)] text-white rounded-full flex items-center justify-center"
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              </div>
            )}
            <div className="flex items-end gap-2">
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                onChange={handleImage}
                className="hidden"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => fileRef.current?.click()}
                className="shrink-0"
              >
                <Paperclip className="w-4 h-4" />
              </Button>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={handleKeyDown}
                rows={1}
                placeholder="Reply to this ticket..."
                className="flex-1 px-4 py-2.5 rounded-xl border text-xs resize-none bg-muted/50 border-border text-foreground placeholder:text-muted-foreground outline-none focus:border-[color:var(--brand)]"
              />
              <Button
                type="button"
                size="icon"
                onClick={() => void handleSend()}
                disabled={sending || (!message.trim() && !imageFile)}
                className="shrink-0 bg-[color:var(--brand)] text-[color:var(--brand-foreground)] hover:bg-[color:var(--brand-hover)]"
              >
                {sending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </Button>
            </div>
          </div>
        </div>
      </DataCard>
    </div>
  );
}
