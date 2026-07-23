import { useMemo, useState, type ReactNode } from 'react';
import type { RentalRuleFields, RentalRuleFormValues } from './rental-rules.types';
import type { RentalRuleFieldScope } from './rental-rule-field-state.util';
import {
  ADDITIONAL_DRIVER_OPTIONS,
  FOREIGN_TRAVEL_OPTIONS,
  YOUNG_DRIVER_OPTIONS,
} from './rental-rules.constants';
import {
  rentalFormSectionClass,
  rentalFormSectionTitleClass,
} from '../../shared/rental-requirements-ui';
import { RentalRuleFieldRow } from './RentalRuleFieldRow';
import { RentalRuleTriStateControl } from './RentalRuleTriStateControl';
import {
  formValueToBooleanState,
  resolveInheritedFieldValue,
} from './rental-rule-field-state.util';
import { extractRulePatchBaseline } from './rental-rules.utils';
import { useLanguage } from '../../../i18n/LanguageContext';

const inputClass =
  'w-full rounded-lg border border-border bg-background px-3 py-2 text-[13px] text-foreground outline-none transition-colors focus:border-brand/50 focus:ring-2 focus:ring-brand/15 disabled:opacity-60';

const labelClass = 'mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground';

interface RentalRuleFieldsFormProps {
  values: RentalRuleFormValues;
  onChange: (values: RentalRuleFormValues) => void;
  disabled?: boolean;
  scope?: RentalRuleFieldScope;
  parentRules?: Partial<RentalRuleFields> | null;
  baselineRules?: Partial<RentalRuleFields> | null;
  showFieldMeta?: boolean;
}

export function RentalRuleFieldsForm({
  values,
  onChange,
  disabled,
  scope = 'category',
  parentRules,
  baselineRules,
  showFieldMeta = true,
}: RentalRuleFieldsFormProps) {
  const { t } = useLanguage();
  const [forcedOwnFields, setForcedOwnFields] = useState<Set<string>>(() => new Set());

  const getScalarTriState = useMemo(
    () =>
      (fieldId: string, hasValue: boolean): 'inherit' | 'own' | 'none' => {
        if (forcedOwnFields.has(fieldId)) return 'own';
        if (scope === 'organization') return hasValue ? 'own' : 'none';
        if (!hasValue) return 'inherit';
        return 'own';
      },
    [forcedOwnFields, scope],
  );

  const activateOwnField = (fieldId: string) => {
    setForcedOwnFields((prev) => new Set(prev).add(fieldId));
  };

  const deactivateOwnField = (fieldId: string) => {
    setForcedOwnFields((prev) => {
      const next = new Set(prev);
      next.delete(fieldId);
      return next;
    });
  };

  const baseline = extractRulePatchBaseline(baselineRules);
  const desired = extractRulePatchBaseline({
    minimumAgeYears: values.minimumAgeYears.trim() ? Number(values.minimumAgeYears) : null,
    minimumLicenseHoldingMonths:
      values.licenseHoldingWholeYears.trim() || values.licenseHoldingExtraMonths.trim()
        ? Number(values.licenseHoldingWholeYears || 0) * 12 +
          Number(values.licenseHoldingExtraMonths || 0)
        : null,
    depositAmountCents: values.depositAmount.trim()
      ? Math.round(Number(values.depositAmount.replace(',', '.')) * 100)
      : null,
    depositCurrency: values.depositCurrency.trim() || null,
    creditCardRequired:
      values.creditCardRequired === 'true'
        ? true
        : values.creditCardRequired === 'false'
          ? false
          : null,
    foreignTravelPolicy: values.foreignTravelPolicy || null,
    additionalDriverPolicy: values.additionalDriverPolicy || null,
    youngDriverPolicy: values.youngDriverPolicy || null,
    insuranceRequirement: values.insuranceRequirement.trim() || null,
    manualApprovalRequired:
      values.manualApprovalRequired === 'true'
        ? true
        : values.manualApprovalRequired === 'false'
          ? false
          : null,
    notes: values.notes.trim() || null,
  });

  const set = <K extends keyof RentalRuleFormValues>(key: K, value: RentalRuleFormValues[K]) => {
    onChange({ ...values, [key]: value });
  };

  const wrapRow = (
    field: Parameters<typeof RentalRuleFieldRow>[0]['field'],
    control: ReactNode,
    storedKey: keyof typeof baseline,
  ) => {
    if (!showFieldMeta) return control;
    return (
      <RentalRuleFieldRow
        field={field}
        scope={scope}
        effectiveValue={resolveInheritedFieldValue(field, parentRules)}
        inheritedValue={resolveInheritedFieldValue(field, parentRules)}
        draftValue={desired[storedKey as keyof typeof desired]}
        previousStored={baseline[storedKey as keyof typeof baseline]}
        nextStored={desired[storedKey as keyof typeof desired]}
        currency={values.depositCurrency || 'EUR'}
      >
        {control}
      </RentalRuleFieldRow>
    );
  };

  const handleBooleanTriState = (
    key: 'creditCardRequired' | 'manualApprovalRequired',
    next: 'inherit' | 'required' | 'not_required' | 'own' | 'none',
  ) => {
    if (next === 'inherit') set(key, '');
    else if (next === 'required') set(key, 'true');
    else set(key, 'false');
  };

  const handleScalarTriState = (
    fieldId: string,
    clearKeys: Array<keyof RentalRuleFormValues>,
    next: 'inherit' | 'required' | 'not_required' | 'own' | 'none',
  ) => {
    if (next === 'own') {
      activateOwnField(fieldId);
      return;
    }
    deactivateOwnField(fieldId);
    if (next === 'inherit' || next === 'none') {
      const cleared = { ...values };
      for (const key of clearKeys) cleared[key] = '';
      onChange(cleared);
    }
  };

  return (
    <div className="space-y-4">
      <section className={rentalFormSectionClass} aria-labelledby="rental-rules-driver-section">
        <h5 id="rental-rules-driver-section" className={rentalFormSectionTitleClass}>
          {t('rentalRules.workflow.sections.driver')}
        </h5>
        <div className="grid gap-4">
          {wrapRow(
            'minimumAgeYears',
            <div className="space-y-2">
              <RentalRuleTriStateControl
                fieldId="rr-minimum-age-mode"
                label={t('rentalRules.workflow.fields.minimumAge')}
                scope={scope}
                kind="scalar"
                value={getScalarTriState('minimumAgeYears', Boolean(values.minimumAgeYears.trim()))}
                onChange={(next) => {
                  handleScalarTriState('minimumAgeYears', ['minimumAgeYears'], next);
                }}
                disabled={disabled}
              />
              {getScalarTriState('minimumAgeYears', Boolean(values.minimumAgeYears.trim())) === 'own' ? (
                <input
                  id="rr-minimum-age"
                  type="number"
                  min={18}
                  max={99}
                  className={inputClass}
                  value={values.minimumAgeYears}
                  onChange={(e) => set('minimumAgeYears', e.target.value)}
                  disabled={disabled}
                  placeholder="21"
                  aria-label={t('rentalRules.workflow.fields.minimumAge')}
                />
              ) : null}
            </div>,
            'minimumAgeYears',
          )}

          {wrapRow(
            'minimumLicenseHoldingMonths',
            <div className="space-y-2">
              <RentalRuleTriStateControl
                fieldId="rr-license-mode"
                label={t('rentalRules.workflow.fields.licenseHolding')}
                scope={scope}
                kind="scalar"
                value={getScalarTriState(
                  'minimumLicenseHoldingMonths',
                  Boolean(values.licenseHoldingWholeYears.trim() || values.licenseHoldingExtraMonths.trim()),
                )}
                onChange={(next) => {
                  handleScalarTriState(
                    'minimumLicenseHoldingMonths',
                    ['licenseHoldingWholeYears', 'licenseHoldingExtraMonths'],
                    next,
                  );
                }}
                disabled={disabled}
              />
              {getScalarTriState(
                'minimumLicenseHoldingMonths',
                Boolean(values.licenseHoldingWholeYears.trim() || values.licenseHoldingExtraMonths.trim()),
              ) === 'own' ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <input
                    id="rr-license-years"
                    type="number"
                    min={0}
                    max={80}
                    className={inputClass}
                    value={values.licenseHoldingWholeYears}
                    onChange={(e) => set('licenseHoldingWholeYears', e.target.value)}
                    disabled={disabled}
                    aria-label={t('rentalRules.workflow.fields.licenseYears')}
                  />
                  <input
                    id="rr-license-months"
                    type="number"
                    min={0}
                    max={11}
                    className={inputClass}
                    value={values.licenseHoldingExtraMonths}
                    onChange={(e) => set('licenseHoldingExtraMonths', e.target.value)}
                    disabled={disabled}
                    aria-label={t('rentalRules.workflow.fields.licenseMonths')}
                  />
                </div>
              ) : null}
            </div>,
            'minimumLicenseHoldingMonths',
          )}
        </div>
      </section>

      <section className={rentalFormSectionClass} aria-labelledby="rental-rules-payment-section">
        <h5 id="rental-rules-payment-section" className={rentalFormSectionTitleClass}>
          {t('rentalRules.workflow.sections.payment')}
        </h5>
        <div className="grid gap-4">
          {wrapRow(
            'depositAmountCents',
            <div className="space-y-2">
              <RentalRuleTriStateControl
                fieldId="rr-deposit-mode"
                label={t('rentalRules.workflow.fields.deposit')}
                scope={scope}
                kind="scalar"
                value={getScalarTriState('depositAmountCents', Boolean(values.depositAmount.trim()))}
                onChange={(next) => {
                  handleScalarTriState('depositAmountCents', ['depositAmount', 'depositCurrency'], next);
                }}
                disabled={disabled}
              />
              {getScalarTriState('depositAmountCents', Boolean(values.depositAmount.trim())) === 'own' ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <input
                    id="rr-deposit"
                    type="text"
                    inputMode="decimal"
                    className={inputClass}
                    value={values.depositAmount}
                    onChange={(e) => set('depositAmount', e.target.value)}
                    disabled={disabled}
                    aria-label={t('rentalRules.workflow.fields.deposit')}
                  />
                  <input
                    id="rr-currency"
                    type="text"
                    className={inputClass}
                    value={values.depositCurrency}
                    onChange={(e) => set('depositCurrency', e.target.value.toUpperCase())}
                    disabled={disabled}
                    maxLength={3}
                    aria-label={t('rentalRules.workflow.fields.currency')}
                  />
                </div>
              ) : null}
            </div>,
            'depositAmountCents',
          )}

          {wrapRow(
            'creditCardRequired',
            <div className="space-y-2">
              <RentalRuleTriStateControl
                fieldId="rr-credit-card-mode"
                label={t('rentalRules.workflow.fields.creditCard')}
                scope={scope}
                kind="boolean"
                value={formValueToBooleanState(scope, values.creditCardRequired)}
                onChange={(next) => handleBooleanTriState('creditCardRequired', next)}
                disabled={disabled}
              />
            </div>,
            'creditCardRequired',
          )}
        </div>
      </section>

      <section className={rentalFormSectionClass} aria-labelledby="rental-rules-travel-section">
        <h5 id="rental-rules-travel-section" className={rentalFormSectionTitleClass}>
          {t('rentalRules.workflow.sections.travel')}
        </h5>
        <div className="grid gap-4 sm:grid-cols-2">
          {wrapRow(
            'foreignTravelPolicy',
            <div className="space-y-2">
              <RentalRuleTriStateControl
                fieldId="rr-foreign-travel-mode"
                label={t('rentalRules.workflow.fields.foreignTravel')}
                scope={scope}
                kind="scalar"
                value={getScalarTriState('foreignTravelPolicy', Boolean(values.foreignTravelPolicy))}
                onChange={(next) => {
                  handleScalarTriState('foreignTravelPolicy', ['foreignTravelPolicy'], next);
                }}
                disabled={disabled}
              />
              {getScalarTriState('foreignTravelPolicy', Boolean(values.foreignTravelPolicy)) === 'own' ? (
                <select
                  id="rr-foreign-travel"
                  className={inputClass}
                  value={values.foreignTravelPolicy}
                  onChange={(e) =>
                    set('foreignTravelPolicy', e.target.value as RentalRuleFormValues['foreignTravelPolicy'])
                  }
                  disabled={disabled}
                  aria-label={t('rentalRules.workflow.fields.foreignTravel')}
                >
                  <option value="">{t('rentalRules.workflow.selectPolicy')}</option>
                  {FOREIGN_TRAVEL_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : null}
            </div>,
            'foreignTravelPolicy',
          )}

          {wrapRow(
            'additionalDriverPolicy',
            <div className="space-y-2">
              <RentalRuleTriStateControl
                fieldId="rr-additional-driver-mode"
                label={t('rentalRules.workflow.fields.additionalDriver')}
                scope={scope}
                kind="scalar"
                value={getScalarTriState('additionalDriverPolicy', Boolean(values.additionalDriverPolicy))}
                onChange={(next) => {
                  handleScalarTriState('additionalDriverPolicy', ['additionalDriverPolicy'], next);
                }}
                disabled={disabled}
              />
              {getScalarTriState('additionalDriverPolicy', Boolean(values.additionalDriverPolicy)) === 'own' ? (
                <select
                  id="rr-additional-driver"
                  className={inputClass}
                  value={values.additionalDriverPolicy}
                  onChange={(e) =>
                    set('additionalDriverPolicy', e.target.value as RentalRuleFormValues['additionalDriverPolicy'])
                  }
                  disabled={disabled}
                  aria-label={t('rentalRules.workflow.fields.additionalDriver')}
                >
                  <option value="">{t('rentalRules.workflow.selectPolicy')}</option>
                  {ADDITIONAL_DRIVER_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : null}
            </div>,
            'additionalDriverPolicy',
          )}

          {wrapRow(
            'youngDriverPolicy',
            <div className="space-y-2">
              <RentalRuleTriStateControl
                fieldId="rr-young-driver-mode"
                label={t('rentalRules.workflow.fields.youngDriver')}
                scope={scope}
                kind="scalar"
                value={getScalarTriState('youngDriverPolicy', Boolean(values.youngDriverPolicy))}
                onChange={(next) => {
                  handleScalarTriState('youngDriverPolicy', ['youngDriverPolicy'], next);
                }}
                disabled={disabled}
              />
              {getScalarTriState('youngDriverPolicy', Boolean(values.youngDriverPolicy)) === 'own' ? (
                <select
                  id="rr-young-driver"
                  className={inputClass}
                  value={values.youngDriverPolicy}
                  onChange={(e) =>
                    set('youngDriverPolicy', e.target.value as RentalRuleFormValues['youngDriverPolicy'])
                  }
                  disabled={disabled}
                  aria-label={t('rentalRules.workflow.fields.youngDriver')}
                >
                  <option value="">{t('rentalRules.workflow.selectPolicy')}</option>
                  {YOUNG_DRIVER_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : null}
            </div>,
            'youngDriverPolicy',
          )}
        </div>
      </section>

      <section className={rentalFormSectionClass} aria-labelledby="rental-rules-approval-section">
        <h5 id="rental-rules-approval-section" className={rentalFormSectionTitleClass}>
          {t('rentalRules.workflow.sections.approval')}
        </h5>
        <div className="grid gap-4">
          {wrapRow(
            'manualApprovalRequired',
            <RentalRuleTriStateControl
              fieldId="rr-manual-approval-mode"
              label={t('rentalRules.workflow.fields.manualApproval')}
              scope={scope}
              kind="boolean"
              value={formValueToBooleanState(scope, values.manualApprovalRequired)}
              onChange={(next) => handleBooleanTriState('manualApprovalRequired', next)}
              disabled={disabled}
            />,
            'manualApprovalRequired',
          )}

          {wrapRow(
            'insuranceRequirement',
            <div className="space-y-2">
              <RentalRuleTriStateControl
                fieldId="rr-insurance-mode"
                label={t('rentalRules.workflow.fields.insurance')}
                scope={scope}
                kind="scalar"
                value={getScalarTriState('insuranceRequirement', Boolean(values.insuranceRequirement.trim()))}
                onChange={(next) => {
                  handleScalarTriState('insuranceRequirement', ['insuranceRequirement'], next);
                }}
                disabled={disabled}
              />
              {getScalarTriState('insuranceRequirement', Boolean(values.insuranceRequirement.trim())) ===
              'own' ? (
                <input
                  id="rr-insurance"
                  type="text"
                  className={inputClass}
                  value={values.insuranceRequirement}
                  onChange={(e) => set('insuranceRequirement', e.target.value)}
                  disabled={disabled}
                  aria-label={t('rentalRules.workflow.fields.insurance')}
                />
              ) : null}
            </div>,
            'insuranceRequirement',
          )}

          {wrapRow(
            'notes',
            <div className="space-y-2">
              <label className={labelClass} htmlFor="rr-notes">
                {t('rentalRules.workflow.fields.notes')}
              </label>
              <textarea
                id="rr-notes"
                className={`${inputClass} min-h-[72px] resize-y`}
                value={values.notes}
                onChange={(e) => set('notes', e.target.value)}
                disabled={disabled}
              />
            </div>,
            'notes',
          )}
        </div>
      </section>
    </div>
  );
}
