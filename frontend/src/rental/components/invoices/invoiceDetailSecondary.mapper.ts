import type { InvoiceActionGate } from './invoiceDetailTypes';
import type { InvoiceProvenanceDto } from './invoiceDetailTypes';
import type { Invoice } from './invoiceTypes';

const UUID_RE =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;

export interface InvoiceLinkedTaskView {
  id: string;
  title: string;
  status: string;
  statusLabel: string;
  isDone: boolean;
}

export interface InvoiceDetailSecondaryPanel {
  showMoreInfo: boolean;
  showTasks: boolean;
  showAudit: boolean;
  hasAnySection: boolean;
  description: string | null;
  notes: string | null;
  canEditNotes: boolean;
  provenance: InvoiceProvenanceDto;
  tasks: InvoiceLinkedTaskView[];
  openTaskCount: number;
  doneTaskCount: number;
}

export function sanitizeTaskTitle(title: string): string {
  const cleaned = title.replace(UUID_RE, '').replace(/\s{2,}/g, ' ').trim();
  return cleaned || 'Aufgabe';
}

export function taskStatusLabel(status: string): string {
  if (status === 'DONE' || status === 'COMPLETED') return 'Erledigt';
  if (status === 'IN_PROGRESS') return 'In Bearbeitung';
  if (status === 'CANCELLED') return 'Abgebrochen';
  return 'Offen';
}

export function buildInvoiceDetailSecondaryPanel(
  invoice: Invoice,
  provenance: InvoiceProvenanceDto,
  editGate: InvoiceActionGate,
): InvoiceDetailSecondaryPanel {
  const description = invoice.description?.trim() || null;
  const notes = invoice.notes?.trim() || null;
  const canEditNotes = editGate.allowed;

  const showMoreInfo = Boolean(description || notes || canEditNotes);

  const tasks = (invoice.tasks ?? []).map((task) => ({
    id: task.id,
    title: sanitizeTaskTitle(task.title),
    status: task.status,
    statusLabel: taskStatusLabel(task.status),
    isDone: task.status === 'DONE' || task.status === 'COMPLETED',
  }));

  const openTaskCount = tasks.filter((t) => !t.isDone).length;
  const doneTaskCount = tasks.filter((t) => t.isDone).length;
  const showTasks = tasks.length > 0;

  const showAudit = Boolean(
    provenance.erstelltVon ||
      provenance.erstelltUeber ||
      provenance.quelle ||
      invoice.id,
  );

  return {
    showMoreInfo,
    showTasks,
    showAudit,
    hasAnySection: showMoreInfo || showTasks || showAudit,
    description,
    notes,
    canEditNotes,
    provenance,
    tasks,
    openTaskCount,
    doneTaskCount,
  };
}

/** Documents removed empty surfaces when grouping secondary blocks (see architecture note). */
export const SECONDARY_EMPTY_CARD_REDUCTION = {
  beforeStandaloneCards: 5,
  afterStandaloneCards: 1,
  removedSurfaces: 4,
} as const;
