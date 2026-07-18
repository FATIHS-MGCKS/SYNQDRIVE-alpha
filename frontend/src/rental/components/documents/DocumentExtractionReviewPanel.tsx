import type { ReactNode } from 'react';
import type { PublicDocumentExtraction, PublicDocumentActionPlanPreview } from '../../lib/document-extraction.types';
import { useDocumentSchemaReview } from '../../hooks/useDocumentSchemaReview';
import { useDocumentActionPlanPreview } from '../../hooks/useDocumentActionPlanPreview';
import { hasSavedFieldReview } from '../../lib/document-schema-field-review';
import {
  DOC_TYPE_LABELS,
  type Plausibility,
  type PlausibilityStatus,
  type ReviewField,
} from './document-extraction.shared';
import { DocumentEntityReview } from './DocumentEntityReview';
import { DocumentSchemaFieldReview } from './DocumentSchemaFieldReview';
import { DocumentActionPlanReview } from './DocumentActionPlanReview';
import type { TranslationKey } from '../../i18n/translations/en';
import type { VehicleLabelLookup } from '../../lib/document-entity-review';

function plausClass(status: PlausibilityStatus): string {
  if (status === 'BLOCKER') return 'border-[color:var(--status-critical)]/30 bg-[color:var(--status-critical)]/[0.06] text-[color:var(--status-critical)]';
  if (status === 'WARNING') return 'border-[color:var(--status-watch)]/30 bg-[color:var(--status-watch)]/[0.06] text-[color:var(--status-watch)]';
  return 'border-[color:var(--status-success)]/30 bg-[color:var(--status-success)]/[0.06] text-[color:var(--status-success)]';
}

export interface DocumentExtractionReviewPanelProps {
  confirmedDocType: string;
  editedFields: ReviewField[];
  plausibility: Plausibility | null;
  record?: PublicDocumentExtraction | null;
  editingFields: boolean;
  readOnly?: boolean;
  canEdit?: boolean;
  onToggleEdit?: () => void;
  onFieldChange: (index: number, value: string) => void;
  fieldsTitle?: string;
  plausibilityTitle?: string;
  showActionPreview?: boolean;
  showEntityResolution?: boolean;
  entityReviewOrgId?: string | null;
  entityReviewVehicleId?: string | null;
  entityReviewExtractionId?: string | null;
  entityReviewLocale?: string;
  entityReviewT?: (key: TranslationKey, vars?: Record<string, string | number>) => string;
  vehicleLookup?: VehicleLabelLookup;
  onEntityLinksUpdated?: (record: PublicDocumentExtraction) => void;
  onSchemaReviewUpdated?: (record: PublicDocumentExtraction) => void;
  onActionPlanPreviewChange?: (preview: PublicDocumentActionPlanPreview | null) => void;
  onActionPlanPreviewStateChange?: (state: {
    preview: PublicDocumentActionPlanPreview | null;
    loading: boolean;
  }) => void;
  headerSlot?: ReactNode;
  footerSlot?: ReactNode;
  isDarkMode?: boolean;
}

function EntityResolutionSection({
  record,
  orgId,
  vehicleId,
  extractionId,
  t,
  readOnly,
  isDarkMode,
  vehicleLookup,
  onEntityLinksUpdated,
}: {
  record: PublicDocumentExtraction;
  orgId: string;
  vehicleId?: string | null;
  extractionId?: string | null;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
  readOnly?: boolean;
  isDarkMode?: boolean;
  vehicleLookup?: VehicleLabelLookup;
  onEntityLinksUpdated?: (record: PublicDocumentExtraction) => void;
}) {
  return (
    <DocumentEntityReview
      record={record}
      orgId={orgId}
      vehicleId={vehicleId}
      extractionId={extractionId ?? record.id}
      t={t}
      readOnly={readOnly}
      isDarkMode={isDarkMode}
      vehicleLookup={vehicleLookup}
      onRecordUpdated={onEntityLinksUpdated}
    />
  );
}

export function DocumentExtractionReviewPanel({
  confirmedDocType,
  editedFields,
  plausibility,
  record = null,
  editingFields,
  readOnly = false,
  canEdit = true,
  onToggleEdit,
  onFieldChange,
  fieldsTitle = 'Erkannte Felder',
  plausibilityTitle = 'Plausibilität',
  showActionPreview = true,
  showEntityResolution = true,
  entityReviewOrgId = null,
  entityReviewVehicleId,
  entityReviewExtractionId,
  entityReviewLocale = 'de',
  entityReviewT,
  vehicleLookup,
  onEntityLinksUpdated,
  onSchemaReviewUpdated,
  onActionPlanPreviewChange,
  onActionPlanPreviewStateChange,
  headerSlot,
  footerSlot,
  isDarkMode = false,
}: DocumentExtractionReviewPanelProps) {
  const schemaOrgId = entityReviewOrgId ?? record?.organizationId ?? '';
  const schemaVehicleId = entityReviewVehicleId ?? record?.vehicleId ?? null;
  const schemaExtractionId = entityReviewExtractionId ?? record?.id ?? null;
  const useSchemaFieldReview = Boolean(record && entityReviewT && (schemaOrgId || schemaVehicleId));

  const schemaReview = useDocumentSchemaReview({
    record,
    orgId: schemaOrgId,
    vehicleId: schemaVehicleId,
    extractionId: schemaExtractionId,
    locale: entityReviewLocale,
    enabled: useSchemaFieldReview,
    onRecordUpdated: onSchemaReviewUpdated,
  });

  const savedFieldReview = hasSavedFieldReview(record?.confirmedData);

  const actionPlanReview = useDocumentActionPlanPreview({
    record,
    orgId: schemaOrgId,
    vehicleId: schemaVehicleId,
    extractionId: schemaExtractionId,
    enabled: useSchemaFieldReview && showActionPreview,
    onPreviewChange: onActionPlanPreviewChange,
    onStateChange: onActionPlanPreviewStateChange,
  });

  return (
    <div className="space-y-3">
      {headerSlot}

      {plausibility ? (
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="sq-section-label">{plausibilityTitle}</span>
            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${plausClass(plausibility.overallStatus)}`}>
              {plausibility.overallStatus}
            </span>
          </div>
          {plausibility.checks.length === 0 ? (
            <div className={`rounded-lg border px-3 py-2 text-[11px] ${plausClass('OK')}`}>
              {entityReviewT?.('docUpload.plausibilityOk') ?? 'Keine Auffälligkeiten'}
            </div>
          ) : (
            <div className="space-y-1.5">
              {plausibility.checks.map((check, index) => (
                <div key={`${check.code}-${index}`} className={`rounded-lg border px-3 py-2 text-[11px] ${plausClass(check.status)}`}>
                  {check.message}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {showEntityResolution && record && entityReviewOrgId && entityReviewT ? (
        <EntityResolutionSection
          record={record}
          orgId={entityReviewOrgId}
          vehicleId={entityReviewVehicleId}
          extractionId={entityReviewExtractionId ?? record.id}
          t={entityReviewT}
          readOnly={readOnly}
          isDarkMode={isDarkMode}
          vehicleLookup={vehicleLookup}
          onEntityLinksUpdated={onEntityLinksUpdated}
        />
      ) : null}

      {showActionPreview ? (
        useSchemaFieldReview && entityReviewT ? (
          <DocumentActionPlanReview
            preview={actionPlanReview.preview}
            loading={actionPlanReview.loading}
            error={actionPlanReview.error}
            locked={!savedFieldReview}
            readOnly={readOnly}
            pendingToggle={actionPlanReview.pendingToggle}
            t={entityReviewT}
            onToggleOptional={(semanticAction, enabled) => {
              void actionPlanReview.setOptionalActionEnabled(semanticAction, enabled);
            }}
          />
        ) : null
      ) : null}

      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="sq-section-label">{fieldsTitle}</span>
          {!useSchemaFieldReview && canEdit && !readOnly && onToggleEdit ? (
            <button type="button" onClick={onToggleEdit} className="text-[10px] font-semibold text-primary">
              {editingFields ? 'Fertig' : 'Bearbeiten'}
            </button>
          ) : null}
        </div>

        {useSchemaFieldReview && entityReviewT ? (
          <>
            {schemaReview.schemaError ? (
              <p className="mb-2 text-[10px] text-[color:var(--status-critical)]">{schemaReview.schemaError}</p>
            ) : null}
            <DocumentSchemaFieldReview
              groups={schemaReview.groups}
              readOnly={readOnly}
              pending={schemaReview.pending}
              isDirty={schemaReview.isDirty}
              hasSavedReview={schemaReview.hasSavedReview}
              saveError={schemaReview.saveError}
              planInvalidatedHint={schemaReview.planInvalidatedHint}
              showSource={schemaReview.showSource}
              isDarkMode={isDarkMode}
              t={entityReviewT}
              onFieldChange={schemaReview.updateFieldValue}
              onSaveReview={() => void schemaReview.saveReview()}
              onToggleSource={schemaReview.toggleSource}
            />
          </>
        ) : (
          <div className={`overflow-hidden rounded-xl border ${isDarkMode ? 'border-neutral-800' : 'border-border'}`}>
            {editedFields.map((field, index) => (
              <div
                key={field.key}
                className={`flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3 px-3 py-2.5 min-w-0 ${index > 0 ? 'border-t border-border' : ''} bg-muted/10`}
              >
                <span className="sm:w-44 shrink-0 text-[10px] font-medium text-muted-foreground">{field.label}</span>
                {editingFields && !readOnly ? (
                  field.fieldType === 'multiline' ? (
                    <textarea
                      value={field.value}
                      rows={3}
                      onChange={(e) => onFieldChange(index, e.target.value)}
                      className="w-full min-w-0 sm:flex-1 rounded-md border border-border surface-premium px-2 py-1 text-[11px] text-foreground"
                    />
                  ) : (
                    <input
                      value={field.value}
                      onChange={(e) => onFieldChange(index, e.target.value)}
                      className="w-full min-w-0 sm:flex-1 rounded-md border border-border surface-premium px-2 py-1 text-[11px] text-foreground"
                    />
                  )
                ) : (
                  <span className="w-full min-w-0 break-words text-[11px] font-medium text-foreground whitespace-pre-wrap">{field.value || '—'}</span>
                )}
              </div>
            ))}
          </div>
        )}

        <p className="mt-1 text-[10px] text-muted-foreground">
          {DOC_TYPE_LABELS[confirmedDocType] || confirmedDocType}
        </p>
      </div>

      {footerSlot}
    </div>
  );
}
