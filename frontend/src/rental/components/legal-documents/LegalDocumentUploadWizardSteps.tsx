import type { LegalDocumentUploadWizardErrors, LegalDocumentUploadWizardForm } from '../../lib/legal-document-upload-wizard.types';
import {
  LEGAL_CONSUMER_VARIANT_OPTIONS,
  LEGAL_DOCUMENT_TYPE_OPTIONS,
  LEGAL_UPLOAD_BOOKING_CHANNELS,
  LEGAL_UPLOAD_CUSTOMER_SEGMENTS,
  LEGAL_UPLOAD_JURISDICTIONS,
  LEGAL_UPLOAD_LANGUAGES,
  LEGAL_UPLOAD_PRODUCT_SCOPES,
  LEGAL_UPLOAD_STATION_SCOPE_MODES,
} from '../../lib/legal-document-upload-wizard.constants';
import { LEGAL_DOCUMENT_TYPE } from '../../lib/legal-document-types';
import { useLanguage } from '../../i18n/LanguageContext';
import {
  LegalUploadFieldError,
  legalUploadInputA11y,
} from './legal-form-a11y';

const fieldClass =
  'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-soft)] motion-reduce:transition-none';

function Label({ htmlFor, children, required }: { htmlFor: string; children: string; required?: boolean }) {
  return (
    <label htmlFor={htmlFor} className="mb-1 block text-[11px] font-semibold text-muted-foreground">
      {children}
      {required ? ' *' : ''}
    </label>
  );
}

export interface WizardStepProps {
  form: LegalDocumentUploadWizardForm;
  errors: LegalDocumentUploadWizardErrors;
  onChange: (patch: Partial<LegalDocumentUploadWizardForm>) => void;
  stationOptions?: { value: string; label: string }[];
}

export function LegalDocumentUploadWizardStepClassification({
  form,
  errors,
  onChange,
  stationOptions = [],
}: WizardStepProps) {
  const { t } = useLanguage();

  return (
    <div className="space-y-4" data-testid="legal-upload-step-classification">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="documentType" required>
            {t('legalDocuments.wizard.field.documentType')}
          </Label>
          <select
            id="documentType"
            value={form.documentType}
            onChange={(e) => onChange({ documentType: e.target.value })}
            className={fieldClass}
            {...legalUploadInputA11y('documentType', errors)}
          >
            <option value="">{t('legalDocuments.wizard.placeholder.select')}</option>
            {LEGAL_DOCUMENT_TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {t(o.labelKey)}
              </option>
            ))}
          </select>
          <LegalUploadFieldError field="documentType" message={errors.documentType} />
        </div>

        {form.documentType === LEGAL_DOCUMENT_TYPE.CONSUMER_INFORMATION ? (
          <div>
            <Label htmlFor="legalVariant" required>
              {t('legalDocuments.wizard.field.variant')}
            </Label>
            <select
              id="legalVariant"
              value={form.legalVariant}
              onChange={(e) => onChange({ legalVariant: e.target.value as never })}
              className={fieldClass}
              {...legalUploadInputA11y('legalVariant', errors)}
            >
              <option value="">{t('legalDocuments.wizard.placeholder.select')}</option>
              {LEGAL_CONSUMER_VARIANT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {t(o.labelKey)}
                </option>
              ))}
            </select>
            <LegalUploadFieldError field="legalVariant" message={errors.legalVariant} />
          </div>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="language" required>
            {t('legalDocuments.wizard.field.language')}
          </Label>
          <select
            id="language"
            value={form.language}
            onChange={(e) => onChange({ language: e.target.value })}
            className={fieldClass}
          >
            {LEGAL_UPLOAD_LANGUAGES.map((o) => (
              <option key={o.value} value={o.value}>
                {t(o.labelKey)}
              </option>
            ))}
          </select>
          <LegalUploadFieldError field="language" message={errors.language} />
        </div>
        <div>
          <Label htmlFor="jurisdictionCountry" required>
            {t('legalDocuments.wizard.field.jurisdiction')}
          </Label>
          <select
            id="jurisdictionCountry"
            value={form.jurisdictionCountry}
            onChange={(e) => onChange({ jurisdictionCountry: e.target.value })}
            className={fieldClass}
          >
            {LEGAL_UPLOAD_JURISDICTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {t(o.labelKey)}
              </option>
            ))}
          </select>
          <LegalUploadFieldError field="jurisdictionCountry" message={errors.jurisdictionCountry} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="customerSegment" required>
            {t('legalDocuments.wizard.field.customerSegment')}
          </Label>
          <select
            id="customerSegment"
            value={form.customerSegment}
            onChange={(e) => onChange({ customerSegment: e.target.value })}
            className={fieldClass}
          >
            {LEGAL_UPLOAD_CUSTOMER_SEGMENTS.map((o) => (
              <option key={o.value} value={o.value}>
                {t(o.labelKey)}
              </option>
            ))}
          </select>
          <LegalUploadFieldError field="customerSegment" message={errors.customerSegment} />
        </div>
        <div>
          <Label htmlFor="bookingChannel" required>
            {t('legalDocuments.wizard.field.bookingChannel')}
          </Label>
          <select
            id="bookingChannel"
            value={form.bookingChannel}
            onChange={(e) => onChange({ bookingChannel: e.target.value })}
            className={fieldClass}
          >
            {LEGAL_UPLOAD_BOOKING_CHANNELS.map((o) => (
              <option key={o.value} value={o.value}>
                {t(o.labelKey)}
              </option>
            ))}
          </select>
          <LegalUploadFieldError field="bookingChannel" message={errors.bookingChannel} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="stationScopeMode" required>
            {t('legalDocuments.wizard.field.stationScope')}
          </Label>
          <select
            id="stationScopeMode"
            value={form.stationScopeMode}
            onChange={(e) => onChange({ stationScopeMode: e.target.value, stationIds: [] })}
            className={fieldClass}
          >
            {LEGAL_UPLOAD_STATION_SCOPE_MODES.map((o) => (
              <option key={o.value} value={o.value}>
                {t(o.labelKey)}
              </option>
            ))}
          </select>
          <LegalUploadFieldError field="stationScopeMode" message={errors.stationScopeMode} />
        </div>
        <div>
          <Label htmlFor="productScope">{t('legalDocuments.wizard.field.productScope')}</Label>
          <select
            id="productScope"
            value={form.productScope}
            onChange={(e) => onChange({ productScope: e.target.value })}
            className={fieldClass}
          >
            {LEGAL_UPLOAD_PRODUCT_SCOPES.map((o) => (
              <option key={o.value || 'all'} value={o.value}>
                {t(o.labelKey)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {form.stationScopeMode === 'STATION_SPECIFIC' ? (
        <div>
          <Label htmlFor="stationIds" required>
            {t('legalDocuments.wizard.field.stations')}
          </Label>
          <select
            id="stationIds"
            multiple
            value={form.stationIds}
            onChange={(e) =>
              onChange({
                stationIds: Array.from(e.target.selectedOptions).map((o) => o.value),
              })
            }
            className={`${fieldClass} min-h-[88px]`}
          >
            {stationOptions.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <LegalUploadFieldError field="stationIds" message={errors.stationIds} />
        </div>
      ) : null}

      <label className="flex items-center gap-2 text-sm text-foreground">
        <input
          type="checkbox"
          checked={form.isMandatory}
          onChange={(e) => onChange({ isMandatory: e.target.checked })}
          className="rounded border-border"
        />
        {t('legalDocuments.wizard.field.mandatory')}
      </label>
    </div>
  );
}

export function LegalDocumentUploadWizardStepVersion({
  form,
  errors,
  onChange,
}: WizardStepProps) {
  const { t } = useLanguage();

  return (
    <div className="space-y-4" data-testid="legal-upload-step-version">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="versionLabel" required>
            {t('legalDocuments.wizard.field.versionLabel')}
          </Label>
          <input
            id="versionLabel"
            value={form.versionLabel}
            onChange={(e) => onChange({ versionLabel: e.target.value })}
            placeholder={t('legalDocuments.wizard.placeholder.version')}
            className={fieldClass}
            {...legalUploadInputA11y('versionLabel', errors)}
          />
          <LegalUploadFieldError field="versionLabel" message={errors.versionLabel} />
        </div>
        <div>
          <Label htmlFor="title">{t('legalDocuments.wizard.field.displayTitle')}</Label>
          <input
            id="title"
            value={form.title}
            onChange={(e) => onChange({ title: e.target.value })}
            placeholder={t('legalDocuments.wizard.placeholder.optional')}
            className={fieldClass}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="validFrom">{t('legalDocuments.wizard.field.validFrom')}</Label>
          <input
            id="validFrom"
            type="datetime-local"
            value={form.validFrom}
            onChange={(e) => onChange({ validFrom: e.target.value })}
            className={fieldClass}
          />
        </div>
        <div>
          <Label htmlFor="validUntil">{t('legalDocuments.wizard.field.validUntil')}</Label>
          <input
            id="validUntil"
            type="datetime-local"
            value={form.validUntil}
            onChange={(e) => onChange({ validUntil: e.target.value })}
            className={fieldClass}
          />
          <LegalUploadFieldError field="validUntil" message={errors.validUntil} />
        </div>
      </div>

      <div>
        <Label htmlFor="changeSummary">{t('legalDocuments.wizard.field.changeSummary')}</Label>
        <textarea
          id="changeSummary"
          rows={3}
          value={form.changeSummary}
          onChange={(e) => onChange({ changeSummary: e.target.value })}
          className={fieldClass}
          placeholder={t('legalDocuments.wizard.placeholder.changeSummary')}
        />
      </div>

      <div>
        <Label htmlFor="legalOwnerName">{t('legalDocuments.wizard.field.legalOwner')}</Label>
        <input
          id="legalOwnerName"
          value={form.legalOwnerName}
          onChange={(e) => onChange({ legalOwnerName: e.target.value })}
          placeholder={t('legalDocuments.wizard.placeholder.legalOwner')}
          className={fieldClass}
        />
      </div>
    </div>
  );
}

export interface FileStepProps {
  file: File | null;
  errors: LegalDocumentUploadWizardErrors;
  onFileSelected: (file: File | null) => void;
  disabled?: boolean;
}

export function LegalDocumentUploadWizardStepFile({
  file,
  errors,
  onFileSelected,
  disabled,
}: FileStepProps) {
  const { t } = useLanguage();

  const onInput = (selected: File | null) => {
    onFileSelected(selected);
  };

  return (
    <div className="space-y-4" data-testid="legal-upload-step-file">
      <div
        className="rounded-xl border border-dashed border-border bg-muted/15 px-4 py-8 text-center"
        onDragOver={(e) => {
          e.preventDefault();
        }}
        onDrop={(e) => {
          e.preventDefault();
          if (disabled) return;
          const dropped = e.dataTransfer.files?.[0] ?? null;
          onInput(dropped);
        }}
      >
        <p className="text-sm font-medium text-foreground">{t('legalDocuments.wizard.file.dropTitle')}</p>
        <p className="mt-1 text-[12px] text-muted-foreground">{t('legalDocuments.wizard.file.dropHint')}</p>
        <div className="mt-4 flex flex-col items-center gap-2 sm:flex-row sm:justify-center">
          <label className="inline-flex cursor-pointer items-center rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-muted">
            {t('legalDocuments.wizard.file.choose')}
            <input
              type="file"
              accept="application/pdf,.pdf"
              className="sr-only"
              disabled={disabled}
              onChange={(e) => {
                onInput(e.target.files?.[0] ?? null);
                e.target.value = '';
              }}
            />
          </label>
        </div>
      </div>

      <LegalUploadFieldError field="file" message={errors.file} />

      {file ? (
        <dl className="grid gap-2 rounded-lg border border-border/60 bg-muted/10 p-3 text-[12px] sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">{t('legalDocuments.wizard.field.fileName')}</dt>
            <dd className="font-medium text-foreground break-all">{file.name}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{t('legalDocuments.wizard.field.fileSize')}</dt>
            <dd className="font-medium text-foreground">
              {(file.size / 1024).toFixed(0)} KB
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-muted-foreground">{t('legalDocuments.wizard.field.clientValidation')}</dt>
            <dd className="text-foreground">{t('legalDocuments.wizard.file.clientOk')}</dd>
          </div>
        </dl>
      ) : null}
    </div>
  );
}

export interface ReviewStepProps {
  form: LegalDocumentUploadWizardForm;
  file: File | null;
  uploadedDocument: import('../../../lib/api').LegalDocumentDto | null;
  uploadProgress: number | null;
  uploadError: string | null;
  canRequestReview: boolean;
}

export function LegalDocumentUploadWizardStepReview({
  form,
  file,
  uploadedDocument,
  uploadProgress,
  uploadError,
  canRequestReview,
}: ReviewStepProps) {
  const { t } = useLanguage();
  const typeOption = LEGAL_DOCUMENT_TYPE_OPTIONS.find((o) => o.value === form.documentType);
  const typeLabel = typeOption ? t(typeOption.labelKey) : form.documentType;

  return (
    <div className="space-y-4" data-testid="legal-upload-step-review">
      <p className="text-[12px] text-muted-foreground">
        {t('legalDocuments.wizard.reviewNote')}
      </p>

      <dl className="divide-y divide-border/60 rounded-lg border border-border/60 text-[12px]">
        <div className="grid gap-1 px-3 py-2 sm:grid-cols-2">
          <dt className="text-muted-foreground">{t('legalDocuments.wizard.field.documentType')}</dt>
          <dd className="font-medium text-foreground">{typeLabel}</dd>
        </div>
        <div className="grid gap-1 px-3 py-2 sm:grid-cols-2">
          <dt className="text-muted-foreground">{t('legalDocuments.wizard.field.version')}</dt>
          <dd className="font-medium text-foreground">{form.versionLabel}</dd>
        </div>
        <div className="grid gap-1 px-3 py-2 sm:grid-cols-2">
          <dt className="text-muted-foreground">{t('legalDocuments.categories.languageJurisdiction')}</dt>
          <dd className="text-foreground">
            {form.language.toUpperCase()} · {form.jurisdictionCountry}
          </dd>
        </div>
        <div className="grid gap-1 px-3 py-2 sm:grid-cols-2">
          <dt className="text-muted-foreground">{t('legalDocuments.wizard.field.file')}</dt>
          <dd className="text-foreground">{file?.name ?? '—'}</dd>
        </div>
      </dl>

      {uploadProgress != null && uploadProgress < 100 ? (
        <div className="space-y-1">
          <div className="flex justify-between text-[11px] text-muted-foreground">
            <span>{t('legalDocuments.wizard.uploadProgress')}</span>
            <span>{t('legalDocuments.wizard.uploadPercent', { percent: uploadProgress })}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-[var(--brand)] transition-all"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
        </div>
      ) : null}

      {uploadError ? (
        <p className="text-[12px] text-[color:var(--status-critical)]" role="alert">
          {uploadError}
        </p>
      ) : null}

      {uploadedDocument ? (
        <dl className="grid gap-2 rounded-lg border border-border/60 bg-muted/10 p-3 text-[12px] sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">{t('legalDocuments.wizard.field.status')}</dt>
            <dd className="font-medium text-foreground">{uploadedDocument.status}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{t('legalDocuments.wizard.field.pageCount')}</dt>
            <dd className="text-foreground">{uploadedDocument.pageCount ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{t('legalDocuments.wizard.field.scan')}</dt>
            <dd className="text-foreground">{uploadedDocument.scanStatus ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{t('legalDocuments.wizard.field.integrity')}</dt>
            <dd className="text-foreground">{uploadedDocument.integrityStatus ?? '—'}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-muted-foreground">{t('legalDocuments.wizard.field.checksum')}</dt>
            <dd className="break-all font-mono text-[11px] text-foreground">
              {uploadedDocument.checksum ?? '—'}
            </dd>
          </div>
        </dl>
      ) : null}

      {!canRequestReview ? (
        <p className="text-[11px] text-muted-foreground">
          {t('legalDocuments.wizard.review.permissionHint')}
        </p>
      ) : null}
    </div>
  );
}
