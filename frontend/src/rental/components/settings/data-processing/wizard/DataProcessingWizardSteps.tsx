import { cn } from '../../../../../components/ui/utils';
import {
  DATA_CATEGORY_OPTIONS,
  PURPOSE_OPTIONS,
  SCOPE_OPTIONS,
} from '../../data-authorization/data-authorization.constants';
import { useLooseLanguage } from '../../../../lib/data-processing-i18n';
import type { DataProcessingPermissions } from '../../../../lib/data-processing-permissions';
import {
  DATA_FREQUENCY_OPTIONS,
  DATA_PROCESSING_PROCEDURE_TYPES,
  DATA_SUBJECT_TYPE_OPTIONS,
  DELETION_METHOD_OPTIONS,
  DPIA_STATUS_OPTIONS,
  LEGAL_BASIS_TYPE_OPTIONS,
  PROVIDER_SCOPE_SUGGESTIONS,
  RETENTION_CLASS_OPTIONS,
  RETENTION_START_EVENT_OPTIONS,
  TRANSFER_MECHANISM_OPTIONS,
} from '../../../../lib/data-processing-wizard.constants';
import type {
  DataProcessingWizardErrors,
  DataProcessingWizardForm,
} from '../../../../lib/data-processing-wizard.types';
import { TenantEntityScopePicker } from './TenantEntityScopePicker';

const inputClass =
  'w-full rounded-xl border border-border bg-background px-3 py-2.5 text-xs text-foreground outline-none focus:ring-2 focus:ring-[var(--brand-soft)]';

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-[11px] text-destructive">{message}</p>;
}

function ChipToggle({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition-colors',
        active
          ? 'border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--brand)]'
          : 'border-border text-muted-foreground hover:border-[var(--brand)]/40',
      )}
    >
      {label}
    </button>
  );
}

interface StepProps {
  form: DataProcessingWizardForm;
  errors: DataProcessingWizardErrors;
  onChange: (patch: Partial<DataProcessingWizardForm>) => void;
}

export function DataProcessingWizardStepProcedure({
  form,
  errors,
  onChange,
  permissions,
}: StepProps & { permissions: DataProcessingPermissions }) {
  const { t } = useLooseLanguage();
  return (
    <div className="space-y-3" data-testid="dp-wizard-step-1">
      <p className="text-xs text-muted-foreground">{t('dataProcessing.wizard.step1.hint')}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {DATA_PROCESSING_PROCEDURE_TYPES.map((option) => {
          const allowed = permissions[option.permissionKey];
          const active = form.procedureType === option.value;
          return (
            <button
              key={option.value}
              type="button"
              disabled={!allowed}
              onClick={() => onChange({ procedureType: option.value })}
              className={cn(
                'rounded-xl border p-3 text-left transition-colors',
                active
                  ? 'border-[var(--brand)] bg-[var(--brand-soft)]'
                  : 'border-border hover:border-[var(--brand)]/40',
                !allowed && 'cursor-not-allowed opacity-50',
              )}
            >
              <p className="text-sm font-semibold text-foreground">{t(option.labelKey)}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">{t(option.descriptionKey)}</p>
            </button>
          );
        })}
      </div>
      <FieldError message={errors.procedureType ? t(errors.procedureType) : undefined} />
    </div>
  );
}

export function DataProcessingWizardStepPurposeLegal({ form, errors, onChange }: StepProps) {
  const { t } = useLooseLanguage();
  return (
    <div className="space-y-4" data-testid="dp-wizard-step-2">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="text-[11px] font-semibold text-muted-foreground">{t('dataProcessing.wizard.fields.title')}</label>
          <input className={inputClass} value={form.title} onChange={(e) => onChange({ title: e.target.value })} />
          <FieldError message={errors.title ? t(errors.title) : undefined} />
        </div>
        <div>
          <label className="text-[11px] font-semibold text-muted-foreground">{t('dataProcessing.wizard.fields.activityCode')}</label>
          <input className={inputClass} value={form.activityCode} onChange={(e) => onChange({ activityCode: e.target.value })} />
          <FieldError message={errors.activityCode ? t(errors.activityCode) : undefined} />
        </div>
      </div>
      <div>
        <label className="text-[11px] font-semibold text-muted-foreground">{t('dataProcessing.wizard.fields.purposeSummary')}</label>
        <textarea className={inputClass} rows={2} value={form.purposeSummary} onChange={(e) => onChange({ purposeSummary: e.target.value })} />
        <FieldError message={errors.purposeSummary ? t(errors.purposeSummary) : undefined} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="text-[11px] font-semibold text-muted-foreground">{t('dataProcessing.wizard.fields.legalBasisType')}</label>
          <select className={inputClass} value={form.legalBasisType} onChange={(e) => onChange({ legalBasisType: e.target.value })}>
            <option value="">{t('dataProcessing.wizard.selectPlaceholder')}</option>
            {LEGAL_BASIS_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{t(option.labelKey)}</option>
            ))}
          </select>
          <FieldError message={errors.legalBasisType ? t(errors.legalBasisType) : undefined} />
        </div>
        <div>
          <label className="text-[11px] font-semibold text-muted-foreground">{t('dataProcessing.wizard.fields.privacyNoticeVersion')}</label>
          <input className={inputClass} value={form.privacyNoticeVersion} onChange={(e) => onChange({ privacyNoticeVersion: e.target.value })} />
          <FieldError message={errors.privacyNoticeVersion ? t(errors.privacyNoticeVersion) : undefined} />
        </div>
      </div>
      <div>
        <label className="text-[11px] font-semibold text-muted-foreground">{t('dataProcessing.wizard.fields.necessityAssessment')}</label>
        <textarea className={inputClass} rows={3} value={form.necessityAssessment} onChange={(e) => onChange({ necessityAssessment: e.target.value })} />
        <FieldError message={errors.necessityAssessment ? t(errors.necessityAssessment) : undefined} />
      </div>
    </div>
  );
}

export function DataProcessingWizardStepDataSubjects({ form, errors, onChange }: StepProps) {
  const { t } = useLooseLanguage();
  const toggle = (key: 'purposes' | 'dataCategories' | 'dataSubjectTypes', value: string) => {
    const current = form[key];
    onChange({
      [key]: current.includes(value) ? current.filter((item) => item !== value) : [...current, value],
    });
  };

  return (
    <div className="space-y-4" data-testid="dp-wizard-step-3">
      <div>
        <label className="text-[11px] font-semibold text-muted-foreground">{t('dataProcessing.wizard.fields.purposes')}</label>
        <div className="mt-2 flex flex-wrap gap-2">
          {PURPOSE_OPTIONS.map((option) => (
            <ChipToggle
              key={option.value}
              active={form.purposes.includes(option.value)}
              label={option.label}
              onClick={() => toggle('purposes', option.value)}
            />
          ))}
        </div>
        <FieldError message={errors.purposes ? t(errors.purposes) : undefined} />
      </div>
      <div>
        <label className="text-[11px] font-semibold text-muted-foreground">{t('dataProcessing.wizard.fields.dataCategories')}</label>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {DATA_CATEGORY_OPTIONS.map((option) => (
            <ChipToggle
              key={option.value}
              active={form.dataCategories.includes(option.value)}
              label={option.label}
              onClick={() => toggle('dataCategories', option.value)}
            />
          ))}
        </div>
        <FieldError message={errors.dataCategories ? t(errors.dataCategories) : undefined} />
      </div>
      <div>
        <label className="text-[11px] font-semibold text-muted-foreground">{t('dataProcessing.wizard.fields.dataSubjectTypes')}</label>
        <div className="mt-2 flex flex-wrap gap-2">
          {DATA_SUBJECT_TYPE_OPTIONS.map((option) => (
            <ChipToggle
              key={option.value}
              active={form.dataSubjectTypes.includes(option.value)}
              label={t(option.labelKey)}
              onClick={() => toggle('dataSubjectTypes', option.value)}
            />
          ))}
        </div>
        <FieldError message={errors.dataSubjectTypes ? t(errors.dataSubjectTypes) : undefined} />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className="text-[11px] font-semibold text-muted-foreground">{t('dataProcessing.wizard.fields.dataFrequency')}</label>
          <select className={inputClass} value={form.dataFrequency} onChange={(e) => onChange({ dataFrequency: e.target.value })}>
            <option value="">{t('dataProcessing.wizard.selectPlaceholder')}</option>
            {DATA_FREQUENCY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{t(option.labelKey)}</option>
            ))}
          </select>
          <FieldError message={errors.dataFrequency ? t(errors.dataFrequency) : undefined} />
        </div>
        <div>
          <label className="text-[11px] font-semibold text-muted-foreground">{t('dataProcessing.wizard.fields.scopeKey')}</label>
          <select className={inputClass} value={form.scopeKey} onChange={(e) => onChange({ scopeKey: e.target.value })}>
            {SCOPE_OPTIONS.filter((option) => option.value !== 'all').map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <FieldError message={errors.scopeKey ? t(errors.scopeKey) : undefined} />
        </div>
        <div>
          <label className="text-[11px] font-semibold text-muted-foreground">{t('dataProcessing.wizard.fields.dataVolumeScope')}</label>
          <input className={inputClass} value={form.dataVolumeScope} onChange={(e) => onChange({ dataVolumeScope: e.target.value })} />
        </div>
      </div>
    </div>
  );
}

export function DataProcessingWizardStepResources({
  form,
  errors,
  onChange,
  orgId,
}: StepProps & { orgId: string }) {
  const { t } = useLooseLanguage();
  return (
    <div className="space-y-4" data-testid="dp-wizard-step-4">
      <p className="text-xs text-muted-foreground">{t('dataProcessing.wizard.step4.hint')}</p>
      <div>
        <label className="text-[11px] font-semibold text-muted-foreground">{t('dataProcessing.wizard.fields.vehicles')}</label>
        <TenantEntityScopePicker
          orgId={orgId}
          kind="vehicles"
          selectedIds={form.vehicleIds}
          onChange={(vehicleIds) => onChange({ vehicleIds })}
          error={errors.vehicleIds ? t(errors.vehicleIds) : undefined}
        />
      </div>
      <div>
        <label className="text-[11px] font-semibold text-muted-foreground">{t('dataProcessing.wizard.fields.customers')}</label>
        <TenantEntityScopePicker
          orgId={orgId}
          kind="customers"
          selectedIds={form.customerIds}
          onChange={(customerIds) => onChange({ customerIds })}
          error={errors.customerIds ? t(errors.customerIds) : undefined}
        />
      </div>
      <div>
        <label className="text-[11px] font-semibold text-muted-foreground">{t('dataProcessing.wizard.fields.bookings')}</label>
        <TenantEntityScopePicker
          orgId={orgId}
          kind="bookings"
          selectedIds={form.bookingIds}
          onChange={(bookingIds) => onChange({ bookingIds })}
          error={errors.bookingIds ? t(errors.bookingIds) : undefined}
        />
      </div>
      <div>
        <label className="text-[11px] font-semibold text-muted-foreground">{t('dataProcessing.wizard.fields.stations')}</label>
        <TenantEntityScopePicker
          orgId={orgId}
          kind="stations"
          selectedIds={form.stationIds}
          onChange={(stationIds) => onChange({ stationIds })}
        />
      </div>
    </div>
  );
}

export function DataProcessingWizardStepRecipients({ form, errors, onChange }: StepProps) {
  const { t } = useLooseLanguage();
  const toggleScope = (scope: string) => {
    onChange({
      grantedScopes: form.grantedScopes.includes(scope)
        ? form.grantedScopes.filter((item) => item !== scope)
        : [...form.grantedScopes, scope],
    });
  };

  return (
    <div className="space-y-4" data-testid="dp-wizard-step-5">
      {form.procedureType === 'PROVIDER_ACCESS' ? (
        <>
          <div>
            <label className="text-[11px] font-semibold text-muted-foreground">{t('dataProcessing.wizard.fields.provider')}</label>
            <input className={inputClass} value={form.provider} onChange={(e) => onChange({ provider: e.target.value })} />
            <FieldError message={errors.provider ? t(errors.provider) : undefined} />
          </div>
          <div>
            <label className="text-[11px] font-semibold text-muted-foreground">{t('dataProcessing.wizard.fields.grantedScopes')}</label>
            <div className="mt-2 flex flex-wrap gap-2">
              {PROVIDER_SCOPE_SUGGESTIONS.map((scope) => (
                <ChipToggle
                  key={scope}
                  active={form.grantedScopes.includes(scope)}
                  label={scope}
                  onClick={() => toggleScope(scope)}
                />
              ))}
            </div>
            <FieldError message={errors.grantedScopes ? t(errors.grantedScopes) : undefined} />
          </div>
        </>
      ) : null}

      {form.procedureType === 'PROCESSOR_AGREEMENT' ? (
        <div>
          <label className="text-[11px] font-semibold text-muted-foreground">{t('dataProcessing.wizard.fields.processorName')}</label>
          <input className={inputClass} value={form.processorName} onChange={(e) => onChange({ processorName: e.target.value })} />
          <FieldError message={errors.processorName ? t(errors.processorName) : undefined} />
        </div>
      ) : null}

      {(form.procedureType === 'PARTNER_SHARING' || form.procedureType === 'CONSENT') ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-[11px] font-semibold text-muted-foreground">{t('dataProcessing.wizard.fields.requestingEntity')}</label>
              <input className={inputClass} value={form.requestingEntity} onChange={(e) => onChange({ requestingEntity: e.target.value })} />
              <FieldError message={errors.requestingEntity ? t(errors.requestingEntity) : undefined} />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-muted-foreground">{t('dataProcessing.wizard.fields.destination')}</label>
              <input className={inputClass} value={form.destination} onChange={(e) => onChange({ destination: e.target.value })} />
              <FieldError message={errors.destination ? t(errors.destination) : undefined} />
            </div>
          </div>
        </>
      ) : null}

      {form.procedureType === 'CONSENT' ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="text-[11px] font-semibold text-muted-foreground">{t('dataProcessing.wizard.fields.dataSubjectReference')}</label>
            <input className={inputClass} value={form.dataSubjectReference} onChange={(e) => onChange({ dataSubjectReference: e.target.value })} />
            <FieldError message={errors.dataSubjectReference ? t(errors.dataSubjectReference) : undefined} />
          </div>
          <div>
            <label className="text-[11px] font-semibold text-muted-foreground">{t('dataProcessing.wizard.fields.consentTextVersion')}</label>
            <input className={inputClass} value={form.consentTextVersion} onChange={(e) => onChange({ consentTextVersion: e.target.value })} />
            <FieldError message={errors.consentTextVersion ? t(errors.consentTextVersion) : undefined} />
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="text-[11px] font-semibold text-muted-foreground">{t('dataProcessing.wizard.fields.recipientCountry')}</label>
          <input className={inputClass} value={form.recipientCountry} onChange={(e) => onChange({ recipientCountry: e.target.value })} />
        </div>
        <div>
          <label className="inline-flex items-center gap-2 text-[11px] font-semibold text-muted-foreground">
            <input
              type="checkbox"
              checked={form.thirdCountryTransfer}
              onChange={(e) => onChange({ thirdCountryTransfer: e.target.checked })}
            />
            {t('dataProcessing.wizard.fields.thirdCountryTransfer')}
          </label>
          {form.thirdCountryTransfer ? (
            <select className={cn(inputClass, 'mt-2')} value={form.transferMechanism} onChange={(e) => onChange({ transferMechanism: e.target.value })}>
              <option value="">{t('dataProcessing.wizard.selectPlaceholder')}</option>
              {TRANSFER_MECHANISM_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{t(option.labelKey)}</option>
              ))}
            </select>
          ) : null}
          <FieldError message={errors.transferMechanism ? t(errors.transferMechanism) : undefined} />
        </div>
      </div>

      {form.procedureType === 'PROCESSOR_AGREEMENT' ? (
        <div>
          <label className="text-[11px] font-semibold text-muted-foreground">{t('dataProcessing.wizard.fields.dpaContractReference')}</label>
          <input className={inputClass} value={form.dpaContractReference} onChange={(e) => onChange({ dpaContractReference: e.target.value })} />
          <FieldError message={errors.dpaContractReference ? t(errors.dpaContractReference) : undefined} />
        </div>
      ) : null}
    </div>
  );
}

export function DataProcessingWizardStepRetention({ form, errors, onChange }: StepProps) {
  const { t } = useLooseLanguage();
  return (
    <div className="space-y-4" data-testid="dp-wizard-step-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="text-[11px] font-semibold text-muted-foreground">{t('dataProcessing.wizard.fields.retentionClass')}</label>
          <select className={inputClass} value={form.retentionClass} onChange={(e) => onChange({ retentionClass: e.target.value })}>
            <option value="">{t('dataProcessing.wizard.selectPlaceholder')}</option>
            {RETENTION_CLASS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{t(option.labelKey)}</option>
            ))}
          </select>
          <FieldError message={errors.retentionClass ? t(errors.retentionClass) : undefined} />
        </div>
        <div>
          <label className="text-[11px] font-semibold text-muted-foreground">{t('dataProcessing.wizard.fields.retentionDurationDays')}</label>
          <input className={inputClass} inputMode="numeric" value={form.retentionDurationDays} onChange={(e) => onChange({ retentionDurationDays: e.target.value })} />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="text-[11px] font-semibold text-muted-foreground">{t('dataProcessing.wizard.fields.retentionStartEvent')}</label>
          <select className={inputClass} value={form.retentionStartEvent} onChange={(e) => onChange({ retentionStartEvent: e.target.value })}>
            <option value="">{t('dataProcessing.wizard.selectPlaceholder')}</option>
            {RETENTION_START_EVENT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{t(option.labelKey)}</option>
            ))}
          </select>
          <FieldError message={errors.retentionStartEvent ? t(errors.retentionStartEvent) : undefined} />
        </div>
        <div>
          <label className="text-[11px] font-semibold text-muted-foreground">{t('dataProcessing.wizard.fields.deletionMethod')}</label>
          <select className={inputClass} value={form.deletionMethod} onChange={(e) => onChange({ deletionMethod: e.target.value })}>
            <option value="">{t('dataProcessing.wizard.selectPlaceholder')}</option>
            {DELETION_METHOD_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{t(option.labelKey)}</option>
            ))}
          </select>
          <FieldError message={errors.deletionMethod ? t(errors.deletionMethod) : undefined} />
        </div>
      </div>
      <div>
        <label className="text-[11px] font-semibold text-muted-foreground">{t('dataProcessing.wizard.fields.technicalOrganizationalMeasures')}</label>
        <textarea className={inputClass} rows={3} value={form.technicalOrganizationalMeasures} onChange={(e) => onChange({ technicalOrganizationalMeasures: e.target.value })} />
      </div>
      <div className="space-y-2">
        <label className="inline-flex items-center gap-2 text-[11px] font-semibold text-muted-foreground">
          <input type="checkbox" checked={form.legalHold} onChange={(e) => onChange({ legalHold: e.target.checked })} />
          {t('dataProcessing.wizard.fields.legalHold')}
        </label>
        {form.legalHold ? (
          <textarea className={inputClass} rows={2} value={form.legalHoldReason} onChange={(e) => onChange({ legalHoldReason: e.target.value })} />
        ) : null}
        <FieldError message={errors.legalHoldReason ? t(errors.legalHoldReason) : undefined} />
      </div>
    </div>
  );
}

export function DataProcessingWizardStepRiskReview({
  form,
  errors,
  onChange,
  canRequestReview,
  submitError,
  submitting,
}: StepProps & {
  canRequestReview: boolean;
  submitError?: string | null;
  submitting?: boolean;
}) {
  const { t } = useLooseLanguage();
  return (
    <div className="space-y-4" data-testid="dp-wizard-step-7">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="text-[11px] font-semibold text-muted-foreground">{t('dataProcessing.wizard.fields.dpiaStatus')}</label>
          <select className={inputClass} value={form.dpiaStatus} onChange={(e) => onChange({ dpiaStatus: e.target.value })}>
            {DPIA_STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{t(option.labelKey)}</option>
            ))}
          </select>
          <FieldError message={errors.dpiaStatus ? t(errors.dpiaStatus) : undefined} />
        </div>
        <div>
          <label className="text-[11px] font-semibold text-muted-foreground">{t('dataProcessing.wizard.fields.reviewerUserId')}</label>
          <input className={inputClass} value={form.reviewerUserId} onChange={(e) => onChange({ reviewerUserId: e.target.value })} />
        </div>
      </div>
      <div>
        <label className="text-[11px] font-semibold text-muted-foreground">{t('dataProcessing.wizard.fields.riskLevelNotes')}</label>
        <textarea className={inputClass} rows={3} value={form.riskLevelNotes} onChange={(e) => onChange({ riskLevelNotes: e.target.value })} />
      </div>
      <div>
        <label className="text-[11px] font-semibold text-muted-foreground">{t('dataProcessing.wizard.fields.reviewNotes')}</label>
        <textarea className={inputClass} rows={2} value={form.reviewNotes} onChange={(e) => onChange({ reviewNotes: e.target.value })} />
      </div>
      <p className="text-[11px] text-muted-foreground">{t('dataProcessing.wizard.step7.hint')}</p>
      {!canRequestReview ? (
        <p className="text-[11px] text-muted-foreground">{t('dataProcessing.wizard.step7.noReviewPermission')}</p>
      ) : null}
      {submitError ? <p className="text-[11px] text-destructive">{submitError}</p> : null}
      {submitting ? (
        <p className="text-[11px] text-muted-foreground">{t('dataProcessing.wizard.submitting')}</p>
      ) : null}
    </div>
  );
}
