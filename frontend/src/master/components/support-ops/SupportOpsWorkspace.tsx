import { useEffect, useRef, useState } from 'react';
import {
  Building2,
  ChevronDown,
  ClipboardList,
  ExternalLink,
  Loader2,
  Lock,
  Paperclip,
  Send,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { StatusChip } from '../../../components/patterns/status';
import { supportStatusTone } from '../../../components/patterns/status-utils';
import { EmptyState, ErrorState, SkeletonCard } from '../../../components/patterns/states';
import { Button } from '../../../components/ui/button';
import { cn } from '../../../components/ui/utils';
import { SupportTechnicalContextCard } from '../../../components/support/SupportTechnicalContextCard';
import {
  api,
  type SupportTicket,
  type SupportTicketCategory,
  type SupportTicketMessage,
  type SupportTicketPriority,
  type SupportTicketStatus,
} from '../../../lib/api';
import {
  SUPPORT_CATEGORY_LABEL,
  SUPPORT_PRIORITY_LABEL,
  formatDateTime,
  formatRelativeTime,
  getMessageSenderLabel,
  getTicketCode,
  isTerminalStatus,
  normalizeCategoryKey,
  normalizePriorityKey,
  normalizeStatusKey,
  relatedEntityLabel,
  sop,
  supportPriorityTone,
  supportStatusLabel,
} from './support-ops.utils';

interface AssigneeOption {
  id: string;
  name: string;
}

interface SupportOpsWorkspaceProps {
  ticket: SupportTicket | null;
  loading?: boolean;
  error?: string | null;
  orgName: string;
  assignees: AssigneeOption[];
  assigneeName: (id: string | null | undefined) => string;
  onTicketUpdate: (ticket: SupportTicket) => void;
  onNavigateToOrg?: (orgId: string) => void;
  onClose?: () => void;
  className?: string;
}

type ComposerTab = 'reply' | 'internal';

const STATUSES: SupportTicketStatus[] = ['OPEN', 'IN_PROGRESS', 'WAITING_FOR_CUSTOMER', 'RESOLVED', 'CLOSED'];
const PRIORITIES: SupportTicketPriority[] = ['LOW', 'NORMAL', 'HIGH', 'CRITICAL'];
const CATEGORIES: SupportTicketCategory[] = [
  'APP',
  'VEHICLE',
  'BOOKING',
  'BILLING',
  'DIMO_TELEMETRY',
  'ACCOUNT',
  'DOCUMENTS',
  'DATA_AUTHORIZATION',
  'HEALTH',
  'OTHER',
];

export function SupportOpsWorkspace({
  ticket,
  loading,
  error,
  orgName,
  assignees,
  assigneeName,
  onTicketUpdate,
  onNavigateToOrg,
  onClose,
  className,
}: SupportOpsWorkspaceProps) {
  const [composerTab, setComposerTab] = useState<ComposerTab>('reply');
  const [reply, setReply] = useState('');
  const [internalNote, setInternalNote] = useState('');
  const [sending, setSending] = useState(false);
  const [savingNote, setSavingNote] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [metaOpen, setMetaOpen] = useState(true);
  const [creatingTask, setCreatingTask] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setReply('');
    setInternalNote('');
    setImageFile(null);
    setImagePreview(null);
    setComposerTab('reply');
  }, [ticket?.id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [ticket?.messages?.length, ticket?.id]);

  if (loading) {
    return (
      <div className={cn(sop.workspaceCol, 'p-4', className)}>
        <SkeletonCard />
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn(sop.workspaceCol, className)}>
        <ErrorState compact title="Ticket konnte nicht geladen werden" description={error} />
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className={cn(sop.workspaceCol, 'items-center justify-center p-8', className)}>
        <EmptyState compact title="Ticket auswählen" description="Wähle ein Ticket aus der Inbox, um den Workspace zu öffnen." />
      </div>
    );
  }

  const status = normalizeStatusKey(ticket);
  const priority = normalizePriorityKey(ticket);
  const category = normalizeCategoryKey(ticket);
  const terminal = isTerminalStatus(status);
  const messages = ticket.messages ?? [];
  const related = relatedEntityLabel(ticket.relatedEntityType ?? null, ticket.relatedEntityId);

  const patchTicket = async (
    patch: {
      status?: SupportTicketStatus;
      priority?: SupportTicketPriority;
      category?: SupportTicketCategory;
      assignedToUserId?: string | null;
    },
    successMsg: string,
    errorMsg: string,
  ) => {
    setUpdating(true);
    try {
      await api.support.updateTicket(ticket.id, patch);
      const updated = await api.support.getTicket(ticket.id);
      onTicketUpdate(updated);
      toast.success(successMsg);
      if (patch.status === 'RESOLVED' || patch.status === 'CLOSED') {
        toast.message('Status aktualisiert', {
          description: 'Eine Systemnachricht wurde im Thread erstellt.',
        });
      }
    } catch (e) {
      toast.error(errorMsg, { description: e instanceof Error ? e.message : undefined });
    } finally {
      setUpdating(false);
    }
  };

  const handleReply = async () => {
    if (sending || (!reply.trim() && !imageFile)) return;
    if (terminal) {
      toast.error('Öffentliche Antwort nicht möglich', {
        description: 'Bitte Status zuerst auf „In Bearbeitung“ setzen oder Ticket wieder öffnen.',
      });
      return;
    }
    setSending(true);
    try {
      let imageUrl: string | undefined;
      if (imageFile) {
        const res = await api.support.uploadImage(imageFile, ticket.organizationId);
        imageUrl = res.url;
      }
      await api.support.addMessage(ticket.id, { content: reply.trim(), body: reply.trim(), imageUrl });
      if (status === 'OPEN') {
        toast.message('Ticket in Bearbeitung', { description: 'Status wurde automatisch aktualisiert.' });
      }
      setReply('');
      setImageFile(null);
      setImagePreview(null);
      const updated = await api.support.getTicket(ticket.id);
      onTicketUpdate(updated);
      toast.success('Antwort gesendet');
    } catch (e) {
      toast.error('Nachricht konnte nicht gesendet werden', { description: e instanceof Error ? e.message : undefined });
    } finally {
      setSending(false);
    }
  };

  const handleInternalNote = async () => {
    if (!internalNote.trim()) return;
    setSavingNote(true);
    try {
      await api.support.addInternalNote(ticket.id, internalNote.trim());
      setInternalNote('');
      const updated = await api.support.getTicket(ticket.id);
      onTicketUpdate(updated);
      toast.success('Interne Notiz gespeichert');
    } catch (e) {
      toast.error('Interne Notiz konnte nicht gespeichert werden', {
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setSavingNote(false);
    }
  };

  const handleImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setImageFile(f);
    const reader = new FileReader();
    reader.onload = () => setImagePreview(reader.result as string);
    reader.readAsDataURL(f);
    e.target.value = '';
  };

  const handleReplyKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!sending && !terminal) void handleReply();
    }
  };

  const handleCreateTask = async () => {
    if (!ticket.organizationId) return;
    setCreatingTask(true);
    try {
      const meta = (ticket.metadata ?? {}) as Record<string, unknown>;
      const vehicleId =
        (typeof meta.vehicleId === 'string' ? meta.vehicleId : undefined) ??
        (ticket.relatedEntityType === 'VEHICLE' ? ticket.relatedEntityId ?? undefined : undefined);
      const bookingId =
        (typeof meta.bookingId === 'string' ? meta.bookingId : undefined) ??
        (ticket.relatedEntityType === 'BOOKING' ? ticket.relatedEntityId ?? undefined : undefined);

      await api.tasks.create(ticket.organizationId, {
        title: `Support: ${ticket.subject}`.slice(0, 120),
        description: `Follow-up für Support-Ticket ${getTicketCode(ticket)}.`,
        type: 'CUSTOM',
        source: 'MANUAL',
        sourceKey: 'SUPPORT_OPS',
        priority: priority === 'CRITICAL' || priority === 'HIGH' ? 'HIGH' : 'NORMAL',
        vehicleId,
        bookingId,
        metadata: { supportTicketId: ticket.id, supportTicketCode: getTicketCode(ticket) },
      });
      toast.success('Aufgabe erstellt', {
        description: 'Follow-up-Aufgabe wurde in der Organisation angelegt.',
      });
    } catch (e) {
      toast.error('Aufgabe konnte nicht erstellt werden', {
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setCreatingTask(false);
    }
  };

  return (
    <section className={cn(sop.workspaceCol, 'min-h-[480px]', className)}>
      <div className="border-b border-border/40 p-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1">
              <span className="text-[10px] font-bold text-[color:var(--brand)]">{getTicketCode(ticket)}</span>
              <StatusChip tone={supportStatusTone(status)} dot className="text-[9px]">
                {supportStatusLabel(status, 'admin')}
              </StatusChip>
              <StatusChip tone={supportPriorityTone(priority)} className="text-[9px]">
                {SUPPORT_PRIORITY_LABEL[priority]}
              </StatusChip>
              <StatusChip tone="neutral" className="text-[9px]">
                {SUPPORT_CATEGORY_LABEL[category]}
              </StatusChip>
            </div>
            <h2 className="mt-1 text-[14px] font-semibold leading-snug text-foreground">{ticket.subject}</h2>
            <p className="mt-0.5 text-[10px] text-muted-foreground">
              {orgName} · {formatRelativeTime(ticket.lastMessageAt || ticket.lastActivityAt)}
            </p>
          </div>
          {onClose && (
            <Button type="button" variant="ghost" size="icon" className="xl:hidden shrink-0" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5">
          <ActionSelect
            label="Status"
            value={status}
            disabled={updating}
            options={STATUSES.map((s) => ({ value: s, label: supportStatusLabel(s, 'admin') }))}
            onChange={(v) => void patchTicket({ status: v as SupportTicketStatus }, 'Status geändert', 'Status konnte nicht geändert werden')}
          />
          <ActionSelect
            label="Priorität"
            value={priority}
            disabled={updating}
            options={PRIORITIES.map((p) => ({ value: p, label: SUPPORT_PRIORITY_LABEL[p] }))}
            onChange={(v) => void patchTicket({ priority: v as SupportTicketPriority }, 'Priorität geändert', 'Priorität konnte nicht geändert werden')}
          />
          <ActionSelect
            label="Kategorie"
            value={category}
            disabled={updating}
            options={CATEGORIES.map((c) => ({ value: c, label: SUPPORT_CATEGORY_LABEL[c] }))}
            onChange={(v) => void patchTicket({ category: v as SupportTicketCategory }, 'Kategorie geändert', 'Kategorie konnte nicht geändert werden')}
          />
          <ActionSelect
            label="Assignee"
            value={ticket.assignedToUserId || ''}
            disabled={updating}
            options={[
              { value: '', label: 'Nicht zugewiesen' },
              ...assignees.map((a) => ({ value: a.id, label: a.name })),
            ]}
            onChange={(v) =>
              void patchTicket(
                { assignedToUserId: v || null },
                v ? 'Ticket zugewiesen' : 'Zuweisung entfernt',
                'Zuweisung konnte nicht gespeichert werden',
              )
            }
          />
          {onNavigateToOrg && ticket.organizationId && (
            <Button type="button" variant="outline" size="sm" className="h-8 text-[10px]" onClick={() => onNavigateToOrg(ticket.organizationId)}>
              <Building2 className="h-3 w-3" />
              Organisation
            </Button>
          )}
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-rows-[1fr_auto]">
        <div className="overflow-y-auto p-3 space-y-2.5">
          {messages.length === 0 ? (
            <p className="text-center text-[11px] text-muted-foreground">Kein Verlauf vorhanden.</p>
          ) : (
            messages.map((msg) => <MessageBubble key={msg.id} message={msg} />)
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="border-t border-border/40 p-3 space-y-2">
          <div className="flex gap-1 rounded-lg bg-muted/30 p-0.5">
            <button
              type="button"
              onClick={() => setComposerTab('reply')}
              className={cn(
                'flex-1 rounded-md px-2 py-1.5 text-[10px] font-semibold transition-colors',
                composerTab === 'reply' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground',
              )}
            >
              Antwort an Kunden
            </button>
            <button
              type="button"
              onClick={() => setComposerTab('internal')}
              className={cn(
                'flex-1 rounded-md px-2 py-1.5 text-[10px] font-semibold transition-colors',
                composerTab === 'internal' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground',
              )}
            >
              Interne Notiz
            </button>
          </div>

          {composerTab === 'reply' ? (
            <>
              {terminal && (
                <p className="rounded-lg border border-border/50 bg-muted/20 px-2.5 py-2 text-[10px] text-muted-foreground">
                  Ticket ist gelöst/geschlossen. Status ändern, bevor du öffentlich antwortest.
                </p>
              )}
              {imagePreview && <AttachmentPreview src={imagePreview} onRemove={() => { setImageFile(null); setImagePreview(null); }} />}
              <div className="flex items-end gap-1.5">
                <input ref={fileRef} type="file" accept="image/*,.pdf" className="hidden" onChange={handleImage} />
                <Button type="button" variant="outline" size="icon" className="h-9 w-9 shrink-0" onClick={() => fileRef.current?.click()} disabled={terminal} aria-label="Anhang hinzufügen">
                  <Paperclip className="h-3.5 w-3.5" />
                </Button>
                <textarea
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  onKeyDown={handleReplyKeyDown}
                  rows={2}
                  disabled={terminal}
                  placeholder="Öffentliche Antwort…"
                  aria-label="Öffentliche Antwort an Kunden"
                  className="min-h-[40px] flex-1 resize-none rounded-lg border border-border/60 bg-background/80 px-2.5 py-2 text-[11px] outline-none disabled:opacity-50"
                />
                <Button type="button" size="icon" className="h-9 w-9 shrink-0" disabled={sending || terminal || (!reply.trim() && !imageFile)} onClick={() => void handleReply()} aria-label="Antwort senden">
                  {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <Lock className="h-3 w-3" />
                Nicht sichtbar für Kunden
              </p>
              <textarea
                value={internalNote}
                onChange={(e) => setInternalNote(e.target.value)}
                rows={3}
                placeholder="Interne Notiz für das Support-Team…"
                aria-label="Interne Notiz"
                className="w-full resize-none rounded-lg border border-amber-500/20 bg-amber-500/5 px-2.5 py-2 text-[11px] outline-none focus:border-amber-500/40"
              />
              <Button type="button" size="sm" className="w-full" disabled={savingNote || !internalNote.trim()} onClick={() => void handleInternalNote()}>
                {savingNote ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Notiz speichern'}
              </Button>
            </>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={() => setMetaOpen((v) => !v)}
        className="flex w-full items-center justify-between border-t border-border/40 px-3 py-2 text-[10px] font-semibold text-muted-foreground hover:bg-muted/30"
      >
        Kontext & Meta
        <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', metaOpen && 'rotate-180')} />
      </button>

      {metaOpen && (
        <div className="max-h-[220px] overflow-y-auto border-t border-border/30 px-3 py-2.5 text-[10px] space-y-2">
          <MetaRow label="Ersteller" value={`${ticket.reporterName || '—'} (${ticket.reporterEmail})`} />
          <MetaRow label="Assignee" value={assigneeName(ticket.assignedToUserId)} />
          <MetaRow label="Erstellt" value={formatDateTime(ticket.createdAt)} />
          <MetaRow label="Letzte Nachricht" value={formatDateTime(ticket.lastMessageAt || ticket.lastActivityAt)} />
          <MetaRow label="Erste Antwort" value={formatDateTime(ticket.firstResponseAt)} />
          <MetaRow label="Gelöst" value={formatDateTime(ticket.resolvedAt)} />
          {related && (
            <div className="rounded-lg border border-border/40 bg-muted/20 p-2">
              <p className="font-semibold text-foreground">Verknüpftes Objekt</p>
              <p className="mt-0.5 text-muted-foreground">{related}</p>
              {ticket.relatedEntityId && (
                <p className="mt-0.5 font-mono text-[9px] text-muted-foreground">{ticket.relatedEntityId}</p>
              )}
            </div>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 w-full gap-1.5 text-[10px]"
            disabled={creatingTask}
            onClick={() => void handleCreateTask()}
          >
            {creatingTask ? <Loader2 className="h-3 w-3 animate-spin" /> : <ClipboardList className="h-3 w-3" />}
            Aufgabe erstellen
          </Button>
        </div>
      )}

      <SupportTechnicalContextCard ticket={ticket} orgName={orgName} />
    </section>
  );
}

function ActionSelect({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className="inline-flex items-center gap-1 rounded-md border border-border/50 bg-background/60 px-1.5 py-1">
      <span className="text-[9px] text-muted-foreground">{label}</span>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="max-w-[100px] bg-transparent text-[10px] font-medium outline-none"
      >
        {options.map((o) => (
          <option key={o.value || 'none'} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right text-foreground">{value}</span>
    </div>
  );
}

function MessageBubble({ message }: { message: SupportTicketMessage }) {
  const isInternal = message.isInternal;
  const isSystem = message.senderRole === 'system';
  const isAdmin = message.senderRole === 'admin';
  const text = message.body || message.content;
  const attachments = [
    ...(message.imageUrl ? [{ url: message.imageUrl, fileName: 'Anhang' }] : []),
    ...(message.attachments ?? []),
  ];

  if (isSystem) {
    return (
      <div className="flex justify-center">
        <div className="max-w-[95%] rounded-md bg-muted/40 px-2 py-1 text-center text-[9px] text-muted-foreground">
          {text}
          <span className="mt-0.5 block opacity-70">{formatRelativeTime(message.createdAt)}</span>
        </div>
      </div>
    );
  }

  if (isInternal) {
    return (
      <div className="rounded-lg border border-amber-500/25 bg-amber-500/8 px-2.5 py-2">
        <div className="mb-1 flex items-center gap-1 text-[9px] font-semibold text-amber-700 dark:text-amber-300">
          <Lock className="h-3 w-3" />
          Intern · {message.senderName}
          <span className="font-normal text-muted-foreground">· {formatRelativeTime(message.createdAt)}</span>
        </div>
        <p className="whitespace-pre-wrap text-[11px] text-foreground">{text}</p>
      </div>
    );
  }

  return (
    <div className={cn('flex', isAdmin ? 'justify-end' : 'justify-start')}>
      <div className="max-w-[90%]">
        <div className={cn('mb-0.5 flex items-center gap-1.5 text-[9px]', isAdmin && 'justify-end')}>
          <span className="font-semibold text-foreground">
            {getMessageSenderLabel(message, 'admin')}
          </span>
          <span className="text-muted-foreground">{formatRelativeTime(message.createdAt)}</span>
        </div>
        <div
          className={cn(
            'rounded-xl px-2.5 py-2 text-[11px] leading-relaxed',
            isAdmin
              ? 'rounded-br-sm bg-[color:var(--brand-soft)] text-foreground border border-[color:var(--brand)]/15'
              : 'rounded-bl-sm bg-muted/40 text-foreground',
          )}
        >
          {text && <p className="whitespace-pre-wrap">{text}</p>}
          {attachments.map((att, i) => (
            <a key={i} href={att.url} target="_blank" rel="noreferrer" className="mt-1.5 flex items-center gap-1 text-[10px] underline">
              <ExternalLink className="h-3 w-3" />
              {att.fileName || 'Anhang'}
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}

function AttachmentPreview({ src, onRemove }: { src: string; onRemove: () => void }) {
  return (
    <div className="relative inline-block">
      <img src={src} alt="" className="h-14 rounded-md object-cover" />
      <button type="button" onClick={onRemove} className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-white">
        <X className="h-2.5 w-2.5" />
      </button>
    </div>
  );
}
