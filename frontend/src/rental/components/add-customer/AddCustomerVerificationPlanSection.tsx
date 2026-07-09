import { ShieldCheck } from 'lucide-react';
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

const ID_OPTIONS: Array<{ value: IdDocumentVerificationMethod; label: string; hint: string }> = [
  {
    value: 'MANUAL',
    label: 'Manuell durch Mitarbeiter prüfen',
    hint: 'Ein Mitarbeiter prüft den Ausweis im System.',
  },
  {
    value: 'DIDIT',
    label: 'KYC-Prüfung über Didit starten',
    hint: 'Didit führt die Ausweisprüfung durch — noch nicht automatisch verifiziert.',
  },
  {
    value: 'DEFERRED',
    label: 'Später nachreichen',
    hint: 'Ausweis wird zu einem späteren Zeitpunkt eingereicht.',
  },
];

const LICENSE_OPTIONS: Array<{ value: DrivingLicenseVerificationMethod; label: string; hint: string }> = [
  {
    value: 'MANUAL',
    label: 'Manuell durch Mitarbeiter prüfen',
    hint: 'Ein Mitarbeiter prüft den Führerschein im System.',
  },
  {
    value: 'DIDIT',
    label: 'KYC-Prüfung über Didit starten',
    hint: 'Didit führt die Führerscheinprüfung durch.',
  },
  {
    value: 'PICKUP',
    label: 'Beim Pickup prüfen',
    hint: 'Prüfung erfolgt bei der Übergabe — blockiert keine Buchung global.',
  },
  {
    value: 'DEFERRED',
    label: 'Später nachreichen',
    hint: 'Führerschein wird zu einem späteren Zeitpunkt eingereicht.',
  },
];

const POA_OPTIONS: Array<{ value: ProofOfAddressVerificationMethod; label: string; hint: string }> = [
  {
    value: 'NOT_REQUIRED',
    label: 'Nicht erforderlich',
    hint: 'Adressnachweis wird für diesen Kunden nicht verlangt.',
  },
  {
    value: 'MANUAL',
    label: 'Manuell durch Mitarbeiter prüfen',
    hint: 'Ein Mitarbeiter prüft den Adressnachweis.',
  },
  {
    value: 'DEFERRED',
    label: 'Später nachreichen',
    hint: 'Adressnachweis wird später eingereicht.',
  },
];

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
  const diditSelected =
    plan.idDocument.method === 'DIDIT' || plan.drivingLicense.method === 'DIDIT';

  return (
    <div className="space-y-4">
      <div className="h-px my-2 bg-border" />
      {sectionTitle(ShieldCheck, 'Dokumentprüfung')}
      <p className="text-xs text-muted-foreground">
        Legen Sie fest, wie Ausweis, Führerschein und ggf. Adressnachweis geprüft werden sollen.
        Die Auswahl dokumentiert den Prüfweg — sie bedeutet noch keine Verifizierung.
      </p>

      <MethodGroup
        label="Ausweisprüfung"
        value={plan.idDocument.method}
        options={ID_OPTIONS}
        onSelect={(method) => onChange({ ...plan, idDocument: { ...plan.idDocument, method } })}
      />

      <MethodGroup
        label="Führerscheinprüfung"
        value={plan.drivingLicense.method}
        options={LICENSE_OPTIONS}
        onSelect={(method) => onChange({ ...plan, drivingLicense: { ...plan.drivingLicense, method } })}
      />
      {plan.drivingLicense.method === 'PICKUP' && licensePickupWarning ? (
        <p className="text-[11px] text-amber-600 dark:text-amber-400">{licensePickupWarning}</p>
      ) : null}

      <MethodGroup
        label="Adressnachweis"
        value={plan.proofOfAddress.method}
        options={POA_OPTIONS}
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
            <span className="font-semibold">KYC-Prozess direkt starten</span>
            <span className="mt-0.5 block text-muted-foreground">
              Didit-Sitzung wird nach dem Anlegen des Kunden automatisch gestartet.
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
