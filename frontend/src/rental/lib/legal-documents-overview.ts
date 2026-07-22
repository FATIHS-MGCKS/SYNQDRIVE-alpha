import type { LegalDocumentDto } from '../../lib/api';
import {
  CONSUMER_INFORMATION_VARIANT_LABELS_DE,
  LEGAL_DOCUMENT_TYPE,
  LEGAL_DOCUMENT_TYPE_CONFIGS,
  legalDocumentGroupKey,
  type LegalDocumentTypeConfig,
} from './legal-document-types';
import type { StatusTone } from '../../components/patterns';

export type LegalDocumentCategoryReadiness = 'ready' | 'attention' | 'blocked' | 'empty';

export interface LegalDocumentConfigAlert {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  detail: string;
  categoryKey?: string;
}

export interface LegalDocumentCategoryOverview {
  config: LegalDocumentTypeConfig;
  readiness: LegalDocumentCategoryReadiness;
  statusLabel: string;
  statusTone: StatusTone;
  activeDocument: LegalDocumentDto | null;
  activeSince: string | null;
  activatedBy: string | null;
  approvedBy: string | null;
  languageLabel: string | null;
  jurisdictionLabel: string | null;
  missingCoverage: string[];
  issues: string[];
  nextAction: string | null;
  versions: LegalDocumentDto[];
  draftCount: number;
  pendingReviewCount: number;
}

export interface LegalDocumentsReadinessSummary {
  overallTone: StatusTone;
  overallLabel: string;
  overallDetail: string;
  readyCount: number;
  attentionCount: number;
  blockedCount: number;
  emptyCount: number;
  categories: LegalDocumentCategoryOverview[];
  configAlerts: LegalDocumentConfigAlert[];
  allVersions: LegalDocumentVersionRow[];
}

export interface LegalDocumentVersionRow {
  id: string;
  categoryTitle: string;
  documentType: string;
  versionLabel: string;
  status: string;
  language: string;
  jurisdiction: string | null;
  fileName: string;
  fileSize: number | null;
  scanStatus: string | null;
  integrityStatus: string | null;
  activatedAt: string | null;
  activatedBy: string | null;
  createdAt: string;
  snapshotCount: number;
}

const SCAN_BLOCKING = new Set(['FAILED', 'INFECTED', 'REJECTED']);
const SCAN_ATTENTION = new Set(['PENDING', 'SCANNING', 'QUARANTINED']);
const INTEGRITY_BLOCKING = new Set([
  'CHECKSUM_MISMATCH',
  'MISSING_OBJECT',
  'STORAGE_ERROR',
  'INTEGRITY_FAILED',
]);

const STATUS_LABEL_DE: Record<string, string> = {
  ACTIVE: 'Aktiv',
  DRAFT: 'Entwurf',
  IN_REVIEW: 'In Prüfung',
  APPROVED: 'Freigegeben',
  SCHEDULED: 'Geplant',
  SUPERSEDED: 'Ersetzt',
  REVOKED: 'Zurückgezogen',
  ARCHIVED: 'Archiviert',
};

const EXPECTED_LANGUAGE = 'de';
const EXPECTED_JURISDICTION = 'DE';

function variantLabel(doc: LegalDocumentDto): string | null {
  const variant = doc.documentVariant ?? doc.legalVariant;
  if (!variant) return null;
  return (
    CONSUMER_INFORMATION_VARIANT_LABELS_DE[
      variant as keyof typeof CONSUMER_INFORMATION_VARIANT_LABELS_DE
    ] ?? variant
  );
}

function scanIssue(doc: LegalDocumentDto): string | null {
  const status = (doc.scanStatus ?? 'UPLOADED').toUpperCase();
  if (SCAN_BLOCKING.has(status)) return `Malware-Scan: ${status}`;
  if (SCAN_ATTENTION.has(status)) return `Scan ausstehend: ${status}`;
  return null;
}

function integrityIssue(doc: LegalDocumentDto): string | null {
  const status = (doc.integrityStatus ?? 'UNVERIFIED').toUpperCase();
  if (INTEGRITY_BLOCKING.has(status)) return `Integrität: ${status}`;
  if (status === 'UNVERIFIED') return 'Integrität noch nicht verifiziert';
  return null;
}

function pickActiveDocument(versions: LegalDocumentDto[]): LegalDocumentDto | null {
  return (
    versions.find((v) => v.status === 'ACTIVE') ??
    versions.find((v) => v.status === 'SCHEDULED') ??
    null
  );
}

function resolveReadiness(
  versions: LegalDocumentDto[],
  active: LegalDocumentDto | null,
): Pick<LegalDocumentCategoryOverview, 'readiness' | 'statusLabel' | 'statusTone' | 'issues' | 'nextAction'> {
  const issues: string[] = [];

  if (versions.length === 0) {
    return {
      readiness: 'empty',
      statusLabel: 'Nicht hinterlegt',
      statusTone: 'critical',
      issues: ['Keine Version vorhanden'],
      nextAction: 'PDF hochladen und freigeben',
    };
  }

  if (!active) {
    const draft = versions.some((v) => v.status === 'DRAFT' || v.status === 'IN_REVIEW');
    const approved = versions.some((v) => v.status === 'APPROVED');
    return {
      readiness: 'blocked',
      statusLabel: 'Nicht einsatzbereit',
      statusTone: 'critical',
      issues: ['Keine aktive Version für Buchungen'],
      nextAction: draft
        ? 'Entwurf prüfen und aktivieren'
        : approved
          ? 'Freigegebene Version aktivieren'
          : 'Version hochladen und aktivieren',
    };
  }

  const scan = scanIssue(active);
  const integrity = integrityIssue(active);
  if (scan) issues.push(scan);
  if (integrity) issues.push(integrity);

  if (active.language?.toLowerCase() !== EXPECTED_LANGUAGE) {
    issues.push(`Aktive Sprache: ${active.language} (erwartet: ${EXPECTED_LANGUAGE})`);
  }
  if ((active.jurisdiction ?? '').toUpperCase() !== EXPECTED_JURISDICTION) {
    issues.push(
      `Jurisdiktion: ${active.jurisdiction ?? '—'} (erwartet: ${EXPECTED_JURISDICTION})`,
    );
  }

  if (issues.some((i) => i.startsWith('Malware') || i.startsWith('Integrität: CHECKSUM') || i.startsWith('Integrität: MISSING'))) {
    return {
      readiness: 'blocked',
      statusLabel: 'Blockiert',
      statusTone: 'critical',
      issues,
      nextAction: 'Scan- oder Integritätsfehler beheben',
    };
  }

  if (issues.length > 0) {
    return {
      readiness: 'attention',
      statusLabel: 'Einschränkung',
      statusTone: 'watch',
      issues,
      nextAction: issues[0] ?? 'Prüfen',
    };
  }

  return {
    readiness: 'ready',
    statusLabel: 'Einsatzbereit',
    statusTone: 'success',
    issues: [],
    nextAction: null,
  };
}

export function buildLegalDocumentsReadinessSummary(
  docs: LegalDocumentDto[],
): LegalDocumentsReadinessSummary {
  const byType: Record<string, LegalDocumentDto[]> = {};
  for (const config of LEGAL_DOCUMENT_TYPE_CONFIGS) {
    byType[config.key] = [];
  }
  for (const doc of docs) {
    const key = legalDocumentGroupKey(doc.documentType, doc.legacyDocumentType);
    if (!byType[key]) byType[key] = [];
    byType[key].push(doc);
  }

  const categories: LegalDocumentCategoryOverview[] = LEGAL_DOCUMENT_TYPE_CONFIGS.map((config) => {
    const versions = (byType[config.key] ?? []).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    const activeDocument = pickActiveDocument(versions);
    const readiness = resolveReadiness(versions, activeDocument);

    const missingCoverage: string[] = [];
    const hasExpectedLanguage = versions.some(
      (v) => v.status === 'ACTIVE' && v.language?.toLowerCase() === EXPECTED_LANGUAGE,
    );
    if (!hasExpectedLanguage && versions.length > 0) {
      missingCoverage.push(`Keine aktive Version für Sprache ${EXPECTED_LANGUAGE.toUpperCase()}`);
    }

    return {
      config,
      ...readiness,
      activeDocument,
      activeSince: activeDocument?.activatedAt ?? activeDocument?.activeFrom ?? null,
      activatedBy: activeDocument?.activatedBy?.displayName ?? null,
      approvedBy: activeDocument?.approvedBy?.displayName ?? null,
      languageLabel: activeDocument?.language ?? null,
      jurisdictionLabel: activeDocument?.jurisdiction ?? null,
      missingCoverage,
      versions,
      draftCount: versions.filter((v) => v.status === 'DRAFT').length,
      pendingReviewCount: versions.filter((v) => v.status === 'IN_REVIEW').length,
    };
  });

  const configAlerts: LegalDocumentConfigAlert[] = [];
  for (const category of categories) {
    if (category.readiness === 'empty' || category.readiness === 'blocked') {
      configAlerts.push({
        id: `${category.config.key}-readiness`,
        severity: 'critical',
        title: `${category.config.title}: ${category.statusLabel}`,
        detail: category.nextAction ?? category.issues[0] ?? 'Aktion erforderlich',
        categoryKey: category.config.key,
      });
    } else if (category.readiness === 'attention') {
      configAlerts.push({
        id: `${category.config.key}-attention`,
        severity: 'warning',
        title: `${category.config.title}: ${category.issues[0] ?? 'Prüfung empfohlen'}`,
        detail: category.nextAction ?? 'Details in der Kategorie prüfen',
        categoryKey: category.config.key,
      });
    }
    for (const issue of category.issues) {
      if (issue.includes('Scan') || issue.includes('Integrität')) {
        configAlerts.push({
          id: `${category.config.key}-${issue}`,
          severity: issue.includes('FAILED') || issue.includes('MISSING') ? 'critical' : 'warning',
          title: category.config.title,
          detail: issue,
          categoryKey: category.config.key,
        });
      }
    }
  }

  const dedupedAlerts = Array.from(
    new Map(configAlerts.map((a) => [a.id, a])).values(),
  );

  const readyCount = categories.filter((c) => c.readiness === 'ready').length;
  const attentionCount = categories.filter((c) => c.readiness === 'attention').length;
  const blockedCount = categories.filter((c) => c.readiness === 'blocked').length;
  const emptyCount = categories.filter((c) => c.readiness === 'empty').length;

  let overallTone: StatusTone = 'success';
  let overallLabel = 'Einsatzbereit';
  let overallDetail = 'Alle Pflicht-Kategorien sind für Buchungen freigegeben.';

  if (blockedCount > 0 || emptyCount > 0) {
    overallTone = 'critical';
    overallLabel = 'Nicht einsatzbereit';
    overallDetail = `${blockedCount + emptyCount} Kategorie(n) blockieren vollständige Buchungsdokumente.`;
  } else if (attentionCount > 0) {
    overallTone = 'watch';
    overallLabel = 'Teilweise eingeschränkt';
    overallDetail = `${attentionCount} Kategorie(n) mit offenen Hinweisen — Buchungen können eingeschränkt sein.`;
  }

  const allVersions: LegalDocumentVersionRow[] = categories.flatMap((category) =>
    category.versions.map((doc) => ({
      id: doc.id,
      categoryTitle: category.config.title,
      documentType: doc.documentType,
      versionLabel: doc.versionLabel,
      status: doc.status,
      language: doc.language,
      jurisdiction: doc.jurisdiction ?? null,
      fileName: doc.fileName,
      fileSize: doc.fileSize ?? doc.sizeBytes,
      scanStatus: doc.scanStatus ?? null,
      integrityStatus: doc.integrityStatus ?? null,
      activatedAt: doc.activatedAt ?? doc.activeFrom,
      activatedBy: doc.activatedBy?.displayName ?? null,
      createdAt: doc.createdAt,
      snapshotCount: doc.snapshotCount ?? 0,
    })),
  );

  return {
    overallTone,
    overallLabel,
    overallDetail,
    readyCount,
    attentionCount,
    blockedCount,
    emptyCount,
    categories,
    configAlerts: dedupedAlerts,
    allVersions,
  };
}

export function formatLegalDocumentStatus(status: string): string {
  return STATUS_LABEL_DE[status] ?? status;
}

export function formatLegalDocumentDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function formatLegalDocumentBytes(bytes: number | null | undefined): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function legalDocumentVariantLabel(doc: LegalDocumentDto): string | null {
  return variantLabel(doc);
}

export function legalDocumentTypeTitle(documentType: string, legacyDocumentType?: string | null): string {
  const key = legalDocumentGroupKey(documentType, legacyDocumentType);
  return LEGAL_DOCUMENT_TYPE_CONFIGS.find((c) => c.key === key)?.title ?? documentType;
}

export const LEGAL_DOCUMENT_EXPECTED_LANGUAGE = EXPECTED_LANGUAGE;
export const LEGAL_DOCUMENT_EXPECTED_JURISDICTION = EXPECTED_JURISDICTION;
