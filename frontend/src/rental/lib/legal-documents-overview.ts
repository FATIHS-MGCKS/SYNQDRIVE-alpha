import type { LegalDocumentDto } from '../../lib/api';
import {
  LEGAL_DOCUMENT_TYPE_CONFIGS,
  legalDocumentGroupKey,
  type LegalDocumentTypeConfig,
} from './legal-document-types';
import type { StatusTone } from '../../components/patterns';
import {
  formatLegalDocumentStatusI18n,
  formatLegalDocumentTypeTitle,
  formatLegalDocumentVariantLabel,
  type LegalDocumentsTranslate,
} from './legal-documents-i18n';

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
  title: string;
  hint: string;
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

const EXPECTED_LANGUAGE = 'de';
const EXPECTED_JURISDICTION = 'DE';

function scanIssue(doc: LegalDocumentDto, t: LegalDocumentsTranslate): string | null {
  const status = (doc.scanStatus ?? 'UPLOADED').toUpperCase();
  if (SCAN_BLOCKING.has(status)) {
    return t('legalDocuments.readiness.issue.scanBlocking', { status });
  }
  if (SCAN_ATTENTION.has(status)) {
    return t('legalDocuments.readiness.issue.scanPending', { status });
  }
  return null;
}

function integrityIssue(doc: LegalDocumentDto, t: LegalDocumentsTranslate): string | null {
  const status = (doc.integrityStatus ?? 'UNVERIFIED').toUpperCase();
  if (INTEGRITY_BLOCKING.has(status)) {
    return t('legalDocuments.readiness.issue.integrityBlocking', { status });
  }
  if (status === 'UNVERIFIED') return t('legalDocuments.readiness.issue.integrityUnverified');
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
  t: LegalDocumentsTranslate,
): Pick<LegalDocumentCategoryOverview, 'readiness' | 'statusLabel' | 'statusTone' | 'issues' | 'nextAction'> {
  const issues: string[] = [];

  if (versions.length === 0) {
    return {
      readiness: 'empty',
      statusLabel: t('legalDocuments.readiness.category.notProvided'),
      statusTone: 'critical',
      issues: [t('legalDocuments.readiness.issue.noVersion')],
      nextAction: t('legalDocuments.readiness.next.uploadAndApprove'),
    };
  }

  if (!active) {
    const draft = versions.some((v) => v.status === 'DRAFT' || v.status === 'IN_REVIEW');
    const approved = versions.some((v) => v.status === 'APPROVED');
    return {
      readiness: 'blocked',
      statusLabel: t('legalDocuments.readiness.category.notReady'),
      statusTone: 'critical',
      issues: [t('legalDocuments.readiness.issue.noActive')],
      nextAction: draft
        ? t('legalDocuments.readiness.next.reviewAndActivate')
        : approved
          ? t('legalDocuments.readiness.next.activateApproved')
          : t('legalDocuments.readiness.next.uploadAndActivate'),
    };
  }

  const scan = scanIssue(active, t);
  const integrity = integrityIssue(active, t);
  if (scan) issues.push(scan);
  if (integrity) issues.push(integrity);

  if (active.language?.toLowerCase() !== EXPECTED_LANGUAGE) {
    issues.push(
      t('legalDocuments.readiness.issue.languageMismatch', {
        actual: active.language,
        expected: EXPECTED_LANGUAGE,
      }),
    );
  }
  if ((active.jurisdiction ?? '').toUpperCase() !== EXPECTED_JURISDICTION) {
    issues.push(
      t('legalDocuments.readiness.issue.jurisdictionMismatch', {
        actual: active.jurisdiction ?? t('legalDocuments.common.emDash'),
        expected: EXPECTED_JURISDICTION,
      }),
    );
  }

  const blockingIntegrity = issues.some(
    (i) =>
      i.includes('CHECKSUM') ||
      i.includes('MISSING') ||
      i.includes('checksum') ||
      i.includes('Integrität: CHECKSUM') ||
      i.includes('Integrity: CHECKSUM'),
  );
  const blockingScan = issues.some(
    (i) => i.includes('FAILED') || i.includes('INFECTED') || i.includes('Malware'),
  );

  if (blockingScan || blockingIntegrity) {
    return {
      readiness: 'blocked',
      statusLabel: t('legalDocuments.readiness.category.blocked'),
      statusTone: 'critical',
      issues,
      nextAction: t('legalDocuments.readiness.next.fixScanIntegrity'),
    };
  }

  if (issues.length > 0) {
    return {
      readiness: 'attention',
      statusLabel: t('legalDocuments.readiness.category.limited'),
      statusTone: 'watch',
      issues,
      nextAction: issues[0] ?? t('legalDocuments.readiness.next.review'),
    };
  }

  return {
    readiness: 'ready',
    statusLabel: t('legalDocuments.readiness.category.ready'),
    statusTone: 'success',
    issues: [],
    nextAction: null,
  };
}

export function buildLegalDocumentsReadinessSummary(
  docs: LegalDocumentDto[],
  t: LegalDocumentsTranslate,
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
    const readiness = resolveReadiness(versions, activeDocument, t);
    const title = t(config.titleKey);
    const hint = t(config.hintKey);

    const missingCoverage: string[] = [];
    const hasExpectedLanguage = versions.some(
      (v) => v.status === 'ACTIVE' && v.language?.toLowerCase() === EXPECTED_LANGUAGE,
    );
    if (!hasExpectedLanguage && versions.length > 0) {
      missingCoverage.push(
        t('legalDocuments.readiness.missingLanguage', {
          language: EXPECTED_LANGUAGE.toUpperCase(),
        }),
      );
    }

    return {
      config,
      title,
      hint,
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
        title: `${category.title}: ${category.statusLabel}`,
        detail: category.nextAction ?? category.issues[0] ?? t('legalDocuments.alerts.actionRequired'),
        categoryKey: category.config.key,
      });
    } else if (category.readiness === 'attention') {
      configAlerts.push({
        id: `${category.config.key}-attention`,
        severity: 'warning',
        title: `${category.title}: ${category.issues[0] ?? t('legalDocuments.alerts.reviewRecommended')}`,
        detail: category.nextAction ?? t('legalDocuments.alerts.checkCategory'),
        categoryKey: category.config.key,
      });
    }
    for (const issue of category.issues) {
      if (
        issue.toLowerCase().includes('scan') ||
        issue.toLowerCase().includes('integr') ||
        issue.includes('Malware')
      ) {
        configAlerts.push({
          id: `${category.config.key}-${issue}`,
          severity:
            issue.includes('FAILED') || issue.includes('MISSING') || issue.includes('INFECTED')
              ? 'critical'
              : 'warning',
          title: category.title,
          detail: issue,
          categoryKey: category.config.key,
        });
      }
    }
  }

  const dedupedAlerts = Array.from(new Map(configAlerts.map((a) => [a.id, a])).values());

  const readyCount = categories.filter((c) => c.readiness === 'ready').length;
  const attentionCount = categories.filter((c) => c.readiness === 'attention').length;
  const blockedCount = categories.filter((c) => c.readiness === 'blocked').length;
  const emptyCount = categories.filter((c) => c.readiness === 'empty').length;

  let overallTone: StatusTone = 'success';
  let overallLabel = t('legalDocuments.readiness.overall.ready');
  let overallDetail = t('legalDocuments.readiness.overall.readyDetail');

  if (blockedCount > 0 || emptyCount > 0) {
    overallTone = 'critical';
    overallLabel = t('legalDocuments.readiness.overall.critical');
    overallDetail = t('legalDocuments.readiness.overall.criticalDetail', {
      count: blockedCount + emptyCount,
    });
  } else if (attentionCount > 0) {
    overallTone = 'watch';
    overallLabel = t('legalDocuments.readiness.overall.attention');
    overallDetail = t('legalDocuments.readiness.overall.attentionDetail', { count: attentionCount });
  }

  const allVersions: LegalDocumentVersionRow[] = categories.flatMap((category) =>
    category.versions.map((doc) => ({
      id: doc.id,
      categoryTitle: category.title,
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

export function formatLegalDocumentStatus(status: string, t?: LegalDocumentsTranslate): string {
  if (t) return formatLegalDocumentStatusI18n(status, t);
  return status;
}

export function formatLegalDocumentDate(
  iso: string | null | undefined,
  locale?: string,
): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function formatLegalDocumentBytes(bytes: number | null | undefined): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function legalDocumentVariantLabel(
  doc: LegalDocumentDto,
  t?: LegalDocumentsTranslate,
): string | null {
  const variant = doc.documentVariant ?? doc.legalVariant;
  if (!variant) return null;
  if (t) return formatLegalDocumentVariantLabel(variant, t);
  return variant;
}

export function legalDocumentTypeTitle(
  documentType: string,
  legacyDocumentType?: string | null,
  t?: LegalDocumentsTranslate,
): string {
  const key = legalDocumentGroupKey(documentType, legacyDocumentType);
  if (t) return formatLegalDocumentTypeTitle(key, t);
  return key;
}

export const LEGAL_DOCUMENT_EXPECTED_LANGUAGE = EXPECTED_LANGUAGE;
export const LEGAL_DOCUMENT_EXPECTED_JURISDICTION = EXPECTED_JURISDICTION;
