import type { RefObject } from 'react';
import { useEffect, useMemo, useState } from 'react';

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '../../../components/ui/accordion';
import { Icon } from '../ui/Icon';
import type { InvoiceDetailDto } from './invoiceDetailTypes';
import { buildInvoiceDetailSecondaryPanel } from './invoiceDetailSecondary.mapper';
import { InvoiceNotes } from './InvoiceNotes';
import { InvoiceTimeline } from './InvoiceTimeline';
import type { Invoice } from './invoiceTypes';
import { INVOICE_ACTION_BTN, type InvoiceThemeClasses } from './invoiceTheme';

interface InvoiceDetailSecondaryProps extends InvoiceThemeClasses {
  invoice: Invoice;
  detail: InvoiceDetailDto;
  orgId: string;
  viewportWidth?: number;
  notesSectionRef?: RefObject<HTMLDivElement | null>;
  onSaveNotes: (notes: string) => Promise<boolean>;
  onCopyInternalId: () => void;
  expandMoreInfoTrigger?: number;
}

function ProvenanceRow({ label, value, tp, ts }: { label: string; value: string; tp: string; ts: string }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-3 py-1">
      <dt className={`text-[10px] ${ts} uppercase tracking-wider font-semibold sm:w-28 shrink-0`}>{label}</dt>
      <dd className={`text-xs ${tp} break-words`}>{value}</dd>
    </div>
  );
}

export function InvoiceDetailSecondary({
  invoice,
  detail,
  orgId,
  viewportWidth = 390,
  notesSectionRef,
  onSaveNotes,
  onCopyInternalId,
  expandMoreInfoTrigger = 0,
  card,
  tp,
  ts,
  inputCls,
  isDarkMode,
}: InvoiceDetailSecondaryProps) {
  const panel = useMemo(
    () => buildInvoiceDetailSecondaryPanel(invoice, detail.relations.provenance, detail.actions.edit),
    [invoice, detail.relations.provenance, detail.actions.edit],
  );

  const defaultOpen = useMemo(() => {
    const open: string[] = [];
    if (viewportWidth >= 768 && panel.showMoreInfo && (panel.description || panel.notes)) {
      open.push('more-info');
    }
    return open;
  }, [viewportWidth, panel.showMoreInfo, panel.description, panel.notes]);

  const [accordionValue, setAccordionValue] = useState<string[]>(defaultOpen);

  useEffect(() => {
    setAccordionValue(defaultOpen);
  }, [defaultOpen]);

  useEffect(() => {
    if (expandMoreInfoTrigger > 0 && panel.showMoreInfo) {
      setAccordionValue((prev) => [...new Set([...prev, 'more-info'])]);
      notesSectionRef?.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [expandMoreInfoTrigger, panel.showMoreInfo, notesSectionRef]);

  if (!panel.hasAnySection) return null;

  return (
    <div className={`${card} p-3 sm:p-4`} data-testid="invoice-detail-secondary">
      <Accordion
        type="multiple"
        value={accordionValue}
        onValueChange={setAccordionValue}
        className="w-full"
      >
        {panel.showMoreInfo ? (
          <AccordionItem value="more-info" className="border-border/50">
            <AccordionTrigger className="py-3 text-xs font-bold uppercase tracking-wider hover:no-underline">
              <span className={tp}>Weitere Informationen</span>
            </AccordionTrigger>
            <AccordionContent className="pb-3 pt-0">
              <div ref={notesSectionRef} className="space-y-4">
                {panel.description ? (
                  <section aria-labelledby="invoice-description-heading">
                    <h4 id="invoice-description-heading" className={`text-[10px] font-semibold uppercase tracking-wider ${ts}`}>
                      Rechnungsbeschreibung
                    </h4>
                    <p className={`mt-1.5 text-xs leading-relaxed break-words ${tp}`}>{panel.description}</p>
                    <p className={`mt-1 text-[10px] ${ts}`}>Kann auf der Rechnung für den Kunden sichtbar sein.</p>
                  </section>
                ) : null}

                <InvoiceNotes
                  invoice={invoice}
                  onSave={onSaveNotes}
                  canEdit={panel.canEditNotes}
                  editBlockedReason={detail.actions.edit.reason}
                  embedded
                  isDarkMode={isDarkMode}
                  card={card}
                  tp={tp}
                  ts={ts}
                  inputCls={inputCls}
                />
              </div>
            </AccordionContent>
          </AccordionItem>
        ) : null}

        {panel.showTasks ? (
          <AccordionItem value="tasks" className="border-border/50">
            <AccordionTrigger className="py-3 text-xs font-bold uppercase tracking-wider hover:no-underline">
              <span className={tp}>
                Aufgaben
                {panel.openTaskCount > 0 ? (
                  <span className={`ml-2 font-normal normal-case ${ts}`}>({panel.openTaskCount} offen)</span>
                ) : null}
              </span>
            </AccordionTrigger>
            <AccordionContent className="pb-3 pt-0">
              <ul className="space-y-2" aria-label="Verknüpfte Aufgaben">
                {panel.tasks.map((task) => (
                  <li
                    key={task.id}
                    className={`flex items-start gap-2.5 rounded-lg border px-3 py-2 ${
                      task.isDone
                        ? isDarkMode
                          ? 'border-border/25 bg-muted/10 opacity-75'
                          : 'border-gray-100 bg-gray-50/40 opacity-80'
                        : isDarkMode
                          ? 'border-border/40 bg-muted/20'
                          : 'border-gray-100 bg-gray-50/60'
                    }`}
                  >
                    <Icon
                      name="list-todo"
                      className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${
                        task.isDone ? 'text-[color:var(--status-positive)]' : 'text-[color:var(--status-watch)]'
                      }`}
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                      <p
                        className={`text-xs font-medium break-words ${
                          task.isDone ? `${ts} line-through decoration-muted-foreground/50` : tp
                        }`}
                      >
                        {task.title}
                      </p>
                      <p className={`text-[10px] ${ts}`}>{task.statusLabel}</p>
                    </div>
                  </li>
                ))}
              </ul>
              {panel.doneTaskCount > 0 ? (
                <p className={`mt-2 text-[10px] ${ts}`}>{panel.doneTaskCount} erledigt</p>
              ) : null}
            </AccordionContent>
          </AccordionItem>
        ) : null}

        {panel.showAudit ? (
          <AccordionItem value="audit" className="border-border/50 border-b-0">
            <AccordionTrigger className="py-3 text-xs font-bold uppercase tracking-wider hover:no-underline">
              <span className={tp}>Herkunft &amp; Audit</span>
            </AccordionTrigger>
            <AccordionContent className="pb-1 pt-0 space-y-4">
              <dl className="space-y-0.5">
                <ProvenanceRow label="Erstellt von" value={panel.provenance.erstelltVon} tp={tp} ts={ts} />
                <ProvenanceRow label="Erstellt über" value={panel.provenance.erstelltUeber} tp={tp} ts={ts} />
                <ProvenanceRow label="Quelle" value={panel.provenance.quelle} tp={tp} ts={ts} />
              </dl>

              <div>
                <button
                  type="button"
                  onClick={onCopyInternalId}
                  className={`${INVOICE_ACTION_BTN} text-[11px]`}
                  aria-label="Interne Rechnungs-ID in Zwischenablage kopieren"
                >
                  <Icon name="copy" className="h-3 w-3" />
                  Interne ID kopieren
                </button>
                <p className={`mt-1 text-[10px] ${ts}`}>Technische Kennung — nicht für Kundenkommunikation.</p>
              </div>

              <InvoiceTimeline orgId={orgId} invoiceId={invoice.id} embedded tp={tp} ts={ts} />
            </AccordionContent>
          </AccordionItem>
        ) : null}
      </Accordion>
    </div>
  );
}
