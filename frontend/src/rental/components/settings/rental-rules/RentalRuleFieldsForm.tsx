import type { RentalRuleFormValues } from './rental-rules.types';

import {

  ADDITIONAL_DRIVER_OPTIONS,

  FOREIGN_TRAVEL_OPTIONS,

  YOUNG_DRIVER_OPTIONS,

} from './rental-rules.constants';

import {

  rentalFormSectionClass,

  rentalFormSectionTitleClass,

} from '../../shared/rental-requirements-ui';



const inputClass =

  'w-full rounded-lg border border-border bg-background px-3 py-2 text-[13px] text-foreground outline-none transition-colors focus:border-brand/50 focus:ring-2 focus:ring-brand/15 disabled:opacity-60';

const labelClass = 'mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground';

const hintClass = 'mt-1 text-[11px] leading-snug text-muted-foreground';



interface RentalRuleFieldsFormProps {

  values: RentalRuleFormValues;

  onChange: (values: RentalRuleFormValues) => void;

  disabled?: boolean;

}



export function RentalRuleFieldsForm({ values, onChange, disabled }: RentalRuleFieldsFormProps) {

  const set = <K extends keyof RentalRuleFormValues>(key: K, value: RentalRuleFormValues[K]) => {

    onChange({ ...values, [key]: value });

  };



  return (

    <div className="space-y-4">

      <section className={rentalFormSectionClass} aria-labelledby="rental-rules-driver-section">

        <h5 id="rental-rules-driver-section" className={rentalFormSectionTitleClass}>

          Driver requirements

        </h5>

        <div className="grid gap-4 sm:grid-cols-2">

          <div>

            <label className={labelClass} htmlFor="rr-minimum-age">

              Minimum age

            </label>

            <input

              id="rr-minimum-age"

              type="number"

              min={18}

              max={99}

              className={inputClass}

              value={values.minimumAgeYears}

              onChange={(e) => set('minimumAgeYears', e.target.value)}

              disabled={disabled}

              placeholder="e.g. 21"

            />

            <p className={hintClass}>Minimum driver age in years at pickup.</p>

          </div>

          <div>

            <label className={labelClass} htmlFor="rr-license-years">

              License holding period

            </label>

            <input

              id="rr-license-years"

              type="number"

              min={0}

              max={80}

              className={inputClass}

              value={values.minimumLicenseHoldingYears}

              onChange={(e) => set('minimumLicenseHoldingYears', e.target.value)}

              disabled={disabled}

              placeholder="e.g. 2"

            />

            <p className={hintClass}>Years the license must be held before rental.</p>

          </div>

        </div>

      </section>



      <section className={rentalFormSectionClass} aria-labelledby="rental-rules-payment-section">

        <h5 id="rental-rules-payment-section" className={rentalFormSectionTitleClass}>

          Payment & deposit

        </h5>

        <div className="grid gap-4 sm:grid-cols-2">

          <div>

            <label className={labelClass} htmlFor="rr-deposit">

              Deposit required

            </label>

            <input

              id="rr-deposit"

              type="text"

              inputMode="decimal"

              className={inputClass}

              value={values.depositAmount}

              onChange={(e) => set('depositAmount', e.target.value)}

              disabled={disabled}

              placeholder="e.g. 500"

            />

          </div>

          <div>

            <label className={labelClass} htmlFor="rr-currency">

              Currency

            </label>

            <input

              id="rr-currency"

              type="text"

              className={inputClass}

              value={values.depositCurrency}

              onChange={(e) => set('depositCurrency', e.target.value.toUpperCase())}

              disabled={disabled}

              maxLength={3}

            />

          </div>

          <div>

            <label className={labelClass} htmlFor="rr-credit-card">

              Credit card required

            </label>

            <select

              id="rr-credit-card"

              className={inputClass}

              value={values.creditCardRequired}

              onChange={(e) => set('creditCardRequired', e.target.value as RentalRuleFormValues['creditCardRequired'])}

              disabled={disabled}

            >

              <option value="">Inherit / not set</option>

              <option value="true">Yes</option>

              <option value="false">No</option>

            </select>

          </div>

        </div>

      </section>



      <section className={rentalFormSectionClass} aria-labelledby="rental-rules-travel-section">

        <h5 id="rental-rules-travel-section" className={rentalFormSectionTitleClass}>

          Travel & additional drivers

        </h5>

        <div className="grid gap-4 sm:grid-cols-2">

          <div>

            <label className={labelClass} htmlFor="rr-foreign-travel">

              Foreign travel

            </label>

            <select

              id="rr-foreign-travel"

              className={inputClass}

              value={values.foreignTravelPolicy}

              onChange={(e) => set('foreignTravelPolicy', e.target.value as RentalRuleFormValues['foreignTravelPolicy'])}

              disabled={disabled}

            >

              <option value="">Inherit / not set</option>

              {FOREIGN_TRAVEL_OPTIONS.map((o) => (

                <option key={o.value} value={o.value}>{o.label}</option>

              ))}

            </select>

          </div>

          <div>

            <label className={labelClass} htmlFor="rr-additional-driver">

              Additional driver

            </label>

            <select

              id="rr-additional-driver"

              className={inputClass}

              value={values.additionalDriverPolicy}

              onChange={(e) =>

                set('additionalDriverPolicy', e.target.value as RentalRuleFormValues['additionalDriverPolicy'])

              }

              disabled={disabled}

            >

              <option value="">Inherit / not set</option>

              {ADDITIONAL_DRIVER_OPTIONS.map((o) => (

                <option key={o.value} value={o.value}>{o.label}</option>

              ))}

            </select>

          </div>

          <div>

            <label className={labelClass} htmlFor="rr-young-driver">

              Young driver

            </label>

            <select

              id="rr-young-driver"

              className={inputClass}

              value={values.youngDriverPolicy}

              onChange={(e) => set('youngDriverPolicy', e.target.value as RentalRuleFormValues['youngDriverPolicy'])}

              disabled={disabled}

            >

              <option value="">Inherit / not set</option>

              {YOUNG_DRIVER_OPTIONS.map((o) => (

                <option key={o.value} value={o.value}>{o.label}</option>

              ))}

            </select>

          </div>

        </div>

      </section>



      <section className={rentalFormSectionClass} aria-labelledby="rental-rules-approval-section">

        <h5 id="rental-rules-approval-section" className={rentalFormSectionTitleClass}>

          Approval & notes

        </h5>

        <div className="grid gap-4 sm:grid-cols-2">

          <div>

            <label className={labelClass} htmlFor="rr-manual-approval">

              Manual approval

            </label>

            <select

              id="rr-manual-approval"

              className={inputClass}

              value={values.manualApprovalRequired}

              onChange={(e) =>

                set('manualApprovalRequired', e.target.value as RentalRuleFormValues['manualApprovalRequired'])

              }

              disabled={disabled}

            >

              <option value="">Inherit / not set</option>

              <option value="true">Yes</option>

              <option value="false">No</option>

            </select>

            <p className={hintClass}>Bookings need operator approval before confirmation.</p>

          </div>

          <div className="sm:col-span-2">

            <label className={labelClass} htmlFor="rr-insurance">

              Insurance requirement

            </label>

            <input

              id="rr-insurance"

              type="text"

              className={inputClass}

              value={values.insuranceRequirement}

              onChange={(e) => set('insuranceRequirement', e.target.value)}

              disabled={disabled}

              placeholder="e.g. Full coverage required"

            />

          </div>

          <div className="sm:col-span-2">

            <label className={labelClass} htmlFor="rr-notes">

              Internal notes

            </label>

            <textarea

              id="rr-notes"

              className={`${inputClass} min-h-[72px] resize-y`}

              value={values.notes}

              onChange={(e) => set('notes', e.target.value)}

              disabled={disabled}

              placeholder="Operator notes — not shown to customers"

            />

          </div>

        </div>

      </section>

    </div>

  );

}


