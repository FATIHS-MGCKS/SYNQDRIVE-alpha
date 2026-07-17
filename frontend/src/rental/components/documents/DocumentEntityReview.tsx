import { useCallback, useMemo, useState } from 'react';
import { Icon } from '../ui/Icon';
import { api } from '../../../lib/api';
import { useDocumentEntityLinks } from '../../hooks/useDocumentEntityLinks';
import type { TranslationKey } from '../../i18n/translations/en';
import type { DocumentEntityLinkType } from '../../lib/document-entity-links';
import {
  buildEntityReviewSections,
  formatEntityConfidencePercent,
  type EntityReviewCandidate,
  type EntityReviewSection,
  type VehicleLabelLookup,
} from '../../lib/document-entity-review';
import type { PublicDocumentExtraction } from '../../lib/document-extraction.types';

type SearchResult = { id: string; label: string };

export interface DocumentEntityReviewProps {
  record: PublicDocumentExtraction | null;
  orgId: string;
  vehicleId?: string | null;
  extractionId: string | null;
  locale?: string;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
  readOnly?: boolean;
  isDarkMode?: boolean;
  vehicleLookup?: VehicleLabelLookup;
  onRecordUpdated?: (record: PublicDocumentExtraction) => void;
}

function reasonLabel(t: DocumentEntityReviewProps['t'], code: string): string {
  const key = `docUpload.entityReview.reason.${code}` as TranslationKey;
  const translated = t(key);
  return translated === key ? code.replace(/_/g, ' ') : translated;
}

function CandidateCard({
  candidate,
  selected,
  t,
  isDarkMode,
  onSelect,
  disabled,
}: {
  candidate: EntityReviewCandidate;
  selected?: boolean;
  t: DocumentEntityReviewProps['t'];
  isDarkMode?: boolean;
  onSelect?: () => void;
  disabled?: boolean;
}) {
  const confidence = formatEntityConfidencePercent(candidate.confidence);
  return (
    <div
      className={`rounded-lg border px-3 py-2.5 min-w-0 ${
        selected
          ? isDarkMode
            ? 'border-brand/50 bg-brand-soft/30'
            : 'border-brand/40 bg-brand-soft/20'
          : isDarkMode
            ? 'border-neutral-800 bg-neutral-900/40'
            : 'border-gray-200 bg-white'
      }`}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between min-w-0">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <span className={`text-xs font-semibold break-words ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
              {candidate.displayLabel}
            </span>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                isDarkMode ? 'bg-amber-500/15 text-amber-300' : 'bg-amber-50 text-amber-800'
              }`}
            >
              {t('docUpload.entityReview.suggestionBadge')}
            </span>
          </div>
          <p className={`text-[10px] ${isDarkMode ? 'text-gray-500' : 'text-muted-foreground'}`}>
            #{candidate.rank}
            {confidence ? ` · ${confidence}` : ''}
            {candidate.confidenceLevel ? ` · ${t(`docUpload.entityReview.confidence.${candidate.confidenceLevel}`)}` : ''}
          </p>
          {candidate.matchReasons.length > 0 ? (
            <p className={`text-[11px] break-words ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
              {t('docUpload.entityReview.matchReasons')}:{' '}
              {candidate.matchReasons.map((reason) => reasonLabel(t, reason)).join(', ')}
            </p>
          ) : null}
          {candidate.metadata.driverRole ? (
            <p className={`text-[11px] ${isDarkMode ? 'text-gray-400' : 'text-muted-foreground'}`}>
              {t('docUpload.entityReview.driverRole')}: {t(`docUpload.entityReview.driverRole.${candidate.metadata.driverRole}` as TranslationKey)}
            </p>
          ) : null}
          {candidate.conflicts.length > 0 ? (
            <ul className="space-y-1">
              {candidate.conflicts.map((conflict, index) => (
                <li
                  key={`${conflict.code}-${index}`}
                  className={`text-[11px] break-words ${
                    conflict.severity === 'BLOCKER'
                      ? isDarkMode
                        ? 'text-red-300'
                        : 'text-red-700'
                      : isDarkMode
                        ? 'text-amber-300'
                        : 'text-amber-800'
                  }`}
                >
                  {conflict.message}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        {onSelect ? (
          <button
            type="button"
            onClick={onSelect}
            disabled={disabled}
            className="min-h-10 shrink-0 self-start rounded-lg bg-brand px-3 py-2 text-[11px] font-semibold text-brand-foreground disabled:opacity-50"
          >
            {t('docUpload.entityReview.select')}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function EntityReviewSectionPanel({
  section,
  t,
  isDarkMode,
  readOnly,
  pending,
  onConfirm,
  onRemove,
  onSearchSelect,
  orgId,
}: {
  section: EntityReviewSection;
  t: DocumentEntityReviewProps['t'];
  isDarkMode?: boolean;
  readOnly?: boolean;
  pending?: boolean;
  onConfirm: (candidate: EntityReviewCandidate) => void;
  onRemove: () => void;
  onSearchSelect: (entityId: string, label: string) => void;
  orgId: string;
}) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  const runSearch = useCallback(async () => {
    if (!section.linkEntityType || searchQuery.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    setSearchLoading(true);
    try {
      const q = searchQuery.trim();
      if (section.linkEntityType === 'vehicle') {
        const res = await api.vehicles.listByOrg(orgId, { limit: 20 });
        const rows = (res.data ?? []) as Array<Record<string, unknown>>;
        setSearchResults(
          rows
            .filter((row) => {
              const plate = String(row.licensePlate ?? '').toLowerCase();
              const name = String(row.vehicleName ?? `${row.make ?? ''} ${row.model ?? ''}`).toLowerCase();
              const needle = q.toLowerCase();
              return plate.includes(needle) || name.includes(needle);
            })
            .slice(0, 8)
            .map((row) => ({
              id: String(row.id),
              label: `${row.vehicleName || `${row.make ?? ''} ${row.model ?? ''}`.trim()}${row.licensePlate ? ` · ${row.licensePlate}` : ''}`,
            })),
        );
      } else if (section.linkEntityType === 'booking') {
        const res = await api.bookings.list(orgId, { search: q, limit: 8 });
        const rows = Array.isArray(res) ? res : (res.data ?? []);
        setSearchResults(
          (rows as Array<Record<string, unknown>>).slice(0, 8).map((row, index) => ({
            id: String(row.id),
            label: String(row.referenceNumber ?? row.bookingNumber ?? `Buchung ${index + 1}`),
          })),
        );
      } else if (section.linkEntityType === 'customer' || section.linkEntityType === 'driver') {
        const res = await api.customers.list(orgId, { search: q, limit: 8 });
        setSearchResults(
          (res.data ?? []).map((row) => ({
            id: row.id,
            label: [row.firstName, row.lastName].filter(Boolean).join(' ') || row.companyName || row.email || 'Kunde',
          })),
        );
      } else if (section.linkEntityType === 'vendor') {
        const rows = await api.vendors.list(orgId);
        const needle = q.toLowerCase();
        setSearchResults(
          rows
            .filter((row) => String(row.name ?? '').toLowerCase().includes(needle))
            .slice(0, 8)
            .map((row) => ({ id: row.id, label: row.name })),
        );
      } else {
        setSearchResults([]);
      }
    } catch {
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  }, [orgId, searchQuery, section.linkEntityType]);

  const confirmedLabel = section.confirmedLink?.label || section.bestCandidate?.displayLabel;

  return (
    <section
      className={`rounded-lg border p-3 sm:p-4 min-w-0 space-y-3 ${
        isDarkMode ? 'border-neutral-800 bg-neutral-900/40' : 'border-gray-200 bg-gray-50/60'
      }`}
      aria-label={t(section.titleKey)}
    >
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between min-w-0">
        <h4 className={`text-sm font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{t(section.titleKey)}</h4>
        {section.confirmedLink ? (
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold ${
              isDarkMode ? 'bg-green-500/15 text-green-300' : 'bg-green-50 text-green-800'
            }`}
          >
            <Icon name="check" className="w-3 h-3" />
            {t('docUpload.entityReview.confirmedBadge')}
          </span>
        ) : (
          <span
            className={`inline-flex rounded-full px-2 py-1 text-[10px] font-semibold ${
              isDarkMode ? 'bg-amber-500/15 text-amber-300' : 'bg-amber-50 text-amber-800'
            }`}
          >
            {t('docUpload.entityReview.unconfirmedBadge')}
          </span>
        )}
      </div>

      {section.originContextHint ? (
        <p className={`text-[11px] break-words ${isDarkMode ? 'text-brand' : 'text-status-info'}`}>
          {section.originContextHint}
        </p>
      ) : null}

      {section.driverAmbiguityHint ? (
        <p className={`text-[11px] break-words ${isDarkMode ? 'text-amber-300' : 'text-amber-800'}`}>
          {t(section.driverAmbiguityHint as TranslationKey)}
        </p>
      ) : null}

      {section.confirmedLink ? (
        <div
          className={`rounded-lg border px-3 py-2.5 ${
            isDarkMode ? 'border-green-500/30 bg-green-500/10' : 'border-green-200 bg-green-50'
          }`}
        >
          <p className={`text-xs font-semibold break-words ${isDarkMode ? 'text-green-200' : 'text-green-900'}`}>
            {confirmedLabel || t('docUpload.entityReview.confirmedSelection')}
          </p>
          {!readOnly ? (
            <button
              type="button"
              onClick={onRemove}
              disabled={pending}
              className={`mt-2 min-h-10 text-[11px] font-semibold underline-offset-2 hover:underline ${
                isDarkMode ? 'text-gray-300' : 'text-gray-700'
              }`}
            >
              {t('docUpload.entityReview.notAssignable')}
            </button>
          ) : null}
        </div>
      ) : section.candidates.length === 0 ? (
        <p className={`text-xs ${isDarkMode ? 'text-muted-foreground' : 'text-gray-600'}`}>{t(section.emptyStateKey)}</p>
      ) : (
        <div className="space-y-2">
          {section.bestCandidate ? (
            <div className="space-y-1.5">
              <p className={`text-[10px] font-semibold uppercase tracking-wide ${isDarkMode ? 'text-gray-500' : 'text-muted-foreground'}`}>
                {t('docUpload.entityReview.bestCandidate')}
              </p>
              <CandidateCard
                candidate={section.bestCandidate}
                t={t}
                isDarkMode={isDarkMode}
                disabled={readOnly || pending || section.bestCandidate.entityId.startsWith('suggestion:')}
                onSelect={
                  readOnly || section.bestCandidate.entityId.startsWith('suggestion:')
                    ? undefined
                    : () => onConfirm(section.bestCandidate!)
                }
              />
            </div>
          ) : null}

          {section.alternativeCandidates.length > 0 ? (
            <div className="space-y-1.5">
              <p className={`text-[10px] font-semibold uppercase tracking-wide ${isDarkMode ? 'text-gray-500' : 'text-muted-foreground'}`}>
                {t('docUpload.entityReview.alternatives')}
              </p>
              <div className="space-y-2">
                {section.alternativeCandidates.map((candidate) => (
                  <CandidateCard
                    key={`${candidate.entityId}-${candidate.rank}`}
                    candidate={candidate}
                    t={t}
                    isDarkMode={isDarkMode}
                    disabled={readOnly || pending || candidate.entityId.startsWith('suggestion:')}
                    onSelect={
                      readOnly || candidate.entityId.startsWith('suggestion:')
                        ? undefined
                        : () => onConfirm(candidate)
                    }
                  />
                ))}
              </div>
            </div>
          ) : null}
        </div>
      )}

      {!readOnly && section.linkEntityType ? (
        <div className="space-y-2 pt-1 border-t border-dashed border-border/60">
          <button
            type="button"
            onClick={() => setSearchOpen((open) => !open)}
            className={`inline-flex items-center gap-1.5 min-h-10 text-[11px] font-semibold ${
              isDarkMode ? 'text-gray-300' : 'text-gray-700'
            }`}
          >
            <Icon name="search" className="w-3.5 h-3.5" />
            {t('docUpload.entityReview.search')}
          </button>
          {searchOpen ? (
            <div className="space-y-2">
              <div className="flex flex-col gap-2 sm:flex-row min-w-0">
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t('docUpload.entityReview.searchPlaceholder')}
                  className={`flex-1 min-w-0 min-h-10 rounded-lg border px-3 py-2 text-xs ${
                    isDarkMode ? 'surface-premium border-neutral-700 text-white' : 'bg-white border-gray-200'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => void runSearch()}
                  disabled={searchLoading || searchQuery.trim().length < 2}
                  className="min-h-10 rounded-lg bg-brand px-3 py-2 text-xs font-semibold text-brand-foreground disabled:opacity-50"
                >
                  {searchLoading ? t('docUpload.entityReview.searching') : t('docUpload.entityReview.searchAction')}
                </button>
              </div>
              {searchResults.length > 0 ? (
                <ul className="space-y-1">
                  {searchResults.map((result) => (
                    <li key={result.id}>
                      <button
                        type="button"
                        onClick={() => onSearchSelect(result.id, result.label)}
                        disabled={pending}
                        className={`w-full min-h-10 rounded-lg border px-3 py-2 text-left text-xs font-medium break-words ${
                          isDarkMode ? 'border-neutral-800 hover:bg-neutral-800' : 'border-gray-200 hover:bg-gray-50'
                        }`}
                      >
                        {result.label}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          {!section.confirmedLink ? (
            <button
              type="button"
              onClick={onRemove}
              disabled={pending}
              className={`min-h-10 text-[11px] font-semibold underline-offset-2 hover:underline ${
                isDarkMode ? 'text-gray-400' : 'text-muted-foreground'
              }`}
            >
              {t('docUpload.entityReview.notAssignable')}
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

export function DocumentEntityReview({
  record,
  orgId,
  vehicleId,
  extractionId,
  t,
  readOnly = false,
  isDarkMode = false,
  vehicleLookup,
  onRecordUpdated,
}: DocumentEntityReviewProps) {
  const sections = useMemo(
    () => buildEntityReviewSections(record, { vehicleLookup, includeEmptySections: true }),
    [record, vehicleLookup],
  );

  const entityLinks = useDocumentEntityLinks({
    orgId,
    vehicleId,
    extractionId,
    recordVehicleId: record?.vehicleId,
    onUpdated: onRecordUpdated,
  });

  const handleConfirm = useCallback(
    async (section: EntityReviewSection, candidate: EntityReviewCandidate) => {
      if (!section.linkEntityType || candidate.entityId.startsWith('suggestion:')) return;
      const existing = section.confirmedLink;
      if (existing) {
        await entityLinks.changeLink(
          section.linkEntityType,
          candidate.entityId,
          candidate.displayLabel,
          existing.entityId,
        );
        return;
      }
      await entityLinks.confirmLink(section.linkEntityType, candidate.entityId, candidate.displayLabel);
    },
    [entityLinks],
  );

  const handleRemove = useCallback(
    async (section: EntityReviewSection) => {
      if (!section.linkEntityType) return;
      await entityLinks.removeLink(section.linkEntityType, section.confirmedLink?.entityId);
    },
    [entityLinks],
  );

  const handleSearchSelect = useCallback(
    async (section: EntityReviewSection, entityId: string, label: string) => {
      if (!section.linkEntityType) return;
      const existing = section.confirmedLink;
      if (existing) {
        await entityLinks.changeLink(section.linkEntityType, entityId, label, existing.entityId);
        return;
      }
      await entityLinks.confirmLink(section.linkEntityType, entityId, label);
    },
    [entityLinks],
  );

  if (!record) return null;

  return (
    <div className="space-y-3 min-w-0">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between min-w-0">
        <div>
          <h3 className={`text-sm font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
            {t('docUpload.entityReview.title')}
          </h3>
          <p className={`text-xs break-words ${isDarkMode ? 'text-muted-foreground' : 'text-gray-600'}`}>
            {t('docUpload.entityReview.subtitle')}
          </p>
        </div>
        {record.entityCandidateRanking?.preselectionBlocked ? (
          <span
            className={`text-[10px] font-semibold rounded-full px-2 py-1 ${
              isDarkMode ? 'bg-amber-500/15 text-amber-300' : 'bg-amber-50 text-amber-800'
            }`}
          >
            {t('docUpload.entityReview.preselectionBlocked')}
          </span>
        ) : null}
      </div>

      {entityLinks.planInvalidatedHint ? (
        <p className={`text-xs rounded-lg border px-3 py-2 ${isDarkMode ? 'border-amber-500/30 bg-amber-500/10 text-amber-200' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>
          {t('docUpload.entityReview.planInvalidatedHint')}
        </p>
      ) : null}

      {entityLinks.error ? (
        <p className={`text-xs ${isDarkMode ? 'text-red-300' : 'text-red-700'}`}>{entityLinks.error}</p>
      ) : null}

      <div className="space-y-3">
        {sections.map((section) => (
          <EntityReviewSectionPanel
            key={section.id}
            section={section}
            t={t}
            isDarkMode={isDarkMode}
            readOnly={readOnly}
            pending={entityLinks.pending}
            orgId={orgId}
            onConfirm={(candidate) => void handleConfirm(section, candidate)}
            onRemove={() => void handleRemove(section)}
            onSearchSelect={(entityId, label) => void handleSearchSelect(section, entityId, label)}
          />
        ))}
      </div>
    </div>
  );
}
