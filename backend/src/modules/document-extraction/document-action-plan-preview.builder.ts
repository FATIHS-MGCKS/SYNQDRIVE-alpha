import { readAcceptedEntityLinks } from './document-fine-extraction.rules';
import { readInvoiceNumber, readSupplier, readTotalGrossCents } from './document-invoice-extraction.rules';
import { readFineReportNumber } from './document-fine-extraction.rules';
import { readInspectionDate, readReportNumber as readInspectionReportNumber } from './document-inspection-extraction.rules';
import type { DocumentActionPlan } from './document-action-plan.types';
import type { DocumentPlannedAction } from './document-action.types';
import {
  DOCUMENT_ACTION_PREVIEW_STATUSES,
  type DocumentActionPreviewStatus,
  type PublicDocumentActionPreviewCardDto,
  type PublicDocumentActionPreviewFieldDto,
  type PublicDocumentActionPreviewIssueDto,
} from './document-action-plan-preview.types';
import {
  isOptionalActionDisabled,
  type DocumentActionPlanPreferences,
} from './document-action-plan-preferences.util';

type ActionCatalogEntry = {
  labelKey: string;
  title: string;
  targetModule: string;
  targetModuleLabel: string;
  targetEntityType?: string | null;
};

const ACTION_CATALOG: Record<string, ActionCatalogEntry> = {
  CREATE_FINE_DRAFT: {
    labelKey: 'documentAction.CREATE_FINE_DRAFT',
    title: 'Bußgeldentwurf anlegen',
    targetModule: 'fines',
    targetModuleLabel: 'Bußgelder',
    targetEntityType: 'fine',
  },
  CREATE_INVOICE_DRAFT: {
    labelKey: 'documentAction.CREATE_INVOICE_DRAFT',
    title: 'Rechnung als Entwurf anlegen',
    targetModule: 'invoices',
    targetModuleLabel: 'Rechnungen',
    targetEntityType: 'invoice',
  },
  CREATE_CREDIT_NOTE_DRAFT: {
    labelKey: 'documentAction.CREATE_CREDIT_NOTE_DRAFT',
    title: 'Gutschrift als Entwurf anlegen',
    targetModule: 'invoices',
    targetModuleLabel: 'Rechnungen',
    targetEntityType: 'invoice',
  },
  CREATE_SERVICE_EVENT: {
    labelKey: 'documentAction.CREATE_SERVICE_EVENT',
    title: 'Serviceeintrag anlegen',
    targetModule: 'vehicle-service',
    targetModuleLabel: 'Werkstatt / Service',
    targetEntityType: 'service_event',
  },
  CREATE_COMPLIANCE_SERVICE_EVENT: {
    labelKey: 'documentAction.CREATE_COMPLIANCE_SERVICE_EVENT',
    title: 'Prüfbericht als Serviceeintrag archivieren',
    targetModule: 'vehicle-service',
    targetModuleLabel: 'Werkstatt / Service',
    targetEntityType: 'service_event',
  },
  UPDATE_VEHICLE_COMPLIANCE_DATES: {
    labelKey: 'documentAction.UPDATE_VEHICLE_COMPLIANCE_DATES',
    title: 'TÜV-/BOKraft-Gültigkeit am Fahrzeug aktualisieren',
    targetModule: 'vehicles',
    targetModuleLabel: 'Fahrzeug',
    targetEntityType: 'vehicle',
  },
  REFRESH_VEHICLE_SERVICE_HISTORY: {
    labelKey: 'documentAction.REFRESH_VEHICLE_SERVICE_HISTORY',
    title: 'Servicehistorie am Fahrzeug aktualisieren',
    targetModule: 'vehicles',
    targetModuleLabel: 'Fahrzeug',
    targetEntityType: 'vehicle',
  },
  ARCHIVE_DOCUMENT: {
    labelKey: 'documentAction.ARCHIVE_DOCUMENT',
    title: 'Dokument nur archivieren',
    targetModule: 'document-extraction',
    targetModuleLabel: 'Dokumentenarchiv',
    targetEntityType: 'document',
  },
  SUGGEST_ENTITY_LINK: {
    labelKey: 'documentAction.SUGGEST_ENTITY_LINK',
    title: 'Verknüpfungen übernehmen',
    targetModule: 'document-extraction',
    targetModuleLabel: 'Zuordnungen',
    targetEntityType: null,
  },
  SUGGEST_DRIVER_ASSIGNMENT: {
    labelKey: 'documentAction.SUGGEST_DRIVER_ASSIGNMENT',
    title: 'Fahrerzuordnung prüfen',
    targetModule: 'document-extraction',
    targetModuleLabel: 'Zuordnungen',
    targetEntityType: 'driver',
  },
  LINK_VEHICLE: {
    labelKey: 'documentAction.LINK_VEHICLE',
    title: 'Mit Fahrzeug verknüpfen',
    targetModule: 'vehicles',
    targetModuleLabel: 'Fahrzeug',
    targetEntityType: 'vehicle',
  },
  LINK_BOOKING: {
    labelKey: 'documentAction.LINK_BOOKING',
    title: 'Buchung zuordnen',
    targetModule: 'bookings',
    targetModuleLabel: 'Buchungen',
    targetEntityType: 'booking',
  },
  LINK_VENDOR: {
    labelKey: 'documentAction.LINK_VENDOR',
    title: 'Lieferant zuordnen',
    targetModule: 'vendors',
    targetModuleLabel: 'Lieferanten',
    targetEntityType: 'vendor',
  },
  CREATE_DAMAGE_DRAFT: {
    labelKey: 'documentAction.CREATE_DAMAGE_DRAFT',
    title: 'Schadensentwurf anlegen',
    targetModule: 'damages',
    targetModuleLabel: 'Schäden',
    targetEntityType: 'damage',
  },
  CREATE_DAMAGE_RECORD: {
    labelKey: 'documentAction.CREATE_DAMAGE_RECORD',
    title: 'Schaden erfassen',
    targetModule: 'damages',
    targetModuleLabel: 'Schäden',
    targetEntityType: 'damage',
  },
  LINK_EXISTING_DAMAGE: {
    labelKey: 'documentAction.LINK_EXISTING_DAMAGE',
    title: 'Bestehenden Schaden verknüpfen',
    targetModule: 'damages',
    targetModuleLabel: 'Schäden',
    targetEntityType: 'damage',
  },
  APPLY_TIRE_MEASUREMENT: {
    labelKey: 'documentAction.APPLY_TIRE_MEASUREMENT',
    title: 'Reifenmessung übernehmen',
    targetModule: 'tires',
    targetModuleLabel: 'Reifen',
    targetEntityType: 'vehicle',
  },
  APPLY_BRAKE_MEASUREMENT: {
    labelKey: 'documentAction.APPLY_BRAKE_MEASUREMENT',
    title: 'Bremsenmessung übernehmen',
    targetModule: 'brakes',
    targetModuleLabel: 'Bremsen',
    targetEntityType: 'vehicle',
  },
  APPLY_BATTERY_MEASUREMENT: {
    labelKey: 'documentAction.APPLY_BATTERY_MEASUREMENT',
    title: 'Batteriemessung übernehmen',
    targetModule: 'battery-health',
    targetModuleLabel: 'Batterie',
    targetEntityType: 'vehicle',
  },
  SUGGEST_PAYMENT_REVIEW: {
    labelKey: 'documentAction.SUGGEST_PAYMENT_REVIEW',
    title: 'Zahlung prüfen',
    targetModule: 'tasks',
    targetModuleLabel: 'Aufgaben',
    targetEntityType: null,
  },
  SUGGEST_DUE_DATE_TASK: {
    labelKey: 'documentAction.SUGGEST_DUE_DATE_TASK',
    title: 'Fälligkeit als Aufgabe vorschlagen',
    targetModule: 'tasks',
    targetModuleLabel: 'Aufgaben',
    targetEntityType: null,
  },
  ARCHIVE_ONLY: {
    labelKey: 'documentAction.ARCHIVE_ONLY',
    title: 'Nur archivieren',
    targetModule: 'document-extraction',
    targetModuleLabel: 'Dokumentenarchiv',
    targetEntityType: 'document',
  },
};

export function resolveActionCatalogEntry(semanticAction: string): ActionCatalogEntry {
  return (
    ACTION_CATALOG[semanticAction] ?? {
      labelKey: `documentAction.${semanticAction}`,
      title: semanticAction.replace(/_/g, ' '),
      targetModule: 'document-extraction',
      targetModuleLabel: 'Dokument',
      targetEntityType: null,
    }
  );
}

function formatCents(cents: unknown): string {
  if (cents == null || cents === '') return '';
  const value = typeof cents === 'number' ? cents : Number(cents);
  if (!Number.isFinite(value)) return String(cents);
  return `${(value / 100).toFixed(2).replace('.', ',')} EUR`;
}

function formatDate(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) return '';
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    const [y, m, d] = trimmed.slice(0, 10).split('-');
    return `${d}.${m}.${y}`;
  }
  return trimmed;
}

function readWritableFields(
  semanticAction: string,
  confirmedData: Record<string, unknown>,
): PublicDocumentActionPreviewFieldDto[] {
  switch (semanticAction) {
    case 'CREATE_FINE_DRAFT':
      return [
        { key: 'reportNumber', label: 'Aktenzeichen', value: readFineReportNumber(confirmedData) ?? '' },
        { key: 'offenseDate', label: 'Tatdatum', value: formatDate(confirmedData.offenseDate ?? confirmedData.eventDate) },
        { key: 'amountCents', label: 'Betrag', value: formatCents(confirmedData.amountCents ?? confirmedData.totalCents) },
        { key: 'issuingAuthority', label: 'Behörde', value: String(confirmedData.issuingAuthority ?? '') },
      ].filter((row) => row.value);
    case 'CREATE_INVOICE_DRAFT':
    case 'CREATE_CREDIT_NOTE_DRAFT':
      return [
        { key: 'invoiceNumber', label: 'Rechnungsnummer', value: readInvoiceNumber(confirmedData) ?? '' },
        { key: 'invoiceDate', label: 'Rechnungsdatum', value: formatDate(confirmedData.invoiceDate ?? confirmedData.eventDate) },
        { key: 'supplier', label: 'Lieferant', value: readSupplier(confirmedData) ?? '' },
        { key: 'totalGross', label: 'Brutto', value: formatCents(readTotalGrossCents(confirmedData)) },
      ].filter((row) => row.value);
    case 'UPDATE_VEHICLE_COMPLIANCE_DATES':
      return [
        { key: 'validUntil', label: 'Gültig bis', value: formatDate(confirmedData.validUntil) },
        { key: 'inspectionDate', label: 'Prüfdatum', value: formatDate(readInspectionDate(confirmedData)) },
        { key: 'reportNumber', label: 'Berichtsnummer', value: readInspectionReportNumber(confirmedData) ?? '' },
      ].filter((row) => row.value);
    case 'CREATE_SERVICE_EVENT':
    case 'CREATE_COMPLIANCE_SERVICE_EVENT':
      return [
        { key: 'eventDate', label: 'Datum', value: formatDate(confirmedData.eventDate) },
        { key: 'workshopName', label: 'Werkstatt', value: String(confirmedData.workshopName ?? '') },
        { key: 'odometerKm', label: 'Kilometerstand', value: confirmedData.odometerKm != null ? `${confirmedData.odometerKm} km` : '' },
        { key: 'description', label: 'Beschreibung', value: String(confirmedData.description ?? '') },
      ].filter((row) => row.value);
    case 'ARCHIVE_DOCUMENT':
    case 'ARCHIVE_ONLY':
      return [
        { key: 'subject', label: 'Betreff', value: String(confirmedData.subject ?? confirmedData.title ?? '') },
        { key: 'documentDate', label: 'Datum', value: formatDate(confirmedData.documentDate ?? confirmedData.eventDate) },
        { key: 'referenceNumber', label: 'Referenz', value: String(confirmedData.referenceNumber ?? confirmedData.reportNumber ?? '') },
      ].filter((row) => row.value);
    default:
      return [];
  }
}

function resolveTargetEntityLabel(
  semanticAction: string,
  confirmedData: Record<string, unknown>,
  vehicleLabel?: string | null,
): { targetEntityType: string | null; targetEntityLabel: string | null } {
  const links = readAcceptedEntityLinks(confirmedData);
  const byType = (entityType: string) =>
    links.find((link) => link.entityType === entityType) ?? null;

  if (semanticAction === 'LINK_VEHICLE' || semanticAction === 'UPDATE_VEHICLE_COMPLIANCE_DATES') {
    const vehicle = byType('vehicle');
    return {
      targetEntityType: 'vehicle',
      targetEntityLabel: vehicle?.label ?? vehicleLabel ?? (vehicle ? 'Fahrzeug' : null),
    };
  }
  if (semanticAction === 'LINK_BOOKING' || semanticAction === 'SUGGEST_ENTITY_LINK') {
    const booking = byType('booking');
    if (booking) {
      return { targetEntityType: 'booking', targetEntityLabel: booking.label ?? 'Buchung' };
    }
  }
  if (semanticAction === 'SUGGEST_DRIVER_ASSIGNMENT') {
    const driver = byType('driver');
    return {
      targetEntityType: 'driver',
      targetEntityLabel: driver?.label ?? 'Noch kein Fahrer zugeordnet',
    };
  }
  if (semanticAction === 'LINK_VENDOR') {
    const vendor = byType('vendor');
    return { targetEntityType: 'vendor', targetEntityLabel: vendor?.label ?? readSupplier(confirmedData) };
  }

  const catalog = ACTION_CATALOG[semanticAction];
  return {
    targetEntityType: catalog?.targetEntityType ?? null,
    targetEntityLabel: vehicleLabel ?? null,
  };
}

function resolveActionIssues(
  action: DocumentPlannedAction,
  plan: DocumentActionPlan,
): { missingPrerequisites: PublicDocumentActionPreviewIssueDto[]; conflicts: PublicDocumentActionPreviewIssueDto[] } {
  const missing = Array.isArray(plan.metadata?.missingRequirements)
    ? (plan.metadata?.missingRequirements as PublicDocumentActionPreviewIssueDto[])
    : [];

  const conflicts: PublicDocumentActionPreviewIssueDto[] = [];
  if (plan.metadata?.duplicateReferenceFineId) {
    conflicts.push({
      code: 'DUPLICATE_FINE_REFERENCE',
      message: 'Ein Bußgeld mit gleichem Aktenzeichen existiert bereits.',
    });
  }
  if (plan.metadata?.duplicateVendorInvoiceId) {
    conflicts.push({
      code: 'DUPLICATE_INVOICE',
      message: 'Eine Rechnung mit gleicher Nummer existiert bereits beim Lieferanten.',
    });
  }
  if (plan.metadata?.duplicateDamageId) {
    conflicts.push({
      code: 'DUPLICATE_DAMAGE',
      message: 'Ein ähnlicher Schaden ist bereits erfasst.',
    });
  }

  if (plan.planOutcome === 'BLOCKED' || plan.planOutcome.endsWith('_BLOCKED')) {
    return { missingPrerequisites: missing, conflicts };
  }

  if (action.requirement === 'REQUIRED' && missing.length > 0) {
    return { missingPrerequisites: missing, conflicts };
  }

  return { missingPrerequisites: [], conflicts };
}

function resolveActionStatus(input: {
  action: DocumentPlannedAction;
  plan: DocumentActionPlan;
  preferences: DocumentActionPlanPreferences;
  missingPrerequisites: PublicDocumentActionPreviewIssueDto[];
  conflicts: PublicDocumentActionPreviewIssueDto[];
}): DocumentActionPreviewStatus {
  const { action, plan, preferences, missingPrerequisites, conflicts } = input;

  if (isOptionalActionDisabled(action.semanticAction, action.requirement, preferences)) {
    return DOCUMENT_ACTION_PREVIEW_STATUSES.DISABLED;
  }

  if (action.requirement === 'INFORMATIONAL') {
    return DOCUMENT_ACTION_PREVIEW_STATUSES.INFORMATIONAL;
  }

  if (
    plan.planOutcome === 'BLOCKED' ||
    plan.planOutcome.endsWith('_BLOCKED') ||
    (action.requirement === 'REQUIRED' && (missingPrerequisites.length > 0 || conflicts.length > 0))
  ) {
    return DOCUMENT_ACTION_PREVIEW_STATUSES.BLOCKED;
  }

  if (action.requirement === 'OPTIONAL') {
    return DOCUMENT_ACTION_PREVIEW_STATUSES.SUGGESTION;
  }

  return DOCUMENT_ACTION_PREVIEW_STATUSES.READY;
}

export function buildActionPreviewCards(input: {
  plan: DocumentActionPlan;
  confirmedData: Record<string, unknown>;
  preferences: DocumentActionPlanPreferences;
  vehicleLabel?: string | null;
}): PublicDocumentActionPreviewCardDto[] {
  return input.plan.actions.map((action) => {
    const catalog = resolveActionCatalogEntry(action.semanticAction);
    const { missingPrerequisites, conflicts } = resolveActionIssues(action, input.plan);
    const entity = resolveTargetEntityLabel(action.semanticAction, input.confirmedData, input.vehicleLabel);
    const enabled = !isOptionalActionDisabled(action.semanticAction, action.requirement, input.preferences);

    return {
      semanticAction: action.semanticAction,
      labelKey: catalog.labelKey,
      title: catalog.title,
      targetModule: catalog.targetModule,
      targetModuleLabel: catalog.targetModuleLabel,
      targetEntityType: entity.targetEntityType ?? catalog.targetEntityType ?? null,
      targetEntityLabel: entity.targetEntityLabel,
      requirement: action.requirement,
      status: resolveActionStatus({
        action,
        plan: input.plan,
        preferences: input.preferences,
        missingPrerequisites,
        conflicts,
      }),
      sequence: action.sequence,
      writableFields: readWritableFields(action.semanticAction, input.confirmedData),
      missingPrerequisites,
      conflicts,
      toggleable: action.requirement === 'OPTIONAL',
      enabled,
    };
  });
}

export function buildActionPlanPreviewSummary(plan: DocumentActionPlan, blocked: boolean): string {
  if (blocked) {
    return 'Einige erforderliche Angaben fehlen oder es gibt Konflikte — Übernahme ist blockiert.';
  }
  if (plan.planOutcome === 'ARCHIVE_ONLY') {
    return 'Das Dokument wird nur archiviert; keine automatische Fachbuchung.';
  }
  if (plan.planOutcome === 'DRAFT_ONLY') {
    return 'Es werden Entwürfe angelegt; einige Angaben sollten vor Freigabe geprüft werden.';
  }
  return 'Die folgenden Aktionen können nach Ihrer Bestätigung ausgeführt werden.';
}
