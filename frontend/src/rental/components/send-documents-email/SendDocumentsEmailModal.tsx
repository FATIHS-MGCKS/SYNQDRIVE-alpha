import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Loader2,
  Mail,
  Send,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { FormDialog } from '../../../components/patterns';
import { Button } from '../../../components/ui/button';
import { Checkbox } from '../../../components/ui/checkbox';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '../../../components/ui/collapsible';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { Textarea } from '../../../components/ui/textarea';
import { cn } from '../../../components/ui/utils';
import { api, type GeneratedDocumentDto } from '../../../lib/api';
import { useRentalOrg } from '../../RentalContext';
import {
  buildEmailPreview,
  pickPrimaryDomain,
} from '../settings/email-delivery/email-delivery.utils';
import type { SendDocumentsEmailModalProps } from './send-documents-email.types';
import {
  availabilityLabel,
  bookingNumberLabel,
  buildDefaultMessage,
  buildDefaultSubject,
  buildDocumentRows,
  currentDocumentsByType,
  customerDisplayName,
  customerEmail,
  formatSentHint,
  hasCustomerEmail,
  isDocumentSelectable,
  parseCcInput,
} from './send-documents-email.utils';

const inputClass =
  'text-sm border-border/70 bg-background focus:border-[color:var(--brand)] focus:ring-[color:var(--brand-soft)]';

export function SendDocumentsEmailModal({
  open,
  onOpenChange,
  orgId,
  bookingId,
  customer,
  booking,
  documents,
  documentTypes,
  initiallySelectedDocumentIds = [],
  sourceContext,
  onSent,
}: SendDocumentsEmailModalProps) {
  const { orgName } = useRentalOrg();

  const [to, setTo] = useState('');
  const [ccOpen, setCcOpen] = useState(false);
  const [cc, setCc] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [includeSignature, setIncludeSignature] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [senderLoading, setSenderLoading] = useState(false);
  const [senderPreview, setSenderPreview] = useState<{
    fromLine: string;
    replyTo: string;
    modeLabel: string;
  } | null>(null);

  const currentByType = useMemo(() => currentDocumentsByType(documents), [documents]);

  const visibleTypes = useMemo(() => {
    if (documentTypes?.length) return documentTypes;
    return [...new Set(documents.map((d) => d.documentType))];
  }, [documentTypes, documents]);

  const displayRows = useMemo(
    () => buildDocumentRows(visibleTypes, currentByType),
    [visibleTypes, currentByType],
  );

  const selectedDocuments = useMemo(
    () => documents.filter((d) => selectedIds.has(d.id) && isDocumentSelectable(d)),
    [documents, selectedIds],
  );

  const bookingLabel = bookingNumberLabel(booking, bookingId);
  const customerName = customerDisplayName(customer);

  const resetForm = useCallback(() => {
    setTo(customerEmail(customer));
    setCc('');
    setCcOpen(false);
    setIncludeSignature(true);
    setError(null);
    const initial = new Set(
      initiallySelectedDocumentIds.filter((id) => {
        const doc = documents.find((d) => d.id === id);
        return isDocumentSelectable(doc);
      }),
    );
    setSelectedIds(initial);
    const types = [...initial]
      .map((id) => documents.find((d) => d.id === id)?.documentType)
      .filter((t): t is string => Boolean(t));
    setSubject(buildDefaultSubject(bookingLabel, types, sourceContext));
    setMessage(buildDefaultMessage(customerName, bookingLabel, types));
  }, [
    bookingLabel,
    customer,
    customerName,
    documents,
    initiallySelectedDocumentIds,
    sourceContext,
  ]);

  useEffect(() => {
    if (!open) return;
    resetForm();
  }, [open, resetForm]);

  useEffect(() => {
    const types = selectedDocuments.map((d) => d.documentType);
    if (!open) return;
    setSubject(buildDefaultSubject(bookingLabel, types, sourceContext));
  }, [selectedDocuments, bookingLabel, sourceContext, open]);

  useEffect(() => {
    if (!open || !orgId) return;
    let cancelled = false;
    setSenderLoading(true);
    Promise.all([api.email.getSettings(orgId), api.email.listDomains(orgId)])
      .then(([settings, domains]) => {
        if (cancelled) return;
        const preview = buildEmailPreview({
          orgName,
          settings,
          primaryDomain: pickPrimaryDomain(domains),
        });
        const modeLabel =
          settings.mode === 'VERIFIED_DOMAIN' &&
          domains.some((d) => d.status === 'VERIFIED')
            ? 'Eigene Domain'
            : 'SynqDrive Standard';
        setSenderPreview({
          fromLine: preview.fromLine,
          replyTo: preview.replyTo,
          modeLabel,
        });
      })
      .catch(() => {
        if (!cancelled) setSenderPreview(null);
      })
      .finally(() => {
        if (!cancelled) setSenderLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, orgId, orgName]);

  const toggleDocument = (doc: GeneratedDocumentDto | null) => {
    if (!doc || !isDocumentSelectable(doc)) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(doc.id)) next.delete(doc.id);
      else next.add(doc.id);
      return next;
    });
  };

  const handleSend = async () => {
    if (!orgId || !bookingId) return;
    const recipient = to.trim();
    if (!recipient || !hasCustomerEmail({ email: recipient })) {
      setError('Bitte geben Sie eine gültige Empfänger-E-Mail-Adresse ein.');
      return;
    }
    if (selectedDocuments.length === 0) {
      setError('Bitte wählen Sie mindestens ein Dokument aus.');
      return;
    }

    setSending(true);
    setError(null);
    try {
      const ccList = parseCcInput(cc);
      await api.documents.sendBookingDocumentsEmail(orgId, bookingId, {
        documentIds: selectedDocuments.map((d) => d.id),
        to: recipient,
        cc: ccList.length ? ccList : undefined,
        subject: subject.trim() || undefined,
        message: message.trim() || undefined,
        includeSignature,
      });
      toast.success(`E-Mail an ${recipient} gesendet`);
      onOpenChange(false);
      await onSent?.();
    } catch (err) {
      const msg = (err as Error).message || 'E-Mail-Versand fehlgeschlagen';
      setError(msg);
      toast.error(msg);
    } finally {
      setSending(false);
    }
  };

  const canSend =
    hasCustomerEmail({ email: to }) && selectedDocuments.length > 0 && !sending;

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Dokumente per E-Mail senden"
      description="Wählen Sie die Anhänge und prüfen Sie Empfänger sowie Absender vor dem Versand."
      maxWidthClassName="sm:max-w-2xl"
      bodyClassName="space-y-4"
      footer={
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 w-full">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={sending}
          >
            Abbrechen
          </Button>
          <Button type="button" onClick={() => void handleSend()} disabled={!canSend}>
            {sending ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <Send className="w-4 h-4 mr-2" />
            )}
            Senden
          </Button>
        </div>
      }
    >
      {error ? (
        <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-300">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      ) : null}

      <div className="space-y-3">
        <div>
          <Label htmlFor="send-docs-to" className="text-xs font-semibold uppercase tracking-wider">
            Empfänger
          </Label>
          <Input
            id="send-docs-to"
            type="email"
            className={cn(inputClass, 'mt-1.5')}
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="kunde@beispiel.de"
            disabled={sending}
          />
        </div>

        <Collapsible open={ccOpen} onOpenChange={setCcOpen}>
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronDown
                className={cn('w-3.5 h-3.5 transition-transform', ccOpen && 'rotate-180')}
              />
              CC (optional)
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-2">
            <Input
              type="text"
              className={inputClass}
              value={cc}
              onChange={(e) => setCc(e.target.value)}
              placeholder="kollege@firma.de, buchhaltung@firma.de"
              disabled={sending}
            />
          </CollapsibleContent>
        </Collapsible>
      </div>

      <div className="rounded-xl border border-border/60 surface-premium p-3 space-y-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
          <Mail className="w-3.5 h-3.5 text-[color:var(--brand)]" />
          Absender-Vorschau
        </div>
        {senderLoading ? (
          <p className="text-xs text-muted-foreground flex items-center gap-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Lädt…
          </p>
        ) : senderPreview ? (
          <div className="grid gap-1.5 text-[11px]">
            <div>
              <span className="text-muted-foreground">Von: </span>
              <span className="font-mono break-all">{senderPreview.fromLine}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Antwort an: </span>
              <span className="font-mono break-all">{senderPreview.replyTo}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Versandmodus: </span>
              <span>{senderPreview.modeLabel}</span>
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Absender konnte nicht geladen werden.</p>
        )}
      </div>

      <div className="space-y-2">
        <Label className="text-xs font-semibold uppercase tracking-wider">Dokumente</Label>
        <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
          {displayRows.map((row) => {
            const sentHint = row.doc ? formatSentHint(row.doc) : null;
            const checked = row.doc ? selectedIds.has(row.doc.id) : false;
            return (
              <label
                key={row.documentType}
                className={cn(
                  'flex items-start gap-3 rounded-xl border p-3 transition-colors',
                  row.selectable
                    ? checked
                      ? 'border-[color:var(--brand)]/40 bg-[color:var(--brand-soft)]/30'
                      : 'border-border/60 surface-premium hover:bg-muted/30 cursor-pointer'
                    : 'border-border/40 bg-muted/20 opacity-80 cursor-not-allowed',
                )}
              >
                <Checkbox
                  checked={checked}
                  disabled={!row.selectable || sending}
                  onCheckedChange={() => toggleDocument(row.doc)}
                  className="mt-0.5"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-foreground">{row.label}</span>
                    <span
                      className={cn(
                        'text-[10px] font-semibold px-2 py-0.5 rounded-full',
                        row.availability === 'available' && 'sq-tone-success',
                        row.availability === 'sent' && 'sq-tone-brand',
                        row.availability === 'missing' && 'sq-tone-neutral',
                        (row.availability === 'void' ||
                          row.availability === 'regenerate_recommended' ||
                          row.availability === 'failed') &&
                          'sq-tone-warning',
                      )}
                    >
                      {availabilityLabel(row.availability)}
                    </span>
                  </div>
                  {row.doc ? (
                    <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                      {[row.doc.documentNumber, row.doc.fileName].filter(Boolean).join(' · ')}
                    </p>
                  ) : (
                    <p className="text-[11px] text-muted-foreground mt-0.5">Noch nicht erstellt</p>
                  )}
                  {sentHint ? (
                    <p className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" />
                      {sentHint}
                    </p>
                  ) : null}
                </div>
              </label>
            );
          })}
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <Label htmlFor="send-docs-subject" className="text-xs font-semibold uppercase tracking-wider">
            Betreff
          </Label>
          <Input
            id="send-docs-subject"
            className={cn(inputClass, 'mt-1.5')}
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            disabled={sending}
          />
        </div>
        <div>
          <Label htmlFor="send-docs-message" className="text-xs font-semibold uppercase tracking-wider">
            Nachricht
          </Label>
          <Textarea
            id="send-docs-message"
            rows={6}
            className={cn(inputClass, 'mt-1.5 resize-y min-h-[120px]')}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            disabled={sending}
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
          <Checkbox
            checked={includeSignature}
            onCheckedChange={(v) => setIncludeSignature(v === true)}
            disabled={sending}
          />
          Firmensignatur anhängen
        </label>
      </div>

      <p className="text-[11px] text-muted-foreground leading-relaxed rounded-lg border border-border/50 bg-muted/20 px-3 py-2">
        Diese E-Mail und die Anhänge werden in der Kunden-/Buchungshistorie protokolliert.
      </p>
    </FormDialog>
  );
}
