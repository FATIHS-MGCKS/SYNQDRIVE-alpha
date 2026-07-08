import { CustomerEligibilityPolicy, CustomerVerificationCheckKind } from '@prisma/client';
import { CustomerVerificationPlanDto } from '@modules/customers/dto/verification-plan.dto';

export type IdDocumentVerificationMethod = 'MANUAL' | 'DIDIT' | 'DEFERRED';
export type DrivingLicenseVerificationMethod = 'MANUAL' | 'DIDIT' | 'PICKUP' | 'DEFERRED';
export type ProofOfAddressVerificationMethod = 'MANUAL' | 'DIDIT' | 'NOT_REQUIRED' | 'DEFERRED';

export type ResolvedVerificationPlan = {
  idDocument: { method: IdDocumentVerificationMethod; note?: string };
  drivingLicense: { method: DrivingLicenseVerificationMethod; note?: string };
  proofOfAddress: { method: ProofOfAddressVerificationMethod; note?: string };
  autoStartDidit: boolean;
};

export type VerificationPlanDecisionJson = {
  selectedAt: string;
  selectedBy: string | null;
  source: 'CREATE_CUSTOMER';
  method: string;
  note?: string | null;
  plannedFor?: 'PICKUP';
};

export function resolveDefaultVerificationPlan(
  policy: CustomerEligibilityPolicy,
): ResolvedVerificationPlan {
  return {
    idDocument: {
      method: policy.requireVerifiedIdForConfirmedBooking ? 'MANUAL' : 'DEFERRED',
    },
    drivingLicense: {
      method: policy.requireVerifiedLicenseForConfirmedBooking
        ? 'MANUAL'
        : policy.requireVerifiedLicenseForPickup
          ? 'PICKUP'
          : 'DEFERRED',
    },
    proofOfAddress: {
      method: 'NOT_REQUIRED',
    },
    autoStartDidit: false,
  };
}

export function mergeVerificationPlan(
  plan: CustomerVerificationPlanDto | undefined,
  policy: CustomerEligibilityPolicy,
): ResolvedVerificationPlan {
  const defaults = resolveDefaultVerificationPlan(policy);
  return {
    idDocument: {
      method: plan?.idDocument?.method ?? defaults.idDocument.method,
      note: plan?.idDocument?.note,
    },
    drivingLicense: {
      method: plan?.drivingLicense?.method ?? defaults.drivingLicense.method,
      note: plan?.drivingLicense?.note,
    },
    proofOfAddress: {
      method: plan?.proofOfAddress?.method ?? defaults.proofOfAddress.method,
      note: plan?.proofOfAddress?.note,
    },
    autoStartDidit: plan?.autoStartDidit ?? defaults.autoStartDidit,
  };
}

export function buildVerificationPlanDescription(plan: ResolvedVerificationPlan): string {
  const parts: string[] = [];

  parts.push(describeDomainPlan('Ausweisprüfung', plan.idDocument.method, plan.idDocument.note));
  parts.push(
    describeDomainPlan('Führerscheinprüfung', plan.drivingLicense.method, plan.drivingLicense.note),
  );
  parts.push(
    describeDomainPlan('Adressnachweis', plan.proofOfAddress.method, plan.proofOfAddress.note),
  );

  return parts.filter(Boolean).join(' ');
}

function describeDomainPlan(
  label: string,
  method: string,
  note?: string,
): string {
  const suffix = note?.trim() ? ` (${note.trim()})` : '';
  switch (method) {
    case 'MANUAL':
      return `${label} manuell durch Mitarbeiter vorgesehen${suffix}.`;
    case 'DIDIT':
      return `${label} über Didit geplant${suffix}.`;
    case 'PICKUP':
      return `${label} beim Pickup vorgesehen${suffix}.`;
    case 'DEFERRED':
      return `${label} später nachreichen${suffix}.`;
    case 'NOT_REQUIRED':
      return `${label} nicht erforderlich.`;
    default:
      return `${label}: ${method}${suffix}.`;
  }
}

export function kindForPlanDomain(
  domain: 'idDocument' | 'drivingLicense' | 'proofOfAddress',
): CustomerVerificationCheckKind {
  switch (domain) {
    case 'idDocument':
      return 'ID_DOCUMENT';
    case 'drivingLicense':
      return 'DRIVING_LICENSE';
    case 'proofOfAddress':
      return 'PROOF_OF_ADDRESS';
  }
}
