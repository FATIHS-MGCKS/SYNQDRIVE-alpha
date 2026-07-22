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

const fieldClass =
  'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-soft)]';

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="mt-1 text-[11px] text-[color:var(--status-critical)]" role="alert">
      {message}
    </p>
  );
}

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
  return (
    <div className="space-y-4" data-testid="legal-upload-step-classification">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="documentType" required>
            Dokumenttyp
          </Label>
          <select
            id="documentType"
            value={form.documentType}
            onChange={(e) => onChange({ documentType: e.target.value })}
            className={fieldClass}
          >
            <option value="">Bitte wählen…</option>
            {LEGAL_DOCUMENT_TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <FieldError message={errors.documentType} />
        </div>

        {form.documentType === LEGAL_DOCUMENT_TYPE.CONSUMER_INFORMATION ? (
          <div>
            <Label htmlFor="legalVariant" required>
              Dokumentvariante
            </Label>
            <select
              id="legalVariant"
              value={form.legalVariant}
              onChange={(e) => onChange({ legalVariant: e.target.value as never })}
              className={fieldClass}
            >
              <option value="">Bitte wählen…</option>
              {LEGAL_CONSUMER_VARIANT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <FieldError message={errors.legalVariant} />
          </div>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="language" required>
            Sprache
          </Label>
          <select
            id="language"
            value={form.language}
            onChange={(e) => onChange({ language: e.target.value })}
            className={fieldClass}
          >
            {LEGAL_UPLOAD_LANGUAGES.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <FieldError message={errors.language} />
        </div>
        <div>
          <Label htmlFor="jurisdictionCountry" required>
            Jurisdiktion
          </Label>
          <select
            id="jurisdictionCountry"
            value={form.jurisdictionCountry}
            onChange={(e) => onChange({ jurisdictionCountry: e.target.value })}
            className={fieldClass}
          >
            {LEGAL_UPLOAD_JURISDICTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <FieldError message={errors.jurisdictionCountry} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="customerSegment" required>
            B2B / B2C
          </Label>
          <select
            id="customerSegment"
            value={form.customerSegment}
            onChange={(e) => onChange({ customerSegment: e.target.value })}
            className={fieldClass}
          >
            {LEGAL_UPLOAD_CUSTOMER_SEGMENTS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <FieldError message={errors.customerSegment} />
        </div>
        <div>
          <Label htmlFor="bookingChannel" required>
            Buchungskanal
          </Label>
          <select
            id="bookingChannel"
            value={form.bookingChannel}
            onChange={(e) => onChange({ bookingChannel: e.target.value })}
            className={fieldClass}
          >
            {LEGAL_UPLOAD_BOOKING_CHANNELS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <FieldError message={errors.bookingChannel} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="stationScopeMode" required>
            Geltungsbereich
          </Label>
          <select
            id="stationScopeMode"
            value={form.stationScopeMode}
            onChange={(e) => onChange({ stationScopeMode: e.target.value, stationIds: [] })}
            className={fieldClass}
          >
            {LEGAL_UPLOAD_STATION_SCOPE_MODES.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <FieldError message={errors.stationScopeMode} />
        </div>
        <div>
          <Label htmlFor="productScope">Produktbereich</Label>
          <select
            id="productScope"
            value={form.productScope}
            onChange={(e) => onChange({ productScope: e.target.value })}
            className={fieldClass}
          >
            {LEGAL_UPLOAD_PRODUCT_SCOPES.map((o) => (
              <option key={o.value || 'all'} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {form.stationScopeMode === 'STATION_SPECIFIC' ? (
        <div>
          <Label htmlFor="stationIds" required>
            Stationen
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
          <FieldError message={errors.stationIds} />
        </div>
      ) : null}

      <label className="flex items-center gap-2 text-sm text-foreground">
        <input
          type="checkbox"
          checked={form.isMandatory}
          onChange={(e) => onChange({ isMandatory: e.target.checked })}
          className="rounded border-border"
        />
        Pflichtdokument für Buchungen
      </label>
    </div>
  );
}

export function LegalDocumentUploadWizardStepVersion({
  form,
  errors,
  onChange,
}: WizardStepProps) {
  return (
    <div className="space-y-4" data-testid="legal-upload-step-version">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="versionLabel" required>
            Versionsbezeichnung
          </Label>
          <input
            id="versionLabel"
            value={form.versionLabel}
            onChange={(e) => onChange({ versionLabel: e.target.value })}
            placeholder="z. B. 2026-01"
            className={fieldClass}
          />
          <FieldError message={errors.versionLabel} />
        </div>
        <div>
          <Label htmlFor="title">Anzeigetitel</Label>
          <input
            id="title"
            value={form.title}
            onChange={(e) => onChange({ title: e.target.value })}
            placeholder="Optional"
            className={fieldClass}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="validFrom">Gültig ab</Label>
          <input
            id="validFrom"
            type="datetime-local"
            value={form.validFrom}
            onChange={(e) => onChange({ validFrom: e.target.value })}
            className={fieldClass}
          />
        </div>
        <div>
          <Label htmlFor="validUntil">Gültig bis (optional)</Label>
          <input
            id="validUntil"
            type="datetime-local"
            value={form.validUntil}
            onChange={(e) => onChange({ validUntil: e.target.value })}
            className={fieldClass}
          />
          <FieldError message={errors.validUntil} />
        </div>
      </div>

      <div>
        <Label htmlFor="changeSummary">Änderungshinweis</Label>
        <textarea
          id="changeSummary"
          rows={3}
          value={form.changeSummary}
          onChange={(e) => onChange({ changeSummary: e.target.value })}
          className={fieldClass}
          placeholder="Kurzbeschreibung der inhaltlichen Änderungen"
        />
      </div>

      <div>
        <Label htmlFor="legalOwnerName">Verantwortliche Fachperson</Label>
        <input
          id="legalOwnerName"
          value={form.legalOwnerName}
          onChange={(e) => onChange({ legalOwnerName: e.target.value })}
          placeholder="Name der fachlich Verantwortlichen"
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
        <p className="text-sm font-medium text-foreground">PDF hier ablegen</p>
        <p className="mt-1 text-[12px] text-muted-foreground">oder Datei auswählen</p>
        <div className="mt-4 flex flex-col items-center gap-2 sm:flex-row sm:justify-center">
          <label className="inline-flex cursor-pointer items-center rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-muted">
            Datei wählen
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

      <FieldError message={errors.file} />

      {file ? (
        <dl className="grid gap-2 rounded-lg border border-border/60 bg-muted/10 p-3 text-[12px] sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Dateiname</dt>
            <dd className="font-medium text-foreground break-all">{file.name}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Größe</dt>
            <dd className="font-medium text-foreground">
              {(file.size / 1024).toFixed(0)} KB
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-muted-foreground">Client-Validierung</dt>
            <dd className="text-foreground">PDF-Format geprüft (Server validiert beim Upload)</dd>
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
  const typeLabel =
    LEGAL_DOCUMENT_TYPE_OPTIONS.find((o) => o.value === form.documentType)?.label ??
    form.documentType;

  return (
    <div className="space-y-4" data-testid="legal-upload-step-review">
      <p className="text-[12px] text-muted-foreground">
        Neue Buchungen erhalten nach Freigabe und Aktivierung die hier hinterlegte Version —
        nicht automatisch beim Speichern als Entwurf.
      </p>

      <dl className="divide-y divide-border/60 rounded-lg border border-border/60 text-[12px]">
        <div className="grid gap-1 px-3 py-2 sm:grid-cols-2">
          <dt className="text-muted-foreground">Dokumenttyp</dt>
          <dd className="font-medium text-foreground">{typeLabel}</dd>
        </div>
        <div className="grid gap-1 px-3 py-2 sm:grid-cols-2">
          <dt className="text-muted-foreground">Version</dt>
          <dd className="font-medium text-foreground">{form.versionLabel}</dd>
        </div>
        <div className="grid gap-1 px-3 py-2 sm:grid-cols-2">
          <dt className="text-muted-foreground">Sprache / Jurisdiktion</dt>
          <dd className="text-foreground">
            {form.language.toUpperCase()} · {form.jurisdictionCountry}
          </dd>
        </div>
        <div className="grid gap-1 px-3 py-2 sm:grid-cols-2">
          <dt className="text-muted-foreground">Datei</dt>
          <dd className="text-foreground">{file?.name ?? '—'}</dd>
        </div>
      </dl>

      {uploadProgress != null && uploadProgress < 100 ? (
        <div className="space-y-1">
          <div className="flex justify-between text-[11px] text-muted-foreground">
            <span>Upload läuft…</span>
            <span>{uploadProgress}%</span>
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
            <dt className="text-muted-foreground">Status</dt>
            <dd className="font-medium text-foreground">{uploadedDocument.status}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Seitenzahl</dt>
            <dd className="text-foreground">{uploadedDocument.pageCount ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Malware-Scan</dt>
            <dd className="text-foreground">{uploadedDocument.scanStatus ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Integrität</dt>
            <dd className="text-foreground">{uploadedDocument.integrityStatus ?? '—'}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-muted-foreground">Prüfsumme</dt>
            <dd className="break-all font-mono text-[11px] text-foreground">
              {uploadedDocument.checksum ?? '—'}
            </dd>
          </div>
        </dl>
      ) : null}

      {!canRequestReview ? (
        <p className="text-[11px] text-muted-foreground">
          Review anfordern erfordert die Berechtigung „Prüfung einreichen“.
        </p>
      ) : null}
    </div>
  );
}
