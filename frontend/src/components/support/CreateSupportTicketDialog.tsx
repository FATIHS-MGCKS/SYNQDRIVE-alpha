import { useEffect, useRef, useState } from 'react';
import { BookOpen, Loader2, Paperclip, Sparkles, X } from 'lucide-react';
import { toast } from 'sonner';
import { FormDialog } from '../patterns/app-dialog';
import { Button } from '../ui/button';
import { cn } from '../ui/utils';
import {
  api,
  type CreateSupportTicketPayload,
  type SupportTicket,
  type SupportTicketAttachmentRef,
  type SupportTicketCategory,
  type SupportTicketPriority,
  type SupportTicketRelatedEntityType,
} from '../../lib/api';
import { suggestHelpArticles } from './help-center-suggestions';
import { mergeTicketMetadata, sanitizeSourcePage } from './support-metadata';
import type { SupportAiTriage, SupportTicketDialogDefaults } from './support.types';
import {
  QUICK_ISSUE_CARDS,
  SUPPORT_CATEGORY_LABEL,
  SUPPORT_PRIORITY_HINT,
  SUPPORT_PRIORITY_LABEL,
} from '../../rental/components/support/support-center.utils';

export interface CreateSupportTicketDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string;
  defaultCategory?: SupportTicketCategory;
  defaultPriority?: SupportTicketPriority;
  relatedEntityType?: SupportTicketRelatedEntityType;
  relatedEntityId?: string;
  sourcePage?: string;
  metadata?: Record<string, unknown>;
  helpCenterAttempted?: boolean;
  aiTriage?: SupportAiTriage;
  onOpenHelpCenter?: () => void;
  onCreated: (ticket: SupportTicket) => void;
  /** @deprecated use defaultCategory */
  presetCategory?: SupportTicketCategory;
  presetRelatedEntityType?: SupportTicketRelatedEntityType;
  presetRelatedEntityId?: string;
}

const PRIORITIES: SupportTicketPriority[] = ['LOW', 'NORMAL', 'HIGH', 'CRITICAL'];

const RELATED_TYPES: Array<{ value: SupportTicketRelatedEntityType | ''; label: string }> = [
  { value: '', label: 'Kein Objekt' },
  { value: 'VEHICLE', label: 'Fahrzeug' },
  { value: 'BOOKING', label: 'Buchung' },
  { value: 'INVOICE', label: 'Rechnung' },
  { value: 'OTHER', label: 'Sonstiges' },
];

export function CreateSupportTicketDialog({
  open,
  onOpenChange,
  orgId,
  defaultCategory,
  defaultPriority,
  relatedEntityType,
  relatedEntityId,
  sourcePage,
  metadata,
  helpCenterAttempted,
  aiTriage,
  onOpenHelpCenter,
  onCreated,
  presetCategory,
  presetRelatedEntityType,
  presetRelatedEntityId,
}: CreateSupportTicketDialogProps) {
  const initCategory = defaultCategory ?? presetCategory ?? aiTriage?.suggestedCategory ?? 'OTHER';
  const initPriority = defaultPriority ?? aiTriage?.suggestedPriority ?? 'NORMAL';
  const initRelatedType = relatedEntityType ?? presetRelatedEntityType ?? '';
  const initRelatedId = relatedEntityId ?? presetRelatedEntityId ?? '';

  const fileRef = useRef<HTMLInputElement>(null);
  const [category, setCategory] = useState<SupportTicketCategory>(initCategory);
  const [priority, setPriority] = useState<SupportTicketPriority>(initPriority);
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [relatedType, setRelatedType] = useState<SupportTicketRelatedEntityType | ''>(initRelatedType);
  const [relatedId, setRelatedId] = useState(initRelatedId);
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    setCategory(initCategory);
    setPriority(initPriority);
    setRelatedType(initRelatedType);
    setRelatedId(initRelatedId);
  }, [open, initCategory, initPriority, initRelatedType, initRelatedId]);

  const helpSuggestions = suggestHelpArticles(category);

  const resetForm = () => {
    setCategory(initCategory);
    setPriority('NORMAL');
    setSubject('');
    setDescription('');
    setRelatedType(initRelatedType);
    setRelatedId(initRelatedId);
    setFiles([]);
    setPreviews([]);
    setUploadProgress(null);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next && !saving) resetForm();
    onOpenChange(next);
  };

  const handleFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []);
    if (!picked.length) return;
    setFiles((prev) => [...prev, ...picked].slice(0, 5));
    picked.forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => setPreviews((prev) => [...prev, reader.result as string].slice(0, 5));
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
    setPreviews((prev) => prev.filter((_, i) => i !== index));
  };

  const validate = (): string | null => {
    if (!subject.trim()) return 'Bitte einen Betreff eingeben.';
    if (!description.trim()) return 'Bitte eine Beschreibung eingeben.';
    if (relatedType && relatedType !== 'OTHER' && !relatedId.trim()) {
      return 'Bitte die ID des betroffenen Objekts angeben.';
    }
    return null;
  };

  const handleSubmit = async () => {
    const err = validate();
    if (err) {
      toast.error(err);
      return;
    }
    if (!orgId) {
      toast.error('Organisation nicht verfügbar');
      return;
    }
    setSaving(true);
    try {
      const attachments: SupportTicketAttachmentRef[] = [];
      let imageUrl: string | undefined;

      for (let i = 0; i < files.length; i++) {
        setUploadProgress(Math.round(((i + 0.5) / files.length) * 100));
        const res = await api.support.uploadImage(files[i], orgId);
        const ref: SupportTicketAttachmentRef = {
          url: res.url,
          fileName: files[i].name,
          mimeType: files[i].type,
          sizeBytes: files[i].size,
        };
        attachments.push(ref);
        if (!imageUrl) imageUrl = res.url;
      }
      setUploadProgress(100);

      const payload: CreateSupportTicketPayload = {
        subject: subject.trim(),
        description: description.trim(),
        category,
        priority,
        sourcePage: sanitizeSourcePage(sourcePage ?? (typeof window !== 'undefined' ? window.location.pathname : undefined)),
        metadata: mergeTicketMetadata(metadata, { helpCenterAttempted, aiTriage: aiTriage as Record<string, unknown> | undefined }),
        imageUrl,
        attachments: attachments.length ? attachments : undefined,
      };

      if (relatedType) {
        payload.relatedEntityType = relatedType;
        if (relatedId.trim()) payload.relatedEntityId = relatedId.trim();
      }

      const ticket = await api.support.createByOrg(orgId, payload);
      toast.success('Ticket wurde erstellt');
      onCreated(ticket);
      resetForm();
      onOpenChange(false);
    } catch (e) {
      toast.error('Ticket konnte nicht erstellt werden', {
        description: e instanceof Error ? e.message : 'Bitte später erneut versuchen.',
      });
    } finally {
      setSaving(false);
      setUploadProgress(null);
    }
  };

  const inputClass =
    'w-full rounded-xl border border-border/60 bg-background/80 px-3.5 py-2.5 text-xs outline-none transition-colors focus:border-[color:var(--brand)] focus:ring-2 focus:ring-[color:color-mix(in_srgb,var(--brand)_12%,transparent)]';

  const showAiHint =
    aiTriage?.suggestedCategory &&
    aiTriage.confidence != null &&
    aiTriage.confidence >= 0.5;

  return (
    <FormDialog
      open={open}
      onOpenChange={handleOpenChange}
      title="Neues Support-Ticket"
      description="Beschreibe dein Anliegen — unser Team antwortet im Ticket-Thread."
      maxWidthClassName="sm:max-w-2xl"
      footer={
        <>
          <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={saving}>
            Abbrechen
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {uploadProgress != null ? `Upload ${uploadProgress}%` : 'Wird erstellt…'}
              </>
            ) : (
              'Ticket erstellen'
            )}
          </Button>
        </>
      }
      bodyClassName="space-y-4"
    >
      {showAiHint && (
        <div className="flex items-start gap-2 rounded-xl border border-border/40 bg-muted/20 px-3 py-2.5 text-[11px] text-muted-foreground">
          <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[color:var(--brand)]" />
          <span>
            Kategorie automatisch vorgeschlagen:{' '}
            <strong className="text-foreground">{SUPPORT_CATEGORY_LABEL[aiTriage!.suggestedCategory!]}</strong>
          </span>
        </div>
      )}

      {helpSuggestions.length > 0 && (
        <div className="rounded-xl border border-border/40 bg-muted/15 px-3.5 py-3">
          <p className="text-[11px] font-semibold text-foreground">Vielleicht hilft dir einer dieser Artikel</p>
          <ul className="mt-2 space-y-1">
            {helpSuggestions.map((article) => (
              <li key={article.id} className="text-[11px] text-muted-foreground">
                · {article.title}
              </li>
            ))}
          </ul>
          {onOpenHelpCenter && (
            <Button type="button" variant="link" size="sm" className="mt-2 h-auto p-0 text-[11px]" onClick={onOpenHelpCenter}>
              <BookOpen className="h-3.5 w-3.5" />
              Help Center öffnen
            </Button>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {QUICK_ISSUE_CARDS.map((card) => (
          <button
            key={card.id}
            type="button"
            onClick={() => setCategory(card.category)}
            className={cn(
              'rounded-xl border p-2.5 text-left transition-all text-[11px] font-semibold',
              category === card.category
                ? 'border-[color:color-mix(in_srgb,var(--brand)_35%,transparent)] bg-[color:var(--brand-soft)]'
                : 'border-border/50 hover:bg-muted/40',
            )}
          >
            {card.title}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {PRIORITIES.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPriority(p)}
            className={cn(
              'rounded-xl border px-3 py-2.5 text-left transition-all',
              priority === p
                ? 'border-[color:color-mix(in_srgb,var(--brand)_35%,transparent)] bg-[color:var(--brand-soft)]'
                : 'border-border/50 hover:bg-muted/40',
            )}
          >
            <span className="block text-[12px] font-semibold text-foreground">{SUPPORT_PRIORITY_LABEL[p]}</span>
            <span className="mt-0.5 block text-[10px] text-muted-foreground">{SUPPORT_PRIORITY_HINT[p]}</span>
          </button>
        ))}
      </div>

      <div>
        <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Betreff *</label>
        <input value={subject} onChange={(e) => setSubject(e.target.value)} className={inputClass} placeholder="Kurze Zusammenfassung" />
      </div>

      <div>
        <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Beschreibung *</label>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={5} className={cn(inputClass, 'resize-none')} placeholder="Was ist passiert?" />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Betroffenes Objekt</label>
          <select value={relatedType} onChange={(e) => setRelatedType(e.target.value as SupportTicketRelatedEntityType | '')} className={inputClass}>
            {RELATED_TYPES.map((opt) => (
              <option key={opt.value || 'none'} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Objekt-ID</label>
          <input value={relatedId} onChange={(e) => setRelatedId(e.target.value)} disabled={!relatedType} className={inputClass} placeholder="ID" />
        </div>
      </div>

      <div>
        <input ref={fileRef} type="file" accept="image/*,.pdf" multiple className="hidden" onChange={handleFiles} />
        <div className="flex flex-wrap gap-2">
          {previews.map((src, i) => (
            <div key={i} className="relative">
              <img src={src} alt="" className="h-16 w-16 rounded-lg border border-border/50 object-cover" />
              <button type="button" onClick={() => removeFile(i)} className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-white">
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
          {files.length < 5 && (
            <button type="button" onClick={() => fileRef.current?.click()} className="flex h-16 w-16 items-center justify-center rounded-lg border border-dashed border-border/60 text-muted-foreground hover:bg-muted/40">
              <Paperclip className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-border/40 bg-muted/20 px-3.5 py-3 text-[11px] leading-relaxed text-muted-foreground">
        Technische Kontextdaten werden automatisch angehängt (ohne sensible Tokens), damit der Support schneller helfen kann.
      </div>
    </FormDialog>
  );
}
