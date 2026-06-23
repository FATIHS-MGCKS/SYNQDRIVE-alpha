import { useEffect, useRef, useState } from 'react';
import { Loader2, Paperclip, RotateCcw, Send, X } from 'lucide-react';
import { toast } from 'sonner';
import { StatusChip } from '../../../components/patterns/status';
import { supportStatusTone } from '../../../components/patterns/status-utils';
import { SkeletonCard } from '../../../components/patterns/states';
import { Button } from '../../../components/ui/button';
import { cn } from '../../../components/ui/utils';
import { api, type SupportTicket, type SupportTicketMessage } from '../../../lib/api';
import {
  SUPPORT_CATEGORY_LABEL,
  SUPPORT_PRIORITY_LABEL,
  SUPPORT_STATUS_LABEL,
  formatDateTime,
  formatRelativeTime,
  getMessageSenderLabel,
  getTicketCode,
  isTicketClosed,
  normalizeCategoryKey,
  normalizePriorityKey,
  normalizeStatusKey,
  relatedEntityLabel,
  sp,
  supportPriorityTone,
} from './support-center.utils';

interface SupportTicketDetailPanelProps {
  ticket: SupportTicket | null;
  orgId: string;
  loading?: boolean;
  onTicketUpdate: (ticket: SupportTicket) => void;
  onClose?: () => void;
  className?: string;
}

export function SupportTicketDetailPanel({
  ticket,
  orgId,
  loading,
  onTicketUpdate,
  onClose,
  className,
}: SupportTicketDetailPanelProps) {
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [reopening, setReopening] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMessage('');
    setImageFile(null);
    setImagePreview(null);
  }, [ticket?.id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [ticket?.messages?.length, ticket?.id]);

  if (loading) {
    return (
      <div className={cn(sp.detailPanel, 'p-4', className)}>
        <SkeletonCard />
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className={cn(sp.detailPanel, 'items-center justify-center p-8 text-center', className)}>
        <p className="text-[13px] font-semibold text-foreground">Ticket auswählen</p>
        <p className="mt-1 max-w-xs text-[12px] text-muted-foreground">
          Wähle links ein Ticket, um den Verlauf zu lesen und zu antworten.
        </p>
      </div>
    );
  }

  const status = normalizeStatusKey(ticket);
  const priority = normalizePriorityKey(ticket);
  const category = normalizeCategoryKey(ticket);
  const closed = isTicketClosed(ticket);
  const messages = (ticket.messages ?? []).filter((m) => !m.isInternal);
  const related = relatedEntityLabel(ticket.relatedEntityType ?? null, ticket.relatedEntityId);

  const handleImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setImageFile(f);
    const reader = new FileReader();
    reader.onload = () => setImagePreview(reader.result as string);
    reader.readAsDataURL(f);
    e.target.value = '';
  };

  const handleSend = async () => {
    if (sending || (!message.trim() && !imageFile)) return;
    setSending(true);
    try {
      let imageUrl: string | undefined;
      if (imageFile) {
        setUploadProgress(30);
        const res = await api.support.uploadImage(imageFile, orgId);
        imageUrl = res.url;
        setUploadProgress(100);
      }
      await api.support.addMessageByOrg(orgId, ticket.id, {
        content: message.trim(),
        body: message.trim(),
        imageUrl,
      });
      setMessage('');
      setImageFile(null);
      setImagePreview(null);
      const updated = await api.support.getByOrg(orgId, ticket.id);
      onTicketUpdate(updated);
      toast.success('Nachricht gesendet');
    } catch (e) {
      toast.error('Nachricht konnte nicht gesendet werden', {
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setSending(false);
      setUploadProgress(null);
    }
  };

  const handleReopen = async () => {
    setReopening(true);
    try {
      const updated = await api.support.reopenByOrg(orgId, ticket.id);
      const full = await api.support.getByOrg(orgId, updated.id);
      onTicketUpdate(full);
      toast.success('Ticket wurde wieder geöffnet');
    } catch (e) {
      toast.error('Ticket konnte nicht wieder geöffnet werden', {
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setReopening(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!sending) void handleSend();
    }
  };

  return (
    <div className={cn(sp.detailPanel, 'min-h-[420px]', className)}>
      <div className="border-b border-border/40 p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-bold text-[color:var(--brand)]">{getTicketCode(ticket)}</span>
              <StatusChip tone={supportStatusTone(status)} dot className="text-[10px]">
                {SUPPORT_STATUS_LABEL[status]}
              </StatusChip>
            </div>
            <h2 className="mt-1 text-[15px] font-semibold tracking-[-0.02em] text-foreground">{ticket.subject}</h2>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <StatusChip tone="neutral" className="text-[10px]">
                {SUPPORT_CATEGORY_LABEL[category]}
              </StatusChip>
              <StatusChip tone={supportPriorityTone(priority)} className="text-[10px]">
                {SUPPORT_PRIORITY_LABEL[priority]}
              </StatusChip>
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Erstellt {formatDateTime(ticket.createdAt)}
              {related ? ` · ${related}` : ''}
            </p>
          </div>
          {onClose && (
            <Button type="button" variant="ghost" size="icon" onClick={onClose} className="lg:hidden shrink-0">
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex-1 space-y-3 overflow-y-auto p-4 sm:p-5">
          {messages.length === 0 ? (
            <p className="text-center text-[12px] text-muted-foreground">Noch keine Nachrichten im Thread.</p>
          ) : (
            messages.map((msg) => <MessageBubble key={msg.id} message={msg} />)
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="border-t border-border/40 p-4">
          {closed ? (
            <div className="space-y-3 text-center">
              <p className="text-[12px] text-muted-foreground">
                Dieses Ticket ist {status === 'RESOLVED' ? 'gelöst' : 'geschlossen'}.
              </p>
              <Button type="button" variant="outline" onClick={handleReopen} disabled={reopening}>
                {reopening ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RotateCcw className="h-4 w-4" />
                )}
                Ticket wieder öffnen
              </Button>
            </div>
          ) : (
            <>
              {imagePreview && (
                <div className="relative mb-2 inline-block">
                  <img src={imagePreview} alt="" className="h-16 rounded-lg object-cover" />
                  <button
                    type="button"
                    onClick={() => {
                      setImageFile(null);
                      setImagePreview(null);
                    }}
                    className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-white"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              )}
              {uploadProgress != null && sending && (
                <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-[color:var(--brand)] transition-all duration-300"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              )}
              <div className="flex items-end gap-2">
                <input ref={fileRef} type="file" accept="image/*,.pdf" onChange={handleImage} className="hidden" />
                <Button type="button" variant="outline" size="icon" onClick={() => fileRef.current?.click()} aria-label="Anhang hinzufügen">
                  <Paperclip className="h-4 w-4" />
                </Button>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyDown={handleKeyDown}
                  rows={2}
                  placeholder="Nachricht schreiben…"
                  aria-label="Nachricht an Support"
                  className="min-h-[44px] flex-1 resize-none rounded-xl border border-border/60 bg-background/80 px-3.5 py-2.5 text-xs outline-none focus:border-[color:var(--brand)]"
                />
                <Button
                  type="button"
                  size="icon"
                  onClick={() => void handleSend()}
                  disabled={sending || (!message.trim() && !imageFile)}
                  aria-label="Nachricht senden"
                >
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: SupportTicketMessage }) {
  const isSystem = message.senderRole === 'system';
  const isUser = message.senderRole === 'user';
  const text = message.body || message.content;
  const attachments = [
    ...(message.imageUrl ? [{ url: message.imageUrl, fileName: 'Anhang' }] : []),
    ...(message.attachments ?? []),
  ];

  if (isSystem) {
    return (
      <div className="flex justify-center animate-fade-up">
        <div className="max-w-[90%] rounded-lg bg-muted/50 px-3 py-1.5 text-center text-[10px] text-muted-foreground">
          {text}
          <span className="mt-0.5 block opacity-70">{formatRelativeTime(message.createdAt)}</span>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('flex animate-fade-up', isUser ? 'justify-end' : 'justify-start')}>
      <div className={cn('max-w-[85%]', isUser ? 'items-end' : 'items-start')}>
        <div className={cn('mb-1 flex items-center gap-2 text-[10px]', isUser && 'justify-end')}>
          <span className={cn('font-semibold', isUser ? 'text-[color:var(--brand)]' : 'text-foreground')}>
            {getMessageSenderLabel(message, 'user')}
          </span>
          <span className="text-muted-foreground">{formatRelativeTime(message.createdAt)}</span>
        </div>
        <div
          className={cn(
            'rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed',
            isUser
              ? 'rounded-br-md bg-[color:var(--brand)] text-white'
              : 'rounded-bl-md border border-border/50 bg-muted/30 text-foreground',
          )}
        >
          {text && <p className="whitespace-pre-wrap">{text}</p>}
          {attachments.map((att, i) => (
            <AttachmentPreview key={i} url={att.url} fileName={att.fileName} />
          ))}
        </div>
      </div>
    </div>
  );
}

function AttachmentPreview({ url, fileName }: { url: string; fileName?: string }) {
  const isImage = /\.(png|jpe?g|gif|webp)(\?|$)/i.test(url) || url.startsWith('data:image');
  if (isImage) {
    return (
      <button
        type="button"
        onClick={() => window.open(url, '_blank')}
        className="mt-2 block overflow-hidden rounded-lg"
      >
        <img src={url} alt={fileName || 'Anhang'} className="max-h-48 object-cover transition-opacity hover:opacity-90" />
      </button>
    );
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="mt-2 inline-flex items-center gap-1 text-[11px] underline"
    >
      {fileName || 'Anhang öffnen'}
    </a>
  );
}
