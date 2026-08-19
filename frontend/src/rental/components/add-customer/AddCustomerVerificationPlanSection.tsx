import { useMemo } from 'react';
import { ShieldCheck } from 'lucide-react';
import { useLanguage } from '../../../i18n/LanguageContext';
import { cn } from '../../../components/ui/utils';

export type IdDocumentVerificationMethod = 'MANUAL' | 'DIDIT' | 'DEFERRED';
export type DrivingLicenseVerificationMethod = 'MANUAL' | 'DIDIT' | 'PICKUP' | 'DEFERRED';
export type ProofOfAddressVerificationMethod = 'MANUAL' | 'DIDIT' | 'NOT_REQUIRED' | 'DEFERRED';

export type CustomerVerificationPlanState = {
  idDocument: { method: IdDocumentVerificationMethod; note?: string };
  drivingLicense: { method: DrivingLicenseVerificationMethod; note?: string };
  proofOfAddress: { method: ProofOfAddressVerificationMethod; note?: string };
  autoStartDidit: boolean;
};

export const DEFAULT_VERIFICATION_PLAN: CustomerVerificationPlanState = {
  idDocument: { method: 'DEFERRED' },
  drivingLicense: { method: 'PICKUP' },
  proofOfAddress: { method: 'NOT_REQUIRED' },
  autoStartDidit: false,
};

interface AddCustomerVerificationPlanSectionProps {
  plan: CustomerVerificationPlanState;
  onChange: (plan: CustomerVerificationPlanState) => void;
  sectionTitle: (icon: React.ComponentType<{ className?: string }>, title: string) => React.ReactNode;
  licensePickupWarning?: string | null;
}

function MethodGroup<T extends string>({
  label,
  value,
  options,
  onSelect,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string; hint: string }>;
  onSelect: (value: T) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <div className="space-y-2">
        {options.map((option) => {
          const selected = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onSelect(option.value)}
              className={cn(
                'w-full rounded-lg border px-3 py-2.5 text-left transition-all',
                selected
                  ? 'border-[color:var(--brand)] bg-[color:var(--brand-soft)]/30'
                  : 'border-border surface-premium hover:border-[color:var(--brand)]/30',
              )}
            >
              <p className="text-xs font-semibold text-foreground">{option.label}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">{option.hint}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function AddCustomerVerificationPlanSection({
  plan,
  onChange,
  sectionTitle,
  licensePickupWarning,
}: AddCustomerVerificationPlanSectionProps) {
  const { t } = useLanguage();

  const idOptions = useMemo(
    () => [
      {
        value: 'MANUAL' as IdDocumentVerificationMethod,
        label: t('customers.wizard.verification.manual'),
        hint: t('customers.wizard.verification.manualIdHint'),
      },
      {
        value: 'DIDIT' as IdDocumentVerificationMethod,
        label: t('customers.wizard.verification.didit'),
        hint: t('customers.wizard.verification.diditIdHint'),
      },
      {
        value: 'DEFERRED' as IdDocumentVerificationMethod,
        label: t('customers.wizard.verification.deferred'),
        hint: t('customers.wizard.verification.deferredIdHint'),
      },
    ],
    [t],
  );

  const licenseOptions = useMemo(
    () => [
      {
        value: 'MANUAL' as DrivingLicenseVerificationMethod,
        label: t('customers.wizard.verification.manual'),
        hint: t('customers.wizard.verification.manualLicenseHint'),
      },
      {
        value: 'DIDIT' as DrivingLicenseVerificationMethod,
        label: t('customers.wizard.verification.didit'),
        hint: t('customers.wizard.verification.diditLicenseHint'),
      },
      {
        value: 'PICKUP' as DrivingLicenseVerificationMethod,
        label: t('customers.wizard.verification.pickup'),
        hint: t('customers.wizard.verification.pickupHint'),
      },
      {
        value: 'DEFERRED' as DrivingLicenseVerificationMethod,
        label: t('customers.wizard.verification.deferred'),
        hint: t('customers.wizard.verification.deferredLicenseHint'),
      },
    ],
    [t],
  );

  const poaOptions = useMemo(
    () => [
      {
        value: 'NOT_REQUIRED' as ProofOfAddressVerificationMethod,
        label: t('customers.wizard.verification.poaNotRequired'),
        hint: t('customers.wizard.verification.poaNotRequiredHint'),
      },
      {
        value: 'MANUAL' as ProofOfAddressVerificationMethod,
        label: t('customers.wizard.verification.manual'),
        hint: t('customers.wizard.verification.poaManualHint'),
      },
      {
        value: 'DEFERRED' as ProofOfAddressVerificationMethod,
        label: t('customers.wizard.verification.deferred'),
        hint: t('customers.wizard.verification.poaDeferredHint'),
      },
    ],
    [t],
  );

  const diditSelected =
    plan.idDocument.method === 'DIDIT' || plan.drivingLicense.method === 'DIDIT';

  return (
    <div className="space-y-4">
      <div className="h-px my-2 bg-border" />
      {sectionTitle(ShieldCheck, t('customers.wizard.verificationPlanTitle'))}
      <p className="text-xs text-muted-foreground">{t('customers.wizard.verificationPlanHint')}</p>

      <MethodGroup
        label={t('customers.wizard.verification.idCheck')}
        value={plan.idDocument.method}
        options={idOptions}
        onSelect={(method) => onChange({ ...plan, idDocument: { ...plan.idDocument, method } })}
      />

      <MethodGroup
        label={t('customers.wizard.verification.licenseCheck')}
        value={plan.drivingLicense.method}
        options={licenseOptions}
        onSelect={(method) => onChange({ ...plan, drivingLicense: { ...plan.drivingLicense, method } })}
      />
      {plan.drivingLicense.method === 'PICKUP' && licensePickupWarning ? (
        <p className="text-[11px] text-amber-600 dark:text-amber-400">{licensePickupWarning}</p>
      ) : null}

      <MethodGroup
        label={t('customers.wizard.verification.poaCheck')}
        value={plan.proofOfAddress.method}
        options={poaOptions}
        onSelect={(method) => onChange({ ...plan, proofOfAddress: { ...plan.proofOfAddress, method } })}
      />

      {diditSelected ? (
        <label className="flex items-start gap-2.5 rounded-lg border border-border bg-muted/20 px-3 py-2.5">
          <input
            type="checkbox"
            checked={plan.autoStartDidit}
            onChange={(e) => onChange({ ...plan, autoStartDidit: e.target.checked })}
            className="mt-0.5"
          />
          <span className="text-xs text-foreground">
            <span className="font-semibold">{t('customers.wizard.verification.autoStartDidit')}</span>
            <span className="mt-0.5 block text-muted-foreground">
              {t('customers.wizard.verification.autoStartDiditHint')}
            </span>
          </span>
        </label>
      ) : null}
    </div>
  );
}

export function verificationPlanToApiPayload(plan: CustomerVerificationPlanState) {
  return {
    idDocument: { method: plan.idDocument.method, note: plan.idDocument.note },
    drivingLicense: { method: plan.drivingLicense.method, note: plan.drivingLicense.note },
    proofOfAddress: { method: plan.proofOfAddress.method, note: plan.proofOfAddress.note },
    autoStartDidit: plan.autoStartDidit,
  };
}
